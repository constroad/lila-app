import path from 'path';
import { randomUUID } from 'crypto';
import JsonStore from '../../storage/json.store.js';
import logger from '../../utils/logger.js';
import { config } from '../../config/environment.js';

export type OutboxMessage = {
  id: string;
  sessionPhone: string;
  recipient: string;
  text: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

export class OutboxQueue {
  private store: JsonStore;

  constructor() {
    const baseDir = path.join(config.whatsapp.sessionDir, '../outbox');
    this.store = new JsonStore({ baseDir, autoBackup: true });
  }

  async list(sessionPhone: string): Promise<OutboxMessage[]> {
    const data = await this.store.get<OutboxMessage[]>(sessionPhone);
    return Array.isArray(data) ? data : [];
  }

  async enqueue(sessionPhone: string, recipient: string, text: string): Promise<OutboxMessage> {
    const queue = await this.list(sessionPhone);
    const item: OutboxMessage = {
      id: randomUUID(),
      sessionPhone,
      recipient,
      text,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    queue.push(item);
    await this.store.set(sessionPhone, queue);
    logger.info(`Queued outbound message ${item.id} for ${sessionPhone}`);
    return item;
  }

  async update(sessionPhone: string, item: OutboxMessage): Promise<void> {
    const queue = await this.list(sessionPhone);
    const index = queue.findIndex((entry) => entry.id === item.id);
    if (index === -1) {
      return;
    }
    queue[index] = item;
    await this.store.set(sessionPhone, queue);
  }

  async remove(sessionPhone: string, id: string): Promise<void> {
    const queue = await this.list(sessionPhone);
    const next = queue.filter((item) => item.id !== id);
    await this.store.set(sessionPhone, next);
  }

  async clear(sessionPhone: string): Promise<void> {
    await this.store.set(sessionPhone, []);
    logger.info(`Cleared outbound queue for ${sessionPhone}`);
  }
}

export default new OutboxQueue();
