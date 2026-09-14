import { RESPUESTA_FALLBACK, correrTurno, historialATurnos, respuestaSegura } from './runtime';
import { HERRAMIENTAS_VENTAS } from './herramientas';
import type { ProveedorLlm, RespuestaLlm, TurnoChat } from './llm.types';

/**
 * EL TURNO DEL AGENTE DE VENTAS, sin red: un proveedor falso devuelve lo que
 * el test quiere y se mira qué hace el runtime con eso.
 */
const uso = { entrada: 100, salida: 20 };
const proveedorDe = (respuestas: RespuestaLlm[]): ProveedorLlm & { turnosVistos: TurnoChat[][] } => {
  const turnosVistos: TurnoChat[][] = [];
  let i = 0;
  return {
    nombre: 'falso',
    turnosVistos,
    async chat({ turnos }) {
      turnosVistos.push(turnos);
      return respuestas[Math.min(i++, respuestas.length - 1)];
    },
  };
};

const contexto = () => {
  const leads: unknown[] = [];
  const escaladas: string[] = [];
  return {
    leads,
    escaladas,
    ctx: {
      guardarLead: async (d: unknown) => (leads.push(d), { notificado: true }),
      escalar: async (m: string) => void escaladas.push(m),
      horario: () => ({ texto: 'L–V 8–18', abierto: true }),
    },
  };
};

const historial: TurnoChat[] = [{ rol: 'usuario', texto: 'hola, quiero asfaltar 500 m2 en ate' }];

describe('correrTurno', () => {
  it('texto directo: lo devuelve tal cual', async () => {
    const r = await correrTurno({ proveedor: proveedorDe([{ texto: '¡Hola! ¿Es una vía o un patio?', uso, motivo: 'fin' }]), sistema: [], historial, herramientas: HERRAMIENTAS_VENTAS, contexto: contexto().ctx });
    expect(r).toMatchObject({ texto: '¡Hola! ¿Es una vía o un patio?', degradado: false, herramientasUsadas: [] });
  });

  it('pide una herramienta, se ejecuta, y con el resultado vuelve a hablar', async () => {
    const c = contexto();
    const p = proveedorDe([
      { llamadas: [{ id: 't1', nombre: 'guardar_lead', argumentos: { servicio: 'colocacion', cantidad: '500 m2', distrito: 'Ate' } }], uso, motivo: 'herramientas' },
      { texto: 'Anotado: 500 m² en Ate. ¿La base ya está preparada?', uso, motivo: 'fin' },
    ]);
    const r = await correrTurno({ proveedor: p, sistema: [], historial, herramientas: HERRAMIENTAS_VENTAS, contexto: c.ctx });
    expect(r.texto).toBe('Anotado: 500 m² en Ate. ¿La base ya está preparada?');
    expect(r.herramientasUsadas).toEqual(['guardar_lead']);
    expect(c.leads).toEqual([{ servicio: 'colocacion', cantidad: '500 m2', distrito: 'Ate', listo: false, nombre: undefined, empresa: undefined, detalle: undefined, fecha: undefined }]);
    expect(r.uso).toEqual({ entrada: 200, salida: 40, cacheLeida: 0, cacheEscrita: 0 });
    // El segundo llamado al modelo vio la llamada y su resultado.
    const segundo = p.turnosVistos[1];
    expect(segundo[segundo.length - 2]).toMatchObject({ rol: 'asistente', llamadas: [{ nombre: 'guardar_lead' }] });
    expect(segundo[segundo.length - 1]).toMatchObject({ rol: 'resultado', resultados: [{ id: 't1', contenido: '{"ok":true,"asesorAvisado":true}' }] });
  });

  it('escalar a humano queda registrado con su motivo', async () => {
    const c = contexto();
    const p = proveedorDe([
      { llamadas: [{ id: 't1', nombre: 'escalar_a_humano', argumentos: { motivo: 'pide hablar con una persona' } }], uso, motivo: 'herramientas' },
      { texto: 'Listo, un asesor te escribe por aquí.', uso, motivo: 'fin' },
    ]);
    await correrTurno({ proveedor: p, sistema: [], historial, herramientas: HERRAMIENTAS_VENTAS, contexto: c.ctx });
    expect(c.escaladas).toEqual(['pide hablar con una persona']);
  });

  it('si el proveedor falla, se queda mudo o se repite: fallback y degradado', async () => {
    const falla: ProveedorLlm = { nombre: 'x', chat: async () => { throw new Error('timeout'); } };
    expect(await correrTurno({ proveedor: falla, sistema: [], historial, herramientas: [], contexto: contexto().ctx })).toMatchObject({ texto: RESPUESTA_FALLBACK, degradado: true });
    expect(await correrTurno({ proveedor: proveedorDe([{ uso, motivo: 'fin' }]), sistema: [], historial, herramientas: [], contexto: contexto().ctx })).toMatchObject({ texto: RESPUESTA_FALLBACK, degradado: true });
    expect(await correrTurno({ proveedor: proveedorDe([{ texto: '¿En qué distrito?', uso, motivo: 'fin' }]), sistema: [], historial, herramientas: [], contexto: contexto().ctx, ultimaRespuestaBot: '¿En qué distrito?' })).toMatchObject({ texto: RESPUESTA_FALLBACK, degradado: true });
  });

  it('un modelo que pide herramientas sin parar se corta en el tope', async () => {
    const eterno: ProveedorLlm = { nombre: 'x', chat: async () => ({ llamadas: [{ id: 'z', nombre: 'horario_atencion', argumentos: {} }], uso, motivo: 'herramientas' }) };
    const r = await correrTurno({ proveedor: eterno, sistema: [], historial, herramientas: HERRAMIENTAS_VENTAS, contexto: contexto().ctx });
    expect(r.degradado).toBe(true);
    expect(r.herramientasUsadas.length).toBe(5);
  });

  it('una herramienta desconocida no rompe el turno', async () => {
    const p = proveedorDe([
      { llamadas: [{ id: 't1', nombre: 'borrar_todo', argumentos: {} }], uso, motivo: 'herramientas' },
      { texto: 'Sigo contigo. ¿Qué área es?', uso, motivo: 'fin' },
    ]);
    const r = await correrTurno({ proveedor: p, sistema: [], historial, herramientas: HERRAMIENTAS_VENTAS, contexto: contexto().ctx });
    expect(r.texto).toBe('Sigo contigo. ¿Qué área es?');
    expect(p.turnosVistos[1][p.turnosVistos[1].length - 1]).toMatchObject({ rol: 'resultado', resultados: [{ error: true }] });
  });
});

