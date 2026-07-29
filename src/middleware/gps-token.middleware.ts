import { Request, Response, NextFunction } from 'express';
import { resolveGpsIngestAuth } from '../services/gps-ingest.service.js';

/**
 * Autenticación del webhook de GPS (Flota F4 §3.4). Credencial PROPIA y de alcance
 * mínimo: el token de `fleetSettings.gpsWebhook` sirve SOLO para esta ruta — no es
 * el `CRON_SECRET` compartido ni la API key de lila. Si el proveedor lo filtra, lo
 * único que se puede hacer con él es escribir puntos de esa empresa.
 *
 * Deja `req.companyId` resuelto, así el rate limiter por empresa (que lo exige)
 * funciona igual que en las rutas con JWT.
 */

/** El token va en header, Bearer o query: no todo panel permite headers. */
export const extractGpsToken = (req: Request): string | undefined => {
  const header = req.headers['x-gps-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const query = req.query.token;
  if (typeof query === 'string' && query.trim()) return query.trim();
  return undefined;
};

export async function requireGpsToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = await resolveGpsIngestAuth(extractGpsToken(req));
  if (!auth) {
    // Mensaje genérico: no se distingue "no existe" de "desactivado" para no
    // confirmarle a un scanner que el token es válido pero está apagado.
    res.status(401).json({ ok: false, message: 'Token inválido' });
    return;
  }
  req.companyId = auth.companyId;
  req.gpsProvider = auth.provider;
  next();
}
