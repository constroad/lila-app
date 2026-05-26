import logger from '../utils/logger.js';
import { config } from '../config/environment.js';
import telegramQueue from './telegram-queue.js';

const ALERT_WINDOW_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const DEFAULT_FLUSH_INTERVAL_MS = 60 * 1000;

const alertCache = new Map<string, number>();

function shouldSendAlert(key: string) {
  const now = Date.now();
  const last = alertCache.get(key);
  if (last && now - last < ALERT_WINDOW_MS) return false;
  alertCache.set(key, now);
  return true;
}

export function resetTelegramAlertCacheForTests() {
  alertCache.clear();
  isFlushing = false;
}

function isPermanentHttpStatus(status: number) {
  // 4xx are client errors (bad token, bad chat id, invalid payload) — retrying is useless.
  // 408 (timeout) and 429 (rate limit) are transient on the server side.
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

async function sendOnce(message: string): Promise<{ ok: true } | { ok: false; permanent: boolean; reason: string }> {
  const body = new URLSearchParams();
  body.append('chat_id', config.telegram.errorsChatId);
  body.append('text', message);

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
      {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    if (res.ok) return { ok: true };
    return {
      ok: false,
      permanent: isPermanentHttpStatus(res.status),
      reason: `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      permanent: false,
      reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

export async function sendTelegramAlert(params: {
  dedupeKey?: string;
  message: string;
}) {
  const { dedupeKey, message } = params;
  if (!config.telegram.botToken || !config.telegram.errorsChatId) return false;
  if (dedupeKey && !shouldSendAlert(dedupeKey)) return false;

  const result = await sendOnce(message);
  if (result.ok) return true;

  if (result.permanent) {
    logger.warn('Telegram alert permanently rejected (not enqueuing)', {
      reason: result.reason,
    });
    return false;
  }

  logger.warn('Failed to send Telegram alert, enqueuing for retry', {
    reason: result.reason,
  });
  try {
    await telegramQueue.enqueue({ message, dedupeKey });
  } catch (queueError) {
    logger.error('Failed to enqueue Telegram alert', queueError);
  }
  return false;
}

let isFlushing = false;

export type TelegramFlushResult = {
  sent: number;
  dropped: number;
  remaining: number;
  skipped?: boolean;
};

export async function flushTelegramQueue(): Promise<TelegramFlushResult> {
  if (isFlushing) {
    const remaining = (await telegramQueue.list()).length;
    return { sent: 0, dropped: 0, remaining, skipped: true };
  }
  isFlushing = true;

  let sent = 0;
  let dropped = 0;

  try {
    // Drop items that already exceeded MAX_ATTEMPTS or MAX_AGE_MS first
    dropped += await telegramQueue.prune();

    const items = await telegramQueue.list();
    if (items.length === 0) {
      return { sent: 0, dropped, remaining: 0 };
    }

    for (const item of items) {
      const result = await sendOnce(item.message);
      if (result.ok) {
        await telegramQueue.remove(item.id);
        sent++;
        continue;
      }

      if (result.permanent) {
        logger.warn(`[telegram-queue] dropping ${item.id} (permanent ${result.reason})`);
        await telegramQueue.remove(item.id);
        dropped++;
        continue;
      }

      // Transient: bump attempts, store error, stop to avoid flooding the API
      await telegramQueue.update({
        ...item,
        attempts: item.attempts + 1,
        lastError: result.reason,
      });
      logger.warn(
        `[telegram-queue] transient failure for ${item.id} (attempt ${item.attempts + 1}): ${result.reason}`
      );
      break;
    }

    const remaining = (await telegramQueue.list()).length;
    return { sent, dropped, remaining };
  } finally {
    isFlushing = false;
  }
}

/**
 * Start a periodic flusher. Returns a stop function (call on graceful shutdown).
 * Safe to call once per process; multiple instances would just duplicate work.
 */
export function startTelegramQueueFlusher(intervalMs: number = DEFAULT_FLUSH_INTERVAL_MS): () => void {
  const tick = () => {
    flushTelegramQueue().catch((err) => {
      logger.error('[telegram-queue] flush tick failed', err);
    });
  };
  const handle = setInterval(tick, intervalMs);
  // Don't keep the event loop alive just for this timer
  if (typeof handle.unref === 'function') handle.unref();
  logger.info(`[telegram-queue] flusher started (interval=${intervalMs}ms)`);
  return () => {
    clearInterval(handle);
    logger.info('[telegram-queue] flusher stopped');
  };
}
