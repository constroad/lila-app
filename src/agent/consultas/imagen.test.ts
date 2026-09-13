import { svgResumenDespachos } from './imagen';
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
