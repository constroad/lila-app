import type { BloqueSistema, EspecificacionHerramienta, LlamadaHerramienta, ProveedorLlm, TurnoChat, UsoTokens } from './llm.types.js';
import { ejecutarHerramienta, type ContextoHerramientas } from './herramientas.js';

/**
 * EL TURNO DEL AGENTE (spec §2.3): el modelo habla o pide herramientas; se
 * ejecutan; vuelve a hablar. Tope de vueltas, tope de tiempo, y si el modelo
 * se queda mudo o repite lo último, una salida digna en vez de un loop.
 *
 * Es puro respecto del proveedor y de las herramientas: llegan por parámetro,
 * y así se prueba sin red.
 */

export const MAX_VUELTAS_HERRAMIENTAS = 5;
const MAX_TOKENS_RESPUESTA = 400;
const TIMEOUT_LLM_MS = 30_000;

export const RESPUESTA_FALLBACK = 'Dame un momento, un asesor te responde por aquí.';

export interface ResultadoTurno {
  texto: string;
  uso: UsoTokens;
  herramientasUsadas: string[];
  /** El modelo no pudo contestar (error, tope, mudo): se mandó el fallback y conviene escalar. */
  degradado: boolean;
}

const sumar = (a: UsoTokens, b: UsoTokens): UsoTokens => ({
  entrada: a.entrada + b.entrada,
  salida: a.salida + b.salida,
  cacheLeida: (a.cacheLeida ?? 0) + (b.cacheLeida ?? 0),
  cacheEscrita: (a.cacheEscrita ?? 0) + (b.cacheEscrita ?? 0),
});

export const correrTurno = async (params: {
  proveedor: ProveedorLlm;
  sistema: BloqueSistema[];
  historial: TurnoChat[];
  herramientas: EspecificacionHerramienta[];
  contexto: ContextoHerramientas;
  /** Último texto que mandó el bot: no se repite dos veces seguidas (spec §10). */
  ultimaRespuestaBot?: string;
}): Promise<ResultadoTurno> => {
  const turnos: TurnoChat[] = [...params.historial];
  let uso: UsoTokens = { entrada: 0, salida: 0 };
  const usadas: string[] = [];
  for (let vuelta = 0; vuelta <= MAX_VUELTAS_HERRAMIENTAS; vuelta++) {
    let respuesta;
    try {
      respuesta = await params.proveedor.chat({ sistema: params.sistema, turnos, herramientas: params.herramientas, maxTokens: MAX_TOKENS_RESPUESTA, timeoutMs: TIMEOUT_LLM_MS });
    } catch {
      return { texto: RESPUESTA_FALLBACK, uso, herramientasUsadas: usadas, degradado: true };
    }
    uso = sumar(uso, respuesta.uso);
    if (respuesta.motivo === 'herramientas' && respuesta.llamadas?.length) {
      if (vuelta === MAX_VUELTAS_HERRAMIENTAS) break;
      const llamadas: LlamadaHerramienta[] = respuesta.llamadas;
      turnos.push({ rol: 'asistente', texto: respuesta.texto, llamadas });
      const resultados = [];
      for (const llamada of llamadas) {
        usadas.push(llamada.nombre);
        resultados.push(await ejecutarHerramienta(llamada, params.contexto));
      }
      turnos.push({ rol: 'resultado', resultados });
      continue;
    }
    const texto = String(respuesta.texto || '').trim();
    if (!texto) break;
    if (params.ultimaRespuestaBot && texto === params.ultimaRespuestaBot.trim()) break;
    return { texto, uso, herramientasUsadas: usadas, degradado: false };
  }
  return { texto: RESPUESTA_FALLBACK, uso, herramientasUsadas: usadas, degradado: true };
};

/** El historial guardado, en turnos para el modelo: cliente → usuario; bot y dueño → asistente. */
export const historialATurnos = (mensajes: Array<{ role: string; text?: string }>, ultimos = 16): TurnoChat[] => {
  const turnos: TurnoChat[] = [];
  for (const m of mensajes.slice(-ultimos)) {
    const texto = String(m.text || '').trim();
    if (!texto) continue;
    const rol = m.role === 'customer' ? 'usuario' : 'asistente';
    const anterior = turnos[turnos.length - 1];
    // Dos mensajes seguidos del mismo lado se juntan: el proveedor exige alternancia.
    if (anterior && anterior.rol === rol) {
      if (anterior.rol === 'usuario') anterior.texto = `${anterior.texto}\n${texto}`;
      else if (anterior.rol === 'asistente') anterior.texto = `${anterior.texto ?? ''}\n${texto}`.trim();
      continue;
    }
    turnos.push(rol === 'usuario' ? { rol, texto } : { rol, texto });
  }
  // La conversación tiene que empezar por el cliente y terminar en el cliente.
  while (turnos.length && turnos[0].rol !== 'usuario') turnos.shift();
  while (turnos.length && turnos[turnos.length - 1].rol !== 'usuario') turnos.pop();
  return turnos;
};
