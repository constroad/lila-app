import { Request, Response, NextFunction } from 'express';
import connectionManager from '../../whatsapp/baileys/connection.manager.js';
import conversationManager from '../../whatsapp/ai-agent/conversation.manager.js';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';

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
    const { to, message } = req.body;

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

    const { queued } = await connectionManager.sendTextMessage(
      sessionPhone,
      recipient,
      message
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: queued ? 'Message queued for delivery' : 'Message sent successfully',
      queued,
    });
  } catch (error) {
    next(error);
  }
}

export async function sendImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone } = req.params;
    const { to, caption } = req.body;
    const file = req.file;

    if (!sessionPhone || !to || !file) {
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

    await socket.sendMessage(recipient, {
      image: file.buffer,
      caption,
      mimetype: file.mimetype,
    });

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
    const { to, caption } = req.body;
    const file = req.file;

    if (!sessionPhone || !to || !file) {
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

    await socket.sendMessage(recipient, {
      video: file.buffer,
      caption,
      mimetype: file.mimetype,
    });

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
    const { to, caption, mimeType } = req.body;
    const file = req.file;

    if (!sessionPhone || !to || !file) {
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

    await socket.sendMessage(recipient, {
      document: file.buffer,
      fileName: file.originalname || 'document',
      mimetype: detectMimeType(file.originalname, mimeType || file.mimetype),
      caption,
    });

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
