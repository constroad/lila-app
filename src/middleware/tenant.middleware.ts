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
import { quotaValidatorService } from '../services/quota-validator.service.js';

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
      req.auth = { type: 'jwt', role: decoded.role };

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
      // El sender configurado de la company SIEMPRE está permitido: lo posee por
      // definición. `allowedSenders` explícito agrega senders EXTRA (producto API
      // multi-número). Sin esto, cambiar de sender o reconectar con otro número
      // rompía el envío hasta resincronizar la lista (bug "Sender not allowed").
      const ownSender = normalizeSender(String(company.whatsappConfig?.sender || ''));
      const isAllowed =
        req.apiKeyAllowedSenders.includes(sessionPhone) ||
        (Boolean(ownSender) && sessionPhone === ownSender);
      if (sessionPhone && !isAllowed) {
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

/**
 * Acepta autenticación de tenant (JWT de Portal o API key `lk_fe_...`) y, como
 * compatibilidad hacia atrás, la API key global `x-api-key === API_SECRET_KEY`.
 *
 * Pensado para endpoints de administración de sesión que hoy llama Portal con
 * JWT (qr, clear, logout, disconnect, syncGroups) sin romper consumidores legacy
 * que aún usan el secreto global. Cuando se complete el hardening RLS se puede
 * retirar el fallback global (ver SCALABILITY-MULTI-SESSION.spec §4/§5).
 */
export async function requireTenantOrApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const legacyKey = req.headers['x-api-key'];
  const expected = process.env.API_SECRET_KEY;
  if (typeof legacyKey === 'string' && expected && legacyKey === expected) {
    return next();
  }
  return requireTenant(req, res, next);
}

/**
 * Verifica que el `:sessionPhone` (sender) pertenezca a la company autenticada.
 * Cierra el GAP cross-tenant de envío (una company no debe enviar por el sender de
 * otra). Ver SCALABILITY-MULTI-SESSION.spec §4.2/§4.3.
 *
 * Sin `companyId` (secreto global administrativo) conserva compatibilidad.
 * Con tenant identificado, cualquier mismatch se bloquea siempre.
 */
export async function requireSenderOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const companyId = req.companyId;
  const sessionPhone = req.params?.sessionPhone;
  // Sin tenant (secreto global) o sin sender → no podemos/!debemos bloquear.
  if (!companyId || !sessionPhone) {
    return next();
  }

  try {
    const owner = await quotaValidatorService.getCompanyByWhatsappSender(sessionPhone);
    if (owner && owner.companyId === companyId) {
      return next(); // ownership correcto
    }
    logger.warn(
      `Sender ownership mismatch: company ${companyId} intentó usar sender ${sessionPhone} ` +
      `(owner=${owner?.companyId ?? 'desconocido'}) [BLOQUEADO]`
    );
    const error: CustomError = new Error('El sender no pertenece a la empresa autenticada');
    error.statusCode = 403;
    return next(error);
  } catch (err) {
    logger.warn('requireSenderOwnership lookup falló:', err);
    const error: CustomError = new Error('No se pudo validar la propiedad del sender');
    error.statusCode = 503;
    return next(error);
  }
}

/**
 * Verifica que el `:phoneNumber` de la ruta (o `body.phoneNumber` al crear sesión)
 * pertenezca a la company autenticada. Cierra el gap cross-tenant de ADMINISTRACIÓN
 * de sesión: sin esto, cualquier tenant autenticado (JWT o `lk_fe_` de OTRA empresa)
 * podía pedir el QR de un sender ajeno (= emparejar su propio teléfono en el slot de
 * otra empresa: account takeover), reiniciarle la sesión (DoS + throttle de login de
 * WhatsApp) o leer sus grupos y contactos completos.
 *
 * Reglas:
 * - Sin tenant (secreto global admin) o sin número → pasa (compat, igual que los
 *   demás guards).
 * - Número con dueños: el tenant debe ser uno de ellos (soporta senders compartidos).
 * - Número SIN dueños (no asignado a ninguna company): pasa con warn — necesario para
 *   el primer emparejamiento y no hay víctima que proteger.
 * - Fallo de lookup → 503 fail-closed (igual que requireSenderOwnership): ante un hipo
 *   de Mongo preferimos negar un QR a regalarlo.
 */
