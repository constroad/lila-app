import { estadoPorReorden, svgAgregados, svgResumenDespachos, svgTanques } from './imagen';
import type { VistaDelDia } from './vista';

/**
 * La imagen del resumen, sin rasterizar: lo que se prueba es que el SVG lleve
 * los mismos datos que el texto —placa, chofer, m³, horas, estado— y que un
 * nombre con «&» o «<» no rompa el XML.
 */
const lima = (h: string) => new Date(`2026-09-13T${h}:00.000-05:00`).getTime();
const vista: VistaDelDia = {
  fecha: '2026-09-13',
  computedAt: 0,
  orders: [
    {
      orderId: 'o1', companyId: 'globofas-s8k', companySlug: 'globofast', cliente: 'DE & BD INMOBILIARIA', obra: 'PROYECTOS <VARIOS>', cantidadCubos: 50, m3Dispatched: 25, hora: '04:00',
      units: [
        { dispatchId: 'd1', unitNumber: 1, plate: 'AZJ 910', driverName: 'HOOVER QUISPE MUÑOZ', state: 'despachado', quantity: 25, departedAt: lima('05:32'), arrivalAt: lima('06:47'), picturesCount: 0 },
        { dispatchId: 'd2', unitNumber: 2, plate: 'BBE 942', driverName: 'LUCIO QUISPE DIAZ', state: 'progreso', quantity: 25, picturesCount: 0 },
      ],
    },
  ],
};

describe('svg del resumen', () => {
  it('lleva cabecera, pedido y una fila por unidad con sus datos', () => {
    const svg = svgResumenDespachos(vista);
    expect(svg).toContain('Despachos — domingo 13/09');
    expect(svg).toContain('25 de 50 m³ despachados · 1 pedido(s)');
    expect(svg).toContain('AZJ 910');
    expect(svg).toContain('HOOVER QUISPE MUÑOZ');
    expect(svg).toContain('05:32');
    expect(svg).toContain('06:47');
    expect(svg).toContain('>llegó<');
    expect(svg).toContain('>cargando<');
  });

  it('escapa lo que rompería el XML', () => {
    const svg = svgResumenDespachos(vista);
    expect(svg).toContain('DE &amp; BD INMOBILIARIA');
    expect(svg).toContain('PROYECTOS &lt;VARIOS&gt;');
    expect(svg).not.toContain('<VARIOS>');
  });
});

/**
 * Las tarjetas de tanques y de agregados: las mismas del cron de Portal. Se
 * prueba que lleven los datos del texto y que el semáforo siga la regla del
 * punto de reposición (bajo = en o por debajo; medio = hasta 1,5×).
 */
describe('tarjetas de tanques', () => {
  it('cada tanque con su nombre, nivel, disponible, llenado y estado', () => {
    const svg = svgTanques(
      [
        { nombre: 'INFRA PEN 1', contenido: 'pen', galones: 573.56, m3Producibles: 22.94, nivelCm: 38, capacidad: 2000, stock: 600, reorden: 200 },
        { nombre: 'INFRA HIGHWAY', contenido: 'petroleo', galones: 66.65, m3Producibles: 0, nivelCm: 29.5, capacidad: 500, stock: 80, reorden: 100 },
      ],
      'Inframaq · planta'
    );
    expect(svg).toContain('Control de tanques');
    expect(svg).toContain('Inframaq · planta');
    expect(svg).toContain('INFRA PEN 1');
    expect(svg).toContain('38 cm');
    expect(svg).toContain('23 m³ prod.');
    expect(svg).toContain('>30%<'); // 600 de 2000
    expect(svg).toContain('>Saludable<');
    expect(svg).toContain('67 gl'); // petróleo: galones, no m³
    expect(svg).toContain('>16%<'); // 80 de 500
    expect(svg).toContain('>Reponer<');
  });
});

describe('tarjetas de agregados', () => {
  it('stock, mínimo, llenado al doble del mínimo y estado', () => {
    const svg = svgAgregados(
      [
        { empresa: 'Globofast', nombre: 'ARENA PRIMARIA', cantidad: 291.65, unidad: 'm³', reponer: true, reorden: 300 },
        { empresa: 'Globofast', nombre: 'ARENA SECUNDARIA', cantidad: 632.63, unidad: 'm³', reponer: false, reorden: 300 },
        { empresa: 'Globofast', nombre: 'CONFITILLO', cantidad: 50, unidad: 'm³', reponer: false, reorden: 0 },
      ],
      'Globofast'
    );
    expect(svg).toContain('Stock de agregados');
    expect(svg).toContain('291.65 m³');
    expect(svg).toContain('300 m³');
    expect(svg).toContain('>49%<'); // 291.65 / 600
    expect(svg).toContain('>Reponer<');
    expect(svg).toContain('>100%<'); // 632.63 / 600, topado
    expect(svg).toContain('>Saludable<');
    expect(svg).toContain('>Sin umbral<'); // sin mínimo no se inventa un %
    expect(svg).toContain('>—<');
  });

  it('el semáforo sigue el punto de reposición', () => {
    expect(estadoPorReorden(300, 300)).toBe('low');
    expect(estadoPorReorden(301, 300)).toBe('medium');
    expect(estadoPorReorden(450, 300)).toBe('medium');
    expect(estadoPorReorden(451, 300)).toBe('healthy');
    expect(estadoPorReorden(999, 0)).toBe('unknown');
  });
});
