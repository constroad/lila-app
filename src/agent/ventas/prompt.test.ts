import { CONSTROAD, bloqueContexto, bloquesSistema, promptAsfalto } from './prompt.asfalto';
import { HERRAMIENTAS_VENTAS } from './herramientas';

describe('prompt del vertical asfalto', () => {
  const p = promptAsfalto(CONSTROAD);
  it('fija lo que no se negocia: sin precios, sin fechas, salida a humano, mensajes cortos, admite ser asistente', () => {
    expect(p).toContain('NUNCA des precios');
    expect(p).toContain('NUNCA prometas fechas');
    expect(p).toContain('escalar_a_humano');
    expect(p).toContain('máximo 3 líneas');
    expect(p).toContain('asistente virtual');
    expect(p).toContain('guardar_lead');
    expect(p).toContain(CONSTROAD.horario);
    expect(p).not.toMatch(/\b(decime|respondé|podés)\b/);
  });

  it('el contexto distingue cliente conocido de lead nuevo y dice la hora', () => {
    const conocido = bloqueContexto({ ahoraTexto: 'lunes 14/09 10:30', enHorario: true, telefono: '51972224301', cliente: { nombre: 'JUAN CARLOS', empresa: 'CONSORCIO LOS PINOS', ultimosPedidos: ['2026-09-09 AV. UNIVERSITARIA 120 m³'] } });
    expect(conocido).toContain('Es cliente de la casa: JUAN CARLOS (CONSORCIO LOS PINOS)');
    expect(conocido).toContain('2026-09-09 AV. UNIVERSITARIA 120 m³');
    expect(conocido).toContain('en horario de atención');
    const nuevo = bloqueContexto({ ahoraTexto: 'sábado 19/09 20:00', enHorario: false, telefono: '51999888777', cliente: null, lead: { servicio: 'venta' } });
    expect(nuevo).toContain('No figura como cliente');
    expect(nuevo).toContain('FUERA del horario');
    expect(nuevo).toContain('{"servicio":"venta"}');
  });

  it('solo el bloque de persona se cachea', () => {
    const bloques = bloquesSistema(CONSTROAD, { ahoraTexto: 'x', enHorario: true, telefono: '1', cliente: null });
    expect(bloques.map((b) => Boolean(b.cacheable))).toEqual([true, false]);
  });

  it('las herramientas que nombra el prompt existen', () => {
    const nombres = HERRAMIENTAS_VENTAS.map((h) => h.nombre);
    for (const n of ['guardar_lead', 'escalar_a_humano']) expect(nombres).toContain(n);
  });
});
