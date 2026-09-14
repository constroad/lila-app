import { generar } from '../llm/modelo.js';
import { ESQUEMA_EXTRACCION, PROMPT_EXTRACCION, type Extraccion } from './guiado.js';

/**
 * Qwen LEE el último mensaje del cliente y devuelve lo que entendió, con
 * gramática. Si el modelo no está o falla, devuelve `{}`: el flujo guiado
 * sigue solo (vuelve a preguntar lo que falta).
 */
const TIMEOUT_EXTRACCION_MS = 40_000;

export const extraerConQwen = async (mensaje: string, contexto: { ultimaPreguntaBot?: string; resumenEnviado?: boolean }): Promise<Extraccion> => {
  const usuario = [
    contexto.ultimaPreguntaBot ? `Lo último que le preguntó la asistente: «${contexto.ultimaPreguntaBot.slice(0, 200)}»` : '',
    contexto.resumenEnviado ? 'La asistente acaba de enviarle un resumen y espera que confirme.' : '',
    `Último mensaje del cliente: «${mensaje.slice(0, 600)}»`,
    'JSON:',
  ]
    .filter(Boolean)
    .join('\n');
  const json = await generar({ tarea: 'ventas-extraccion', sistema: PROMPT_EXTRACCION, usuario, esquema: ESQUEMA_EXTRACCION as unknown as Record<string, unknown>, maxTokens: 220, timeoutMs: TIMEOUT_EXTRACCION_MS });
  if (!json) return {};
  try {
    const v = JSON.parse(json) as Record<string, unknown>;
    const s = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
    const b = (k: string) => v[k] === true;
    return {
      servicio: (['venta', 'colocacion', 'transporte', 'fabricacion', 'otro'] as const).find((x) => x === v.servicio),
      detalle: s('detalle'),
      cantidad: s('cantidad'),
      distrito: s('distrito'),
      base: v.base === 'nueva' || v.base === 'pavimento' ? v.base : '',
      fecha: s('fecha'),
      nombre: s('nombre'),
      empresa: s('empresa'),
      quierePersona: b('quierePersona'),
      preguntaPrecio: b('preguntaPrecio'),
      confirma: b('confirma'),
      fueraDeTema: b('fueraDeTema'),
      saludoSolo: b('saludoSolo'),
    };
  } catch {
    return {};
  }
};
