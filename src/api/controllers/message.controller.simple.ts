/**
 * 📦 Message Controller (Simple - Notifications Approach)
 *
 * EXACT copy-paste of notifications flow.
 * Direct sending without complex ConnectionManager.
 * Maintains same API schemas for Portal compatibility.
 */

import { Request, Response, NextFunction } from 'express';
import { WhatsAppDirectService } from '../../services/whatsapp-direct.service.js';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import { incrementWhatsAppUsage } from '../../middleware/quota.middleware.js';

/**
 * Send text message
 * POST /api/messages/:sessionPhone/text
 * Body: { to: string, message: string }
 */
export async function sendTextMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone } = req.params;
    const { to, message } = req.body;

    if (!to || !message) {
      const error: CustomError = new Error('to and message are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    // Check if session is active
    if (!WhatsAppDirectService.isSessionActive(sessionPhone)) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    logger.info(`📤 Sending text message from ${sessionPhone} to ${to}`);

    // ✅ DIRECT SEND (like notifications - no assertSessions, no complex logic)
    try {
      const result = await WhatsAppDirectService.sendMessage(sessionPhone, to, message);

      // Increment quota if tenant exists
      if (req.tenantId) {
        await incrementWhatsAppUsage(req.tenantId);
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Message sent successfully',
        messageId: result.key.id,
        timestamp: result.messageTimestamp,
      });
    } catch (sendError) {
      const errorMsg = sendError instanceof Error ? sendError.message : String(sendError);
      logger.error(`❌ Send error: ${errorMsg}`);

      // Group error - provide helpful message
      if (
        to.includes('@g.us') &&
        (errorMsg.includes('participant') ||
          errorMsg.includes('forbidden') ||
          errorMsg.includes('not-acceptable'))
      ) {
        const error: CustomError = new Error(
          `Cannot send to group. The bot may not be a member/admin of this group. Try refreshing groups with GET /api/sessions/${sessionPhone}/syncGroups`
        );
        error.statusCode = HTTP_STATUS.FORBIDDEN;
        return next(error);
      }

      // Session error
      if (
        errorMsg.includes('session') ||
        errorMsg.includes('connection') ||
        errorMsg.includes('not connected')
      ) {
        const error: CustomError = new Error('Session disconnected. Please reconnect.');
        error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
        return next(error);
      }

      // Other errors
      throw sendError;
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Send image (enhanced with legacy features)
 * POST /api/messages/:sessionPhone/image
 * Body: {
 *   to: string,
 *   caption?: string,
 *   filePath?: string,     // Relative path in company storage
 *   fileUrl?: string,      // External URL or company storage URL
 *   mimeType?: string,     // Override MIME type
 *   fileName?: string      // Override file name
 * }
 * OR multipart with file upload
 */
export async function sendImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone } = req.params;
    const { to, caption, filePath, fileUrl, mimeType, fileName } = req.body;
    const file = req.file;

    if (!to) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (!WhatsAppDirectService.isSessionActive(sessionPhone)) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    logger.info(`📤 Sending image from ${sessionPhone} to ${to}`);

    // Build send options
    const sendOptions: any = {
      caption,
      mimeType,
      fileName,
      companyId: req.companyId, // For filePath/fileUrl resolution
    };

    // Priority: buffer > fileName (temp) > filePath/fileUrl (storage)
    if (file?.buffer) {
      sendOptions.buffer = file.buffer;
      sendOptions.fileName = file.originalname;
      sendOptions.mimeType = mimeType || file.mimetype;
    } else if (file?.filename) {
      sendOptions.fileName = file.filename;
    } else if (filePath) {
      sendOptions.filePath = filePath;
    } else if (fileUrl) {
      sendOptions.fileUrl = fileUrl;
    } else {
      const error: CustomError = new Error('file, filePath, or fileUrl is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    await WhatsAppDirectService.sendImageFile(sessionPhone, to, sendOptions);

    if (req.tenantId) {
      await incrementWhatsAppUsage(req.tenantId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Image sent successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Send video (enhanced with legacy features + MP4 fix)
 * POST /api/messages/:sessionPhone/video
 * Body: {
 *   to: string,
 *   caption?: string,
 *   filePath?: string,     // Relative path in company storage
 *   fileUrl?: string,      // External URL or company storage URL
 *   mimeType?: string,     // Override MIME type
 *   fileName?: string      // Override file name
 * }
 * OR multipart with file upload
 *
 * FIX: MP4 files are correctly detected as 'video/mp4' (not 'application/mp4')
 */
export async function sendVideo(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone } = req.params;
    const { to, caption, filePath, fileUrl, mimeType, fileName } = req.body;
    const file = req.file;

    if (!to) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (!WhatsAppDirectService.isSessionActive(sessionPhone)) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    logger.info(`📤 Sending video from ${sessionPhone} to ${to}`);

    // Build send options
    const sendOptions: any = {
      caption,
      mimeType,
      fileName,
      companyId: req.companyId,
    };

    // Priority: buffer > fileName (temp) > filePath/fileUrl (storage)
    if (file?.buffer) {
      sendOptions.buffer = file.buffer;
      sendOptions.fileName = file.originalname;
      sendOptions.mimeType = mimeType || file.mimetype; // Will be corrected by detectMimeType
    } else if (file?.filename) {
      sendOptions.fileName = file.filename;
    } else if (filePath) {
      sendOptions.filePath = filePath;
    } else if (fileUrl) {
      sendOptions.fileUrl = fileUrl;
    } else {
      const error: CustomError = new Error('file, filePath, or fileUrl is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    await WhatsAppDirectService.sendVideoFile(sessionPhone, to, sendOptions);

    if (req.tenantId) {
      await incrementWhatsAppUsage(req.tenantId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Video sent successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Send file/document (enhanced with legacy features + PDF fix)
 * POST /api/messages/:sessionPhone/file
 * Body: {
 *   to: string,
 *   caption?: string,
 *   filePath?: string,     // Relative path in company storage
 *   fileUrl?: string,      // External URL or company storage URL
 *   mimeType?: string,     // Override MIME type
 *   fileName?: string      // Override file name
 * }
 * OR multipart with file upload
 *
 * FIX: PDF files are correctly detected as 'application/pdf' (not 'application/octet-stream')
 */
export async function sendFile(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionPhone } = req.params;
    const { to, caption, filePath, fileUrl, mimeType, fileName } = req.body;
    const file = req.file;

    if (!to) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (!WhatsAppDirectService.isSessionActive(sessionPhone)) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    logger.info(`📤 Sending file from ${sessionPhone} to ${to}`);

    // Build send options
    const sendOptions: any = {
      caption,
      mimeType,
      fileName,
      companyId: req.companyId,
    };

    // Priority: buffer > fileName (temp) > filePath/fileUrl (storage)
    if (file?.buffer) {
      sendOptions.buffer = file.buffer;
      sendOptions.fileName = file.originalname || 'document';
      sendOptions.mimeType = mimeType || file.mimetype; // Will be corrected by detectMimeType
    } else if (file?.filename) {
      sendOptions.fileName = file.filename;
    } else if (filePath) {
      sendOptions.filePath = filePath;
    } else if (fileUrl) {
      sendOptions.fileUrl = fileUrl;
    } else {
      const error: CustomError = new Error('file, filePath, or fileUrl is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    await WhatsAppDirectService.sendDocument(sessionPhone, to, sendOptions);

    if (req.tenantId) {
      await incrementWhatsAppUsage(req.tenantId);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'File sent successfully',
    });
  } catch (error) {
    next(error);
  }
}
