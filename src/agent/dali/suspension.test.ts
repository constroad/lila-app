import { jest } from '@jest/globals';

/**
 * EMPRESA SUSPENDIDA: la marca se lee de `bot_configs` con caché de un
 * minuto por empresa, y suspender o levantar desde la consola la actualiza en
 * el acto (sin esperar el minuto).
 */
const findOne = jest.fn<(q: unknown) => { select: () => { lean: () => Promise<unknown> } }>();
jest.unstable_mockModule('../../database/bot.models.js', () => ({ getBotConfigModel: async () => ({ findOne }) }));

const { _resetSuspensiones, anotarSuspension, CACHE_SUSPENSION_MS, estaSuspendida } = await import('./suspension.js');

const responde = (doc: unknown) => findOne.mockReturnValue({ select: () => ({ lean: async () => doc }) });

beforeEach(() => {
  _resetSuspensiones();
  findOne.mockReset();
});

describe('estaSuspendida', () => {
  it('lee la marca una vez por minuto', async () => {
    responde({ operador: { suspendida: true } });
    const t0 = 1_000_000;
    expect(await estaSuspendida('constroad', t0)).toBe(true);
    expect(await estaSuspendida('constroad', t0 + CACHE_SUSPENSION_MS - 1)).toBe(true);
    expect(findOne).toHaveBeenCalledTimes(1);
    responde({ operador: { suspendida: false } });
    expect(await estaSuspendida('constroad', t0 + CACHE_SUSPENSION_MS + 1)).toBe(false);
    expect(findOne).toHaveBeenCalledTimes(2);
  });

  it('sin config, o sin marca, no está suspendida', async () => {
    responde(null);
    expect(await estaSuspendida('nadie', 5)).toBe(false);
    responde({ operador: {} });
    expect(await estaSuspendida('otra', 5)).toBe(false);
  });

  it('anotar desde la consola vale en el acto, sin consultar la base', async () => {
    anotarSuspension('constroad', true, 10);
    expect(await estaSuspendida('constroad', 11)).toBe(true);
    expect(findOne).not.toHaveBeenCalled();
    anotarSuspension('constroad', false, 12);
    expect(await estaSuspendida('constroad', 13)).toBe(false);
  });
});
