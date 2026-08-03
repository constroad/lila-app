import path from 'path';
import { randomUUID } from 'crypto';
import axios from 'axios';
import JsonStore from '../storage/json.store.js';
import logger from '../utils/logger.js';
import { config } from '../config/environment.js';
import { buildPortalCallbackHeaders } from '../utils/portal-callback.js';
import { computeArrivalReminderDelayMs, computeLocationShareDelayMs } from '../utils/driver-link.js';
import {
  hasScheduledAutoClose,
  scheduleDispatchAutoClose,
} from './dispatch-autoclose.service.js';
import { WhatsAppDirectService } from './whatsapp-direct.service.js';

/**
 * Mensajes programados al chofer (F8-C), persistidos en JsonStore (sobreviven
 * reinicios de lila, igual que la cola de Telegram). Dos tipos:
 * - `location-share`: link para compartir ubicación — sale a **1/4 del ETA**
 *   (ya en ruta, no al despachar cuando aún carga en planta).
 * - `arrival-reminder`: "marca tu llegada" — sale a **ETA + 10%**.
 * Portal calcula el ETA (ajustado a volquete). Al vencer: si el despacho YA
 * tiene llegada marcada, se descarta; si no, se envía. Sin intervención humana.
 */

export type DriverReminderKind = 'location-share' | 'arrival-reminder';

