import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
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

    const isConnected = await connectionManager.ensureConnected(sessionPhone);
    const socket = connectionManager.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    // Preparar mensaje con menciones si se proporcionan
    const messageContent: any = { text: message };

    if (mentions && Array.isArray(mentions) && mentions.length > 0) {
      // Normalizar menciones a formato JID
      const mentionedJids = mentions.map((phone: string) => normalizeRecipient(phone));
      messageContent.mentions = mentionedJids;
      logger.info(`Sending message with ${mentionedJids.length} mentions`);
    }

    // Enviar mensaje
    await socket.sendMessage(recipient, messageContent);

    // Incrementar quota de WhatsApp (Fase 10)
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Message sent successfully',
      mentionsCount: mentions?.length || 0,
    });
  } catch (error) {
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

    const isConnected = await connectionManager.ensureConnected(sessionPhone);
    const socket = connectionManager.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (file) {
      await socket.sendMessage(recipient, {
        image: file.buffer,
        caption,
        mimetype: detectMimeType(file.originalname, mimeType || file.mimetype),
      });
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
      await socket.sendMessage(recipient, {
        image: resolved.buffer,
        caption,
        mimetype: resolved.mimeType,
      });
    }

    // Incrementar quota de WhatsApp (Fase 10)
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Image sent successfully',
    });
  } catch (error) {
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

    const isConnected = await connectionManager.ensureConnected(sessionPhone);
    const socket = connectionManager.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (file) {
      await socket.sendMessage(recipient, {
        video: file.buffer,
        caption,
        mimetype: detectMimeType(file.originalname, mimeType || file.mimetype),
      });
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
      await socket.sendMessage(recipient, {
        video: resolved.buffer,
        caption,
        mimetype: resolved.mimeType,
      });
    }

    // Incrementar quota de WhatsApp (Fase 10)
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Video sent successfully',
    });
  } catch (error) {
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

    const isConnected = await connectionManager.ensureConnected(sessionPhone);
    const socket = connectionManager.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (file) {
      await socket.sendMessage(recipient, {
        document: file.buffer,
        fileName: file.originalname || 'document',
        mimetype: detectMimeType(file.originalname, mimeType || file.mimetype),
        caption,
      });
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
      await socket.sendMessage(recipient, {
        document: resolved.buffer,
        fileName: resolved.fileName || 'document',
        mimetype: resolved.mimeType,
        caption,
      });
    }

    // Incrementar quota de WhatsApp (Fase 10)
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'File sent successfully',
    });
  } catch (error) {
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

    const isConnected = await connectionManager.ensureConnected(sessionPhone);
    const socket = connectionManager.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error: CustomError = new Error('Invalid recipient');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    // Determinar número de opciones seleccionables
    const selectableOptions = selectableCount || 1;
    const maxSelectable = Math.min(selectableOptions, options.length);

    // Enviar poll
    const message = await socket.sendMessage(recipient, {
      poll: {
        name: question,
        values: options,
        selectableCount: maxSelectable,
      },
    });

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
    });
  } catch (error) {
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

    const isConnected = await connectionManager.ensureConnected(sessionPhone);
    const socket = connectionManager.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

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

    // Enviar mensaje
    await socket.sendMessage(recipient, { text: menuText });

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
    });
  } catch (error) {
    next(error);
  }
}
