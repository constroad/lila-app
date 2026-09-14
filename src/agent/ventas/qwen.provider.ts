import { generar } from '../llm/modelo.js';
import type { BloqueSistema, ProveedorLlm, RespuestaLlm, TurnoChat } from './llm.types.js';

/**
 * QWEN LOCAL como proveedor del agente de ventas. José, 14/09: «hagámoslo con
 * Qwen, que ya lo tenemos instalado». Es el mismo modelo en memoria que usa
 * el agente de operaciones (`llm/modelo.ts`, infraestructura compartida como
 * la base de datos; la lógica de cada agente es aparte).
 *
 * Un modelo de 1,5 B no sigue el protocolo de herramientas de los grandes,
 * así que acá el turno es UNA salida en JSON con forma forzada por gramática:
 * lo que dice, lo que aprendió del lead y si escala. El runtime la traduce a
 * texto + llamadas a herramientas. Una llamada por turno, sin vueltas.
 */

export const ESQUEMA_TURNO_VENTAS = {
  type: 'object',
  properties: {
    respuesta: { type: 'string' },
    lead: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        empresa: { type: 'string' },
        servicio: { enum: ['', 'venta', 'colocacion', 'transporte', 'fabricacion', 'otro'] },
        detalle: { type: 'string' },
        cantidad: { type: 'string' },
        distrito: { type: 'string' },
        fecha: { type: 'string' },
        listo: { type: 'boolean' },
      },
    },
    escalar: { type: 'boolean' },
    motivo_escalada: { type: 'string' },
  },
} as const;

export const INSTRUCCIONES_JSON = [
  '# Formato de salida (obligatorio)',
  'Respondes SOLO con un JSON: {"respuesta": "lo que le dices al cliente (máximo 3 líneas, una o dos preguntas)", "lead": {datos del cliente y su necesidad que sepas hasta ahora; "" en lo que no sabes; "listo": true solo cuando el cliente confirmó el resumen}, "escalar": true solo si hay que pasar a un asesor, "motivo_escalada": "" o el motivo}.',
  'Ejemplo 1 — cliente: «hola, quiero asfaltar mi patio» → {"respuesta":"¡Hola! Con gusto. ¿De cuántos m² es el patio y en qué distrito está?","lead":{"nombre":"","empresa":"","servicio":"colocacion","detalle":"asfaltado de patio","cantidad":"","distrito":"","fecha":"","listo":false},"escalar":false,"motivo_escalada":""}',
  'Ejemplo 2 — cliente: «son 600 m2 en Lurín, la base ya está compactada» → {"respuesta":"Perfecto: 600 m² en Lurín con base lista. ¿Para cuándo lo necesitas y a nombre de quién va la cotización?","lead":{"nombre":"","empresa":"","servicio":"colocacion","detalle":"asfaltado de patio, base compactada","cantidad":"600 m2","distrito":"Lurín","fecha":"","listo":false},"escalar":false,"motivo_escalada":""}',
  'Ejemplo 3 — cliente: «cuánto cuesta el m3?» → {"respuesta":"El precio depende de la cantidad y la ubicación; con esos datos el asesor te cotiza hoy mismo. ¿Cuántos m³ necesitas y a qué distrito?","lead":{...lo que ya sabías...},"escalar":false,"motivo_escalada":""}',
  'Ejemplo 4 — cliente: «quiero hablar con una persona» → {"respuesta":"Claro, un asesor te escribe por aquí en el horario de atención.","lead":{...},"escalar":true,"motivo_escalada":"pide hablar con una persona"}',
].join('\n');

const MAX_TRANSCRIPCION = 14;

/** La conversación como texto: la sesión del modelo se reinicia en cada turno. */
export const transcripcion = (turnos: TurnoChat[]): string => {
  const lineas: string[] = [];
  for (const t of turnos.slice(-MAX_TRANSCRIPCION)) {
    if (t.rol === 'usuario') lineas.push(`Cliente: ${t.texto.slice(0, 600)}`);
    else if (t.rol === 'asistente' && t.texto) lineas.push(`Tú: ${t.texto.slice(0, 600)}`);
  }
  return lineas.join('\n');
};

interface SalidaTurno {
  respuesta?: string;
  lead?: Record<string, unknown>;
  escalar?: boolean;
  motivo_escalada?: string;
}

/** Del JSON del modelo a la respuesta genérica: texto + llamadas en un solo turno. */
export const interpretarTurnoVentas = (json: string): RespuestaLlm => {
  let salida: SalidaTurno = {};
  try {
    salida = JSON.parse(json) as SalidaTurno;
  } catch {
    return { uso: { entrada: 0, salida: 0 }, motivo: 'fin' };
  }
  const llamadas = [];
  const lead = Object.fromEntries(Object.entries(salida.lead ?? {}).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== false));
  if (Object.keys(lead).length) llamadas.push({ id: 'lead', nombre: 'guardar_lead', argumentos: lead });
  if (salida.escalar === true) llamadas.push({ id: 'escalar', nombre: 'escalar_a_humano', argumentos: { motivo: String(salida.motivo_escalada || 'el modelo decidió escalar') } });
  const texto = String(salida.respuesta || '').trim();
  return { texto: texto || undefined, llamadas: llamadas.length ? llamadas : undefined, uso: { entrada: 0, salida: 0 }, motivo: 'fin' };
};

export const crearProveedorQwen = (): ProveedorLlm => ({
  nombre: 'qwen-local',
  async chat({ sistema, turnos, maxTokens, timeoutMs }): Promise<RespuestaLlm> {
    const persona = sistema.filter((b: BloqueSistema) => b.cacheable).map((b) => b.texto).join('\n\n');
    const contexto = sistema.filter((b: BloqueSistema) => !b.cacheable).map((b) => b.texto).join('\n\n');
    const json = await generar({
      tarea: 'ventas',
      sistema: `${persona}\n\n${INSTRUCCIONES_JSON}`,
      usuario: `${contexto}\n\nConversación:\n${transcripcion(turnos)}\n\nTu siguiente mensaje, en JSON:`,
      esquema: ESQUEMA_TURNO_VENTAS as unknown as Record<string, unknown>,
      maxTokens,
      timeoutMs,
      temperatura: 0.3,
    });
    if (!json) throw new Error('qwen no respondió');
    return interpretarTurnoVentas(json);
  },
});
