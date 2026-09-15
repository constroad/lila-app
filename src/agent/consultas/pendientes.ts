/**
 * Preguntas que el agente le hizo a una persona y esperan respuesta. Motor puro.
 *
 * «¿Cuál de los dos pedidos?» → la persona contesta «1» o «2» en el mismo grupo.
 * Es estado de conversación, por persona y por grupo, con diez minutos de vida:
 * un «2» suelto media hora después no es una respuesta a nada.
 *
 * Vive en memoria a propósito: si un deploy lo borra, la persona vuelve a
 * preguntar y listo. Persistir una pregunta de diez minutos sería exagerar.
 */

export interface PreguntaPendiente<T = unknown> {
  quien: string;
  grupo: string;
  /** Opciones numeradas («¿cuál pedido?»), o vacío si lo que falta es una unidad. */
  opciones: string[];
  /**
   * `unidad`: se contesta con un número, una placa o «la última». `confirmar`:
   * con un «sí». `texto`: con cualquier cosa corta (un nombre de cliente, de
   * proveedor o de material que faltó en la pregunta).
   */
  tipo?: 'opciones' | 'unidad' | 'confirmar' | 'texto';
  /** Qué hacer con la opción elegida (índice base 0) o con el texto de la unidad. */
  continuar: (indice: number, texto?: string) => Promise<T>;
  creadaMs: number;
}

export const VIGENCIA_PREGUNTA_MS = 10 * 60_000;
const pendientes = new Map<string, PreguntaPendiente>();

/** Solo para tests. */
export const _resetPendientes = (): void => pendientes.clear();

const clave = (quien: string, grupo: string) => `${grupo}|${quien}`;

export const preguntar = <T>(p: Omit<PreguntaPendiente<T>, 'creadaMs'>, ahoraMs = Date.now()): void => {
  pendientes.set(clave(p.quien, p.grupo), { ...p, creadaMs: ahoraMs } as PreguntaPendiente);
};

/** ¿Este texto nombra una unidad? Un número, una placa, o «la última / primera». */
export const nombraUnidad = (texto: string): boolean => {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /\b\d{1,2}\b/.test(t) || /\b[a-z]{3}[\s-]?\d{3}\b/.test(t) || /\b(ultim[oa]|primer[oa]?)\b/.test(t);
};

/**
 * ¿Este texto contesta una pregunta pendiente de esta persona en este grupo?
 * Devuelve la pregunta y lo elegido, o `null`. La pregunta se consume solo si
 * el texto la contesta: un «buenos días» en el medio no la cancela.
 */
export interface RespuestaPendiente {
  pregunta: PreguntaPendiente;
  indice: number;
  texto: string;
  /** Un número que no es ninguna de las opciones («5» con tres opciones): se avisa y la pregunta sigue en pie. */
  invalida?: boolean;
}

export const responderPendiente = (
  quien: string,
  grupo: string,
  texto: string,
  ahoraMs = Date.now()
): RespuestaPendiente | null => {
  const k = clave(quien, grupo);
  const p = pendientes.get(k);
  if (!p) return null;
  if (ahoraMs - p.creadaMs > VIGENCIA_PREGUNTA_MS) {
    pendientes.delete(k);
    return null;
  }
  if (p.tipo === 'unidad') {
    if (!nombraUnidad(texto)) return null;
    pendientes.delete(k);
    return { pregunta: p, indice: -1, texto: String(texto || '').trim() };
  }
  if (p.tipo === 'texto') {
    const t = String(texto || '').trim();
    // Un mensaje largo es otra conversación, no la respuesta a «¿qué nombre?».
    if (!t || t.length > 60 || t.startsWith('@') || t.startsWith('!')) return null;
    pendientes.delete(k);
    return { pregunta: p, indice: -1, texto: t };
  }
  if (p.tipo === 'confirmar') {
    const t = String(texto || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const si = /^(si|sí|dale|ok|okey|claro|exacto|eso|ya|1)\b/.test(t);
    const no = /^(no|nada|otra|3)\b/.test(t);
    if (!si && !no) return null;
    pendientes.delete(k);
    return si ? { pregunta: p, indice: 0, texto: t } : null;
  }
  const t = String(texto || '').trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  // «5» con tres opciones es un intento de responder, no otra conversación: se
  // dice cuáles valen y la pregunta sigue en pie (José, 15/09: «valida que
  // respondan con un número válido»).
  if (n < 1 || n > p.opciones.length) return { pregunta: p, indice: -1, texto: t, invalida: true };
  pendientes.delete(k);
  return { pregunta: p, indice: n - 1, texto: t };
};

/** Qué se le dice a quien contesta con un número que no es ninguna opción. */
export const textoRespuestaInvalida = (p: PreguntaPendiente): string =>
  p.opciones.length === 1 ? 'Responde con *1*.' : `Responde con un número del *1* al *${p.opciones.length}*.`;

export const textoPregunta = (encabezado: string, opciones: string[]): string =>
  [encabezado, ...opciones.map((o, i) => `${i + 1}. ${o}`), '', 'Responde con el número.'].join('\n');
