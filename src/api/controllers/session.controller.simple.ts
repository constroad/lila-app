/**
 * 📦 Session Controller (Simple - Notifications Approach)
 *
 * EXACT copy-paste of notifications flow.
 * Uses simple sessions.simple.ts instead of ConnectionManager.
 * Maintains same API schemas for Portal compatibility.
 */

import { Request, Response, NextFunction } from 'express';
import qrcode from 'qrcode';
import {
  startSession,
  createPairingSession,
  getQRCode,
  isSessionReady,
  listSessions,
  disconnectSession as disconnectSimpleSession,
  clearSession as clearSimpleSession,
  getSession,
} from '../../whatsapp/baileys/sessions.simple.js';
import { WhatsAppDirectService } from '../../services/whatsapp-direct.service.js';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';

/**
 * Wait for QR code to be generated
 */
async function waitForQRCode(
  phoneNumber: string,
  timeoutMs = 60000,
  intervalMs = 300
): Promise<string | undefined> {
  const start = Date.now();

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const qr = getQRCode(phoneNumber);
      if (qr) {
        clearInterval(timer);
        resolve(qr);
        return;
      }

      if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        resolve(undefined);
      }
    }, intervalMs);
  });
}

/**
 * Create session with QR code
 * POST /api/sessions
 * Body: { phoneNumber: string }
 */
export async function createSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    logger.info(`Creating session for ${phoneNumber}`);

    // Start session with QR
    startSession(phoneNumber, (qr) => {
      logger.info(`QR generated for ${phoneNumber}`);
    });

    // Wait for QR code
    const qr = await waitForQRCode(phoneNumber);
    const qrImage = qr ? await qrcode.toDataURL(qr) : undefined;

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        phoneNumber,
        status: isSessionReady(phoneNumber) ? 'connected' : 'connecting',
        qr,
        qrImage,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create session with pairing code
 * POST /api/sessions/:phoneNumber/pairing
 */
export async function createPairingSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    logger.info(`Creating pairing code session for ${phoneNumber}`);

    let pairingCode = '';

    // Create pairing session
    await createPairingSession(phoneNumber, (code) => {
      pairingCode = code;
    });

    // Wait briefly for code
    await new Promise((resolve) => setTimeout(resolve, 2000));

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        phoneNumber,
        pairingCode,
        instructions:
          'Open WhatsApp → Settings → Linked Devices → Link with phone number → Enter this code',
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get session status
 * GET /api/sessions/:phoneNumber/status
 */
export async function getSessionStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const isConnected = isSessionReady(phoneNumber);
    const qr = getQRCode(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        phoneNumber,
        status: isConnected ? 'connected' : 'disconnected',
        isConnected,
        ...(qr && { qr }),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Disconnect session
 * DELETE /api/sessions/:phoneNumber
 */
export async function disconnectSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    await disconnectSimpleSession(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} disconnected`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Clear session completely (reset)
 * POST /api/sessions/:phoneNumber/clear
 *
 * This performs a complete session reset:
 * - Logout from WhatsApp
 * - Delete physical session files (credentials)
 * - Clear message queue
 * - Remove backup files
 * - Clean memory structures
 *
 * Use this when the user wants to completely remove a session and prevent auto-recovery.
 */
export async function clearSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    logger.info(`Clearing session ${phoneNumber} (full reset)...`);
    await clearSimpleSession(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} cleared completely`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all sessions
 * GET /api/sessions/list
 */
export async function getAllSessionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionIds = listSessions();
    const sessions = sessionIds.map((phone) => ({
      phoneNumber: phone,
      status: isSessionReady(phone) ? 'connected' : 'disconnected',
      isConnected: isSessionReady(phone),
    }));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        total: sessions.length,
        sessions,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get QR code image
 * GET /api/sessions/:phoneNumber/qr
 */
export async function getQRCodeImageHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    // Start session if not exists
    const existingSession = getSession(phoneNumber);
    if (!existingSession) {
      startSession(phoneNumber, (qr) => {
        logger.info(`QR generated for ${phoneNumber}`);
      });
    }

    const qr = (await waitForQRCode(phoneNumber)) ?? getQRCode(phoneNumber);

    if (!qr) {
      const error: CustomError = new Error('QR not available');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    const qrText = typeof qr === 'string' ? qr : String(qr);
    const qrDataUrl = await qrcode.toDataURL(qrText);

    if (req.query.format === 'json') {
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          qr: qrText,
          qrImage: qrDataUrl,
        },
      });
      return;
    }

    const base64 = qrDataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.status(HTTP_STATUS.OK).send(buffer);
  } catch (error) {
    next(error);
  }
}

/**
 * Get group list
 * GET /api/sessions/:phoneNumber/groups
 */
export async function getGroupListHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (!WhatsAppDirectService.isSessionActive(phoneNumber)) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    const groups = WhatsAppDirectService.listGroups(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      groups,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Sync groups from WhatsApp
 * GET /api/sessions/:phoneNumber/syncGroups
 */
export async function syncGroupsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (!WhatsAppDirectService.isSessionActive(phoneNumber)) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    logger.info(`Syncing groups for ${phoneNumber} using refreshGroups`);
    const result = await WhatsAppDirectService.refreshGroups(phoneNumber);

    if (result.success) {
      const groups = WhatsAppDirectService.listGroups(phoneNumber);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        groupCount: result.groupCount,
        groups,
      });
    } else {
      const error: CustomError = new Error(result.error || 'Failed to sync groups');
      error.statusCode = HTTP_STATUS.INTERNAL_ERROR;
      return next(error);
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Get contacts
 * GET /api/sessions/:phoneNumber/contacts
 */
export async function getContactsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (!WhatsAppDirectService.isSessionActive(phoneNumber)) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    const contacts = WhatsAppDirectService.listContacts(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      contacts,
    });
  } catch (error) {
    next(error);
  }
}

// Aliases for backwards compatibility
export const logoutSession = disconnectSessionHandler;
export const listActiveSessions = getAllSessionsHandler;
export const createSession = createSessionHandler;
export const getSessionStatus = getSessionStatusHandler;
export const disconnectSession = disconnectSessionHandler;
export const clearSession = clearSessionHandler;
export const getAllSessions = getAllSessionsHandler;
export const getQRCodeImage = getQRCodeImageHandler;
export const getGroupList = getGroupListHandler;
export const syncGroups = syncGroupsHandler;
export const getContacts = getContactsHandler;