export async function requireSessionOwnership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const companyId = req.companyId;
  const phone =
    req.params?.phoneNumber ||
    (req.body as { phoneNumber?: string } | undefined)?.phoneNumber;
  if (!companyId || !phone) {
    return next();
  }

  try {
    const owners = await quotaValidatorService.listCompaniesByWhatsappSender(String(phone));
    const ownerIds = owners.map((company) => company.companyId);

    if (ownerIds.length === 0) {
      logger.warn(
        `Session ownership: sender ${phone} sin dueño; permitido a ${companyId} (primer emparejamiento)`
      );
      return next();
    }

    if (ownerIds.includes(companyId)) {
      return next();
    }

    logger.warn(
      `Session ownership mismatch: ${companyId} intentó operar la sesión ${phone} ` +
        `(owners=${ownerIds.join(', ')}) [BLOQUEADO]`
    );
    const error: CustomError = new Error('La sesión no pertenece a la empresa autenticada');
    error.statusCode = 403;
    return next(error);
  } catch (err) {
    logger.warn(`requireSessionOwnership lookup falló para ${phone}: ${String(err)}`);
    const error: CustomError = new Error('No se pudo validar la propiedad de la sesión');
    error.statusCode = 503;
    return next(error);
  }
}

/**
 * Guard para operaciones DESTRUCTIVAS de sesión (`/clear`, `/logout`, `DELETE`): impide
 * que un tenant borre o cierre las credenciales de un número compartido por varias
 * companies. Este es exactamente el caso que dejó muerta a 51949376824: un `/clear` desde
 * un tenant borró creds que usaban 3 empresas y nadie pudo reconectar sin re-emparejar.
 *
 * Reglas (usa `:phoneNumber` de la ruta y `req.companyId` del tenant autenticado):
 * - Número compartido (>1 company lo usa como sender): BLOQUEA (409) salvo `body.force===true`.
 *   La alternativa segura es `POST /:phoneNumber/restart` (reinicio suave, conserva creds).
 * - Número de una sola company: exige que el tenant autenticado sea esa company (si no, 403).
 * - Sin `companyId` (secreto global / admin): no bloquea (compat).
 *
 * Fail-open ante fallo de lookup (consistente con `requireSenderOwnership`): no bloquear por
 * un hipo de Mongo, pero se loggea con nivel warn.
 */
export async function guardSharedSenderDestructive(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const companyId = req.companyId;
  const phone = req.params?.phoneNumber;
  // Sin sender en la ruta, o secreto global (sin tenant) → no podemos/!debemos bloquear.
  if (!phone || !companyId) {
    return next();
  }

  const force = (req.body && (req.body as { force?: unknown }).force) === true;

  try {
    const owners = await quotaValidatorService.listCompaniesByWhatsappSender(phone);
    const ownerIds = owners.map((c) => c.companyId);

    if (ownerIds.length > 1) {
      if (force) {
        logger.warn(
          `Destructive op on SHARED sender ${phone} by ${companyId} FORZADA ` +
          `(owners: ${ownerIds.join(', ')})`
        );
        return next();
      }
      const error: CustomError = new Error(
        `El número ${phone} lo usan ${ownerIds.length} empresas (${ownerIds.join(', ')}). ` +
        `Usá el reinicio suave (POST /sessions/${phone}/restart) o reenviá con force:true ` +
        `para el reset destructivo (borra credenciales para TODAS).`
      );
      error.statusCode = 409;
      logger.warn(
        `Blocked destructive op on shared sender ${phone} by ${companyId} ` +
        `(owners: ${ownerIds.join(', ')})`
      );
      return next(error);
    }

    if (ownerIds.length === 1 && ownerIds[0] !== companyId) {
      logger.warn(
        `Blocked destructive op on sender ${phone}: ${companyId} no es dueño (owner=${ownerIds[0]})`
      );
      const error: CustomError = new Error('El número no pertenece a la empresa autenticada');
      error.statusCode = 403;
      return next(error);
    }

    return next();
  } catch (err) {
    logger.warn(`guardSharedSenderDestructive lookup falló para ${phone} (ignorado): ${String(err)}`);
    return next();
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
