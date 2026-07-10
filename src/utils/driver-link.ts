import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';

// Mismo contrato que Portal `src/lib/tracking/driverToken.ts` (secreto
// compartido: JWT_SECRET aquí = LILA_APP_JWT_SECRET en Portal). El token solo
// autoriza a publicar ubicación/llegada de UN dispatch; TTL una jornada.
const SCOPE = 'driver-location';
const DEFAULT_TTL = '12h';

export function signDriverToken(
  dispatchId: string,
  companyId: string,
  expiresIn: string | number = DEFAULT_TTL
): string {
  return jwt.sign({ dispatchId, companyId, scope: SCOPE }, config.security.jwtSecret, {
    expiresIn,
  } as jwt.SignOptions);
}

/** Link del chofer (GPS en ruta + marcar llegada) servido por Portal (F7/F8). */
export function buildDriverLink(dispatchId: string, companyId: string): string {
  const base = String(config.portal.baseUrl || '').replace(/\/+$/, '');
  return `${base}/public/driver/${signDriverToken(dispatchId, companyId)}`;
}

/**
 * Delay del recordatorio "marca tu llegada" (F8-C): ETA + 10% de margen.
 * Sin ETA usable cae a 90 min; clamp [15 min, 6 h] para no spamear ni
 * quedar obsoleto.
 */
export function computeArrivalReminderDelayMs(
  etaDurationSeconds: number | null | undefined
): number {
  const MIN_MS = 15 * 60 * 1000;
  const MAX_MS = 6 * 60 * 60 * 1000;
  const FALLBACK_MS = 90 * 60 * 1000;

  const eta = Number(etaDurationSeconds);
  if (!Number.isFinite(eta) || eta <= 0) return FALLBACK_MS;
  const withMargin = eta * 1.1 * 1000;
  return Math.min(MAX_MS, Math.max(MIN_MS, Math.round(withMargin)));
}

/**
 * Delay para ENVIAR el link de compartir-ubicación al chofer (F8-C): 1/4 del
 * tiempo de recorrido. Así el mensaje llega cuando el volquete ya está EN RUTA
 * (no al despachar, cuando aún carga/maniobra en planta y compartir GPS no
 * aporta). El ETA que llega ya viene ajustado a volquete (Portal). Sin ETA
 * usable cae a 10 min; clamp [3 min, 30 min] para no salir ni tan pronto ni
 * tan tarde. `0` = envío inmediato (reenvío manual desde el admin).
 */
export function computeLocationShareDelayMs(
  etaDurationSeconds: number | null | undefined
): number {
  const MIN_MS = 3 * 60 * 1000;
  const MAX_MS = 30 * 60 * 1000;
  const FALLBACK_MS = 10 * 60 * 1000;

  const eta = Number(etaDurationSeconds);
  if (!Number.isFinite(eta) || eta <= 0) return FALLBACK_MS;
  const quarter = eta * 0.25 * 1000;
  return Math.min(MAX_MS, Math.max(MIN_MS, Math.round(quarter)));
}
