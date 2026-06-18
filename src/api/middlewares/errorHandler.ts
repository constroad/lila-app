import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { sendTelegramAlert } from '../../services/telegram-alert.service.js';

export interface CustomError extends Error {
  statusCode?: number;
  details?: any;
}

/**
 * Normaliza el path para la clave de deduplicación de alertas Telegram.
 * Sin esto, cada URL única (p.ej. cada thumbnail `/files/.../thumb_X.jpg`)
 * genera una clave distinta y el dedupe de 5 min NUNCA agrupa, inundando el
 * canal. Colapsamos los segmentos de alta cardinalidad para que un mismo tipo
 * de error en una misma "familia" de rutas cuente como una sola alerta.
 */
export function normalizeAlertPath(p: string): string {
  return p
    .replace(/\/files\/.*/i, '/files/*') // todo el árbol de archivos estáticos
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ':uuid'
    )
    .replace(/[a-f0-9]{24}/gi, ':id'); // ObjectIds de Mongo
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
    const normalizedPath = normalizeAlertPath(req.path);
    // El dedupe (5 min) agrupa por path NORMALIZADO + status + message, así
    // una ráfaga (p.ej. cientos de thumbnails abortados) = 1 sola alerta.
    const alertKey = `${statusCode}:${normalizedPath}:${message}`;
    const companyId = req.companyId || 'N/A';
    const lines = [
      'LILA-APP ERROR!',
      '---------------------',
      `path: ${req.path}`,
      `method: ${req.method}`,
      `companyId: ${companyId}`,
      `status: ${statusCode}`,
      `message: ${message}`,
    ];
    if (normalizedPath !== req.path) {
      lines.push(`(agrupado: máx 1 alerta/5min para "${normalizedPath}")`);
    }

    sendTelegramAlert({
      dedupeKey: alertKey,
      message: lines.join('\n'),
    }).catch((error) => {
      logger.warn('Failed to send Telegram alert', error);
    });
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
