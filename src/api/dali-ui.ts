import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * LA UI DE DALI, SERVIDA POR LILA (spec DALI §2.1): `ui/dali/dist` (Vite) en la
 * RAÍZ de `dali.constroad.com` (`DALI_HOSTS`), con fallback a `index.html` para
 * las rutas de la SPA. Cero proceso nuevo en la mini; mismo origen que
 * `/api/dali/*`. En ese host solo la API y los archivos siguen siendo de lila
 * (`RUTAS_DE_LILA`); todo lo demás es el panel —incluido `/admin/*`, que ahí es
 * la consola del operador y no el dashboard de salud de lila, por eso este
 * montaje va antes de ese `/admin` en `src/index.ts`—. Hasta el 18/09 el panel
 * vivía bajo `/dali/`; esos enlaces (en cualquier host) mandan con 301 a la
 * misma ruta en la raíz del host de Dali. Sin `dist` (una release sin la UI
 * compilada) se responde 404 en vez de colgar a lila.
 */
export const DALI_HOSTS = ['dali.constroad.com'];
/** El prefijo viejo del panel (`lila.constroad.com/dali/…`, `dali.constroad.com/dali/…`): sigue entrando, redirigido. */
export const PREFIJO_VIEJO = '/dali';
/** Lo que en el host de Dali sigue siendo de lila. `/health` se registra antes que la UI; está acá por si eso cambia. */
export const RUTAS_DE_LILA = ['/api', '/files', '/health'];

const hostDe = (req: Request): string => String(req.headers.host || '').split(':')[0];
const esRutaDeLila = (ruta: string): boolean => RUTAS_DE_LILA.some((prefijo) => ruta === prefijo || ruta.startsWith(`${prefijo}/`));
const carpetaDist = (): string => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ui', 'dali', 'dist');

/** El panel: los assets con hash (cache larga), los estáticos de `public/` y, para cualquier otra ruta, el index (nunca cacheado). */
const panel = (dist: string): RequestHandler => {
  const index = path.join(dist, 'index.html');
  const ui = express.Router();
  ui.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  ui.use(express.static(dist, { index: false, maxAge: '1h' }));
  ui.get('*', (_req: Request, res: Response) => {
    if (!fs.existsSync(index)) {
      res.status(404).type('text/plain').send('La UI de Dali no está compilada en esta release.');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(index);
  });
  return ui;
};

export const montarUiDali = (app: Express): void => {
  const ui = panel(carpetaDist());
  app.use(PREFIJO_VIEJO, (req: Request, res: Response) => {
    const resto = req.originalUrl.slice(PREFIJO_VIEJO.length);
    res.redirect(301, `https://${DALI_HOSTS[0]}${resto.startsWith('/') ? resto : `/${resto}`}`);
  });
  app.use((req: Request, res: Response, next) => {
    if (!DALI_HOSTS.includes(hostDe(req)) || esRutaDeLila(req.path)) return next();
    return ui(req, res, next);
  });
};
