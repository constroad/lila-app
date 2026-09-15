import { atencionPendiente, metricasDelDia, tiempoDeRespuesta, type ConversacionParaInicio, type MensajeParaInicio } from './inicio';
import { leadDeConversacion, tituloDeLead } from './leads';

/**
 * LOS AGREGADOS DEL INICIO son funciones puras sobre listas: hoy contra ayer
 * por día peruano, quién pide atención, y la mediana de lo que tarda el bot.
 */
const lima = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-05:00`);
const conv = (id: string, extra: Partial<ConversacionParaInicio> = {}): ConversacionParaInicio => ({
  id,
  customerPhone: `5190000000${id}`,
  status: 'bot',
  lastMessageAt: lima('2026-09-15', '10:00'),
  lastCustomerMessageAt: lima('2026-09-15', '09:59'),
  createdAt: lima('2026-09-15', '09:00'),
  ...extra,
});

describe('métricas del día', () => {
  it('cuenta conversaciones y leads por día peruano, y las que quedaron sin respuesta', () => {
    const lista = [
      conv('1', { lead: { servicio: 'colocacion' } }),
      conv('2', { lastCustomerMessageAt: lima('2026-09-14', '18:00'), lastMessageAt: lima('2026-09-14', '18:01'), createdAt: lima('2026-09-14', '17:00'), lead: {} }),
      conv('3', { lastCustomerMessageAt: lima('2026-09-15', '11:00'), lastMessageAt: lima('2026-09-15', '10:30') }), // el cliente habló después del bot
      conv('4', { status: 'human', lastCustomerMessageAt: lima('2026-09-15', '11:00'), lastMessageAt: lima('2026-09-15', '10:30') }), // la atiende una persona: no cuenta
    ];
    const m = metricasDelDia(lista, [], '2026-09-15', '2026-09-14');
    expect(m).toEqual({ conversacionesHoy: 3, conversacionesAyer: 1, leadsNuevosHoy: 1, leadsNuevosAyer: 1, sinResponder: 1, tiempoRespuestaS: null });
  });

  it('el tiempo de respuesta es la mediana del primer mensaje del bot tras cada mensaje del cliente', () => {
    const m = (conversationId: string, role: string, hora: string): MensajeParaInicio => ({ conversationId, role, createdAt: lima('2026-09-15', hora) });
    const mensajes = [m('a', 'customer', '10:00'), m('a', 'customer', '10:00'), m('a', 'bot', '10:00'), m('b', 'customer', '11:00'), m('b', 'bot', '11:01'), m('c', 'bot', '12:00')];
    // a: 0 s (mismo minuto); b: 60 s; c sin cliente antes: no cuenta → mediana de [0, 60] = 60
    expect(tiempoDeRespuesta(mensajes)).toBe(60);
    expect(tiempoDeRespuesta([])).toBeNull();
  });

  it('piden atención las escaladas, la más reciente primero, con «Tomar»', () => {
    const ahora = lima('2026-09-15', '12:00').getTime();
    const lista = [
      conv('1', { status: 'human', escalatedAt: lima('2026-09-15', '11:20'), customerName: 'Luis Paredes' }),
      conv('2', { status: 'human', escalatedAt: lima('2026-09-15', '11:48') }),
      conv('3', { status: 'human' }), // la tomó el dueño, no escaló: no pide nada
    ];
    expect(atencionPendiente(lista, ahora, (id) => (id === '1' ? '¿y me pueden incluir la señalización?' : undefined))).toEqual([
      { conversationId: '2', nombre: '+51900000002', telefono: '51900000002', empresa: undefined, motivo: 'pidio-persona', texto: 'Pidió hablar con una persona', haceMin: 12, accion: 'tomar', ultimoMensaje: undefined, chips: [] },
      { conversationId: '1', nombre: 'Luis Paredes', telefono: '51900000001', empresa: undefined, motivo: 'pidio-persona', texto: 'Pidió hablar con una persona', haceMin: 40, accion: 'tomar', ultimoMensaje: '¿y me pueden incluir la señalización?', chips: [] },
    ]);
  });
});

describe('el lead que ve el dueño', () => {
  it('se arma con lo que el motor guardó y el estado de trabajo, con título «servicio cantidad · distrito»', () => {
    const c = {
      id: 'c1',
      customerName: 'Luis',
      customerPhone: '51999111222',
      createdAt: lima('2026-09-15', '10:42'),
      lastMessageAt: lima('2026-09-15', '10:50'),
      lead: { servicio: 'colocacion', respuestas: { nombre: 'Luis Paredes', area: '600 m²', distrito: 'Lurín', espesor: '2 pulgadas' }, listo: true, empresa: 'Transportes Paredes' },
    };
    const l = leadDeConversacion(c, lima('2026-09-15', '11:00').getTime(), { estado: 'contactado' });
    expect(l).toMatchObject({ id: 'c1', titulo: 'Asfaltado 600 m² · Lurín', nombre: 'Luis Paredes', empresa: 'Transportes Paredes', telefono: '51999111222', estado: 'contactado', confirmado: true });
    expect(l.campos).toEqual(expect.arrayContaining([['Espesor', '2 pulgadas']]));
    expect(leadDeConversacion({ ...c, lead: {} }, 0).estado).toBe('nuevo');
    expect(tituloDeLead({ servicio: 'Transporte', distrito: 'Ate' })).toBe('Transporte · Ate');
  });
});
