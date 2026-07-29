import crypto from 'crypto';
import { getCompanyModel, getGpsPositionModel } from '../database/models.js';
import logger from '../utils/logger.js';
import { normalizeGpsBatch, type GpsNormalizeResult } from './gps-normalizer.js';

/**
 * Ingest del rastro GPS del proveedor de hardware (Flota F4 §3.4).
 *
 * Por qué vive en lila y no en el Portal: el equipo manda un punto por minuto por
 * unidad. Con 20 unidades son ~28 800 requests al día — en una función serverless
 * eso es la factura del mes; acá es un proceso que ya está prendido.
 *
 * Escribe la MISMA colección que lee la torre de control (`gpspositions` de
 * `constroad_db`, compartida con el Portal). Los eventos derivados (exceso de
 * velocidad, geocercas, desvío) los sigue calculando el cron del Portal: acá no se
 * deriva nada — un webhook que además evalúa reglas se vuelve el punto único de
 * falla de todo el módulo.
 *
 * Credencial: token PROPIO por empresa (`fleetSettings.gpsWebhook`), nunca el
 * `CRON_SECRET` compartido ni la API key de lila. El token IDENTIFICA a la empresa
 * (se resuelve por su hash), así que la URL no lleva `companyId` y no hay nada que
 * enumerar ni cross-tenant que forzar.
 */

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

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

type GpsWebhookConfig = {
  secretHash?: string;
  isActive?: boolean;
  provider?: string;
  tokenPrefix?: string;
};

type CompanyRow = {
  companyId: string;
  fleetSettings?: { gpsWebhook?: GpsWebhookConfig };
};

export type GpsIngestAuth = { companyId: string; provider?: string };

/**
 * Resuelve la empresa dueña del token. Devuelve `null` ante cualquier duda: token
 * ausente, sin configuración, desactivado o hash que no coincide.
 *
 * La comparación del hash se repite EN CÓDIGO además de filtrar por él en la
 * query. Es a propósito: si algún día un `strictQuery` de mongoose descartara el
 * filtro por una ruta no declarada, la query devolvería la PRIMERA empresa y esto
 * sería un bypass total. Con la verificación explícita, ese escenario falla
 * cerrado.
 */
export async function resolveGpsIngestAuth(token: string | undefined): Promise<GpsIngestAuth | null> {
  const clean = String(token || '').trim();
  if (clean.length < 20) return null;

  const expectedHash = hashToken(clean);
  const Company = await getCompanyModel();
  const company = (await Company.findOne({
    'fleetSettings.gpsWebhook.secretHash': expectedHash,
  })
    .select('companyId fleetSettings.gpsWebhook')
    .lean()) as CompanyRow | null;

  const config = company?.fleetSettings?.gpsWebhook;
  if (!company?.companyId || !config?.secretHash) return null;
  if (config.isActive === false) return null;
  if (!timingSafeEqual(expectedHash, String(config.secretHash))) return null;

  return { companyId: company.companyId, provider: config.provider };
}

/**
 * Código de un error de escritura del lote. Mongoose lo ANIDA (`{ err: { code } }`)
 * y el driver lo expone plano (`{ code }`) según por dónde venga: leer solo una de
 * las dos formas hacía que un reenvío legítimo del equipo se viera como error de
 * DB, devolviera 503 y el proveedor reintentara en bucle. Se verificó contra la DB
 * real: la forma que llega de `insertMany` es la anidada.
 */
export const resolveWriteErrorCode = (writeError: unknown): number | undefined => {
  const flat = writeError as { code?: number; err?: { code?: number } };
  return flat?.code ?? flat?.err?.code;
};

export type GpsIngestResult = GpsNormalizeResult & {
  /** Puntos efectivamente escritos (los repetidos los frena el índice único). */
  inserted: number;
  duplicates: number;
};

/**
 * Normaliza el lote y lo inserta. `ordered: false` es lo que hace idempotente al
 * reenvío: el índice único `{companyId, plate, at, source}` rechaza los repetidos
 * uno por uno y el resto del lote SÍ entra. Con `ordered: true` un solo duplicado
 * (el equipo reintenta cuando recupera señal) tumbaría el lote completo.
 */
export async function ingestGpsBatch(params: {
  companyId: string;
  payload: unknown;
  defaultPlate?: string;
  now?: Date;
}): Promise<GpsIngestResult> {
  const normalized = normalizeGpsBatch(params.payload, {
    defaultPlate: params.defaultPlate,
    source: 'provider',
    now: params.now,
  });
  if (normalized.points.length === 0) {
    return { ...normalized, inserted: 0, duplicates: 0 };
  }

  const GpsPosition = await getGpsPositionModel();
  const documents = normalized.points.map((point) => ({
    ...point,
    companyId: params.companyId,
  }));

  try {
    const created = await GpsPosition.insertMany(documents, { ordered: false });
    return { ...normalized, inserted: created.length, duplicates: 0 };
  } catch (error) {
    const bulkError = error as {
      writeErrors?: unknown[];
      result?: { insertedCount?: number };
    };
    const writeErrors = Array.isArray(bulkError.writeErrors) ? bulkError.writeErrors : [];
    const duplicates = writeErrors.filter((writeError) => resolveWriteErrorCode(writeError) === 11000)
      .length;
    // Solo los duplicados son esperables. Cualquier otro error de escritura se
    // propaga: un fallo de conexión no puede verse como "lote recibido".
    if (writeErrors.length > 0 && duplicates === writeErrors.length) {
      const insertedCount = bulkError.result?.insertedCount;
      const inserted =
        typeof insertedCount === 'number' ? insertedCount : documents.length - duplicates;
      return { ...normalized, inserted, duplicates };
    }
    throw error;
  }
}

/** Sello de último uso del webhook (best-effort: nunca bloquea la respuesta). */
export function touchGpsWebhookSafe(params: {
  companyId: string;
  points: number;
}): void {
  void (async () => {
    const Company = await getCompanyModel();
    await Company.updateOne(
      { companyId: params.companyId },
      {
        $set: {
          'fleetSettings.gpsWebhook.lastUsedAt': new Date(),
          'fleetSettings.gpsWebhook.lastPoints': params.points,
        },
      }
    );
  })().catch((error) => {
    logger.warn(`[gps-ingest] no se pudo sellar el uso del webhook: ${String(error)}`);
  });
}
