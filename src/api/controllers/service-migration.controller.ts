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

    const request = req.body?.request as ServiceMigrationRequest | undefined;
    const entityType = request?.entityType === 'order' ? 'order' : 'service';
    const recordId = asText(
      req.body?.recordId ||
      (entityType === 'order' ? req.body?.orderId : req.body?.serviceId)
    );
    if (!recordId || !request?.sourceCompanyId || !request.targetCompanyId) {
      return res.status(400).json({
        ok: false,
        message: 'recordId, sourceCompanyId y targetCompanyId son requeridos',
      });
    }
    if (req.companyId !== request.targetCompanyId) {
      return res.status(400).json({
        ok: false,
        message: 'El token no coincide con la empresa destino',
      });
    }

    const response = await startServiceMigration(recordId, request);
    return res.status(202).json({
      ok: true,
      data: response,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    logger.error('[service-migration] create failed', error);
    const isConflict = message.includes('Ya existe una migración');
    const isValidationError =
      message.includes('Falta pairing') ||
      message.includes('Confirmación inválida') ||
      message.includes('Pedido no existe') ||
      message.includes('Origen y destino');
    return res.status(isConflict ? 409 : isValidationError ? 400 : 500).json({
      ok: false,
      message,
    });
  }
}
