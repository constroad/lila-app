import { deployDe, erroresDe, estadoGeneral, type LineaDeSalud } from './salud';

/**
 * SALUD DEL SISTEMA (S4): el estado general sale de las líneas y los envíos
 * fallidos; los errores recientes son los eventos de línea que son un
 * problema, con la empresa dueña; el deploy se lee de la carpeta de release
 * de torre.
 */
const linea = (numero: string, estado: LineaDeSalud['estado']): LineaDeSalud => ({ companyId: numero, nombre: numero, rubro: 'asphalt', numero, estado });

describe('estadoGeneral', () => {
  it('operativo con todo conectado; atención con una línea caída o envíos fallidos; caído con todas caídas', () => {
    expect(estadoGeneral([linea('1', 'conectado'), linea('2', 'conectado'), linea('', 'sin-numero')], 0)).toBe('operativo');
    expect(estadoGeneral([linea('1', 'conectado'), linea('2', 'desconectado')], 0)).toBe('atencion');
    expect(estadoGeneral([linea('1', 'conectado')], 2)).toBe('atencion');
    expect(estadoGeneral([linea('1', 'desconectado'), linea('2', 'requiere-vincular')], 0)).toBe('caido');
    expect(estadoGeneral([linea('', 'sin-numero')], 0)).toBe('operativo');
  });
});

describe('erroresDe', () => {
  it('se queda con desconexiones, envíos fallidos y aparcadas; el resto no es un error', () => {
    const at = new Date('2026-09-16T04:02:00Z');
    const errores = erroresDe(
      [
        { sessionId: '51944000222', kind: 'disconnected', code: 428, at },
        { sessionId: '51949376824', kind: 'send-failed', detail: 'timeout', companyId: 'constroad', at },
        { sessionId: '51949376824', kind: 'connected', at },
        { sessionId: '51961888111', kind: 'parked', detail: 'WhatsApp no completó el login', at },
      ],
      (numero, companyId) => (companyId === 'constroad' ? 'CONSTROAD' : numero === '51944000222' ? 'Constructora JC' : undefined)
    );
    expect(errores.map((e) => `${e.tipo}:${e.empresa ?? '-'}`)).toEqual(['desconexion:Constructora JC', 'envio-fallido:CONSTROAD', 'sin-conectar:-']);
    expect(errores[0].detalle).toMatch(/conexión|Conexión|cerr/i);
    expect(errores[1].detalle).toBe('timeout');
  });
});

describe('deployDe', () => {
  it('saca el sha y la fecha (hora de Lima) de la carpeta de release de torre', () => {
    expect(deployDe('/Users/jose/deploys/lila/releases/20260916-093255-e3d7a34', 'v22.0.0', Date.parse('2026-09-16T14:33:40Z'))).toEqual({
      release: '20260916-093255-e3d7a34',
      sha: 'e3d7a34',
      desplegadoEl: '2026-09-16T14:32:55.000Z',
      node: 'v22.0.0',
      iniciadoEl: '2026-09-16T14:33:40.000Z',
    });
  });

  it('sin carpeta de release (desarrollo) no inventa sha ni fecha', () => {
    expect(deployDe('/Users/jose/projects/lila-app', 'v22.0.0', 0)).toMatchObject({ release: 'lila-app', sha: null, desplegadoEl: null });
  });
});
