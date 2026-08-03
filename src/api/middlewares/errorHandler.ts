import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { sendTelegramAlert } from '../../services/telegram-alert.service.js';
import { recordSuspiciousRequest } from '../../services/scanner-detection.service.js';

export interface CustomError extends Error {
  statusCode?: number;
  details?: any;
  /** Lo pone busboy/axios cuando el stream se corta (ver `isTruncatedUpload`). */
  code?: string;
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
  // El middleware `cors` lanza un Error plano (sin statusCode) al rechazar un
  // origin no permitido — sin este caso especial caía en 500 por default,
  // lo que (a) es semánticamente incorrecto (es un 403, no un error interno)
  // y (b) disparaba una alerta Telegram por CADA path distinto que un scanner
  // probara (ver scanner-detection.service, que agrupa esto por IP en su lugar).
  const isCorsRejection = err.message === 'Not allowed by CORS';
  /**
   * El cuerpo multipart llegó cortado: el cliente abandonó la subida o el
   * proxy/túnel de adelante partió el stream. NO es un fallo del server —
   * busboy lo reporta como error suelto y terminaba en 500 + alerta, así que
   * cada firma de asistencia con red mala despertaba al grupo.
   */
  const isTruncatedUpload =
    err.message === 'Unexpected end of form' || err.code === 'ECONNABORTED';
  const statusCode =
    err.statusCode ||
    (isCorsRejection
      ? HTTP_STATUS.FORBIDDEN
      : isTruncatedUpload
        ? HTTP_STATUS.BAD_REQUEST
        : HTTP_STATUS.INTERNAL_ERROR);
  const message = isTruncatedUpload
    ? 'La subida llegó incompleta: reintentá con mejor señal'
    : err.message || 'Internal Server Error';

  // ip/userAgent SIEMPRE en el log de error (no solo cuando se alerta): es lo
  // que faltó en el incidente del 2026-07-19 — sin esto, revisar una ráfaga
  // pasada no permite saber qué IP/herramienta la generó.
  logger.error('Error:', {
    statusCode,
    message,
    path: req.path,
    method: req.method,
    ip: req.ip || 'unknown',
    userAgent: req.get('user-agent') || 'none',
    details: err.details,
  });

  if (isCorsRejection) {
    recordSuspiciousRequest(req.ip || 'unknown', req.path, req.get('user-agent'));
  }

  const shouldAlert =
    !isCorsRejection &&
    // Una subida truncada es del lado del cliente: se responde 400 y se loguea,
    // pero no se alerta. Alertar por esto es ruido que tapa lo que sí importa.
    !isTruncatedUpload &&
    (statusCode >= 500 ||
      req.path.startsWith('/api/drive') ||
      req.path.startsWith('/api/message'));

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

  recordSuspiciousRequest(req.ip || 'unknown', req.path, req.get('user-agent'));

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
