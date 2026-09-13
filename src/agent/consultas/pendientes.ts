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
  opciones: string[];
  /** Qué hacer con la opción elegida (índice base 0). */
  continuar: (indice: number) => Promise<T>;
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

/**
 * ¿Este texto contesta una pregunta pendiente de esta persona en este grupo?
 * Devuelve la pregunta y el índice elegido, o `null`. La pregunta se consume.
 */
export const responderPendiente = (
  quien: string,
  grupo: string,
  texto: string,
  ahoraMs = Date.now()
): { pregunta: PreguntaPendiente; indice: number } | null => {
  const k = clave(quien, grupo);
  const p = pendientes.get(k);
  if (!p) return null;
  if (ahoraMs - p.creadaMs > VIGENCIA_PREGUNTA_MS) {
    pendientes.delete(k);
    return null;
  }
  const n = Number(String(texto || '').trim());
  if (!Number.isInteger(n) || n < 1 || n > p.opciones.length) return null;
  pendientes.delete(k);
  return { pregunta: p, indice: n - 1 };
};

export const textoPregunta = (encabezado: string, opciones: string[]): string =>
  [encabezado, ...opciones.map((o, i) => `${i + 1}. ${o}`), '', 'Respondé con el número.'].join('\n');
