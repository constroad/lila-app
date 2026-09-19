import { describe, expect, it } from '@jest/globals';
import express from 'express';
import { createServer, request, type Server } from 'node:http';
import { DALI_HOSTS, PREFIJO_VIEJO, montarUiDali } from './dali-ui.js';

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

/** La SPA (o el 404 claro de una release sin `dist`): lo que responde el panel en cualquiera de sus rutas. */
const esElPanel = (r: { status: number; cuerpo: string }): void => {
  expect([200, 404]).toContain(r.status);
  if (r.status === 200) expect(r.cuerpo).toContain('id="root"');
  else expect(r.cuerpo).toContain('no está compilada');
};

const LILA = 'lila.constroad.com';
const DALI = DALI_HOSTS[0];

/**
 * LA UI DE DALI POR HOST: en `dali.constroad.com` el panel vive en la RAÍZ (sin
 * `/dali/`); en cualquier otro host, la raíz sigue siendo la genérica de lila.
 * El montaje va ANTES de esa raíz genérica y del `/admin` de lila (el
 * dashboard de salud), como en `src/index.ts`: en el host de Dali `/admin/*`
 * es la consola del operador. Y la API y los archivos se registran DESPUÉS,
 * también como en `src/index.ts`: el panel tiene que dejarlos pasar.
 */
const conApp = async (fn: (base: string) => Promise<void>): Promise<void> => {
  const app = express();
  montarUiDali(app);
  app.get('/', (_req, res) => res.json({ status: 'ok' }));
  app.use('/admin', express.Router().get('/empresas', (_req, res) => res.type('text/plain').send('dashboard de lila')));
  app.get('/api/dali/auth/yo', (_req, res) => res.json({ yo: 'ok' }));
  app.get('/files/companies/x/foto.jpg', (_req, res) => res.type('text/plain').send('archivo de lila'));
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
  it('en el host de Dali la raíz es el panel; en los demás, sigue la raíz de lila', async () => {
    await conApp(async (base) => {
      esElPanel(await pedir(base, '/', DALI));
      esElPanel(await pedir(base, '/guia', DALI));
      const lila = await pedir(base, '/', LILA);
      expect(lila.status).toBe(200);
      expect(JSON.parse(lila.cuerpo)).toEqual({ status: 'ok' });
      expect((await pedir(base, '/guia', LILA)).status).toBe(404);
    });
  });

  it('los enlaces viejos /dali/… mandan (301) a la misma ruta en la raíz del host de Dali, desde cualquier host', async () => {
    await conApp(async (base) => {
      const desdeLila = await pedir(base, `${PREFIJO_VIEJO}/admin/salud?x=1`, LILA);
      expect(desdeLila.status).toBe(301);
      expect(desdeLila.location).toBe(`https://${DALI}/admin/salud?x=1`);
      const desdeDali = await pedir(base, `${PREFIJO_VIEJO}/guia`, DALI);
      expect(desdeDali.status).toBe(301);
      expect(desdeDali.location).toBe(`https://${DALI}/guia`);
      expect((await pedir(base, PREFIJO_VIEJO, DALI)).location).toBe(`https://${DALI}/`);
      expect((await pedir(base, `${PREFIJO_VIEJO}/`, LILA)).location).toBe(`https://${DALI}/`);
      expect((await pedir(base, `${PREFIJO_VIEJO}?x=1`, LILA)).location).toBe(`https://${DALI}/?x=1`);
    });
  });

  it('en el host de Dali, la API y los archivos siguen siendo de lila; /admin es la consola, no el dashboard', async () => {
    await conApp(async (base) => {
      const api = await pedir(base, '/api/dali/auth/yo', DALI);
      expect(api.status).toBe(200);
      expect(JSON.parse(api.cuerpo)).toEqual({ yo: 'ok' });
      expect((await pedir(base, '/files/companies/x/foto.jpg', DALI)).cuerpo).toBe('archivo de lila');
      esElPanel(await pedir(base, '/admin/empresas', DALI));
      expect((await pedir(base, '/admin/empresas', LILA)).cuerpo).toBe('dashboard de lila');
    });
  });
});
