import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { config } from '../../config/environment.js';

const ALERT_WINDOW_MS = 5 * 60 * 1000;
const alertCache = new Map<string, number>();

const shouldSendAlert = (key: string) => {
  const now = Date.now();
  const last = alertCache.get(key);
  if (last && now - last < ALERT_WINDOW_MS) return false;
  alertCache.set(key, now);
  return true;
};

const sendTelegramAlert = async (message: string) => {
  if (!config.telegram.botToken || !config.telegram.errorsChatId) return;

  const body = new URLSearchParams();
  body.append('chat_id', config.telegram.errorsChatId);
  body.append('text', message);

  await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
    method: 'POST',
    body,
  });
};

export interface CustomError extends Error {
  statusCode?: number;
  details?: any;
}

export function errorHandler(
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_ERROR;
  const message = err.message || 'Internal Server Error';

  logger.error('Error:', {
    statusCode,
    message,
    path: req.path,
    method: req.method,
    details: err.details,
  });

  const shouldAlert =
    statusCode >= 500 ||
    req.path.startsWith('/api/drive') ||
    req.path.startsWith('/api/message');

  if (shouldAlert) {
    const alertKey = `${statusCode}:${req.path}:${message}`;
    if (shouldSendAlert(alertKey)) {
      const companyId = req.companyId || 'N/A';
      const errorMessage = [
        'LILA-APP ERROR!',
        '---------------------',
        `path: ${req.path}`,
        `method: ${req.method}`,
        `companyId: ${companyId}`,
        `status: ${statusCode}`,
        `message: ${message}`,
      ].join('\n');

      sendTelegramAlert(errorMessage).catch((error) => {
        logger.warn('Failed to send Telegram alert', error);
      });
    }
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}

export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
  // Ignorar silenciosamente rutas de Next.js HMR
  if (req.path.includes('_next/') || req.path.includes('/__webpack')) {
    return res.status(404).end();
  }

  const error: CustomError = new Error(`Route not found: ${req.path}`);
  error.statusCode = HTTP_STATUS.NOT_FOUND;
  next(error);
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const skipPaths = new Set(['/', '/health']);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (skipPaths.has(req.path)) {
      return;
    }
    if (req.path.startsWith('/docs')) {
      return;
    }
    logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
}

export function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_SECRET_KEY;

  if (!expectedKey || apiKey !== expectedKey) {
    const error: CustomError = new Error('Unauthorized: Invalid API Key');
    error.statusCode = HTTP_STATUS.UNAUTHORIZED;
    return next(error);
  }

  next();
}
