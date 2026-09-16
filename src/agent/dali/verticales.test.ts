import { GUION_ASFALTO } from '../ventas/guion.asfalto';
import { aplicarVertical, MODO_LEGIBLE, resumenDePack, verticalesDe, VerticalSinPack } from './verticales';

/**
 * LOS PACKS POR RUBRO (S3): hoy solo asfalto tiene pack (v1, en el código);
 * los demás rubros se listan como «próximamente» con el modo del motor que
 * les tocará. Aplicar un pack es volver al guion de fábrica, y solo asfalto
 * lo tiene.
 */
describe('verticalesDe', () => {
  it('lista los cinco rubros del registro, el de asfalto con su pack y sus empresas, los otros sin pack', () => {
    const verticales = verticalesDe(new Map([['asphalt', [{ companyId: 'constroad', nombre: 'CONSTROAD' }]]]));
    expect(verticales.map((v) => `${v.id}:${v.version ?? '-'}:${v.modo}`)).toEqual(['asphalt:v1:lead', 'restaurant:-:pedido', 'grifo:-:info', 'lubricentro:-:cita', 'otro:-:info']);
    const asfalto = verticales[0];
    expect(asfalto).toMatchObject({ disponible: true, modoLegible: MODO_LEGIBLE.lead, plantilla: 'Excel v1', empresas: [{ companyId: 'constroad', nombre: 'CONSTROAD' }] });
    expect(asfalto.servicios).toBe(GUION_ASFALTO.servicios.length);
    expect(asfalto.preguntas).toBeGreaterThan(10);
    expect(verticales[1]).toMatchObject({ disponible: false, servicios: 0, preguntas: 0, plantilla: null, empresas: [] });
  });

  it('el resumen del pack cuenta servicios, preguntas por servicio y las de cierre', () => {
    const r = resumenDePack({ servicios: [{ ...GUION_ASFALTO.servicios[1] }, { ...GUION_ASFALTO.servicios[2] }], cierre: GUION_ASFALTO.cierre });
    expect(r.servicios).toBe(2);
    expect(r.preguntas).toBe(GUION_ASFALTO.servicios[1].preguntas.length + GUION_ASFALTO.servicios[2].preguntas.length);
    expect(r.cierre).toBe(GUION_ASFALTO.cierre.length);
  });
});

describe('aplicarVertical', () => {
  it('rechaza los rubros que todavía no tienen pack', async () => {
    await expect(aplicarVertical('restaurant', 'polleria', 'José')).rejects.toThrow(VerticalSinPack);
  });
});
