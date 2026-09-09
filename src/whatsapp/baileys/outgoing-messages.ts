/**
 * Memoria corta de los mensajes que ENVIAMOS, para poder reenviarlos cuando el
 * destinatario no pudo descifrarlos.
 *
 * POR QUÉ EXISTE (09/09/2026). Choferes de globofas reportaron que los vales y
 * las ubicaciones les aparecían como «Esperando este mensaje. Puede tardar un
 * poco» o directamente como eliminados. Eso NO es un fallo de envío: del lado
 * nuestro salió `200` y sin un solo error. Es que el teléfono del chofer no pudo
 * DESCIFRARLO —pasa con multi-dispositivo, reinstalaciones o sesiones
 * desincronizadas— y WhatsApp lo resuelve solo: el receptor manda un *retry
 * receipt* («no pude, mandámelo de nuevo») y el emisor lo vuelve a cifrar.
 *
 * Ese reenvío automático NO funcionaba: `makeWASocket` no recibía `getMessage`,
 * que es el callback con el que Baileys recupera el mensaje original para
 * re-cifrarlo. Sin él, el pedido de reenvío se cae al vacío y el chofer se queda
 * con el placeholder PARA SIEMPRE.
 *
 * ACOTADA A PROPÓSITO. Los retry receipts llegan en segundos o minutos, no en
 * horas: guardar más tiempo solo gasta RAM en una máquina de 8 GB compartida con
 * producción. Por eso TTL corto y tope duro de entradas, con desalojo del más
 * viejo.
 *
 * SIN IMPORTS. Este módulo no importa nada: `sessions.simple` arrastra `config`,
 * que usa `import.meta` y no parsea bajo CommonJS — un test que lo importara
 * reventaría al cargarse (pitfall §13).
 */

export interface OutgoingEntry {
  sessionId: string;
  /** Contenido del mensaje tal como lo devolvió Baileys al enviarlo. */
  message: unknown;
  at: number;
}

/** Los retry receipts llegan enseguida; más de una hora no sirve para nada. */
export const OUTGOING_TTL_MS = 60 * 60 * 1000;

/** Tope duro de mensajes recordados. Un vale con miniatura pesa decenas de KB. */
export const OUTGOING_MAX = 300;

const store = new Map<string, OutgoingEntry>();

/** Solo para tests. */
export const _resetOutgoing = (): void => void store.clear();

export const outgoingSize = (): number => store.size;

/**
 * Descarta lo vencido y, si aún sobra, lo más viejo. `Map` conserva el orden de
 * inserción, así que el primero es el más antiguo.
 */
export const pruneOutgoing = (now = Date.now()): void => {
  for (const [id, entry] of Array.from(store.entries())) {
    if (now - entry.at > OUTGOING_TTL_MS) store.delete(id);
  }
  while (store.size > OUTGOING_MAX) {
    const masViejo = store.keys().next();
    if (masViejo.done) break;
    store.delete(masViejo.value);
  }
};

/**
 * Recuerda un mensaje enviado. NUNCA lanza: se llama desde el camino de envío y
 * un fallo acá jamás puede tumbar un despacho.
 */
export const recordOutgoingMessage = (
  sessionId: string,
  messageId: string | null | undefined,
  message: unknown,
  now = Date.now()
): void => {
  try {
    const id = String(messageId || '').trim();
    if (!id || !sessionId || !message) return;
    // Re-insertar mueve la entrada al final: un mensaje reenviado no se vuelve
    // el más viejo de la cola.
    store.delete(id);
    store.set(id, { sessionId, message, at: now });
    pruneOutgoing(now);
  } catch {
    // Un fallo del recordatorio no puede afectar al envío que ya salió bien.
  }
};

/**
 * El mensaje que pide un retry receipt, o `undefined` si ya no lo tenemos.
 *
 * Se exige que la sesión coincida: un id de otra sesión no debe devolver
 * contenido, aunque los ids de WhatsApp sean prácticamente únicos.
 */
export const findOutgoingMessage = (
  sessionId: string,
  messageId: string | null | undefined,
  now = Date.now()
): unknown | undefined => {
  try {
    const id = String(messageId || '').trim();
    if (!id) return undefined;
    const entry = store.get(id);
    if (!entry) return undefined;
    if (entry.sessionId !== sessionId) return undefined;
    if (now - entry.at > OUTGOING_TTL_MS) {
      store.delete(id);
      return undefined;
    }
    return entry.message;
  } catch {
    return undefined;
  }
};
