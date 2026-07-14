import path from 'path';
import { randomUUID } from 'crypto';
import JsonStore from '../../storage/json.store.js';
import logger from '../../utils/logger.js';
import { config } from '../../config/environment.js';
import { sendTelegramAlert } from '../../services/telegram-alert.service.js';

// Política de retención (patrón telegram-queue): un item que ya falló OUTBOX_MAX_ATTEMPTS
// veces o lleva más de OUTBOX_TTL_MS encolado se descarta en el flush. Sin esto, un item
// envenenado (ej. media irrecuperable) se reintentaba para siempre y, con el viejo
// break-on-first-error, bloqueaba TODA la cola detrás de él.
export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_TTL_MS = 24 * 60 * 60 * 1000;
// Cap por sesión: los media viajan como base64 DENTRO del JSON de la cola (se
// reescribe entero por operación). Sin cap, una caída larga con ráfaga de videos
// infla el archivo y la memoria sin límite. Al exceder: drop del más viejo + alerta.
export const OUTBOX_MAX_ITEMS = 50;

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
  companyId?: string;
  tenantId?: string;
  trackUsage?: boolean;
  // Media message (image, video, document)
  mediaOptions?: {
    buffer?: string; // Base64 encoded buffer
    fileName?: string;
    filePath?: string;
    fileUrl?: string;
    caption?: string;
    mimeType?: string;
    companyId?: string;
    tenantId?: string;
    trackUsage?: boolean;
  };
};

/**
 * Un item se descarta si agotó sus intentos o expiró su TTL. `createdAt` ilegible
 * cuenta como expirado (item corrupto: nunca podría razonarse su antigüedad).
 */
export function isOutboxItemDroppable(item: OutboxMessage, nowMs: number): boolean {
  if (item.attempts >= OUTBOX_MAX_ATTEMPTS) return true;
  const createdAtMs = Date.parse(item.createdAt);
  if (!Number.isFinite(createdAtMs)) return true;
  return nowMs - createdAtMs > OUTBOX_TTL_MS;
}

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
   * Aplica el cap OUTBOX_MAX_ITEMS con drop-oldest (FIFO: lo más viejo ya es lo más
   * probable de expirar por TTL) y alerta por Telegram con dedupe por sesión.
   */
  private enforceCap(sessionPhone: string, queue: OutboxMessage[]): OutboxMessage[] {
    if (queue.length < OUTBOX_MAX_ITEMS) {
      return queue;
    }
    const overflow = queue.length - OUTBOX_MAX_ITEMS + 1;
    const dropped = queue.slice(0, overflow);
    dropped.forEach((item) => {
      logger.warn(
        `🗑 Outbox ${sessionPhone} lleno (${OUTBOX_MAX_ITEMS}): dropped oldest ${item.messageType} ${item.id} (createdAt=${item.createdAt})`
      );
    });
    sendTelegramAlert({
      dedupeKey: `outbox-overflow-${sessionPhone}`,
      message:
        `⚠️ Outbox WhatsApp de ${sessionPhone} alcanzó el límite de ${OUTBOX_MAX_ITEMS} mensajes.\n\n` +
        `Se descartaron los más viejos para encolar los nuevos. La sesión lleva demasiado tiempo caída: revisa su estado.`,
    }).catch(() => {});
    return queue.slice(overflow);
  }

  /**
   * Enqueue a text message
   */
  async enqueue(
    sessionPhone: string,
    recipient: string,
    text: string,
    mentions?: string[],
    metadata: { companyId?: string; tenantId?: string; trackUsage?: boolean } = {}
  ): Promise<OutboxMessage> {
    const queue = this.enforceCap(sessionPhone, await this.list(sessionPhone));
    const item: OutboxMessage = {
      id: randomUUID(),
      sessionPhone,
      recipient,
      messageType: 'text',
      text,
      mentions,
      companyId: metadata.companyId,
      tenantId: metadata.tenantId,
      trackUsage: metadata.trackUsage,
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
      tenantId?: string;
      trackUsage?: boolean;
    }
  ): Promise<OutboxMessage> {
    const queue = this.enforceCap(sessionPhone, await this.list(sessionPhone));

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
