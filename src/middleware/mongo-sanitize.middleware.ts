/**
 * mongoSanitize — defensa contra NoSQL operator-injection en Mongo.
 *
 * Elimina recursivamente claves peligrosas (`$...` o con `.`) de `req.body`,
 * `req.query` y `req.params`, neutralizando payloads tipo `{ "$ne": null }` o
 * `{ "user.role": "admin" }` sin depender de una librería externa.
 *
 * Defense-in-depth: hoy el riesgo es bajo (Mongoose con filtros estructurados,
 * `$regex` escapado), pero este middleware lo cierra de raíz. Ver
 * specs/SCALABILITY-MULTI-SESSION.spec §4.5.
 */
import { Request, Response, NextFunction } from 'express';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Buffer.isBuffer(value);

const sanitize = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(sanitize);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete value[key];
      continue;
    }
    sanitize(value[key]);
  }
};

export function mongoSanitize(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
  } catch {
    // La sanitización nunca debe romper el request.
  }
  next();
}
