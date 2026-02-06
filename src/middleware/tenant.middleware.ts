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
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import logger from '../utils/logger.js';
import { getCompanyModel } from '../database/models.js';

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

const API_KEY_PREFIX = 'lk_fe_';

const normalizeSender = (value: string) => value.replace(/[^\d]/g, '');

const extractApiKey = (req: Request): string | null => {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('ApiKey ')) {
    return authHeader.replace('ApiKey ', '').trim();
  }

  return null;
};

const parseApiKey = (apiKey: string): { companyId: string; secret: string } | null => {
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const rest = apiKey.slice(API_KEY_PREFIX.length);
  const separatorIndex = rest.indexOf('_');
  if (separatorIndex <= 0) {
    return null;
  }

  const companyId = rest.slice(0, separatorIndex).trim();
  const secret = rest.slice(separatorIndex + 1).trim();
  if (!companyId || !secret) {
    return null;
  }

  return { companyId, secret };
};

const hashApiKey = (apiKey: string): string =>
  crypto.createHash('sha256').update(apiKey).digest('hex');

const timingSafeEqual = (a: string, b: string): boolean => {
  try {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
};

/**
 * Middleware que requiere autenticación por tenant
 * Extrae el JWT del header Authorization y valida el companyId
 */
export async function requireTenant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const parts = authHeader.split(' ');
      const token = parts[1];

      if (!token) {
        const error: CustomError = new Error('No token provided');
        error.statusCode = 401;
        throw error;
      }

      let decoded: JWTPayload;
      try {
        decoded = jwt.verify(token, config.security.jwtSecret) as JWTPayload;
      } catch (err) {
        const error: CustomError = new Error('Invalid or expired token');
        error.statusCode = 401;
        throw error;
      }

      if (!decoded.companyId) {
        const error: CustomError = new Error('Token does not contain companyId');
        error.statusCode = 401;
        throw error;
      }

      req.companyId = decoded.companyId;
      req.auth = { type: 'jwt' };

      logger.info(`Tenant validated: ${decoded.companyId}`, {
        path: req.path,
        method: req.method,
        userId: decoded.userId,
      });

      return next();
    }

    const apiKey = extractApiKey(req);
    if (!apiKey) {
      const error: CustomError = new Error('No authorization header provided');
      error.statusCode = 401;
      throw error;
    }

    const parsed = parseApiKey(apiKey);
    if (!parsed) {
      const error: CustomError = new Error('Invalid API key format');
      error.statusCode = 401;
      throw error;
    }

    const CompanyModel = await getCompanyModel();
    const company = await CompanyModel.findOne({ companyId: parsed.companyId, isActive: true }).lean();
    if (!company) {
      const error: CustomError = new Error('Company not found');
      error.statusCode = 401;
      throw error;
    }

    const keyData = (company as any)['api-key-lila-access'] || {};
    if (!keyData.keyHash || keyData.isActive !== true) {
      const error: CustomError = new Error('API key inactive or not configured');
      error.statusCode = 401;
      throw error;
    }

    const computedHash = hashApiKey(apiKey);
    if (!timingSafeEqual(computedHash, String(keyData.keyHash))) {
      const error: CustomError = new Error('Invalid API key');
      error.statusCode = 401;
      throw error;
    }

    const origin = req.headers.origin;
    if (Array.isArray(keyData.allowedOrigins) && keyData.allowedOrigins.length > 0 && typeof origin === 'string') {
      if (!keyData.allowedOrigins.includes(origin)) {
        const error: CustomError = new Error('Origin not allowed');
        error.statusCode = 403;
        throw error;
      }
    }

    req.companyId = parsed.companyId;
    req.auth = { type: 'apiKey', keyPrefix: keyData.keyPrefix };
    req.apiKeyAllowedSenders = Array.isArray(keyData.allowedSenders)
      ? keyData.allowedSenders.map((sender: string) => normalizeSender(String(sender)))
      : undefined;

    // Enforce module access rules for API key
    const baseUrl = req.baseUrl || '';
    if (baseUrl.startsWith('/api/drive') && company.features?.modules?.drive === false) {
      const error: CustomError = new Error('Drive module not enabled for this company');
      error.statusCode = 403;
      throw error;
    }

    if (baseUrl.startsWith('/api/message') && !company.whatsappConfig?.sender) {
      const error: CustomError = new Error('WhatsApp sender not configured for this company');
      error.statusCode = 403;
      throw error;
    }

    if (baseUrl.startsWith('/api/message') && req.apiKeyAllowedSenders?.length) {
      const sessionPhoneRaw = req.params?.sessionPhone;
      const sessionPhone = sessionPhoneRaw ? normalizeSender(String(sessionPhoneRaw)) : '';
      if (sessionPhone && !req.apiKeyAllowedSenders.includes(sessionPhone)) {
        const error: CustomError = new Error('Sender not allowed for this API key');
        error.statusCode = 403;
        throw error;
      }
    }

    await CompanyModel.updateOne(
      { companyId: parsed.companyId },
      {
        $set: {
          'api-key-lila-access.lastUsedAt': new Date(),
          'api-key-lila-access.lastUsedIp': req.ip,
        },
      }
    );

    logger.info(`Tenant validated (apiKey): ${parsed.companyId}`, {
      path: req.path,
      method: req.method,
    });

    return next();
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
