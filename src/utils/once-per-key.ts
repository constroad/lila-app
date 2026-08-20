import { config } from '../config/environment.js';
import { getDispatchNotificationFlagModel } from '../models/dispatch-notification-flag.model.js';
import logger from './logger.js';

/**
 * Reclamo ATÓMICO de "esto ya se hizo": el primero que llama con una `key` se
 * la queda, los demás reciben `false`.
 *
 * Vive acá y no dentro de `dispatch-notifications.service.ts` —donde nació—
 * porque ya lo necesita un segundo consumidor (el reporte de clima). Copiar 20
 * líneas de un upsert atómico es exactamente cómo terminan existiendo dos
 * implementaciones que se comportan distinto bajo carrera.
 *
 * La colección tiene TTL de 48 h (ver el modelo), así que las claves con fecha
 * adentro se limpian solas.
 */

/** En desarrollo no se deduplica: probar un flujo dos veces seguidas es normal. */
export function shouldBypassDedupe(nodeEnv = config.nodeEnv) {
  return nodeEnv === 'development';
}

/**
 * `true` si ESTA llamada se quedó con la clave (o sea: hay que hacer el trabajo).
 *
 * Ante un fallo de Mongo devuelve `true` — se prefiere un aviso repetido a un
 * aviso perdido. Un duplicado se ve y se ignora; un envío que nunca salió no
 * deja rastro.
 */
export async function claimOnce(key: string, companyId: string): Promise<boolean> {
  if (shouldBypassDedupe()) return true;

  try {
    const FlagModel = await getDispatchNotificationFlagModel();
    const result = await FlagModel.updateOne(
      { key },
      { $setOnInsert: { key, companyId, createdAt: new Date() } },
      { upsert: true }
    );
    return result.upsertedCount > 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[once-per-key] no se pudo reclamar "${key}": ${message}`);
    return true;
  }
}

/** ¿La clave ya está tomada? Lectura pura — NO reclama. */
export async function isClaimed(key: string): Promise<boolean> {
  if (shouldBypassDedupe()) return false;

  try {
    const FlagModel = await getDispatchNotificationFlagModel();
    return Boolean(await FlagModel.exists({ key }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[once-per-key] no se pudo consultar "${key}": ${message}`);
    // Ante la duda, decir que NO está tomada: reintentar es mejor que saltear.
    return false;
  }
}
