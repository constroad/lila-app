import { etaRestanteSegundos, seleccionarEnRutaSinCierre } from './dispatch-autoclose-sweeper.service';

const AHORA = Date.parse('2026-09-15T20:39:00.000Z'); // 15:39 Lima
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

describe('seleccionarEnRutaSinCierre', () => {
  it('toma los despachados sin llegada que salieron en la ventana (15/09: unidades 8, 9 y 11)', () => {
    const docs = [
      { _id: 'u8', companyId: 'globofas-s8k', state: 'despachado', departedAt: hace(6 * 60 + 46) },
      { _id: 'u9', companyId: 'globofas-s8k', state: 'despachado', departedAt: hace(6 * 60 + 27) },
      { _id: 'u11', companyId: 'globofas-s8k', state: 'despachado', departedAt: hace(5 * 60 + 24) },
      { _id: 'llego', companyId: 'globofas-s8k', state: 'despachado', departedAt: hace(300), arrival: { at: hace(100) } },
      { _id: 'recien', companyId: 'globofas-s8k', state: 'despachado', departedAt: hace(5) },
      { _id: 'ayer', companyId: 'globofas-s8k', state: 'despachado', departedAt: hace(13 * 60) },
      { _id: 'cargando', companyId: 'globofas-s8k', state: 'progreso', departedAt: hace(60) },
      { _id: 'sinEmpresa', state: 'despachado', departedAt: hace(60) },
      { _id: 'sinSalida', companyId: 'globofas-s8k', state: 'despachado' },
    ];
    expect(seleccionarEnRutaSinCierre(docs, AHORA).map((d) => d.dispatchId)).toEqual(['u8', 'u9', 'u11']);
  });

  it('acepta departedAt como Date y lo devuelve en ISO', () => {
    const r = seleccionarEnRutaSinCierre([{ _id: 'x', companyId: 'c', state: 'despachado', departedAt: new Date(AHORA - 3_600_000) }], AHORA);
    expect(r).toEqual([{ companyId: 'c', dispatchId: 'x', departedAt: new Date(AHORA - 3_600_000).toISOString() }]);
  });
});

describe('etaRestanteSegundos', () => {
  it('descuenta lo que ya pasó desde la salida', () => {
    expect(etaRestanteSegundos(AHORA - 30 * 60_000, 2 * 3600, AHORA)).toBe(90 * 60);
  });
  it('si la llegada esperada ya pasó, es 0 (cierra en el próximo tick), nunca negativo ni null', () => {
    expect(etaRestanteSegundos(AHORA - 6 * 3600_000, 2 * 3600, AHORA)).toBe(0);
  });
  it('sin ETA devuelve null (el job decide su fallback)', () => {
    expect(etaRestanteSegundos(AHORA - 3600_000, null, AHORA)).toBeNull();
    expect(etaRestanteSegundos(AHORA - 3600_000, 0, AHORA)).toBeNull();
  });
});
