import { jest } from '@jest/globals';

jest.unstable_mockModule('../../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

type Acceso = typeof import('./acceso.js');
type Miembros = typeof import('./miembros.js');
let acceso: Acceso;
let miembros: Miembros;
beforeAll(async () => {
  acceso = await import('./acceso.js');
  miembros = await import('./miembros.js');
});
beforeEach(() => acceso._resetCodigos());

/**
 * ENTRAR CON CÓDIGO, sin constroad-auth todavía: el código se genera, vale 10
 * minutos y un solo uso, cinco intentos lo queman, y a quien no es miembro se le
 * contesta igual que a quien sí (no se revela quién existe).
 */
const jose = { id: 'm1', companyId: 'constroad', identity: '51903124919', name: 'José', role: 'owner' as const };
const buscarMiembro = async (identidad: string) => (identidad === jose.identity ? jose : null);
const anotarIngreso = async () => undefined;
const generar = () => '482913';

describe('identidades', () => {
  it('normaliza celulares y correos', () => {
    expect(miembros.normalizarIdentidad('+51 903 124 919')).toBe('51903124919');
    expect(miembros.normalizarIdentidad('903124919')).toBe('51903124919'); // nueve cifras: Perú
    expect(miembros.normalizarIdentidad(' Jose@Mail.com ')).toBe('jose@mail.com');
    expect(miembros.esIdentidadValida('51903124919')).toBe(true);
    expect(miembros.esIdentidadValida('jose@mail.com')).toBe(true);
    expect(miembros.esIdentidadValida('12')).toBe(false);
    expect(miembros.esIdentidadValida('hola')).toBe(false);
  });
});

describe('pedir y verificar el código', () => {
  it('el ciclo completo: pedir, verificar, y el código ya no sirve', async () => {
    const pedido = await acceso.pedirCodigo('+51 903 124 919', { buscarMiembro, generar, ahoraMs: 1_000 });
    expect(pedido).toEqual({ ok: true, canal: 'prueba', reintentoEnMs: 30_000 });
    const mal = await acceso.verificarCodigo('51903124919', '000000', { buscarMiembro, anotarIngreso, ahoraMs: 2_000 });
    expect(mal).toEqual({ ok: false, motivo: 'incorrecto' });
    const bien = await acceso.verificarCodigo('51903124919', '482913', { buscarMiembro, anotarIngreso, ahoraMs: 3_000 });
    expect(bien).toEqual({ ok: true, miembro: jose });
    expect(await acceso.verificarCodigo('51903124919', '482913', { buscarMiembro, anotarIngreso, ahoraMs: 4_000 })).toEqual({ ok: false, motivo: 'sin-codigo' });
  });

  it('vence a los 10 minutos y se quema a los cinco intentos', async () => {
    await acceso.pedirCodigo('51903124919', { buscarMiembro, generar, ahoraMs: 0 });
    expect(await acceso.verificarCodigo('51903124919', '482913', { buscarMiembro, anotarIngreso, ahoraMs: acceso.VIGENCIA_CODIGO_MS + 1 })).toEqual({ ok: false, motivo: 'vencido' });
    await acceso.pedirCodigo('51903124919', { buscarMiembro, generar, ahoraMs: 100_000 });
    for (let i = 1; i < acceso.INTENTOS_MAXIMOS; i++) expect((await acceso.verificarCodigo('51903124919', '1', { buscarMiembro, anotarIngreso, ahoraMs: 100_001 })).ok).toBe(false);
    expect(await acceso.verificarCodigo('51903124919', '1', { buscarMiembro, anotarIngreso, ahoraMs: 100_002 })).toEqual({ ok: false, motivo: 'bloqueado' });
    expect(await acceso.verificarCodigo('51903124919', '482913', { buscarMiembro, anotarIngreso, ahoraMs: 100_003 })).toEqual({ ok: false, motivo: 'sin-codigo' });
  });

  it('a quien no es miembro se le contesta lo mismo, pero no hay código que verificar', async () => {
    expect(await acceso.pedirCodigo('51999000111', { buscarMiembro, generar, ahoraMs: 0 })).toEqual({ ok: true, canal: 'prueba', reintentoEnMs: 30_000 });
    expect(await acceso.verificarCodigo('51999000111', '482913', { buscarMiembro, anotarIngreso, ahoraMs: 1 })).toEqual({ ok: false, motivo: 'sin-codigo' });
  });

  it('una identidad inválida se rechaza y pedir dos veces seguidas espera 30 s', async () => {
    expect(await acceso.pedirCodigo('hola', { buscarMiembro, generar })).toEqual({ ok: false, motivo: 'identidad-invalida' });
    await acceso.pedirCodigo('51903124919', { buscarMiembro, generar, ahoraMs: 0 });
    expect(await acceso.pedirCodigo('51903124919', { buscarMiembro, generar, ahoraMs: 10_000 })).toEqual({ ok: false, motivo: 'muy-seguido' });
    expect((await acceso.pedirCodigo('51903124919', { buscarMiembro, generar, ahoraMs: 31_000 })).ok).toBe(true);
  });
});
