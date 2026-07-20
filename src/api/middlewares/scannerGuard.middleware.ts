import { Request, Response, NextFunction } from 'express';
import { isBanned } from '../../services/scanner-detection.service.js';

/**
 * Se monta ANTES de helmet/cors/json-parsing: una IP marcada como scanner
 * (ver scanner-detection.service) recibe 404 sin gastar el resto del pipeline.
 * Respuesta idéntica a una ruta inexistente normal: no revela que hay un guard.
 */
export function scannerGuard(req: Request, res: Response, next: NextFunction): void {
  if (isBanned(req.ip || 'unknown')) {
    res.status(404).end();
    return;
  }
  next();
}
