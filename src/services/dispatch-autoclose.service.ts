import path from 'path';
import { randomUUID } from 'crypto';
import axios from 'axios';
import JsonStore from '../storage/json.store.js';
import logger from '../utils/logger.js';
import { config } from '../config/environment.js';
import { buildPortalCallbackHeaders } from '../utils/portal-callback.js';

/**
 * Cierre de fondo de la llegada de un despacho (fire-and-forget, one-shot).
 *
 * Problema: los choferes no abren el link para marcar su llegada, así que la
 * unidad queda "en ruta" para siempre. Solución agnóstica al que mira (cliente/
 * admin/despachador): al despachar se programa UN job que, al cumplirse el ETA
 * de la unidad (el MISMO que muestra el mapa, ya ajustado a volquete/auto por
 * Portal — no le sumamos nada), llama a Portal para dar por entregada la unidad
 * si NADIE la cerró. Persiste en JsonStore (sobrevive reinicios, igual que la
 * cola de recordatorios) y se AUTODESTRUYE al disparar (no se re-encola).
 *
 * Portal decide el resultado (idempotente): si el chofer/operador ya marcó
 * llegada, responde `already_marked` y el job igual se descarta. El cierre de
 * fondo es el actor más débil (`arrival.by='system'`), así que una marca real
 * posterior lo pisa (auto-corrige) y la UI no le pone ✓.
 */

export type DispatchAutoCloseItem = {
  id: string;
  companyId: string;
  dispatchId: string;
  availableAt: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

const STORE_KEY = 'queue';
const MAX_ATTEMPTS = 3;
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // más viejo que una jornada no tiene sentido
const DEFAULT_FLUSH_INTERVAL_MS = 60 * 1000;
// Solo cuando NO hay ETA usable (ruta degradada): tope conservador para no
// dejar "en ruta" indefinidamente. Con ETA se usa el ETA tal cual, sin margen.
const NO_ETA_FALLBACK_MS = 90 * 60 * 1000;
// Un delay mayor que MAX_AGE haría que el item expire ANTES de disparar → nunca
// cerraría. Se acota para que siempre alcance a ejecutarse dentro de su vida.
const MAX_DELAY_MS = MAX_AGE_MS - 60 * 1000;

const store = new JsonStore({
  baseDir: path.join(config.whatsapp.sessionDir, '../dispatch-autoclose'),
  autoBackup: true,
});

async function listQueue(): Promise<DispatchAutoCloseItem[]> {
  const data = await store.get<DispatchAutoCloseItem[]>(STORE_KEY);
  return Array.isArray(data) ? data : [];
}

async function saveQueue(items: DispatchAutoCloseItem[]): Promise<void> {
  await store.set(STORE_KEY, items);
}

/** Delay del cierre = ETA de la unidad (segundos) tal cual. Sin ETA → fallback. */
function computeAutoCloseDelayMs(etaSeconds: number | null | undefined): number {
  const eta = Number(etaSeconds);
  const raw = Number.isFinite(eta) && eta > 0 ? eta * 1000 : NO_ETA_FALLBACK_MS;
  return Math.min(MAX_DELAY_MS, Math.max(0, Math.round(raw)));
}

/**
 * Programa el cierre de fondo de UN despacho a `ETA` desde ahora. Dedupe por
 * dispatch (reprogramar no duplica). Best-effort: nunca lanza. `etaSeconds` lo
 * pasa el llamador que ya lo consultó a Portal (no re-consulta el tracking).
 */
export async function scheduleDispatchAutoClose(params: {
  companyId: string;
  dispatchId: string;
  etaSeconds: number | null | undefined;
}): Promise<boolean> {
  try {
    if (!params.companyId || !params.dispatchId) return false;
    const queue = await listQueue();
    if (queue.some((item) => item.dispatchId === params.dispatchId)) {
      return false; // ya programado
    }
    const delayMs = computeAutoCloseDelayMs(params.etaSeconds);
    const availableAt = new Date(Date.now() + delayMs).toISOString();
    queue.push({
      id: randomUUID(),
      companyId: params.companyId,
      dispatchId: params.dispatchId,
      availableAt,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
    await saveQueue(queue);
    logger.info('dispatch_autoclose.scheduled', {
      companyId: params.companyId,
      dispatchId: params.dispatchId,
      etaSeconds: params.etaSeconds ?? null,
      availableAt,
    });
    return true;
  } catch (error) {
    logger.error('dispatch_autoclose.schedule_failed', {
      dispatchId: params.dispatchId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Llama a Portal para cerrar la llegada. Devuelve:
 * - 'done'  → Portal resolvió (cerrado / ya marcado / no aplica / no existe):
 *             trabajo terminado, descartar (autodestrucción).
 * - 'retry' → fallo transitorio (5xx / red / timeout): reintentar luego.
 */
async function postAutoClose(item: DispatchAutoCloseItem): Promise<'done' | 'retry'> {
  const base = String(config.portal.baseUrl).replace(/\/+$/, '');
  try {
    await axios.post(
      `${base}/api/dispatch/${item.dispatchId}/auto-close`,
      {},
      {
        headers: buildPortalCallbackHeaders(item.companyId, 'lila-dispatch-autoclose'),
        timeout: 8000,
      }
    );
    return 'done';
  } catch (error) {
    const status =
      axios.isAxiosError(error) && error.response ? error.response.status : null;
    // 4xx = respuesta definitiva de Portal (id inválido / no encontrado) → no
    // reintentar. 5xx / sin respuesta (red, timeout) → transitorio → reintentar.
    if (status !== null && status >= 400 && status < 500) return 'done';
    logger.warn('dispatch_autoclose.post_failed', {
      companyId: item.companyId,
      dispatchId: item.dispatchId,
      status,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'retry';
  }
}

let isFlushing = false;

/** Cierra las unidades cuyo ETA venció; descarta el job tras dispararlo. */
export async function flushDispatchAutoClose(now: Date = new Date()): Promise<{
  closed: number;
  dropped: number;
  remaining: number;
}> {
  if (isFlushing) return { closed: 0, dropped: 0, remaining: 0 };
  isFlushing = true;
  let closed = 0;
  let dropped = 0;

  try {
    const queue = await listQueue();
    const keep: DispatchAutoCloseItem[] = [];

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

      const outcome = await postAutoClose(item);
      if (outcome === 'done') {
        // Disparado: NO se re-encola = autodestrucción.
        closed += 1;
        logger.info('dispatch_autoclose.fired', {
          companyId: item.companyId,
          dispatchId: item.dispatchId,
        });
      } else {
        keep.push({ ...item, attempts: item.attempts + 1, lastError: 'transient' });
      }
    }

    await saveQueue(keep);
    return { closed, dropped, remaining: keep.length };
  } catch (error) {
    logger.error('dispatch_autoclose.flush_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { closed, dropped, remaining: -1 };
  } finally {
    isFlushing = false;
  }
}

/** Flusher periódico (mismo patrón que la cola de recordatorios/Telegram). */
export function startDispatchAutoCloseFlusher(
  intervalMs: number = DEFAULT_FLUSH_INTERVAL_MS
): () => void {
  const tick = () => {
    flushDispatchAutoClose().catch((err) => {
      logger.error('[dispatch-autoclose] flush tick failed', err);
    });
  };
  const handle = setInterval(tick, intervalMs);
  if (typeof handle.unref === 'function') handle.unref();
  logger.info(`[dispatch-autoclose] flusher started (interval=${intervalMs}ms)`);
  return () => {
    clearInterval(handle);
    logger.info('[dispatch-autoclose] flusher stopped');
  };
}
