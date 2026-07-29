import { Request, Response } from 'express';
import logger from '../../utils/logger.js';
import { ingestGpsBatch, touchGpsWebhookSafe } from '../../services/gps-ingest.service.js';

/**
 * Webhook del proveedor de GPS (Flota F4 §3.4) — `POST /api/gps/positions`.
 * La autenticación la resolvió `requireGpsToken`: acá `req.companyId` ya es de
 * confianza y el cuerpo NO puede cambiarlo.
 *
 * Contrato con el proveedor: manda su JSON tal cual (el normalizador traduce los
 * alias habituales: `placa`/`lat`/`latitude`/`ts` en epoch de segundos o de
 * milisegundos) y autentica con el token de la empresa en `x-gps-token`.
 *
 * Responde 200 cuando el lote se PROCESÓ, con el desglose de lo aceptado y lo
 * descartado por motivo. Es deliberado: un proveedor que recibe 4xx por un punto
 * malo reintenta el lote entero en bucle, y ese bucle lo pagamos nosotros. El 4xx
 * queda para lo que el proveedor SÍ puede arreglar (token, cuerpo ausente) y el
 * 503 para lo que debe reintentar (la DB se cayó).
 */

export async function ingestGpsPositions(req: Request, res: Response): Promise<void> {
  const companyId = req.companyId;
  if (!companyId) {
    res.status(401).json({ ok: false, message: 'Token inválido' });
    return;
  }
  if (!req.body) {
    res.status(400).json({ ok: false, message: 'Cuerpo vacío' });
    return;
  }

  // La placa puede venir en la URL (proveedores que publican un endpoint por
  // unidad); si viene en cada punto, gana la del punto.
  const plateParam = req.query.plate ?? req.query.placa;
  const defaultPlate = typeof plateParam === 'string' ? plateParam : undefined;

  try {
    const result = await ingestGpsBatch({ companyId, payload: req.body, defaultPlate });
    if (result.inserted > 0) {
      touchGpsWebhookSafe({ companyId, points: result.inserted });
    }
    const rejectedCount = Object.values(result.rejected).reduce((sum, count) => sum + count, 0);
    if (rejectedCount > 0) {
      logger.warn(
        `[gps] ${companyId}: ${result.inserted} escritos, ${rejectedCount} descartados ${JSON.stringify(result.rejected)}`
      );
    }
    res.status(200).json({
      ok: true,
      inserted: result.inserted,
      duplicates: result.duplicates,
      rejected: result.rejected,
    });
  } catch (error) {
    logger.error(`[gps] ingest falló para ${companyId}:`, error);
    res.status(503).json({ ok: false, message: 'No se pudo registrar el lote' });
  }
}

/**
 * Sonda para el técnico del proveedor: confirma que el token llegó bien SIN
 * escribir nada. Sin esto, la única forma de probar la conexión es mandar puntos
 * falsos, y esos quedan en el rastro real de la unidad.
 */
export async function checkGpsToken(req: Request, res: Response): Promise<void> {
  res.status(200).json({ ok: true, provider: req.gpsProvider ?? null });
}
