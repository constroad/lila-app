/**
 * 📦 WhatsApp Direct Service (EXACT copy from notifications)
 *
 * Simple, direct message sending without complex validations.
 * This is the "notifications" approach - just send directly.
 */

import {
  startSession,
  getSession,
  createPairingSession,
  listSessions,
  getStore,
  isWhatsAppSessionActive,
  disconnectSession,
  getQRCode,
  isSessionReady,
} from '../whatsapp/baileys/sessions.simple.js';
import { populateStoreIfEmpty } from '../whatsapp/baileys/populate-store-simple.js';
import {
  detectMimeType,
  getSendOptions,
  resolveFileBuffer,
  downloadFileFromUrl,
} from './whatsapp-media.utils.js';
import outboxQueue from '../whatsapp/queue/outbox-queue.js';
import logger from '../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';
import { config } from '../config/environment.js';
import { resolveWhatsAppRecipient } from '../utils/whatsapp-recipient-routing.js';
import {
  resolveCompanyIdFromMediaOptions,
  resolveWhatsAppMediaSourceKind,
} from './whatsapp-media-source.util.js';
import { assertWhatsAppRecipient } from '../utils/whatsapp-phone.js';

export const WhatsAppDirectService = {
  /**
   * Create session with QR code
   */
  async createSession(id: string, qrCb: (qr: string) => void) {
    return await startSession(id, qrCb);
  },

  /**
   * Create session with pairing code
   */
  createPairingSession: (phone: string, cb: (code: string) => void) => {
    return createPairingSession(phone, cb);
  },

  /**
   * Send text message (DIRECT - no assertSessions)
   * @param queueOnFail - If true, queue message when send fails (default: true)
   */
  async sendMessage(
    id: string,
    to: string,
    message: string,
    options: {
      queueOnFail?: boolean;
      mentions?: string[];
      companyId?: string;
      tenantId?: string;
      skipRecipientRouting?: boolean;
    } = {}
  ) {
    const queueOnFail = options.queueOnFail !== false;
    const routedTo = options.skipRecipientRouting
      ? String(to || '').trim()
      : resolveWhatsAppRecipient(to, {
          companyId: options.companyId,
          tenantId: options.tenantId,
        });

    const sock = getSession(id);
    if (!sock) {
      if (queueOnFail) {
        await outboxQueue.enqueue(id, routedTo, message, options.mentions);
        logger.info(`📥 Queued text message for ${id} (session not found)`);
        return { queued: true };
      }
      throw new Error('Session not found');
    }

    if (!isSessionReady(id)) {
      if (queueOnFail) {
        await outboxQueue.enqueue(id, routedTo, message, options.mentions);
        logger.info(`📥 Queued text message for ${id} (session not ready)`);
        return { queued: true };
      }
      throw new Error('Session not ready');
    }

    try {
      const validTo = assertWhatsAppRecipient(routedTo);
      const sendOptions = getSendOptions(validTo);
      return await sock.sendMessage(validTo, { text: message }, sendOptions);
    } catch (error) {
      logger.warn(`Failed to send message via ${id}: ${String(error)}`);
      if (queueOnFail) {
        await outboxQueue.enqueue(id, routedTo, message, options.mentions);
        logger.info(`📥 Queued text message for ${id} (send failed)`);
        return { queued: true };
      }
      throw error;
    }
  },

  /**
   * Send video file (enhanced with legacy features)
   *
   * FIXES:
   * - MP4 detection: Forces 'video/mp4' instead of 'application/mp4'
   * - Proper mimetype detection by extension (not browser detection)
   *
   * @param id - Session ID
   * @param to - Recipient (phone or group JID)
   * @param options - Send options (same as sendImageFile)
   */
  async sendVideoFile(
    id: string,
    to: string,
    options: {
      buffer?: Buffer;
      fileName?: string;
      filePath?: string;
      fileUrl?: string;
      caption?: string;
      mimeType?: string;
      companyId?: string;
      tenantId?: string;
      queueOnFail?: boolean;
    }
  ) {
    const queueOnFail = options.queueOnFail !== false;
    const routedTo = resolveWhatsAppRecipient(to, {
      companyId: options.companyId,
      tenantId: options.tenantId,
    });

    const sock = getSession(id);
    if (!sock) {
      if (queueOnFail) {
        await outboxQueue.enqueueMedia(id, routedTo, 'video', options);
        logger.info(`📥 Queued video message for ${id} (session not found)`);
        return { queued: true };
      }
      throw new Error('Session not found');
    }

    if (!isSessionReady(id)) {
      if (queueOnFail) {
        await outboxQueue.enqueueMedia(id, routedTo, 'video', options);
        logger.info(`📥 Queued video message for ${id} (session not ready)`);
        return { queued: true };
      }
      throw new Error('Session not ready');
    }

    const validTo = assertWhatsAppRecipient(routedTo);
    const sendOptions = getSendOptions(validTo);

    let videoBuffer: Buffer;
    let resolvedMimeType: string;
    let shouldCleanup = false;
    let cleanupPath: string | undefined;

    const sourceKind = resolveWhatsAppMediaSourceKind(options);

    if (sourceKind === 'buffer') {
      videoBuffer = options.buffer;
      // FIX: Prioritize extension over browser-detected mimetype
      resolvedMimeType = detectMimeType(options.fileName, options.mimeType || 'video/mp4');
    } else if (sourceKind === 'storage') {
      const resolvedCompanyId = resolveCompanyIdFromMediaOptions(options);
      if (!resolvedCompanyId) {
        throw new Error('companyId is required when using filePath or fileUrl');
      }

      const resolved = await resolveFileBuffer({
        companyId: resolvedCompanyId,
        filePath: options.filePath,
        fileUrl: options.fileUrl,
        mimeType: options.mimeType,
        fileName: options.fileName,
      });

      if (!resolved) {
        throw new Error('Could not resolve file from filePath or fileUrl');
      }

      videoBuffer = resolved.buffer;
      resolvedMimeType = resolved.mimeType;
    } else if (sourceKind === 'temp') {
      const tempPath = path.join(config.uploads.directory, options.fileName);
      videoBuffer = await fs.readFile(tempPath);
      // FIX: Prioritize extension (e.g., .mp4 → video/mp4, not application/mp4)
      resolvedMimeType = detectMimeType(options.fileName, options.mimeType);
      shouldCleanup = true;
      cleanupPath = tempPath;
    } else if (sourceKind === 'external') {
      const downloaded = await downloadFileFromUrl(options.fileUrl, options.mimeType);
      videoBuffer = await fs.readFile(downloaded.filePath);
      resolvedMimeType = downloaded.mimeType;
      shouldCleanup = true;
      cleanupPath = downloaded.filePath;
    } else {
      throw new Error('One of buffer, fileName, filePath, or fileUrl is required');
    }

    try {
      // Send video
      await sock.sendMessage(
        validTo,
        {
          video: videoBuffer,
          caption: options.caption,
          mimetype: resolvedMimeType,
          ptv: false, // Not a video note
        },
        sendOptions
      );

      // Cleanup temp files
      if (shouldCleanup && cleanupPath) {
        await fs.unlink(cleanupPath).catch((err) =>
          console.error(`⚠️ Could not delete temp file ${cleanupPath}:`, err)
        );
      }
    } catch (error) {
      logger.warn(`Failed to send video via ${id}: ${String(error)}`);
      if (queueOnFail) {
        await outboxQueue.enqueueMedia(id, routedTo, 'video', options);
        logger.info(`📥 Queued video message for ${id} (send failed)`);
        return { queued: true };
      }
      throw error;
    }
  },

  /**
   * Send image file (enhanced with legacy features)
   *
   * @param id - Session ID
   * @param to - Recipient (phone or group JID)
   * @param options - Send options
   *   - buffer: Direct buffer (from file upload)
   *   - fileName: Temp file name in uploads dir (will be deleted after send)
   *   - filePath: Relative path in company storage (persistent, won't be deleted)
   *   - fileUrl: External URL or company storage URL
   *   - caption: Image caption
   *   - mimeType: Override MIME type
   *   - companyId: Required for filePath/fileUrl resolution
   */
  async sendImageFile(
    id: string,
    to: string,
    options: {
      buffer?: Buffer;
      fileName?: string;
      filePath?: string;
      fileUrl?: string;
      caption?: string;
      mimeType?: string;
      companyId?: string;
      tenantId?: string;
      queueOnFail?: boolean;
    }
  ) {
    const queueOnFail = options.queueOnFail !== false;
    const routedTo = resolveWhatsAppRecipient(to, {
      companyId: options.companyId,
      tenantId: options.tenantId,
    });

    const sock = getSession(id);
    if (!sock) {
      if (queueOnFail) {
        await outboxQueue.enqueueMedia(id, routedTo, 'image', options);
        logger.info(`📥 Queued image message for ${id} (session not found)`);
        return { queued: true };
      }
      throw new Error('Session not found');
    }

    if (!isSessionReady(id)) {
      if (queueOnFail) {
        await outboxQueue.enqueueMedia(id, routedTo, 'image', options);
        logger.info(`📥 Queued image message for ${id} (session not ready)`);
        return { queued: true };
      }
      throw new Error('Session not ready');
    }

    const validTo = assertWhatsAppRecipient(routedTo);
    const sendOptions = getSendOptions(validTo);

    let imageBuffer: Buffer;
    let resolvedMimeType: string;
    let shouldCleanup = false;
    let cleanupPath: string | undefined;

    const sourceKind = resolveWhatsAppMediaSourceKind(options);

    if (sourceKind === 'buffer') {
      imageBuffer = options.buffer;
      resolvedMimeType = detectMimeType(options.fileName, options.mimeType || 'image/jpeg');
    } else if (sourceKind === 'storage') {
      const resolvedCompanyId = resolveCompanyIdFromMediaOptions(options);
      if (!resolvedCompanyId) {
        throw new Error('companyId is required when using filePath or fileUrl');
      }

      const resolved = await resolveFileBuffer({
        companyId: resolvedCompanyId,
        filePath: options.filePath,
        fileUrl: options.fileUrl,
        mimeType: options.mimeType,
        fileName: options.fileName,
      });

      if (!resolved) {
        throw new Error('Could not resolve file from filePath or fileUrl');
      }

      imageBuffer = resolved.buffer;
      resolvedMimeType = resolved.mimeType;
    } else if (sourceKind === 'temp') {
      const tempPath = path.join(config.uploads.directory, options.fileName);
      imageBuffer = await fs.readFile(tempPath);
      resolvedMimeType = detectMimeType(options.fileName, options.mimeType);
      shouldCleanup = true;
      cleanupPath = tempPath;
    } else if (sourceKind === 'external') {
      const downloaded = await downloadFileFromUrl(options.fileUrl, options.mimeType);
      imageBuffer = await fs.readFile(downloaded.filePath);
      resolvedMimeType = downloaded.mimeType;
      shouldCleanup = true;
      cleanupPath = downloaded.filePath;
    } else {
      throw new Error('One of buffer, fileName, filePath, or fileUrl is required');
    }

    try {
      // Send image
      await sock.sendMessage(
        validTo,
        {
          image: imageBuffer,
          caption: options.caption,
          mimetype: resolvedMimeType,
        },
        sendOptions
      );

      // Cleanup temp files
      if (shouldCleanup && cleanupPath) {
        await fs.unlink(cleanupPath).catch((err) =>
          console.error(`⚠️ Could not delete temp file ${cleanupPath}:`, err)
        );
      }
    } catch (error) {
      logger.warn(`Failed to send image via ${id}: ${String(error)}`);
      if (queueOnFail) {
        await outboxQueue.enqueueMedia(id, routedTo, 'image', options);
        logger.info(`📥 Queued image message for ${id} (send failed)`);
        return { queued: true };
      }
      throw error;
    }
  },

  /**
   * Send document/file (enhanced with legacy features)
   *
   * FIXES:
   * - PDF detection: Forces 'application/pdf' instead of 'application/octet-stream'
   * - Proper mimetype for Office docs (DOCX, XLSX, PPTX)
   * - fileName is REQUIRED for WhatsApp document display
   *
   * @param id - Session ID
   * @param to - Recipient (phone or group JID)
   * @param options - Send options (same as sendImageFile)
   */
  async sendDocument(
    id: string,
    to: string,
    options: {
      buffer?: Buffer;
      fileName?: string;
      filePath?: string;
      fileUrl?: string;
      caption?: string;
      mimeType?: string;
      companyId?: string;
      tenantId?: string;
      queueOnFail?: boolean;
      skipRecipientRouting?: boolean;
    }
  ) {
    const queueOnFail = options.queueOnFail !== false;
    const routedTo = options.skipRecipientRouting
      ? String(to || '').trim()
      : resolveWhatsAppRecipient(to, {
          companyId: options.companyId,
          tenantId: options.tenantId,
        });

    const sock = getSession(id);
    if (!sock) {
      if (queueOnFail) {
        await outboxQueue.enqueueMedia(id, routedTo, 'document', options);
        logger.info(`📥 Queued document message for ${id} (session not found)`);
        return { queued: true };
      }
      throw new Error('Session not found');
    }

    if (!isSessionReady(id)) {
      if (queueOnFail) {
        await outboxQueue.enqueueMedia(id, routedTo, 'document', options);
        logger.info(`📥 Queued document message for ${id} (session not ready)`);
        return { queued: true };
      }
      throw new Error('Session not ready');
    }

    const validTo = assertWhatsAppRecipient(routedTo);
    const sendOptions = getSendOptions(validTo);

    let documentBuffer: Buffer;
    let resolvedMimeType: string;
    let resolvedFileName: string;
    let shouldCleanup = false;
    let cleanupPath: string | undefined;

    const sourceKind = resolveWhatsAppMediaSourceKind(options);

    if (sourceKind === 'buffer') {
      documentBuffer = options.buffer;
      // FIX: Prioritize extension (e.g., .pdf → application/pdf, not octet-stream)
      resolvedMimeType = detectMimeType(options.fileName, options.mimeType || 'application/octet-stream');
      resolvedFileName = options.fileName || 'document';
    } else if (sourceKind === 'storage') {
      const resolvedCompanyId = resolveCompanyIdFromMediaOptions(options);
      if (!resolvedCompanyId) {
        throw new Error('companyId is required when using filePath or fileUrl');
      }

      const resolved = await resolveFileBuffer({
        companyId: resolvedCompanyId,
        filePath: options.filePath,
        fileUrl: options.fileUrl,
        mimeType: options.mimeType,
        fileName: options.fileName,
      });

      if (!resolved) {
        throw new Error('Could not resolve file from filePath or fileUrl');
      }

      documentBuffer = resolved.buffer;
      resolvedMimeType = resolved.mimeType;
      resolvedFileName = resolved.fileName;
    } else if (sourceKind === 'temp') {
      const tempPath = path.join(config.uploads.directory, options.fileName);
      documentBuffer = await fs.readFile(tempPath);
      // FIX: Prioritize extension for correct PDF/DOC detection
      resolvedMimeType = detectMimeType(options.fileName, options.mimeType);
      resolvedFileName = options.fileName;
      shouldCleanup = true;
      cleanupPath = tempPath;
    } else if (sourceKind === 'external') {
      const downloaded = await downloadFileFromUrl(options.fileUrl, options.mimeType);
      documentBuffer = await fs.readFile(downloaded.filePath);
      resolvedMimeType = downloaded.mimeType;
      resolvedFileName = downloaded.fileName;
      shouldCleanup = true;
      cleanupPath = downloaded.filePath;
    } else {
      throw new Error('One of buffer, fileName, filePath, or fileUrl is required');
    }

    try {
      // Send document
      await sock.sendMessage(
        validTo,
        {
          document: documentBuffer,
          fileName: resolvedFileName, // REQUIRED for WhatsApp
          mimetype: resolvedMimeType,
          caption: options.caption,
        },
        sendOptions
      );

      // Cleanup temp files
      if (shouldCleanup && cleanupPath) {
        await fs.unlink(cleanupPath).catch((err) =>
          console.error(`⚠️ Could not delete temp file ${cleanupPath}:`, err)
        );
      }
    } catch (error) {
      logger.warn(`Failed to send document via ${id}: ${String(error)}`);
      if (queueOnFail) {
        await outboxQueue.enqueueMedia(id, routedTo, 'document', options);
        logger.info(`📥 Queued document message for ${id} (send failed)`);
        return { queued: true };
      }
      throw error;
    }
  },

  /**
   * List all chats
   */
  listChats: (id: string) => {
    const store = getStore(id);
    return Array.from(store.chats.values());
  },

  /**
   * List all contacts
   */
  listContacts: (id: string) => {
    const store = getStore(id);
    return Array.from(store.contacts.values());
  },

  /**
   * List groups only
   */
  listGroups: (id: string) => {
    const store = getStore(id);
    return Array.from(store.chats.values())
      .filter((chat) => chat.id.endsWith('@g.us'))
      .map((group) => ({
        id: group.id,
        name: group.name,
        participants: group.participant?.map((p) => p) || [],
      }));
  },

  /**
   * Refresh groups from WhatsApp
   */
  refreshGroups: async (id: string) => {
    const sock = getSession(id);
    if (!sock) throw new Error('Session not found');
    const result = await populateStoreIfEmpty(id, sock);
    return result;
  },

  /**
   * Get all active sessions
   */
  getSessions: () => {
    return listSessions();
  },

  /**
   * Check if session is active
   */
  isSessionActive: (id: string) => {
    return isWhatsAppSessionActive(id);
  },

  /**
   * Check if session is ready
   */
  isSessionReady: (id: string) => {
    return isSessionReady(id);
  },

  /**
   * Get QR code for session
   */
  getQRCode: (id: string) => {
    return getQRCode(id);
  },

  /**
   * Disconnect session
   */
  disconnectSession: async (id: string) => {
    return await disconnectSession(id);
  },

  /**
   * Get session socket (for advanced use)
   */
  getSession: (id: string) => {
    return getSession(id);
  },

  /**
   * Flush outbox queue (send pending messages after reconnection)
   * This is called automatically when a session reconnects
   */
  async flushOutbox(id: string): Promise<void> {
    const sock = getSession(id);
    if (!sock || !isSessionReady(id)) {
      logger.warn(`Cannot flush outbox for ${id}: session not ready`);
      return;
    }

    const queue = await outboxQueue.list(id);
    if (queue.length === 0) {
      return;
    }

    logger.info(`📤 Flushing ${queue.length} queued messages for ${id}`);

    for (const item of queue) {
      try {
        if (item.messageType === 'text') {
          // Send text message
          await sock.sendMessage(item.recipient, { text: item.text! });
          await outboxQueue.remove(id, item.id);
          logger.info(`✅ Sent queued text message ${item.id}`);
        } else if (item.messageType === 'image' && item.mediaOptions) {
          // Send image
          const options = { ...item.mediaOptions };
          if (options.buffer) {
            options.buffer = Buffer.from(options.buffer, 'base64');
          }
          await this.sendImageFile(id, item.recipient, options as any);
          await outboxQueue.remove(id, item.id);
          logger.info(`✅ Sent queued image message ${item.id}`);
        } else if (item.messageType === 'video' && item.mediaOptions) {
          // Send video
          const options = { ...item.mediaOptions };
          if (options.buffer) {
            options.buffer = Buffer.from(options.buffer, 'base64');
          }
          await this.sendVideoFile(id, item.recipient, options as any);
          await outboxQueue.remove(id, item.id);
          logger.info(`✅ Sent queued video message ${item.id}`);
        } else if (item.messageType === 'document' && item.mediaOptions) {
          // Send document
          const options = { ...item.mediaOptions };
          if (options.buffer) {
            options.buffer = Buffer.from(options.buffer, 'base64');
          }
          await this.sendDocument(id, item.recipient, options as any);
          await outboxQueue.remove(id, item.id);
          logger.info(`✅ Sent queued document message ${item.id}`);
        }
      } catch (error) {
        // Update attempt count and error
        const updated = {
          ...item,
          attempts: item.attempts + 1,
          lastError: String(error),
        };
        await outboxQueue.update(id, updated);
        logger.warn(`⚠️ Failed to flush queued message ${item.id}: ${String(error)}`);
        // Stop on first error to avoid flooding
        break;
      }
    }
  },
};
