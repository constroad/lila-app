import { Request, Response } from 'express';
import { startServiceMigration, type ServiceMigrationRequest } from '../../services/service-migration.service.js';
import logger from '../../utils/logger.js';

const asText = (value: unknown) => String(value ?? '').trim();

export async function createServiceMigration(req: Request, res: Response) {
  try {
    if (req.auth?.role !== 'super-admin') {
      return res.status(403).json({
        ok: false,
        message: 'Super admin role is required',
      });
    }

    const serviceId = asText(req.body?.serviceId);
    const request = req.body?.request as ServiceMigrationRequest | undefined;
    if (!serviceId || !request?.sourceCompanyId || !request.targetCompanyId) {
      return res.status(400).json({
        ok: false,
        message: 'serviceId, sourceCompanyId y targetCompanyId son requeridos',
      });
    }
    if (req.companyId !== request.targetCompanyId) {
      return res.status(400).json({
        ok: false,
        message: 'El token no coincide con la empresa destino',
      });
    }

    const response = startServiceMigration(serviceId, request);
    return res.status(202).json({
      ok: true,
      data: response,
    });
  } catch (error: any) {
    logger.error('[service-migration] create failed', error);
    const isConflict = String(error?.message || '').includes('Ya existe una migración');
    return res.status(isConflict ? 409 : 500).json({
      ok: false,
      message: error.message,
    });
  }
}
