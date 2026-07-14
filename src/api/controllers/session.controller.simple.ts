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
  getQRCodeGeneratedAt,
  isSessionReady,
  listSessions,
  disconnectSession as disconnectSimpleSession,
  clearSession as clearSimpleSession,
  restartSession as restartSimpleSession,
  getSession,
} from '../../whatsapp/baileys/sessions.simple.js';
import { WhatsAppDirectService } from '../../services/whatsapp-direct.service.js';
import {
  isWhatsAppProxyMode,
  proxySessionRead,
} from '../../services/whatsapp-proxy.service.js';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';

/**
 * Espera máxima (ms) por el QR en una sola request. Corta a propósito: el proxy de Portal corre
 * en Vercel Hobby (~10s de límite de función). Si el QR no está en esta ventana, se responde
 * "connecting" y el cliente hace polling. Ver getQRCodeImageHandler.
 */
const QR_WAIT_MS = 6000;

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

    // Send-proxy (dev): re-emparejar debe hacerse contra PROD (dueño del socket).
    // Sin este corte, startSession abriría un socket local → guerra 440 con prod.
    if (isWhatsAppProxyMode()) {
      const error: CustomError = new Error(
        'Send-proxy activo: crea/vincula la sesión desde el entorno de producción, no en local.'
      );
      error.statusCode = HTTP_STATUS.CONFLICT;
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

    // Esperar hasta PAIRING_WAIT_MS a que Baileys genere el código (no un sleep fijo:
    // el código puede tardar unos segundos y el sleep de 2s a veces respondía vacío).
    const PAIRING_WAIT_MS = 20000;
    const pairingCode = await new Promise<string>((resolve) => {
      let settled = false;
      const finish = (code: string) => {
        if (settled) return;
        settled = true;
        resolve(code);
      };
      createPairingSession(phoneNumber, (code) => finish(code)).catch((error) => {
        logger.error('Error creating pairing session:', error);
        finish('');
      });
      setTimeout(() => finish(''), PAIRING_WAIT_MS);
    });

    if (!pairingCode) {
      const error: CustomError = new Error(
        'No se pudo generar el código de vinculación. Intenta de nuevo.'
      );
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        phoneNumber,
        pairingCode,
        instructions:
          'WhatsApp → Ajustes → Dispositivos vinculados → Vincular con número de teléfono → ingresa este código',
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

    // Send-proxy (dev): la sesión vive en PROD. El logout local no tendría socket, pero
    // cortar aquí evita cualquier efecto sobre el estado compartido. Operar desde prod.
    if (isWhatsAppProxyMode()) {
      const error: CustomError = new Error(
        'Send-proxy activo: desconecta la sesión desde el entorno de producción, no en local.'
      );
      error.statusCode = HTTP_STATUS.CONFLICT;
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

    // Send-proxy (dev): las creds Baileys viven en el Mongo COMPARTIDO (whatsapp_auth).
    // Un /clear local ejecutaría clearMongoAuthState/clearStoreSnapshot y borraría las
    // credenciales de la sesión PRODUCTIVA → re-emparejar obligado. Igual que el guard
    // de create/QR/pairing: administrar sesiones solo desde prod.
    if (isWhatsAppProxyMode()) {
      const error: CustomError = new Error(
        'Send-proxy activo: restablece la sesión desde el entorno de producción, no en local (las credenciales viven en el Mongo compartido).'
      );
      error.statusCode = HTTP_STATUS.CONFLICT;
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
 * Restart session (soft) — reconnect WITHOUT logout, keeping credentials.
 * POST /api/sessions/:phoneNumber/restart
 *
 * Safe for senders shared across companies: no credentials are deleted, so it
 * does not affect other tenants. This is the endpoint to use for "reconnect /
 * restart" instead of the destructive /clear.
 */
export async function restartSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    logger.info(`Restarting session ${phoneNumber} (soft, creds preserved)...`);
    await restartSimpleSession(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} restarted`,
      data: {
        phoneNumber,
        status: isSessionReady(phoneNumber) ? 'connected' : 'connecting',
      },
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

    // Send-proxy (dev): el QR es un stream atado al socket, que debe vivir en PROD.
    // Sin este corte, startSession abriría un socket local → guerra 440 con prod.
    if (isWhatsAppProxyMode()) {
      const error: CustomError = new Error(
        'Send-proxy activo: genera el QR desde el entorno de producción, no en local.'
      );
      error.statusCode = HTTP_STATUS.CONFLICT;
      return next(error);
    }

    // Start session if not exists
    const existingSession = getSession(phoneNumber);
    if (!existingSession) {
      startSession(phoneNumber, (qr) => {
        logger.info(`QR generated for ${phoneNumber}`);
      });
    }

    // Si ya está conectada, no hay QR que mostrar.
    if (isSessionReady(phoneNumber)) {
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { status: 'connected', isConnected: true, qr: null, qrImage: null },
      });
      return;
    }

    // Espera CORTA para NO bloquear (Vercel Hobby mata la función proxy a ~10s). Si el QR aún no
    // está listo, se responde 200 "connecting" y el CLIENTE hace polling; NUNCA se bloquea 60s.
    const qr = (await waitForQRCode(phoneNumber, QR_WAIT_MS)) ?? getQRCode(phoneNumber);

    if (!qr) {
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: { status: 'connecting', isConnected: false, qr: null, qrImage: null },
      });
      return;
    }

    const qrText = typeof qr === 'string' ? qr : String(qr);
    const qrDataUrl = await qrcode.toDataURL(qrText);

    if (req.query.format === 'json') {
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          status: 'waiting_qr',
          isConnected: false,
          qr: qrText,
          qrImage: qrDataUrl,
          qrGeneratedAt: getQRCodeGeneratedAt(phoneNumber) ?? Date.now(),
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

    // Send-proxy (dev): la sesión y su store viven en PROD — servir la lectura
    // desde allá (mismo contrato de respuesta, pass-through).
    if (isWhatsAppProxyMode()) {
      const prodGroups = await proxySessionRead(phoneNumber, 'groups');
      return res.status(HTTP_STATUS.OK).json(prodGroups);
    }

    if (!WhatsAppDirectService.isSessionActive(phoneNumber)) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    const groups = WhatsAppDirectService.listGroups(phoneNumber);

    res.status(HTTP_STATUS.OK).json(groups);
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

    // Send-proxy (dev): el sync real ocurre en PROD (dueño del socket y el store).
    if (isWhatsAppProxyMode()) {
      const prodSyncResult = await proxySessionRead(phoneNumber, 'syncGroups');
      return res.status(HTTP_STATUS.OK).json(prodSyncResult);
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

    // Send-proxy (dev): la sesión y su store viven en PROD — servir la lectura
    // desde allá (mismo contrato de respuesta, pass-through).
    if (isWhatsAppProxyMode()) {
      const prodContacts = await proxySessionRead(phoneNumber, 'contacts');
      return res.status(HTTP_STATUS.OK).json(prodContacts);
    }

    if (!WhatsAppDirectService.isSessionActive(phoneNumber)) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    const contacts = WhatsAppDirectService.listContacts(phoneNumber);

    res.status(HTTP_STATUS.OK).json(contacts);
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
export const restartSession = restartSessionHandler;
export const getAllSessions = getAllSessionsHandler;
export const getQRCodeImage = getQRCodeImageHandler;
export const getGroupList = getGroupListHandler;
export const syncGroups = syncGroupsHandler;
export const getContacts = getContactsHandler;
