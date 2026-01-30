/**
 * Company Rate Limiter Middleware - Per-Company Rate Limiting
 *
 * Middleware para limitar el número de requests por empresa en una ventana de tiempo.
 * Usa almacenamiento en memoria (in-memory) para tracking.
 *
 * Fase 10: Quotas y Validaciones (In-Memory)
 *
 * @example
 * ```typescript
 * // Limitar a 100 requests por minuto por empresa
 * router.post('/api/messages',
 *   requireTenant,
 *   companyRateLimiter({ limit: 100, windowMs: 60000 }),
 *   sendMessage
 * );
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimiterOptions {
  /**
   * Número máximo de requests permitidos en la ventana
   */
  limit: number;

  /**
   * Tamaño de la ventana en milisegundos
   * @default 60000 (1 minuto)
   */
  windowMs?: number;

  /**
   * Mensaje personalizado cuando se excede el límite
   */
  message?: string;

  /**
   * Incluir headers de rate limit en la respuesta
   * @default true
   */
  includeHeaders?: boolean;

  /**
   * Handler personalizado cuando se excede el límite
   */
  onLimitReached?: (req: Request, res: Response) => void;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

/**
 * Almacena contadores de rate limit en memoria por empresa
 * Key: companyId
 * Value: { count, resetTime }
 */
const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Limpia registros expirados cada 5 minutos
 */
setInterval(() => {
  const now = Date.now();
  for (const [companyId, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(companyId);
    }
  }
}, 5 * 60 * 1000); // 5 minutos

/**
 * Verifica y actualiza el rate limit para una empresa
 */
function checkAndIncrementRateLimit(
  companyId: string,
  limit: number,
  windowMs: number
): { allowed: boolean; current: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitStore.get(companyId);

  // Si no hay registro o expiró, crear uno nuevo
  if (!record || now > record.resetTime) {
    const newRecord: RateLimitRecord = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(companyId, newRecord);

    return {
      allowed: true,
      current: 1,
      resetTime: newRecord.resetTime,
    };
  }

  // Incrementar contador
  record.count++;
  rateLimitStore.set(companyId, record);

  const allowed = record.count <= limit;

  return {
    allowed,
    current: record.count,
    resetTime: record.resetTime,
  };
}

// ============================================================================
// MIDDLEWARE FACTORY
// ============================================================================

/**
 * Crea un middleware de rate limiting por empresa
 */
export function companyRateLimiter(options: RateLimiterOptions) {
  const {
    limit,
    windowMs = 60000, // 1 minuto por defecto
    message = 'Too many requests, please try again later',
    includeHeaders = true,
    onLimitReached,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const companyId = req.companyId;

      // Si no hay companyId, pasar al siguiente middleware
      // (esto significa que requireTenant no se ejecutó antes)
      if (!companyId) {
        logger.warn('Company rate limiter called without companyId');
        return next();
      }

      // Verificar rate limit
      const result = checkAndIncrementRateLimit(companyId, limit, windowMs);

      // Agregar headers de rate limit
      if (includeHeaders) {
        res.setHeader('X-RateLimit-Limit', limit.toString());
        res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - result.current).toString());
        res.setHeader('X-RateLimit-Reset', result.resetTime.toString());
      }

      // Si excede el límite
      if (!result.allowed) {
        logger.warn(`Rate limit exceeded for company ${companyId}`, {
          current: result.current,
          limit,
          windowMs,
        });

        // Agregar header de retry después de
        const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());

        // Ejecutar handler personalizado si existe
        if (onLimitReached) {
          onLimitReached(req, res);
          return;
        }

        // Respuesta por defecto
        res.status(429).json({
          success: false,
          error: {
            message,
            code: 'RATE_LIMIT_EXCEEDED',
            statusCode: 429,
            rateLimit: {
              limit,
              current: result.current,
              windowMs,
              retryAfter,
            },
          },
        });
        return;
      }

      // Rate limit no excedido, continuar
      next();
    } catch (error) {
      logger.error('Error in company rate limiter:', error);
      // En caso de error, permitir la request
      next();
    }
  };
}

// ============================================================================
// PRESET CONFIGURATIONS
// ============================================================================

/**
 * Rate limiter estricto: 10 requests por minuto
 */
export const strictRateLimiter = companyRateLimiter({
  limit: 10,
  windowMs: 60000, // 1 minuto
  message: 'Rate limit exceeded. Maximum 10 requests per minute.',
});

/**
 * Rate limiter moderado: 60 requests por minuto
 */
export const moderateRateLimiter = companyRateLimiter({
  limit: 60,
  windowMs: 60000, // 1 minuto
  message: 'Rate limit exceeded. Maximum 60 requests per minute.',
});

/**
 * Rate limiter generoso: 200 requests por minuto
 */
export const generousRateLimiter = companyRateLimiter({
  limit: 200,
  windowMs: 60000, // 1 minuto
  message: 'Rate limit exceeded. Maximum 200 requests per minute.',
});

/**
 * Rate limiter para WhatsApp: 30 mensajes por minuto
 */
export const whatsappRateLimiter = companyRateLimiter({
  limit: 30,
  windowMs: 60000, // 1 minuto
  message: 'WhatsApp rate limit exceeded. Maximum 30 messages per minute.',
});

/**
 * Rate limiter para uploads: 20 archivos por minuto
 */
export const uploadRateLimiter = companyRateLimiter({
  limit: 20,
  windowMs: 60000, // 1 minuto
  message: 'Upload rate limit exceeded. Maximum 20 uploads per minute.',
});

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parsea una string de tiempo (ej: "5m", "1h") a milisegundos
 */
export function parseTimeWindow(timeStr: string): number {
  const units: Record<string, number> = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
  };

  const match = timeStr.match(/^(\d+)([smhd])$/);

  if (!match) {
    throw new Error(`Invalid time window format: ${timeStr}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  return value * units[unit];
}

/**
 * Crea un rate limiter desde configuración de environment
 */
export function createRateLimiterFromConfig() {
  const limitStr = process.env.COMPANY_RATE_LIMIT || '100';
  const windowStr = process.env.COMPANY_RATE_WINDOW || '1m';

  const limit = parseInt(limitStr, 10);
  const windowMs = parseTimeWindow(windowStr);

  return companyRateLimiter({ limit, windowMs });
}

/**
 * Limpia todos los registros de rate limit (útil para testing)
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
  logger.info('All rate limit records cleared');
}
