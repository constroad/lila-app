import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { areJidsSameUser, isLidUser, jidEncode, jidNormalizedUser } from '@whiskeysockets/baileys';
import connectionManager from '../../whatsapp/baileys/connection.manager.js';
import conversationManager from '../../whatsapp/ai-agent/conversation.manager.js';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import { incrementWhatsAppUsage } from '../../middleware/quota.middleware.js';
import { storagePathService } from '../../services/storage-path.service.js';

function normalizeRecipient(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('@')) return trimmed;
  const normalized = trimmed.replace(/[^\d]/g, '');
  return `${normalized}@s.whatsapp.net`;
}

const SESSION_ERROR_PATTERNS = [
  'session not connected',
  'not connected',
  'connection closed',
  'stream errored',
  'restart required',
  'not authorized',
  'not logged in',
];

const NOT_ACCEPTABLE_PATTERNS = ['not-acceptable'];
const NO_SESSIONS_PATTERNS = ['no sessions', 'no session'];

const extractErrorMessage = (error: unknown): string => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || '';
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
};

const isSessionUnavailableError = (error: unknown): boolean => {
  const message = extractErrorMessage(error).toLowerCase();
  if (!message) return false;
  return SESSION_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
};

const isNotAcceptableError = (error: unknown): boolean => {
  const message = extractErrorMessage(error).toLowerCase();
  if (!message) return false;
  return NOT_ACCEPTABLE_PATTERNS.some((pattern) => message.includes(pattern));
};

const isNoSessionsError = (error: unknown): boolean => {
  const message = extractErrorMessage(error).toLowerCase();
  if (!message) return false;
  return NO_SESSIONS_PATTERNS.some((pattern) => message.includes(pattern));
};

const buildSessionUnavailableError = (message = 'Session not connected'): CustomError => {
  const error: CustomError = new Error(message);
  error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
  return error;
};

const buildForbiddenError = (message = 'WhatsApp rejected the message for this chat'): CustomError => {
  const error: CustomError = new Error(message);
  error.statusCode = HTTP_STATUS.FORBIDDEN;
  return error;
};

const isGroupJid = (jid: string): boolean => jid.endsWith('@g.us');
const getSendOptions = (recipient: string) => {
  if (isGroupJid(recipient)) {
    return {
      useCachedGroupMetadata: false,
      useUserDevicesCache: false,
    } as const;
  }
  return undefined;
};

/**
 * Helper: Wait for a condition with timeout
 */
const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 200
): Promise<boolean> => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
};

/**
 * Helper: Verify sessions exist in auth state
 */
const verifySessions = (socket: any, jids: string[]): boolean => {
  if (!socket?.authState?.keys?.get) {
    return false;
  }

  // Sample check: verify at least some sessions exist
  // Full verification would check all jids, but that's expensive
  const sampleSize = Math.min(3, jids.length);
  const sampled = jids.slice(0, sampleSize);

  let foundCount = 0;
  for (const jid of sampled) {
    try {
      const sessions = socket.authState.keys.get('session', [jid]);
      if (sessions && Object.keys(sessions).length > 0) {
        foundCount++;
      }
    } catch {
      // Ignore errors in verification
    }
  }

  // Consider success if at least 50% of sampled have sessions
  return foundCount >= Math.ceil(sampleSize / 2);
};

