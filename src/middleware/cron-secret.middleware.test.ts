import { requireCronSecret } from './cron-secret.middleware';

/**
 * `/api/cron/*` de lila exige el secreto compartido.
 *
 * El 07/09/2026 el mismo endpoint devolvía 401 en Portal (guard de borde) y 200
 * en lila (mount pelado), servido por el Funnel público. Con `x-company-id` —un
 * header, no una credencial— un tercero podía consumir el cupo diario del
 * reporte de cualquier empresa y dejarla sin su aviso de lluvia, con el cronjob
 * anotado como exitoso.
 */
const correr = (headers: Record<string, unknown>) => {
  const json = jest.fn();
  const res = { status: jest.fn(() => res), json } as never as {
    status: jest.Mock;
    json: jest.Mock;
  };
  const next = jest.fn();
  requireCronSecret({ headers } as never, res as never, next);
  return { status: res.status.mock.calls[0]?.[0] as number | undefined, body: json.mock.calls[0]?.[0], next };
};

const SECRETO_ORIGINAL = process.env.CRON_SECRET;

afterEach(() => {
  if (SECRETO_ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = SECRETO_ORIGINAL;
});

it('sin header no pasa: es exactamente el curl que devolvía 200', () => {
  process.env.CRON_SECRET = 'secreto-de-prueba';
  const { status, body, next } = correr({});
  expect(status).toBe(401);
  expect(body).toEqual({ ok: false, message: 'Unauthorized cron execution' });
  expect(next).not.toHaveBeenCalled();
});

it('con el secreto correcto pasa', () => {
  process.env.CRON_SECRET = 'secreto-de-prueba';
  const { next, status } = correr({ 'x-cron-secret': 'secreto-de-prueba' });
  expect(next).toHaveBeenCalled();
  expect(status).toBeUndefined();
});

it('un secreto equivocado no pasa, ni siquiera si es prefijo del bueno', () => {
  process.env.CRON_SECRET = 'secreto-de-prueba';
  expect(correr({ 'x-cron-secret': 'secreto-de' }).status).toBe(401);
  expect(correr({ 'x-cron-secret': 'secreto-de-prueba-y-mas' }).status).toBe(401);
  expect(correr({ 'x-cron-secret': 'otro' }).status).toBe(401);
});

/**
 * FAIL-CLOSED, igual que Portal: sin `CRON_SECRET` en el entorno no se corre
 * nada. Una ruta de cómputo sin auth no es un modo degradado aceptable — y si
 * abriera, un despliegue con la env faltante reabriría el hueco en silencio.
 */
it('sin CRON_SECRET configurado NO abre: rechaza todo', () => {
  delete process.env.CRON_SECRET;
  expect(correr({ 'x-cron-secret': 'lo-que-sea' }).status).toBe(401);
  expect(correr({}).status).toBe(401);
});

it('el header vacío o con espacios no cuenta como credencial', () => {
  process.env.CRON_SECRET = 'secreto-de-prueba';
  expect(correr({ 'x-cron-secret': '' }).status).toBe(401);
  expect(correr({ 'x-cron-secret': '   ' }).status).toBe(401);
});
