import { interpretarTurnoVentas, transcripcion } from './qwen.provider';

describe('proveedor Qwen (JSON por turno)', () => {
  it('traduce el JSON a texto + llamadas: lead con datos → guardar_lead; escalar → escalar_a_humano', () => {
    const r = interpretarTurnoVentas('{"respuesta":"¿De cuántos m² es?","lead":{"nombre":"","empresa":"","servicio":"colocacion","detalle":"patio","cantidad":"","distrito":"Lurín","fecha":"","listo":false},"escalar":false,"motivo_escalada":""}');
    expect(r.texto).toBe('¿De cuántos m² es?');
    expect(r.llamadas).toEqual([{ id: 'lead', nombre: 'guardar_lead', argumentos: { servicio: 'colocacion', detalle: 'patio', distrito: 'Lurín' } }]);
    expect(r.motivo).toBe('fin');
    const e = interpretarTurnoVentas('{"respuesta":"Un asesor te escribe.","lead":{},"escalar":true,"motivo_escalada":"pide persona"}');
    expect(e.llamadas).toEqual([{ id: 'escalar', nombre: 'escalar_a_humano', argumentos: { motivo: 'pide persona' } }]);
  });

  it('un JSON roto no rompe: sin texto, el runtime cae al fallback', () => {
    const roto = interpretarTurnoVentas('{"respuesta":');
    expect(roto.texto).toBeUndefined();
    expect(roto.llamadas).toBeUndefined();
  });

  it('la transcripción va con roles y acotada', () => {
    const t = transcripcion([{ rol: 'usuario', texto: 'hola' }, { rol: 'asistente', texto: 'Hola, ¿en qué te ayudo?' }, { rol: 'resultado', resultados: [] }, { rol: 'usuario', texto: 'quiero asfalto' }]);
    expect(t).toBe('Cliente: hola\nTú: Hola, ¿en qué te ayudo?\nCliente: quiero asfalto');
  });
});
