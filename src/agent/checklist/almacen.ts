import type { MensajeGrupo } from './mensajes.js';

/**
 * Lo que se dijo en el grupo, para poder saber qué NO se dijo.
 *
 * El agente detecta la ausencia de un hecho, y para eso necesita recordar lo que
 * pasó por el grupo durante el día. WhatsApp no lo guarda para nosotros: el
 * store de Baileys no persiste mensajes (`store.manager.ts`: «`messages` se
 * mantiene por compatibilidad de tipo pero NO se llena ni persiste»).
 *
 * EN MEMORIA Y ACOTADO. La mini son 8 GB compartidos con producción, y la
 * ventana útil es de horas: un mensaje de anteayer no confirma la producción de
 * mañana. Si lila se reinicia se pierde lo observado y el agente vuelve a
 * preguntar — que es el lado seguro del error.
 *
 * SIN IMPORTS PESADOS: se prueba bajo el runner CJS (pitfall §13).
 */

/** Ventana de observación. Más allá, un mensaje ya no dice nada del día que viene. */
export const VENTANA_MS = 36 * 60 * 60 * 1000;

/** Tope duro de mensajes recordados por grupo. */
export const MAX_MENSAJES = 500;

const porGrupo = new Map<string, MensajeGrupo[]>();

/** Solo para tests. */
export const _resetAlmacen = (): void => void porGrupo.clear();

export const observados = (grupo: string): number => porGrupo.get(grupo)?.length ?? 0;

/**
 * Guarda un mensaje del grupo. NUNCA lanza: se llama desde el camino de recepción
 * de WhatsApp y un fallo acá no puede afectar a nada más.
 */
export const recordarMensaje = (grupo: string, mensaje: MensajeGrupo): void => {
  try {
    const jid = String(grupo || '').trim();
    if (!jid) return;

    const lista = porGrupo.get(jid) ?? [];
    lista.push(mensaje);

    const desde = mensaje.ts - VENTANA_MS;
    const vigentes = lista.filter((m) => m.ts >= desde);
    porGrupo.set(jid, vigentes.slice(-MAX_MENSAJES));
  } catch {
    // Observar es best-effort: nunca puede romper la recepción de mensajes.
  }
};

/**
 * Los mensajes del grupo dentro de una ventana. El detector pide desde cuándo
 * mirar —típicamente desde que se creó el pedido—, porque un «cuadrilla lista»
 * de ayer no confirma la producción de mañana.
 */
export const mensajesDesde = (grupo: string, desdeMs: number): MensajeGrupo[] =>
  (porGrupo.get(String(grupo || '').trim()) ?? []).filter((m) => m.ts >= desdeMs);
