import { describe, expect, it } from '@jest/globals';
import express from 'express';
import { createServer, request, type Server } from 'node:http';
import { DALI_HOSTS, montarUiDali } from './dali-ui.js';

/** `fetch` de Node no deja poner `Host`; con `http.request` sí. */
const pedir = (base: string, ruta: string, host: string): Promise<{ status: number; location?: string; cuerpo: string }> =>
  new Promise((resolve, reject) => {
    const req = request(`${base}${ruta}`, { headers: { host } }, (res) => {
      let cuerpo = '';
      res.setEncoding('utf8');
      res.on('data', (t) => (cuerpo += t));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, cuerpo }));
    });
    req.on('error', reject);
    req.end();
  });

/**
 * LA UI DE DALI POR HOST: en `dali.constroad.com` la raíz redirige a `/dali/`;
 * en cualquier otro host, la raíz sigue siendo la genérica de lila. Y el
 * montaje tiene que ir ANTES de esa raíz genérica, o el redirect muere (pasó:
 * el host de Dali contestaba `{status: ok}` y el túnel parecía roto).
 */
const conApp = async (fn: (base: string) => Promise<void>): Promise<void> => {
  const app = express();
  montarUiDali(app);
  app.get('/', (_req, res) => res.json({ status: 'ok' }));
  const server: Server = createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
};

describe('montarUiDali', () => {
  it('en el host de Dali la raíz manda a /dali/; en los demás, sigue la raíz de lila', async () => {
    await conApp(async (base) => {
      const dali = await pedir(base, '/', DALI_HOSTS[0]);
      expect(dali.status).toBe(302);
      expect(dali.location).toBe('/dali/');
      const lila = await pedir(base, '/', 'lila.constroad.com');
      expect(lila.status).toBe(200);
      expect(JSON.parse(lila.cuerpo)).toEqual({ status: 'ok' });
    });
  });

  it('/dali/ responde la SPA (o un 404 claro si la release no trae el dist)', async () => {
    await conApp(async (base) => {
      const res = await pedir(base, '/dali/inicio', DALI_HOSTS[0]);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) expect(res.cuerpo).toContain('id="root"');
      else expect(res.cuerpo).toContain('no está compilada');
    });
  });
});