export type DriverReminderItem = {
  id: string;
  companyId: string;
  dispatchId: string;
  sender: string;
  phone: string;
  message: string;
  /** Tipo de mensaje. Ausente en items previos = 'arrival-reminder' (back-compat). */
  kind?: DriverReminderKind;
  availableAt: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

const itemKind = (item: DriverReminderItem): DriverReminderKind =>
  item.kind ?? 'arrival-reminder';

const STORE_KEY = 'queue';
const MAX_ATTEMPTS = 3;
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // más viejo que una jornada no tiene sentido
const DEFAULT_FLUSH_INTERVAL_MS = 60 * 1000;

// Lazy: crear el store al primer uso, no al importar el módulo (mismo motivo
// que dispatch-autoclose: leer config en load-time rompe suites CJS con
// environment mockeado sin `whatsapp`, y un import no debería tocar filesystem).
let store: JsonStore | null = null;

function getStore(): JsonStore {
  if (!store) {
    store = new JsonStore({
      baseDir: path.join(config.whatsapp.sessionDir, '../driver-reminders'),
      autoBackup: true,
    });
  }
  return store;
}

async function listQueue(): Promise<DriverReminderItem[]> {
  const data = await getStore().get<DriverReminderItem[]>(STORE_KEY);
  return Array.isArray(data) ? data : [];
}

async function saveQueue(items: DriverReminderItem[]): Promise<void> {
  await getStore().set(STORE_KEY, items);
}

/** ETA (segundos) del despacho vía Portal (interna, x-company-id). Null si falla. */
async function fetchDispatchTracking(
  companyId: string,
  dispatchId: string
): Promise<{ durationSeconds: number | null; stage: string | null } | null> {
  try {
    const base = String(config.portal.baseUrl).replace(/\/+$/, '');
    const response = await axios.get(`${base}/api/dispatch-tracking`, {
      params: { dispatchId },
      // Bearer de callback: sin él, Portal (hardening F0) responde 401.
      headers: buildPortalCallbackHeaders(companyId, 'lila-driver-arrival'),
      timeout: 8000,
    });
    const data = response.data?.data ?? {};
    return {
      durationSeconds: Number.isFinite(Number(data.durationSeconds))
        ? Number(data.durationSeconds)
        : null,
      stage: typeof data.stage === 'string' ? data.stage : null,
    };
  } catch (error) {
    logger.warn('driver_reminder.tracking_fetch_failed', {
      companyId,
      dispatchId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Encola UN mensaje al chofer. Dedupe por (dispatch, kind): reprogramar el mismo
 * tipo no duplica, pero link y recordatorio conviven. Best-effort.
 */
async function enqueueDriverMessage(params: {
  companyId: string;
  dispatchId: string;
  sender: string;
  phone: string;
  message: string;
  kind: DriverReminderKind;
  delayMs: number;
}): Promise<boolean> {
  const availableAt = new Date(Date.now() + Math.max(0, params.delayMs)).toISOString();
  const queue = await listQueue();
  if (queue.some((item) => item.dispatchId === params.dispatchId && itemKind(item) === params.kind)) {
    return false; // ya programado ese tipo
  }
  queue.push({
    id: randomUUID(),
    companyId: params.companyId,
    dispatchId: params.dispatchId,
    sender: params.sender,
    phone: params.phone,
    message: params.message,
    kind: params.kind,
    availableAt,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await saveQueue(queue);
  logger.info('driver_reminder.scheduled', {
    companyId: params.companyId,
    dispatchId: params.dispatchId,
    kind: params.kind,
    availableAt,
  });
  return true;
}

/**
 * Programa AMBOS mensajes al despachar con UN solo fetch de ETA: el link de
 * ubicación a 1/4 del recorrido y el recordatorio de llegada a ETA+10%.
 * Best-effort (nunca lanza). Dedupe por (dispatch, kind).
 */
export async function scheduleDriverFollowups(params: {
  companyId: string;
  dispatchId: string;
  sender: string;
  phone: string;
  linkMessage: string;
  arrivalMessage: string;
}): Promise<void> {
  try {
    const tracking = await fetchDispatchTracking(params.companyId, params.dispatchId);
    const eta = tracking?.durationSeconds ?? null;
    const base = {
      companyId: params.companyId,
      dispatchId: params.dispatchId,
      sender: params.sender,
      phone: params.phone,
    };
    await enqueueDriverMessage({
      ...base,
      message: params.linkMessage,
      kind: 'location-share',
      delayMs: computeLocationShareDelayMs(eta),
    });
    await enqueueDriverMessage({
      ...base,
      message: params.arrivalMessage,
      kind: 'arrival-reminder',
      delayMs: computeArrivalReminderDelayMs(eta),
    });
  } catch (error) {
    logger.error('driver_followups.schedule_failed', {
      dispatchId: params.dispatchId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Programa SOLO el cierre de fondo de la llegada, sin depender del chofer.
 *
 * Vivía dentro de `scheduleDriverFollowups`, que a su vez cuelga del bloque del
 * vale al conductor (`sendDriverPdf` + teléfono + sender). Consecuencia real
 * (constroad, 02/08/2026): un pedido con "Enviar vale al conductor" APAGADO se
 * quedó con 5 unidades "en ruta" para siempre — el job nunca se creó. El as-is
 * §6.1 promete "no depende del chofer"; ahora sí se cumple.
 *
 * Best-effort: nunca lanza. Dedupe por dispatch (llamarla dos veces no duplica).
 */
export async function scheduleDispatchArrivalAutoClose(params: {
  companyId: string;
  dispatchId: string;
}): Promise<void> {
  try {
    // El post-process (toda salida) y el vale pueden pedirlo para el mismo
    // despacho: si ya está programado se corta ANTES de consultar el ETA.
    if (await hasScheduledAutoClose(params.dispatchId)) return;
    const tracking = await fetchDispatchTracking(params.companyId, params.dispatchId);
    await scheduleDispatchAutoClose({
      companyId: params.companyId,
      dispatchId: params.dispatchId,
      etaSeconds: tracking?.durationSeconds ?? null,
    });
  } catch (error) {
    logger.error('dispatch_autoclose.schedule_failed', {
      dispatchId: params.dispatchId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Programa SOLO el recordatorio de llegada (ETA+10%). Se conserva por
 * compatibilidad; el flujo del vale usa `scheduleDriverFollowups`.
 */
export async function scheduleDriverArrivalReminder(params: {
  companyId: string;
  dispatchId: string;
  sender: string;
  phone: string;
  message: string;
}): Promise<boolean> {
  try {
    const tracking = await fetchDispatchTracking(params.companyId, params.dispatchId);
    return await enqueueDriverMessage({
      companyId: params.companyId,
      dispatchId: params.dispatchId,
      sender: params.sender,
      phone: params.phone,
      message: params.message,
      kind: 'arrival-reminder',
      delayMs: computeArrivalReminderDelayMs(tracking?.durationSeconds),
    });
  } catch (error) {
    logger.error('driver_reminder.schedule_failed', {
      dispatchId: params.dispatchId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

let isFlushing = false;

/** Envía los recordatorios vencidos; descarta los de unidades ya llegadas. */
export async function flushDriverReminders(now: Date = new Date()): Promise<{
  sent: number;
  dropped: number;
  remaining: number;
}> {
  if (isFlushing) return { sent: 0, dropped: 0, remaining: 0 };
  isFlushing = true;
  let sent = 0;
  let dropped = 0;

  try {
    const queue = await listQueue();
    const keep: DriverReminderItem[] = [];

    for (const item of queue) {
      const age = now.getTime() - new Date(item.createdAt).getTime();
      if (age > MAX_AGE_MS || item.attempts >= MAX_ATTEMPTS) {
        dropped += 1;
        continue;
      }
      if (new Date(item.availableAt).getTime() > now.getTime()) {
        keep.push(item);
        continue;
      }

      // ¿Ya marcó su llegada (chofer u operador)? → no molestar.
      const tracking = await fetchDispatchTracking(item.companyId, item.dispatchId);
      if (tracking?.stage === 'delivered') {
        dropped += 1;
        logger.info('driver_reminder.dropped_already_arrived', {
          companyId: item.companyId,
          dispatchId: item.dispatchId,
        });
        continue;
      }

      try {
        await WhatsAppDirectService.sendMessage(item.sender, item.phone, item.message, {
          companyId: item.companyId,
          queueOnFail: false,
        });
        sent += 1;
        logger.info('driver_reminder.sent', {
          companyId: item.companyId,
          dispatchId: item.dispatchId,
        });
      } catch (error) {
        keep.push({
          ...item,
          attempts: item.attempts + 1,
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await saveQueue(keep);
    return { sent, dropped, remaining: keep.length };
  } catch (error) {
    logger.error('driver_reminder.flush_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent, dropped, remaining: -1 };
  } finally {
    isFlushing = false;
  }
}

/** Flusher periódico (mismo patrón que la cola de Telegram). */
export function startDriverReminderFlusher(
  intervalMs: number = DEFAULT_FLUSH_INTERVAL_MS
): () => void {
  const tick = () => {
    flushDriverReminders().catch((err) => {
      logger.error('[driver-reminder] flush tick failed', err);
    });
  };
  const handle = setInterval(tick, intervalMs);
  if (typeof handle.unref === 'function') handle.unref();
  logger.info(`[driver-reminder] flusher started (interval=${intervalMs}ms)`);
  return () => {
    clearInterval(handle);
    logger.info('[driver-reminder] flusher stopped');
  };
}
