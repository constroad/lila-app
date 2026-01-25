import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';

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
  const error: CustomError = new Error(`Route not found: ${req.path}`);
  error.statusCode = HTTP_STATUS.NOT_FOUND;
  next(error);
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
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
