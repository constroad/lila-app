import { Request, Response, NextFunction } from 'express';
import qrcode from 'qrcode';
import connectionManager from '../../whatsapp/baileys/connection.manager.js';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { config } from '../../config/environment.js';
import { CustomError } from '../middlewares/errorHandler.js';

async function waitForQRCode(
  phoneNumber: string,
  timeoutMs = config.whatsapp.qrTimeout,
  intervalMs = 300
): Promise<string | undefined> {
  const start = Date.now();

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const qr = connectionManager.getQRCode(phoneNumber);
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

export async function createSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    logger.info(`Creating session for ${phoneNumber}`);
    connectionManager.enableSession(phoneNumber);

    await connectionManager.createConnection(phoneNumber);
    const qr = await waitForQRCode(phoneNumber);
    const qrImage = qr ? await qrcode.toDataURL(qr) : undefined;

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        phoneNumber,
        status: connectionManager.getConnectionStatus(phoneNumber),
        qr,
        qrImage,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSessionStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const status = connectionManager.getConnectionStatus(phoneNumber);
    const qr = connectionManager.getQRCode(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        phoneNumber,
        status,
        isConnected: connectionManager.isConnected(phoneNumber),
        ...(qr && { qr }),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function disconnectSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    await connectionManager.disconnectManual(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} disconnected`,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const connections = connectionManager.getAllConnections();
    const sessions = Array.from(connections.keys()).map((phone) => ({
      phoneNumber: phone,
      status: connectionManager.getConnectionStatus(phone),
      isConnected: connectionManager.isConnected(phone),
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

export async function getQRCodeImage(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    connectionManager.enableSession(phoneNumber);

    if (!connectionManager.getConnection(phoneNumber)) {
      await connectionManager.createConnection(phoneNumber);
    }

    const qr = (await waitForQRCode(phoneNumber)) ?? connectionManager.getQRCode(phoneNumber);
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

export async function getGroupList(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const isConnected = await connectionManager.ensureConnected(phoneNumber);
    if (!isConnected) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    const groups = await connectionManager.getGroups(phoneNumber);

    res.status(HTTP_STATUS.OK).json(groups);
  } catch (error) {
    next(error);
  }
}

export async function syncGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const isConnected = await connectionManager.ensureConnected(phoneNumber);
    if (!isConnected) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    const groups = await connectionManager.getGroups(phoneNumber);

    res.status(HTTP_STATUS.OK).json(groups);
  } catch (error) {
    next(error);
  }
}

export async function getContactsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const isConnected = await connectionManager.ensureConnected(phoneNumber);
    if (!isConnected) {
      const error: CustomError = new Error('Session not connected');
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }

    const contacts = await connectionManager.getContacts(phoneNumber);

    res.status(HTTP_STATUS.OK).json(contacts);
  } catch (error) {
    next(error);
  }
}

export async function logoutSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    await connectionManager.disconnectManual(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} disconnected`,
    });
  } catch (error) {
    next(error);
  }
}

export async function listActiveSessions(req: Request, res: Response, next: NextFunction) {
  return getAllSessions(req, res, next);
}

/**
 * 🔄 Restaurar sesión desde backup
 * POST /api/session/:phoneNumber/restore
 * Body: { backupTimestamp?: string } (opcional, usa el más reciente si no se especifica)
 */
export async function restoreSessionFromBackup(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;
    const { backupTimestamp } = req.body;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    logger.info(`Attempting to restore session ${phoneNumber} from backup`);
    connectionManager.enableSession(phoneNumber);

    // Desconectar sesión existente si hay
    try {
      await connectionManager.disconnect(phoneNumber);
    } catch (e) {
      // Ignorar si no había sesión activa
    }

    // Restaurar desde backup
    const restored = await connectionManager.restoreFromBackup(phoneNumber, backupTimestamp);

    if (!restored) {
      const error: CustomError = new Error('Failed to restore from backup - no backups found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    // Intentar reconectar con las credenciales restauradas
    await connectionManager.createConnection(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} restored from backup and reconnecting`,
      data: {
        phoneNumber,
        status: connectionManager.getConnectionStatus(phoneNumber),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 📋 Listar backups disponibles para una sesión
 * GET /api/session/:phoneNumber/backups
 */
export async function listSessionBackups(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const backups = await connectionManager.listBackups(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        phoneNumber,
        backups,
        total: backups.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 🔄 Forzar reinicio de reconexión (limpiar estado de reconexión)
 * POST /api/session/:phoneNumber/reset-reconnect
 */
export async function resetReconnectState(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    logger.info(`Resetting reconnect state for ${phoneNumber}`);

    await connectionManager.resetReconnect(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Reconnect state reset for ${phoneNumber}`,
    });
  } catch (error) {
    next(error);
  }
}

export async function clearSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    await connectionManager.clearSession(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} cleared`,
    });
  } catch (error) {
    next(error);
  }
}
