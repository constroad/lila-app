/**
 * Tenant Middleware - Multi-Tenant JWT Validation
 *
 * Middleware para validar JWT y extraer companyId del token.
 * Asegura que cada petición esté asociada a una empresa específica.
 *
 * Fase 9: Multi-Tenant Portal Transformation
 *
 * @example
 * ```typescript
 * router.post('/files', requireTenant, uploadFile);
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import logger from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

interface JWTPayload {
  companyId: string;
  userId?: string;
  email?: string;
  role?: string;
  [key: string]: any;
}

interface CustomError extends Error {
  statusCode?: number;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Middleware que requiere autenticación por tenant
 * Extrae el JWT del header Authorization y valida el companyId
 */
export function requireTenant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Extraer token del header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      const error: CustomError = new Error('No authorization header provided');
      error.statusCode = 401;
      throw error;
    }

    // El formato esperado es: "Bearer <token>"
    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      const error: CustomError = new Error('Invalid authorization header format. Expected: Bearer <token>');
      error.statusCode = 401;
      throw error;
    }

    const token = parts[1];

    if (!token) {
      const error: CustomError = new Error('No token provided');
      error.statusCode = 401;
      throw error;
    }

    // Validar token
    let decoded: JWTPayload;

    try {
      decoded = jwt.verify(token, config.security.jwtSecret) as JWTPayload;
    } catch (err) {
      const error: CustomError = new Error('Invalid or expired token');
      error.statusCode = 401;
      throw error;
    }

    // Verificar que el token contenga companyId
    if (!decoded.companyId) {
      const error: CustomError = new Error('Token does not contain companyId');
      error.statusCode = 401;
      throw error;
    }

    // Inyectar companyId en el request para que esté disponible en los controladores
    req.companyId = decoded.companyId;

    logger.info(`Tenant validated: ${decoded.companyId}`, {
      path: req.path,
      method: req.method,
      userId: decoded.userId,
    });

    next();
  } catch (err) {
    const error = err as CustomError;
    const statusCode = error.statusCode || 401;

    logger.warn('Tenant validation failed:', {
      path: req.path,
      method: req.method,
      error: error.message,
    });

    res.status(statusCode).json({
      success: false,
      error: {
        message: error.message,
        statusCode,
      },
    });
  }
}

/**
 * Middleware opcional que intenta extraer el tenant pero no falla si no existe
 * Útil para endpoints que pueden funcionar con o sin autenticación
 */
export function optionalTenant(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];

    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, config.security.jwtSecret) as JWTPayload;

      if (decoded.companyId) {
        req.companyId = decoded.companyId;
        logger.info(`Optional tenant identified: ${decoded.companyId}`);
      }
    } catch (err) {
      // Token inválido, pero no fallar - continuar sin companyId
      logger.debug('Optional tenant validation failed (ignored):', err);
    }

    next();
  } catch (err) {
    // En caso de cualquier error, simplemente continuar sin tenant
    next();
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Genera un JWT de prueba para desarrollo
 * SOLO USAR EN DESARROLLO
 */
export function generateDevToken(companyId: string, userId?: string): string {
  if (config.nodeEnv === 'production') {
    throw new Error('generateDevToken is only available in development');
  }

  const payload: JWTPayload = {
    companyId,
    userId: userId || 'dev-user',
    email: 'dev@constroad.com',
    role: 'admin',
  };

  return jwt.sign(payload, config.security.jwtSecret, {
    expiresIn: '24h',
  });
}
