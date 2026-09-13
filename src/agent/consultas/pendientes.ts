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
  /** `unidad`: se contesta con un número, una placa o «la última». `confirmar`: con un «sí». */
  tipo?: 'opciones' | 'unidad' | 'confirmar';
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
export const responderPendiente = (
  quien: string,
  grupo: string,
  texto: string,
  ahoraMs = Date.now()
): { pregunta: PreguntaPendiente; indice: number; texto: string } | null => {
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
  if (p.tipo === 'confirmar') {
    const t = String(texto || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const si = /^(si|sí|dale|ok|okey|claro|exacto|eso|ya|1)\b/.test(t);
    const no = /^(no|nada|otra|3)\b/.test(t);
    if (!si && !no) return null;
    pendientes.delete(k);
    return si ? { pregunta: p, indice: 0, texto: t } : null;
  }
  const n = Number(String(texto || '').trim());
  if (!Number.isInteger(n) || n < 1 || n > p.opciones.length) return null;
  pendientes.delete(k);
  return { pregunta: p, indice: n - 1, texto: String(texto || '').trim() };
};

export const textoPregunta = (encabezado: string, opciones: string[]): string =>
  [encabezado, ...opciones.map((o, i) => `${i + 1}. ${o}`), '', 'Respondé con el número.'].join('\n');
