import express, { type Express, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * LA UI DE DALI, SERVIDA POR LILA (spec DALI §2.1): `ui/dali/dist` (Vite) en
 * `/dali/`, con fallback a `index.html` para las rutas de la SPA. Cero proceso
 * nuevo en la mini; mismo origen que `/api/dali/*`. En `dali.constroad.com`
 * (`DALI_HOSTS`) la raíz redirige a `/dali/`. Sin `dist` (una release sin la
 * UI compilada) se responde 404 en vez de colgar a lila.
 */
export const DALI_HOSTS = ['dali.constroad.com'];
export const DALI_BASE = '/dali';

const carpetaDist = (): string => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ui', 'dali', 'dist');

export const montarUiDali = (app: Express): void => {
  const dist = carpetaDist();
  const index = path.join(dist, 'index.html');
  app.get('/', (req: Request, res: Response, next) => {
    const host = String(req.headers.host || '').split(':')[0];
    if (DALI_HOSTS.includes(host)) return res.redirect(302, `${DALI_BASE}/`);
    return next();
  });
  // Los assets llevan hash en el nombre: cache larga. El index, nunca.
  app.use(`${DALI_BASE}/assets`, express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  app.use(DALI_BASE, express.static(dist, { index: false, maxAge: '1h' }));
  app.get([DALI_BASE, `${DALI_BASE}/*`], (_req: Request, res: Response) => {
    if (!fs.existsSync(index)) {
      res.status(404).type('text/plain').send('La UI de Dali no está compilada en esta release.');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(index);
  });
};
