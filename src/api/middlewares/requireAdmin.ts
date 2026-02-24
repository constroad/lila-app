import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from './errorHandler.js';

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const role =
    (req as any).user?.role ||
    (typeof req.headers['x-user-role'] === 'string' ? req.headers['x-user-role'] : undefined);

  if (role !== 'admin') {
    const error: CustomError = new Error('Admin role required');
    error.statusCode = HTTP_STATUS.FORBIDDEN;
    return next(error);
  }

  next();
}