const assertRecipientSessions = async (socket: any, recipient: string): Promise<boolean> => {
  if (!socket?.assertSessions) {
    return false;
  }

  // 🔍 FORCE LOG: Always log before try to guarantee output
  logger.info(`🔍 === assertRecipientSessions START for ${recipient} ===`);

  try {
    if (isGroupJid(recipient)) {
      const metadata = await socket.groupMetadata(recipient);
      const participants = (metadata?.participants || []).map((participant: any) => participant?.id).filter(Boolean);

      logger.info(`🔍 Raw socket.user: ${JSON.stringify({ id: socket?.user?.id, lid: socket?.user?.lid })}`);
      logger.info(`🔍 Raw creds.me: ${JSON.stringify({ id: socket?.authState?.creds?.me?.id, lid: socket?.authState?.creds?.me?.lid })}`);

      const ownJids = [
        socket?.user?.id,
        socket?.user?.lid,
        socket?.authState?.creds?.me?.id,
        socket?.authState?.creds?.me?.lid,
      ]
        .filter(Boolean)
        .map((jid) => jidNormalizedUser(jid as string));
      const hasOwnIdentity = ownJids.length > 0;

      const isMember = participants.some((jid) =>
        ownJids.some((ownJid) => areJidsSameUser(jid, ownJid))
      );
      const participantRecord = (metadata?.participants || []).find((participant: any) =>
        ownJids.some((ownJid) => areJidsSameUser(participant?.id, ownJid))
      );
      const isAdmin =
        participantRecord?.admin === 'admin' ||
        participantRecord?.admin === 'superadmin' ||
        participantRecord?.isAdmin === true;

      const participantStats = participants.reduce(
        (acc: { total: number; lid: number; user: number; other: number }, jid: string) => {
          acc.total += 1;
          if (isLidUser(jid)) {
            acc.lid += 1;
          } else if (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us')) {
            acc.user += 1;
          } else {
            acc.other += 1;
          }
          return acc;
        },
        { total: 0, lid: 0, user: 0, other: 0 }
      );

      // 🔍 DEBUG: Log exact JIDs for troubleshooting
      logger.info(
        `🔍 Own JIDs (normalized): ${JSON.stringify(ownJids)}`
      );
      logger.info(
        `🔍 Group participants (first 10): ${JSON.stringify(participants.slice(0, 10))}`
      );
      logger.info(
        `🔍 MEMBERSHIP CHECK: isMember=${isMember}, isAdmin=${isAdmin}, hasOwnIdentity=${hasOwnIdentity}`
      );
      logger.info(
        `Group metadata for ${recipient}: participants=${participantStats.total}, user=${participantStats.user}, lid=${participantStats.lid}, other=${participantStats.other}, isMember=${isMember}, isAdmin=${isAdmin}, announce=${metadata?.announce ?? false}, ownIds=${ownJids.length}`
      );

      // ✅ RELAXED VALIDATION: Only warn about membership issues, don't block
      // Let WhatsApp be the final authority on whether message is acceptable
      if (hasOwnIdentity && !isMember) {
        logger.warn(
          `⚠️ WARNING: JID comparison suggests sender is not detected as group member. This may be a false positive due to JID format mismatch. Proceeding anyway - WhatsApp will reject if truly not a member.`
        );
        // Don't throw error - trust WhatsApp's validation
      }

      if (metadata?.announce && !isAdmin && hasOwnIdentity && isMember) {
        // Only check admin if we detected membership (to avoid false positives)
        logger.warn(
          `⚠️ WARNING: Group is admin-only and sender not detected as admin. Proceeding anyway - WhatsApp will reject if needed.`
        );
        // Don't throw error - trust WhatsApp's validation
      }

      const normalizedParticipants = Array.from(new Set(participants))
        .filter((jid) => typeof jid === 'string')
        .map((jid) => jidNormalizedUser(jid as string))
        .filter(Boolean);

      const useLid = normalizedParticipants.some((jid) => isLidUser(jid));
      const expandedParticipants = normalizedParticipants.flatMap((jid) => {
        if (!isLidUser(jid)) {
          return [jid];
        }
        const user = jid.split('@')[0] || '';
        if (!user) {
          return [jid];
        }
        return [jid, jidEncode(user, 's.whatsapp.net')];
      });

      const filtered = expandedParticipants
        .filter((jid) => isLidUser(jid) || jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us'))
        .filter((jid) => (hasOwnIdentity ? !ownJids.some((ownJid) => areJidsSameUser(jid, ownJid)) : true));

      if (filtered.length === 0) {
        logger.warn(`Group ${recipient} has no assertable participants`);
        return false;
      }

      // ✅ MEJORA 1: Assert sessions (trust Baileys to handle)
      logger.info(`🔄 Asserting sessions for ${filtered.length} participants in ${recipient}...`);

      try {
        // Assert user-level sessions
        await socket.assertSessions(filtered, true);
        logger.info(`✅ socket.assertSessions() completed`);

        // ✅ MEJORA 2: Wait for sessions to be established (give Baileys time to complete handshake)
        // Longer wait for groups (scales with participant count)
        const waitTime = Math.min(3000 + (filtered.length * 100), 15000); // 3s base + 100ms per participant, max 15s
        logger.info(`⏳ Waiting ${waitTime}ms for ${filtered.length} participants to establish sessions...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        logger.info(`✅ Session assertion completed for ${recipient}, proceeding with send attempt`);
      } catch (error) {
        logger.warn(`⚠️ Assert sessions encountered error: ${String(error)} - will attempt send anyway`);
        // Don't return false here - let the actual send attempt be the final test
      }

      // Then, if supported, assert device-level sessions to avoid "No sessions" on sender-key distribution
      if (typeof socket.getUSyncDevices === 'function') {
        try {
          const devices = await socket.getUSyncDevices(normalizedParticipants, false, false);
          const deviceJids = Array.from(
            new Set(
              devices
                .map((device: { user: string; device?: number }) =>
                  useLid
                    ? [
                        jidEncode(device.user, 'lid', device.device),
                        jidEncode(device.user, 's.whatsapp.net', device.device),
                      ]
                    : [jidEncode(device.user, 's.whatsapp.net', device.device)]
                )
                .flat()
                .filter(Boolean)
            )
          ).filter((jid) => (hasOwnIdentity ? !ownJids.some((ownJid) => areJidsSameUser(jid, ownJid)) : true));

          if (deviceJids.length > 0) {
            logger.info(
              `🔄 Asserting ${deviceJids.length} device sessions for ${recipient} (useLid=${useLid})`
            );
            await socket.assertSessions(deviceJids, true);

            // Wait for device sessions too
            await new Promise((resolve) => setTimeout(resolve, 1000));

            logger.info(`✅ Device sessions asserted for ${recipient}`);
          }
        } catch (error) {
          logger.warn(`Failed to assert device sessions for ${recipient}: ${String(error)}`);
        }
      }
    } else {
      // For direct messages
      logger.info(`🔄 Asserting session for direct message to ${recipient}...`);
      await socket.assertSessions([recipient], true);

      // Wait and verify
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const verified = verifySessions(socket, [recipient]);

      if (!verified) {
        logger.warn(`⚠️ Session verification failed for ${recipient}`);
        return false;
      }

      logger.info(`✅ Session verified for ${recipient}`);
    }
    return true;
  } catch (error) {
    logger.warn(`Failed to assert sessions for ${recipient}: ${String(error)}`);
    return false;
  }
};

const normalizeSessionError = (error: unknown): CustomError | null => {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    return error as CustomError;
  }
  if (isSessionUnavailableError(error)) {
    return buildSessionUnavailableError();
  }
  return null;
};

const normalizeSendError = (error: unknown): CustomError | null => {
  if (isNotAcceptableError(error)) {
    return buildForbiddenError(
      'WhatsApp rejected the message. Verify the sender is a member/admin of the group.'
    );
  }
  return normalizeSessionError(error);
};

const getActiveSocket = async (sessionPhone: string) => {
  const isConnected = await connectionManager.ensureConnected(sessionPhone);
  const socket = connectionManager.getConnection(sessionPhone) as any;
  if (!socket || !isConnected) {
    logger.warn(`getActiveSocket failed for ${sessionPhone}`, {
      isConnected,
      hasSocket: Boolean(socket),
    });
    throw buildSessionUnavailableError();
  }
  return socket;
};

const sendWithReconnect = async (
  sessionPhone: string,
  sendFn: (socket: any) => Promise<void>,
  options?: { recipient?: string }
) => {
  const socket = await getActiveSocket(sessionPhone);
  try {
    await sendFn(socket);
    return { retried: false };
  } catch (error) {
    // ✅ MEJORA: Handle not-acceptable with recovery attempt for groups
    if (isNotAcceptableError(error)) {
      // For groups, this might be a temporary sender-key sync issue
      if (options?.recipient && isGroupJid(options.recipient)) {
        logger.warn(
          `⚠️ not-acceptable error for group ${options.recipient}, attempting sender-key recovery...`
        );

        try {
          // 1. Refresh group metadata and assert sessions
          logger.info(`🔄 Step 1: Calling assertRecipientSessions()...`);
          const recovered = await assertRecipientSessions(socket, options.recipient);
          logger.info(`✅ Step 1 completed: recovered=${recovered}`);

          if (recovered) {
            // 2. Wait for sender-keys to sync (critical for post-QR groups)
            logger.info(`⏳ Step 2: Waiting 3s for sender-keys to sync after recovery...`);
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // 3. Retry send
            logger.info(`🔄 Step 3: Retrying send after sender-key recovery...`);
            await sendFn(socket);
            logger.info(`✅ Send successful after sender-key recovery`);
            return { retried: true };
          } else {
            logger.warn(`⚠️ assertRecipientSessions() returned false - cannot recover`);
          }
        } catch (retryError) {
          logger.warn(
            `❌ Sender-key recovery failed: ${extractErrorMessage(retryError)} - falling through to original error`
          );
          // Fall through to throw original not-acceptable error
        }
      }

      throw buildForbiddenError(
        'WhatsApp rejected the message. Verify the sender is a member/admin of the group.'
      );
    }

    if (!isNoSessionsError(error)) {
      const sessionError = normalizeSessionError(error);
      if (sessionError) {
        logger.warn(`Send failed for ${sessionPhone}, attempting reconnect...`, {
          error: extractErrorMessage(error),
        });

        try {
          await connectionManager.disconnect(sessionPhone);
        } catch {
          // ignore disconnect errors
        }

        try {
          await connectionManager.createConnection(sessionPhone);
          const reconnected = await connectionManager.ensureConnected(sessionPhone, 10000, 400);
          if (reconnected) {
            const retrySocket = connectionManager.getConnection(sessionPhone);
            if (retrySocket) {
              await sendFn(retrySocket);
              return { retried: true };
            }
          }
        } catch {
          // fall through to original error
        }

        throw sessionError;
      }
      throw error;
    }

    if (isNoSessionsError(error) && options?.recipient) {
      logger.warn(`No sessions for ${options.recipient}, attempting session assert...`);
      const repaired = await assertRecipientSessions(socket, options.recipient);
      if (repaired) {
        try {
          await sendFn(socket);
          return { retried: true };
        } catch (retryError) {
          logger.warn(
            `Retry after session assert failed for ${options.recipient}: ${extractErrorMessage(retryError)}`
          );
        }
      } else {
        logger.warn(`Session assert failed for ${options.recipient}`);
      }
    }
    const noSessionError = buildSessionUnavailableError(
      'Recipient session not ready. Try again after sessions are established.'
    );
    throw noSessionError;
  }
};

function detectMimeType(filename: string | undefined, fallback: string | undefined) {
  if (fallback) return fallback;
  if (!filename) return 'application/octet-stream';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'txt':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    case 'zip':
      return 'application/zip';
    case 'rar':
      return 'application/vnd.rar';
    case '7z':
      return 'application/x-7z-compressed';
    default:
      return 'application/octet-stream';
  }
}

function extractRelativePathFromUrl(fileUrl: string, companyId: string): string | null {
  try {
    const url = new URL(fileUrl, 'http://localhost');
    const pathname = url.pathname;
    const marker = `/files/companies/${companyId}/`;
    if (!pathname.startsWith(marker)) return null;
    const raw = pathname.slice(marker.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

function normalizeRelativePath(input: string, companyId: string): string | null {
  let raw = input.trim();
  if (!raw) return null;

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = new URL(raw);
      raw = url.pathname;
    }
  } catch {
    // ignore URL parse errors
  }

  raw = raw.replace(/\\/g, '/');

  const isUrlPath =
    raw.startsWith('/files/companies/') || raw.startsWith('/companies/');

  if (path.isAbsolute(raw) && !isUrlPath) {
    const companyRoot = storagePathService.getCompanyRoot(companyId);
    const normalizedRoot = path.normalize(companyRoot);
    const normalizedRaw = path.normalize(raw);
    if (normalizedRaw.startsWith(normalizedRoot)) {
      raw = path.relative(normalizedRoot, normalizedRaw);
    } else {
      return null;
    }
  }

  raw = raw.replace(/^\/+/, '');

  const marker = `files/companies/${companyId}/`;
  const altMarker = `companies/${companyId}/`;
  if (raw.startsWith(marker)) {
    raw = raw.slice(marker.length);
  } else if (raw.startsWith(altMarker)) {
    raw = raw.slice(altMarker.length);
  } else {
    const segment = `/companies/${companyId}/`;
    const idx = raw.indexOf(segment);
    if (idx >= 0) {
      raw = raw.slice(idx + segment.length);
    }
  }

  try {
    raw = decodeURIComponent(raw);
  } catch {
    // ignore decode errors
  }

  return raw || null;
}

async function resolveFileBuffer(params: {
  companyId: string;
  filePath?: string;
  fileUrl?: string;
  mimeType?: string;
  fileName?: string;
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const { companyId, filePath, fileUrl, mimeType, fileName } = params;

  let relativePath = filePath ? normalizeRelativePath(filePath, companyId) : null;
  if (!relativePath && fileUrl) {
    relativePath = normalizeRelativePath(fileUrl, companyId) ||
      extractRelativePathFromUrl(fileUrl, companyId);
  }
  if (!relativePath) return null;

  if (path.isAbsolute(relativePath)) {
    throw new Error('filePath must be relative');
  }

  const resolved = storagePathService.resolvePath(companyId, relativePath);
  if (!storagePathService.validateAccess(resolved, companyId)) {
    throw new Error('Invalid filePath');
  }

  const exists = await fs.pathExists(resolved);
  if (!exists) {
    throw new Error('File not found');
  }

  const stat = await fs.stat(resolved);
  const MAX_WTSP_BYTES = 100 * 1024 * 1024;
  if (stat.size > MAX_WTSP_BYTES) {
    throw new Error('File too large for WhatsApp');
  }

  const buffer = await fs.readFile(resolved);
  const resolvedFileName = fileName || path.basename(resolved);
  const resolvedMimeType = detectMimeType(resolvedFileName, mimeType);

  return {
    buffer,
    mimeType: resolvedMimeType,
    fileName: resolvedFileName,
  };
}

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone, chatId, message } = req.body;

    if (!sessionPhone || !chatId || !message) {
      const error: CustomError = new Error('sessionPhone, chatId, and message are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const { queued } = await connectionManager.sendTextMessage(
      sessionPhone,
      chatId,
      message
    );

    logger.info(`Message ${queued ? 'queued' : 'sent'} to ${chatId} via ${sessionPhone}`);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: queued ? 'Message queued for delivery' : 'Message sent successfully',
      queued,
    });
  } catch (error) {
    next(error);
  }
}

export async function sendTextMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone } = req.params;
    const { to, message, mentions } = req.body;

    if (!sessionPhone || !to || !message) {
      const error: CustomError = new Error('sessionPhone, to, and message are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const socket = await getActiveSocket(sessionPhone);
    logger.info(`sendTextMessage: connected=${connectionManager.isConnected(sessionPhone)}`);

    // Preparar mensaje con menciones si se proporcionan
    const messageContent: any = { text: message };

    if (mentions && Array.isArray(mentions) && mentions.length > 0) {
      // Normalizar menciones a formato JID
      const mentionedJids = mentions.map((phone: string) => normalizeRecipient(phone));
      messageContent.mentions = mentionedJids;
      logger.info(`Sending message with ${mentionedJids.length} mentions`);
    }

    // Enviar mensaje (con reconexión si es necesario)
    const sendOptions = getSendOptions(recipient);
    const sendResult = await sendWithReconnect(
      sessionPhone,
      (activeSocket) => activeSocket.sendMessage(recipient, messageContent, sendOptions),
      { recipient }
    );

    // Incrementar quota de WhatsApp (Fase 10)
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Message sent successfully',
      mentionsCount: mentions?.length || 0,
      retried: sendResult.retried,
    });
  } catch (error) {
    const sendError = normalizeSendError(error);
    if (sendError) {
      return next(sendError);
    }
    next(error);
  }
}

export async function sendImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone } = req.params;
    const { to, caption, filePath, fileUrl, mimeType, fileName } = req.body;
    const file = req.file;

    if (!sessionPhone || !to || (!file && !filePath && !fileUrl)) {
      const error: CustomError = new Error('sessionPhone, to, and file are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const socket = await getActiveSocket(sessionPhone);

    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    let sendResult: { retried: boolean };
    const sendOptions = getSendOptions(recipient);
    if (file) {
      sendResult = await sendWithReconnect(
        sessionPhone,
        (activeSocket) =>
          activeSocket.sendMessage(
            recipient,
            {
              image: file.buffer,
              caption,
              mimetype: detectMimeType(file.originalname, mimeType || file.mimetype),
            },
            sendOptions
          ),
        { recipient }
      );
    } else {
      const resolved = await resolveFileBuffer({
        companyId: req.companyId as string,
        filePath,
        fileUrl,
        mimeType,
        fileName,
      });
      if (!resolved) {
        const error: CustomError = new Error('filePath or fileUrl is required');
        error.statusCode = HTTP_STATUS.BAD_REQUEST;
        return next(error);
      }
      sendResult = await sendWithReconnect(
        sessionPhone,
        (activeSocket) =>
          activeSocket.sendMessage(
            recipient,
            {
              image: resolved.buffer,
              caption,
              mimetype: resolved.mimeType,
            },
            sendOptions
          ),
        { recipient }
      );
    }

    // Incrementar quota de WhatsApp (Fase 10)
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Image sent successfully',
      retried: sendResult.retried,
    });
  } catch (error) {
    const sendError = normalizeSendError(error);
    if (sendError) {
      return next(sendError);
    }
    next(error);
  }
}

export async function sendVideo(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone } = req.params;
    const { to, caption, filePath, fileUrl, mimeType, fileName } = req.body;
    const file = req.file;

    if (!sessionPhone || !to || (!file && !filePath && !fileUrl)) {
      const error: CustomError = new Error('sessionPhone, to, and file are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const socket = await getActiveSocket(sessionPhone);

    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    let sendResult: { retried: boolean };
    const sendOptions = getSendOptions(recipient);
    if (file) {
      sendResult = await sendWithReconnect(
        sessionPhone,
        (activeSocket) =>
          activeSocket.sendMessage(
            recipient,
            {
              video: file.buffer,
              caption,
              mimetype: detectMimeType(file.originalname, mimeType || file.mimetype),
            },
            sendOptions
          ),
        { recipient }
      );
    } else {
      const resolved = await resolveFileBuffer({
        companyId: req.companyId as string,
        filePath,
        fileUrl,
        mimeType,
        fileName,
      });
      if (!resolved) {
        const error: CustomError = new Error('filePath or fileUrl is required');
        error.statusCode = HTTP_STATUS.BAD_REQUEST;
        return next(error);
      }
      sendResult = await sendWithReconnect(
        sessionPhone,
        (activeSocket) =>
          activeSocket.sendMessage(
            recipient,
            {
              video: resolved.buffer,
              caption,
              mimetype: resolved.mimeType,
            },
            sendOptions
          ),
        { recipient }
      );
    }

    // Incrementar quota de WhatsApp (Fase 10)
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Video sent successfully',
      retried: sendResult.retried,
    });
  } catch (error) {
    const sendError = normalizeSendError(error);
    if (sendError) {
      return next(sendError);
    }
    next(error);
  }
}

export async function sendFile(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone } = req.params;
    const { to, caption, mimeType, filePath, fileUrl, fileName } = req.body;
    const file = req.file;

    if (!sessionPhone || !to || (!file && !filePath && !fileUrl)) {
      const error: CustomError = new Error('sessionPhone, to, and file are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const socket = await getActiveSocket(sessionPhone);

    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    let sendResult: { retried: boolean };
    const sendOptions = getSendOptions(recipient);
    if (file) {
      sendResult = await sendWithReconnect(
        sessionPhone,
        (activeSocket) =>
          activeSocket.sendMessage(
            recipient,
            {
              document: file.buffer,
              fileName: file.originalname || 'document',
              mimetype: detectMimeType(file.originalname, mimeType || file.mimetype),
              caption,
            },
            sendOptions
          ),
        { recipient }
      );
    } else {
      const resolved = await resolveFileBuffer({
        companyId: req.companyId as string,
        filePath,
        fileUrl,
        mimeType,
        fileName,
      });
      if (!resolved) {
        const error: CustomError = new Error('filePath or fileUrl is required');
        error.statusCode = HTTP_STATUS.BAD_REQUEST;
        return next(error);
      }
      sendResult = await sendWithReconnect(
        sessionPhone,
        (activeSocket) =>
          activeSocket.sendMessage(
            recipient,
            {
              document: resolved.buffer,
              fileName: resolved.fileName || 'document',
              mimetype: resolved.mimeType,
              caption,
            },
            sendOptions
          ),
        { recipient }
      );
    }

    // Incrementar quota de WhatsApp (Fase 10)
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'File sent successfully',
      retried: sendResult.retried,
    });
  } catch (error) {
    const sendError = normalizeSendError(error);
    if (sendError) {
      return next(sendError);
    }
    next(error);
  }
}

export async function getConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone, chatId } = req.params;

    if (!sessionPhone || !chatId) {
      const error: CustomError = new Error('sessionPhone and chatId are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const conversation = await conversationManager.get(chatId, sessionPhone);

    if (!conversation) {
      const error: CustomError = new Error('Conversation not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllConversations(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { sessionPhone } = req.params;

    if (!sessionPhone) {
      const error: CustomError = new Error('sessionPhone is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const conversations = await conversationManager.getAllForSession(sessionPhone);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        total: conversations.length,
        conversations,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function closeConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone, chatId } = req.params;

    if (!sessionPhone || !chatId) {
      const error: CustomError = new Error('sessionPhone and chatId are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    await conversationManager.closeConversation(chatId, sessionPhone);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Conversation closed',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Envía una encuesta (poll) a WhatsApp
 * Fase 11: Mensajes Avanzados
 */
export async function sendPoll(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone } = req.params;
    const { to, question, options, selectableCount } = req.body;

    if (!sessionPhone || !to || !question || !options) {
      const error: CustomError = new Error('sessionPhone, to, question, and options are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (!Array.isArray(options) || options.length < 2) {
      const error: CustomError = new Error('options must be an array with at least 2 items');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (options.length > 12) {
      const error: CustomError = new Error('options cannot exceed 12 items');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const socket = await getActiveSocket(sessionPhone);

    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error: CustomError = new Error('Invalid recipient');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    // Determinar número de opciones seleccionables
    const selectableOptions = selectableCount || 1;
    const maxSelectable = Math.min(selectableOptions, options.length);

    // Enviar poll (con reconexión si es necesario)
    let message: any;
    const sendOptions = getSendOptions(recipient);
    const sendResult = await sendWithReconnect(
      sessionPhone,
      async (activeSocket) => {
        message = await activeSocket.sendMessage(
          recipient,
          {
            poll: {
              name: question,
              values: options,
              selectableCount: maxSelectable,
            },
          },
          sendOptions
        );
      },
      { recipient }
    );

    logger.info(`Poll sent to ${recipient}: ${question} (${options.length} options)`);

    // Incrementar quota de WhatsApp (Fase 10)
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Poll sent successfully',
      messageId: message.key.id,
      pollDetails: {
        question,
        optionsCount: options.length,
        selectableCount: maxSelectable,
      },
      retried: sendResult.retried,
    });
  } catch (error) {
    const sendError = normalizeSendError(error);
    if (sendError) {
      return next(sendError);
    }
    next(error);
  }
}

/**
 * Envía un menú de texto numerado (alternativa a buttons)
 * Fase 11: Mensajes Avanzados
 */
export async function sendTextMenu(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone } = req.params;
    const { to, title, options, footer } = req.body;

    if (!sessionPhone || !to || !options) {
      const error: CustomError = new Error('sessionPhone, to, and options are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (!Array.isArray(options) || options.length < 1) {
      const error: CustomError = new Error('options must be an array with at least 1 item');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const socket = await getActiveSocket(sessionPhone);

    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error: CustomError = new Error('Invalid recipient');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    // Construir menú de texto
    const menuLines: string[] = [];

    if (title) {
      menuLines.push(`*${title}*`);
      menuLines.push('');
    }

    options.forEach((option: string, index: number) => {
      menuLines.push(`${index + 1}. ${option}`);
    });

    if (footer) {
      menuLines.push('');
      menuLines.push(footer);
    } else {
      menuLines.push('');
      menuLines.push('_Reply with the number of your choice_');
    }

    const menuText = menuLines.join('\n');

    // Enviar mensaje (con reconexión si es necesario)
    const sendOptions = getSendOptions(recipient);
    const sendResult = await sendWithReconnect(
      sessionPhone,
      (activeSocket) =>
        activeSocket.sendMessage(
          recipient,
          { text: menuText },
          sendOptions
        ),
      { recipient }
    );

    logger.info(`Text menu sent to ${recipient}: ${options.length} options`);

    // Incrementar quota de WhatsApp (Fase 10)
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Text menu sent successfully',
      menuDetails: {
        title: title || null,
        optionsCount: options.length,
        footer: footer || null,
      },
      retried: sendResult.retried,
    });
  } catch (error) {
    const sendError = normalizeSendError(error);
    if (sendError) {
      return next(sendError);
    }
    next(error);
  }
}