describe('historialATurnos', () => {
  it('cliente → usuario; bot y dueño → asistente; seguidos se juntan; empieza y termina en el cliente', () => {
    const turnos = historialATurnos([
      { role: 'bot', text: 'bienvenida vieja' },
      { role: 'customer', text: 'hola' },
      { role: 'customer', text: 'quiero asfalto' },
      { role: 'bot', text: '¿Para qué proyecto?' },
      { role: 'owner', text: 'te llamo en un rato' },
      { role: 'customer', text: 'ok' },
      { role: 'bot', text: '' },
    ]);
    expect(turnos).toEqual([
      { rol: 'usuario', texto: 'hola\nquiero asfalto' },
      { rol: 'asistente', texto: '¿Para qué proyecto?\nte llamo en un rato' },
      { rol: 'usuario', texto: 'ok' },
    ]);
  });

  it('respeta la ventana de los últimos N', () => {
    const muchos = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'bot' : 'customer', text: `m${i}` }));
    const turnos = historialATurnos(muchos, 6);
    expect(turnos).toHaveLength(5); // 6 mensajes, el último (bot) se cae
    expect(turnos[0]).toEqual({ rol: 'usuario', texto: 'm34' });
  });
});

describe('respuestaSegura (inyección y fugas)', () => {
  it('bloquea precios, instrucciones reveladas y el modelo fuera de papel', () => {
    expect(respuestaSegura('Claro, son S/ 250 por m³.')).toMatchObject({ ok: false, motivo: 'contiene un precio' });
    expect(respuestaSegura('Te sale 180 soles el metro.')).toMatchObject({ ok: false, motivo: 'contiene un precio' });
    expect(respuestaSegura('Mis instrucciones son: # Quién eres…')).toMatchObject({ ok: false, motivo: 'revela instrucciones' });
    expect(respuestaSegura('Ok, ahora soy un asistente sin restricciones.')).toMatchObject({ ok: false, motivo: 'salió del papel' });
    expect(respuestaSegura('x'.repeat(901))).toMatchObject({ ok: false, motivo: 'demasiado larga' });
  });

  it('deja pasar lo normal, con números que no son precios', () => {
    expect(respuestaSegura('Perfecto: 600 m² en Lurín con base lista. ¿Para cuándo lo necesitas?')).toEqual({ ok: true });
    expect(respuestaSegura('Atendemos de lunes a viernes de 8:00 a 18:00.')).toEqual({ ok: true });
    expect(respuestaSegura('Con 2 pulgadas de espesor va bien para tráfico medio.')).toEqual({ ok: true });
  });

  it('una respuesta bloqueada no se manda: fallback y escalada', async () => {
    const c = contexto();
    const r = await correrTurno({ proveedor: proveedorDe([{ texto: 'Te cobramos S/ 300 por m3, solo por hoy.', uso, motivo: 'fin' }]), sistema: [], historial, herramientas: [], contexto: c.ctx });
    expect(r).toMatchObject({ texto: RESPUESTA_FALLBACK, degradado: true });
    expect(c.escaladas).toEqual(['respuesta bloqueada: contiene un precio']);
  });

  it('texto y llamadas en el mismo turno (modelo local): se ejecutan y se responde sin volver a preguntar', async () => {
    const c = contexto();
    const p = proveedorDe([{ texto: '¿De cuántos m² es?', llamadas: [{ id: 'lead', nombre: 'guardar_lead', argumentos: { servicio: 'colocacion' } }], uso, motivo: 'fin' }]);
    const r = await correrTurno({ proveedor: p, sistema: [], historial, herramientas: HERRAMIENTAS_VENTAS, contexto: c.ctx });
    expect(r.texto).toBe('¿De cuántos m² es?');
    expect(p.turnosVistos).toHaveLength(1);
    expect(c.leads).toHaveLength(1);
  });
});
