import path from 'path';
import { randomUUID } from 'crypto';
import axios from 'axios';
import JsonStore from '../storage/json.store.js';
import logger from '../utils/logger.js';
import { config } from '../config/environment.js';
import { computeArrivalReminderDelayMs } from '../utils/driver-link.js';
import { WhatsAppDirectService } from './whatsapp-direct.service.js';

/**
 * Recordatorio "marca tu llegada" al chofer (F8-C): se programa al despachar
 * con delay = ETA + 10% (Portal calcula el ETA con su cadena de tracking).
 * Persistido en JsonStore (sobrevive reinicios de lila, igual que la cola de
 * Telegram). Al vencer: si el despacho YA tiene llegada marcada, se descarta;
 * si no, se envía el WhatsApp. Sin intervención humana.
 */

export type DriverReminderItem = {
  id: string;
  companyId: string;
  dispatchId: string;
  sender: string;
  phone: string;
  message: string;
  availableAt: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

const STORE_KEY = 'queue';
const MAX_ATTEMPTS = 3;
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // más viejo que una jornada no tiene sentido
const DEFAULT_FLUSH_INTERVAL_MS = 60 * 1000;

const store = new JsonStore({
  baseDir: path.join(config.whatsapp.sessionDir, '../driver-reminders'),
  autoBackup: true,
});

async function listQueue(): Promise<DriverReminderItem[]> {
  const data = await store.get<DriverReminderItem[]>(STORE_KEY);
  return Array.isArray(data) ? data : [];
}

async function saveQueue(items: DriverReminderItem[]): Promise<void> {
  await store.set(STORE_KEY, items);
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
      headers: { 'x-company-id': companyId },
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
 * Programa el recordatorio para un despacho recién salido. Dedupe por
 * dispatch: reprogramar no duplica. Best-effort (nunca lanza).
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
    const delayMs = computeArrivalReminderDelayMs(tracking?.durationSeconds);
    const availableAt = new Date(Date.now() + delayMs).toISOString();

    const queue = await listQueue();
    if (queue.some((item) => item.dispatchId === params.dispatchId)) {
      return false; // ya programado
    }
    queue.push({
      id: randomUUID(),
      companyId: params.companyId,
      dispatchId: params.dispatchId,
      sender: params.sender,
      phone: params.phone,
      message: params.message,
      availableAt,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
    await saveQueue(queue);
    logger.info('driver_reminder.scheduled', {
      companyId: params.companyId,
      dispatchId: params.dispatchId,
      availableAt,
      etaSeconds: tracking?.durationSeconds ?? null,
    });
    return true;
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
