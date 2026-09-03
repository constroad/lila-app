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
import { replaceLegacyBotLabelForCompanyId } from '../../utils/company-bot.js';
import { sendTelegramAlert } from '../../services/telegram-alert.service.js';

/** Alerta Telegram cuando un mensaje se encola por sesión caída (dedup 15 min por sesión). */
function alertSessionDown(sessionPhone: string, companyId: string | undefined): void {
  sendTelegramAlert({
    dedupeKey: `session-not-connected-queue-${sessionPhone}`,
    message: [
      `⚠️ Sesión WhatsApp ${sessionPhone} no conectada`,
      `companyId: ${companyId || 'N/A'}`,
      `Mensaje encolado → se entregará automáticamente al reconectar.`,
    ].join('\n'),
  }).catch(() => {});
}

/**
 * Valida que un destino de GRUPO (`...@g.us`) pertenezca a la sesión activa. Tras cambiar de
 * sender, los JID de grupo viejos quedan inválidos; en vez de fallar genérico devolvemos un
 * error claro `GROUP_NOT_IN_SESSION` para que el Portal guíe la reasignación. Único punto de
 * validación (lila-app tiene la sesión/store vivos). No bloquea si el store aún no tiene grupos.
 */
function getGroupReachabilityError(sessionPhone: string, to: string): CustomError | null {
  if (!to || !to.includes('@g.us')) return null; // no es grupo
  try {
    const groups = WhatsAppDirectService.listGroups(sessionPhone);
    if (!groups.length) return null; // store no poblado aún → no bloquear
    if (groups.some((group) => group.id === to)) return null; // grupo válido
  } catch {
    return null; // ante duda, no bloquear
  }
  // El JID y el número van EN el mensaje: es lo que llega al Telegram de
  // errores y a los logs de Portal. El 03/09/2026 hubo 75 de estos sin poder
  // decir a qué grupo apuntaban, y resultó ser el grupo de OTRA empresa.
  const error: CustomError = new Error(
    `GROUP_NOT_IN_SESSION: el grupo ${to} no pertenece al número conectado ${sessionPhone}. Reasigna el grupo.`
  );
  error.statusCode = HTTP_STATUS.CONFLICT;
  return error;
}

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

    const groupError = getGroupReachabilityError(sessionPhone, to);
    if (groupError) return next(groupError);

    logger.info(`📤 Sending text message from ${sessionPhone} to ${to}`);

    // ✅ DIRECT SEND — queueOnFail=true (default): si la sesión no está lista el mensaje
    // se encola en outbox y se entrega en cuanto reconecte. No retornamos 503: el caller
    // no necesita reintentar porque la entrega está garantizada por la cola.
    try {
      const normalizedMessage = await replaceLegacyBotLabelForCompanyId(req.companyId, message);
      const result = await WhatsAppDirectService.sendMessage(sessionPhone, to, normalizedMessage, {
        companyId: req.companyId,
        tenantId: req.tenantId,
      });

      if ('queued' in result && result.queued) {
        alertSessionDown(sessionPhone, req.companyId);
        return res.status(202).json({
          success: true,
          queued: true,
          message: 'Sesión no conectada — mensaje encolado, se enviará al reconectar',
        });
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
    const resolvedCompanyId =
      (req as any).companyId || req.body?.companyId || req.query?.companyId;

    if (!to) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const groupError = getGroupReachabilityError(sessionPhone, to);
    if (groupError) return next(groupError);

    logger.info(`📤 Sending image from ${sessionPhone} to ${to}`);

    // Build send options
    const sendOptions: any = {
      caption,
      mimeType,
      fileName,
      companyId: resolvedCompanyId, // For filePath/fileUrl resolution
      tenantId: req.tenantId,
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

    const imageResult = await WhatsAppDirectService.sendImageFile(sessionPhone, to, sendOptions);

    if (imageResult && 'queued' in imageResult && imageResult.queued) {
      alertSessionDown(sessionPhone, resolvedCompanyId);
      return res.status(202).json({ success: true, queued: true, message: 'Sesión no conectada — imagen encolada, se enviará al reconectar' });
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
    const resolvedCompanyId =
      (req as any).companyId || req.body?.companyId || req.query?.companyId;

    if (!to) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const groupError = getGroupReachabilityError(sessionPhone, to);
    if (groupError) return next(groupError);

    logger.info(`📤 Sending video from ${sessionPhone} to ${to}`);

    // Build send options
    const sendOptions: any = {
      caption,
      mimeType,
      fileName,
      companyId: resolvedCompanyId,
      tenantId: req.tenantId,
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

    const videoResult = await WhatsAppDirectService.sendVideoFile(sessionPhone, to, sendOptions);

    if (videoResult && 'queued' in videoResult && videoResult.queued) {
      alertSessionDown(sessionPhone, resolvedCompanyId);
      return res.status(202).json({ success: true, queued: true, message: 'Sesión no conectada — video encolado, se enviará al reconectar' });
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
    const resolvedCompanyId =
      (req as any).companyId || req.body?.companyId || req.query?.companyId;

    if (!to) {
      const error: CustomError = new Error('to is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const groupError = getGroupReachabilityError(sessionPhone, to);
    if (groupError) return next(groupError);

    logger.info(`📤 Sending file from ${sessionPhone} to ${to}`);

    // Build send options
    const sendOptions: any = {
      caption,
      mimeType,
      fileName,
      companyId: resolvedCompanyId,
      tenantId: req.tenantId,
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

    const fileResult = await WhatsAppDirectService.sendDocument(sessionPhone, to, sendOptions);

    if (fileResult && 'queued' in fileResult && fileResult.queued) {
      alertSessionDown(sessionPhone, resolvedCompanyId);
      return res.status(202).json({ success: true, queued: true, message: 'Sesión no conectada — archivo encolado, se enviará al reconectar' });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'File sent successfully',
    });
  } catch (error) {
    next(error);
  }
}
