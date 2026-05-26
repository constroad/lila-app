import path from 'path';
import { randomUUID } from 'crypto';
import JsonStore from '../storage/json.store.js';
import logger from '../utils/logger.js';
import { config } from '../config/environment.js';

export type TelegramQueueItem = {
  id: string;
  message: string;
  dedupeKey?: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

export const TELEGRAM_QUEUE_LIMITS = {
  MAX_ATTEMPTS: 5,
  MAX_AGE_MS: 24 * 60 * 60 * 1000,
  MAX_QUEUE_SIZE: 1000,
};

const STORE_KEY = 'queue';

export class TelegramQueue {
  private store: JsonStore;

  constructor() {
    const baseDir = path.join(config.whatsapp.sessionDir, '../telegram-alerts');
    this.store = new JsonStore({ baseDir, autoBackup: true });
  }

  async list(): Promise<TelegramQueueItem[]> {
    const data = await this.store.get<TelegramQueueItem[]>(STORE_KEY);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Enqueue an alert for later retry.
   * Returns null when an item with the same dedupeKey is already pending
   * (so dedupe-blocked alerts don't pile up).
   * Drops the oldest item when MAX_QUEUE_SIZE is reached.
   */
  async enqueue(params: { message: string; dedupeKey?: string }): Promise<TelegramQueueItem | null> {
    const { message, dedupeKey } = params;
    const queue = await this.list();

    if (dedupeKey && queue.some((entry) => entry.dedupeKey === dedupeKey)) {
      return null;
    }

    const item: TelegramQueueItem = {
      id: randomUUID(),
      message,
      dedupeKey,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    queue.push(item);
    while (queue.length > TELEGRAM_QUEUE_LIMITS.MAX_QUEUE_SIZE) {
      queue.shift();
    }

    await this.store.set(STORE_KEY, queue);
    logger.info(`[telegram-queue] enqueued alert ${item.id} (pending=${queue.length})`);
    return item;
  }

  async update(item: TelegramQueueItem): Promise<void> {
    const queue = await this.list();
    const index = queue.findIndex((entry) => entry.id === item.id);
    if (index === -1) return;
    queue[index] = item;
    await this.store.set(STORE_KEY, queue);
  }

  async remove(id: string): Promise<void> {
    const queue = await this.list();
    const next = queue.filter((item) => item.id !== id);
    if (next.length !== queue.length) {
      await this.store.set(STORE_KEY, next);
    }
  }

  /**
   * Drop items that exceed MAX_ATTEMPTS or MAX_AGE_MS.
   * Returns the count of items dropped.
   */
  async prune(now: number = Date.now()): Promise<number> {
    const queue = await this.list();
    const remaining = queue.filter((item) => {
      const tooOld = now - Date.parse(item.createdAt) > TELEGRAM_QUEUE_LIMITS.MAX_AGE_MS;
      const tooManyAttempts = item.attempts >= TELEGRAM_QUEUE_LIMITS.MAX_ATTEMPTS;
      if (tooOld || tooManyAttempts) {
        logger.warn(
          `[telegram-queue] dropping alert ${item.id} (attempts=${item.attempts}, age=${
            now - Date.parse(item.createdAt)
          }ms)`
        );
        return false;
      }
      return true;
    });

    const dropped = queue.length - remaining.length;
    if (dropped > 0) {
      await this.store.set(STORE_KEY, remaining);
    }
    return dropped;
  }
}

const telegramQueueInstance = new TelegramQueue();
export default telegramQueueInstance;
