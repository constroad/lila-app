import { timingSafeEqual } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * Auth de las rutas `/api/cron/*` de lila.
 *
 * **POR QUÉ EXISTE (07/09/2026).** `app.use('/api/cron', cronRoutes)` estaba
 * montado PELADO. Portal protege sus `/api/cron/*` desde el borde
 * (`cronAuth.edge.ts`, fail-closed) y por eso su proxy contestaba 401 sin
 * credenciales — pero el mismo endpoint, servido acá y expuesto por el Funnel,
 * contestaba 200 con el reporte a cualquiera:
 *
 *     curl https://lila.constroad.com/api/cron/weather-asphalt-forecast
 *     → 200 {"ok":true,"status":"ok",...}
 *
 * No es solo cómputo gratis contra una API pública con rate limit. La ruta lee
 * la empresa de `x-company-id` —un header del cliente, jamás una credencial— y
 * con ella consume el CUPO DIARIO del reporte: un tercero podía quemarle el
 * aviso de lluvia del día a cualquier empresa, y el cronjob de esa empresa
 * quedaba registrado como exitoso. Ver lila-security §0 y §1.
 *
 * Mismo secreto y misma semántica que Portal: el emisor es el JobExecutor y ya
 * manda `x-cron-secret`. **FAIL-CLOSED**: sin `CRON_SECRET` en el entorno no se
 * corre nada — una ruta de cómputo sin auth no es un modo degradado aceptable.
 */
const equalsSecret = (provided: string, expected: string): boolean => {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // `timingSafeEqual` exige el mismo largo; comparar largos no filtra el valor.
  return a.length === b.length && timingSafeEqual(a, b);
};

export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = (process.env.CRON_SECRET || '').trim();
  const provided = String(req.headers['x-cron-secret'] || '').trim();

  if (!expected || !provided || !equalsSecret(provided, expected)) {
    // Mismo cuerpo que Portal: un scanner no aprende de qué lado del proxy está.
    res.status(401).json({ ok: false, message: 'Unauthorized cron execution' });
    return;
  }

  next();
}
