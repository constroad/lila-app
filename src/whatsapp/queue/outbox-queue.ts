import path from 'path';
import { randomUUID } from 'crypto';
import JsonStore from '../../storage/json.store.js';
import logger from '../../utils/logger.js';
import { config } from '../../config/environment.js';

export type OutboxMessage = {
  id: string;
  sessionPhone: string;
  recipient: string;
  messageType: 'text' | 'image' | 'video' | 'document';
  createdAt: string;
  attempts: number;
  lastError?: string;
  // Text message
  text?: string;
  mentions?: string[];
  // Media message (image, video, document)
  mediaOptions?: {
    buffer?: string; // Base64 encoded buffer
    fileName?: string;
    filePath?: string;
    fileUrl?: string;
    caption?: string;
    mimeType?: string;
    companyId?: string;
  };
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

  /**
   * Enqueue a text message
   */
  async enqueue(sessionPhone: string, recipient: string, text: string, mentions?: string[]): Promise<OutboxMessage> {
    const queue = await this.list(sessionPhone);
    const item: OutboxMessage = {
      id: randomUUID(),
      sessionPhone,
      recipient,
      messageType: 'text',
      text,
      mentions,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    queue.push(item);
    await this.store.set(sessionPhone, queue);
    logger.info(`Queued outbound text message ${item.id} for ${sessionPhone}`);
    return item;
  }

  /**
   * Enqueue a media message (image, video, document)
   */
  async enqueueMedia(
    sessionPhone: string,
    recipient: string,
    messageType: 'image' | 'video' | 'document',
    options: {
      buffer?: Buffer;
      fileName?: string;
      filePath?: string;
      fileUrl?: string;
      caption?: string;
      mimeType?: string;
      companyId?: string;
    }
  ): Promise<OutboxMessage> {
    const queue = await this.list(sessionPhone);

    // Convert buffer to base64 for JSON storage
    const mediaOptions = {
      ...options,
      buffer: options.buffer ? options.buffer.toString('base64') : undefined,
    };

    const item: OutboxMessage = {
      id: randomUUID(),
      sessionPhone,
      recipient,
      messageType,
      mediaOptions,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    queue.push(item);
    await this.store.set(sessionPhone, queue);
    logger.info(`Queued outbound ${messageType} message ${item.id} for ${sessionPhone}`);
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

const outboxQueueInstance = new OutboxQueue();
export default outboxQueueInstance;

/**
 * Flush outbox queue for a session (send pending messages)
 * This is called automatically when a session reconnects
 * NOTE: This function is standalone to avoid circular dependencies
 */
export async function flushOutboxForSession(sessionPhone: string): Promise<void> {
  // Dynamic import to avoid circular dependency
  const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');

  try {
    await WhatsAppDirectService.flushOutbox(sessionPhone);
  } catch (error) {
    logger.error(`Error flushing outbox for ${sessionPhone}:`, error);
  }
}
