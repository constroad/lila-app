/**
 * Quota Middleware - Multi-Tenant Quota Validation
 *
 * Middleware para validar quotas antes de ejecutar operaciones.
 * Previene que las empresas excedan sus límites de uso.
 *
 * Fase 10: Quotas y Validaciones
 *
 * @example
 * ```typescript
 * router.post('/message/text',
 *   requireTenant,
 *   requireWhatsAppQuota,
 *   sendMessage
 * );
 *
 * router.post('/drive/files',
 *   requireTenant,
 *   requireStorageQuota,
 *   uploadFile
 * );
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import { quotaValidatorService } from '../services/quota-validator.service.js';
import logger from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

interface CustomError extends Error {
  statusCode?: number;
  code?: string;
}

// ============================================================================
// WHATSAPP QUOTA MIDDLEWARE
// ============================================================================

/**
 * Middleware que verifica la quota de WhatsApp antes de enviar mensajes
 * Requiere que req.companyId esté definido (usar después de requireTenant)
 */
export async function requireWhatsAppQuota(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      const error: CustomError = new Error('Company ID is required');
      error.statusCode = 401;
      error.code = 'COMPANY_ID_REQUIRED';
      throw error;
    }

    // Verificar si el servicio está listo
    if (!quotaValidatorService.isReady()) {
      logger.warn('QuotaValidator not ready, allowing operation');
      return next();
    }

    // Verificar quota
    const allowed = await quotaValidatorService.checkWhatsAppQuota(companyId);

    if (!allowed) {
      const quotaInfo = await quotaValidatorService.getWhatsAppQuotaInfo(companyId);

      logger.warn(`WhatsApp quota exceeded for company ${companyId}`, quotaInfo);

      res.status(429).json({
        success: false,
        error: {
          message: 'WhatsApp message quota exceeded for this month',
          code: 'WHATSAPP_QUOTA_EXCEEDED',
          statusCode: 429,
          quota: {
            current: quotaInfo.current,
            limit: quotaInfo.limit,
            remaining: quotaInfo.remaining,
            period: quotaInfo.period,
          },
        },
      });
      return;
    }

    logger.debug(`WhatsApp quota check passed for company ${companyId}`);
    next();
  } catch (error) {
    const err = error as CustomError;
    const statusCode = err.statusCode || 500;

    logger.error('WhatsApp quota validation error:', error);

    res.status(statusCode).json({
      success: false,
      error: {
        message: err.message || 'Error validating WhatsApp quota',
        code: err.code || 'QUOTA_VALIDATION_ERROR',
        statusCode,
      },
    });
  }
}

/**
 * Middleware opcional que verifica WhatsApp quota pero no bloquea
 * Útil para endpoints donde queremos advertir pero no bloquear
 */
export async function checkWhatsAppQuota(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.companyId;

    if (!companyId || !quotaValidatorService.isReady()) {
      return next();
    }

    const quotaInfo = await quotaValidatorService.getWhatsAppQuotaInfo(companyId);

    // Agregar info al request para que el controller pueda usarla
    (req as any).quotaInfo = { whatsapp: quotaInfo };

    // Advertir si está cerca del límite (90%)
    if (quotaInfo.current / quotaInfo.limit >= 0.9) {
      logger.warn(`WhatsApp quota near limit for company ${companyId}:`, quotaInfo);
    }

    next();
  } catch (error) {
    logger.error('Error checking WhatsApp quota:', error);
    next(); // Continuar sin bloquear
  }
}

// ============================================================================
// STORAGE QUOTA MIDDLEWARE
// ============================================================================

/**
 * Middleware que verifica la quota de almacenamiento antes de subir archivos
 * Requiere que req.file esté definido (usar después de multer)
 * Requiere que req.companyId esté definido (usar después de requireTenant)
 */
export async function requireStorageQuota(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      const error: CustomError = new Error('Company ID is required');
      error.statusCode = 401;
      error.code = 'COMPANY_ID_REQUIRED';
      throw error;
    }

    // Obtener tamaño del archivo
    const file = req.file;
    if (!file) {
      const error: CustomError = new Error('File is required');
      error.statusCode = 400;
      error.code = 'FILE_REQUIRED';
      throw error;
    }

    const fileSize = file.size;

    // Verificar si el servicio está listo
    if (!quotaValidatorService.isReady()) {
      logger.warn('QuotaValidator not ready, allowing operation');
      return next();
    }

    // Verificar quota
    const allowed = await quotaValidatorService.checkStorageQuota(companyId, fileSize);

    if (!allowed) {
      const quotaInfo = await quotaValidatorService.getStorageQuotaInfo(companyId);

      logger.warn(`Storage quota exceeded for company ${companyId}`, {
        fileSize,
        ...quotaInfo,
      });

      res.status(429).json({
        success: false,
        error: {
          message: 'Storage quota exceeded',
          code: 'STORAGE_QUOTA_EXCEEDED',
          statusCode: 429,
          quota: {
            current: quotaInfo.current,
            limit: quotaInfo.limit,
            remaining: quotaInfo.remaining,
            period: quotaInfo.period,
            currentFormatted: formatBytes(quotaInfo.current),
            limitFormatted: formatBytes(quotaInfo.limit),
            remainingFormatted: formatBytes(quotaInfo.remaining),
            fileSizeFormatted: formatBytes(fileSize),
          },
        },
      });
      return;
    }

    logger.debug(`Storage quota check passed for company ${companyId}: ${fileSize} bytes`);
    next();
  } catch (error) {
    const err = error as CustomError;
    const statusCode = err.statusCode || 500;

    logger.error('Storage quota validation error:', error);

    res.status(statusCode).json({
      success: false,
      error: {
        message: err.message || 'Error validating storage quota',
        code: err.code || 'QUOTA_VALIDATION_ERROR',
        statusCode,
      },
    });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Incrementa el contador de mensajes de WhatsApp después de enviar
 * Usar en el controller después de enviar el mensaje
 */
export async function incrementWhatsAppUsage(companyId: string): Promise<void> {
  try {
    if (quotaValidatorService.isReady()) {
      await quotaValidatorService.incrementWhatsAppUsage(companyId, 1);
      logger.debug(`Incremented WhatsApp usage for company ${companyId}`);
    }
  } catch (error) {
    logger.error('Error incrementing WhatsApp usage:', error);
    // No lanzar error, solo loggear
  }
}

/**
 * Incrementa el contador de almacenamiento después de subir archivo
 * Usar en el controller después de guardar el archivo
 */
export async function incrementStorageUsage(companyId: string, fileSize: number): Promise<void> {
  try {
    if (quotaValidatorService.isReady()) {
      await quotaValidatorService.incrementStorageUsage(companyId, fileSize);
      logger.debug(`Incremented storage usage for company ${companyId}: ${fileSize} bytes`);
    }
  } catch (error) {
    logger.error('Error incrementing storage usage:', error);
    // No lanzar error, solo loggear
  }
}

/**
 * Decrementa el contador de almacenamiento después de eliminar archivo
 * Usar en el controller después de eliminar el archivo
 */
export async function decrementStorageUsage(companyId: string, fileSize: number): Promise<void> {
  try {
    if (quotaValidatorService.isReady()) {
      await quotaValidatorService.decrementStorageUsage(companyId, fileSize);
      logger.debug(`Decremented storage usage for company ${companyId}: ${fileSize} bytes`);
    }
  } catch (error) {
    logger.error('Error decrementing storage usage:', error);
    // No lanzar error, solo loggear
  }
}

/**
 * Formatea bytes a formato legible
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
