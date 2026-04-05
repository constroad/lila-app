import logger from '../utils/logger.js';
import { config } from '../config/environment.js';

const ALERT_WINDOW_MS = 5 * 60 * 1000;
const alertCache = new Map<string, number>();

function shouldSendAlert(key: string) {
  const now = Date.now();
  const last = alertCache.get(key);
  if (last && now - last < ALERT_WINDOW_MS) return false;
  alertCache.set(key, now);
  return true;
}

export async function sendTelegramAlert(params: {
  dedupeKey?: string;
  message: string;
}) {
  const { dedupeKey, message } = params;
  if (!config.telegram.botToken || !config.telegram.errorsChatId) return false;
  if (dedupeKey && !shouldSendAlert(dedupeKey)) return false;

  try {
    const body = new URLSearchParams();
    body.append('chat_id', config.telegram.errorsChatId);
    body.append('text', message);

    await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
      method: 'POST',
      body,
    });
    return true;
  } catch (error) {
    logger.warn('Failed to send Telegram alert', error);
    return false;
  }
}
