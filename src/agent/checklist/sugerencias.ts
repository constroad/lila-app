/**
 * Las PROPUESTAS que esperan una persona. Motor puro, sin imports.
 *
 * MODO SUGERIDO (spec §4.3): el agente no le escribe a la gente que trabaja por
 * su cuenta. Lo que quiere mandar lo publica en el grupo de operaciones como una
 * propuesta —«Respondé 1 para mandarlo, 3 para descartar»— y recién con el «1»
 * de una persona sale al grupo real. Klarna volvió a contratar humanos porque
 * un error delante de la gente se recuerda; acá la persona está en el medio
 * desde el primer día.
 *
 * Cada propuesta lleva a dónde iría y qué diría. El «1» no elige el destino: el
 * destino ya está fijado en la propuesta y viene de la lista cerrada del
 * alcance. La persona aprueba o no; no redirige.
 */

export type TipoPropuesta = 'aviso-planta' | 'checklist-admin';
export type EstadoPropuesta = 'pendiente' | 'aprobada' | 'descartada' | 'vencida';

export interface Propuesta {
  id: string;
  tipo: TipoPropuesta;
  pedidoId: string;
  /** Firma semántica (ver `firmaAviso`): para no volver a proponer lo mismo. */
  firma: string;
  /** JID del grupo real al que iría. */
  destino: string;
  nombreDestino: string;
  /** El texto tal cual saldría al grupo real. */
  texto: string;
  creadaMs: number;
  estado: EstadoPropuesta;
  /** Quién la aprobó o descartó (JID del participante), para el registro. */
  decididaPor?: string;
  decididaMs?: number;
}

/** Una propuesta que nadie contesta en 6 h ya no se puede mandar: el momento pasó. */
export const VIGENCIA_MS = 6 * 60 * 60 * 1000;
const MAX_PROPUESTAS = 200;

const propuestas: Propuesta[] = [];
let secuencia = 0;

/** Solo para tests. */
export const _resetPropuestas = (): void => {
  propuestas.length = 0;
  secuencia = 0;
};

const expirar = (ahoraMs: number): void => {
  for (const p of propuestas) {
    if (p.estado === 'pendiente' && ahoraMs - p.creadaMs > VIGENCIA_MS) p.estado = 'vencida';
  }
};

export const proponer = (
  datos: Omit<Propuesta, 'id' | 'creadaMs' | 'estado'>,
  ahoraMs = Date.now()
): Propuesta => {
  const propuesta: Propuesta = {
    ...datos,
    id: String(++secuencia),
    creadaMs: ahoraMs,
    estado: 'pendiente',
  };
  propuestas.push(propuesta);
  if (propuestas.length > MAX_PROPUESTAS) propuestas.splice(0, propuestas.length - MAX_PROPUESTAS);
  return propuesta;
};

/**
 * ¿Ya se propuso esto? Para no repetir la misma propuesta. Una VENCIDA no
 * cuenta: si nadie la contestó en 6 h y el hecho sigue faltando, se vuelve a
 * proponer — lo que se quiere evitar es el eco, no la insistencia justificada.
 */
export const yaPropuesta = (tipo: TipoPropuesta, firma: string, ahoraMs = Date.now()): boolean => {
  expirar(ahoraMs);
  return propuestas.some((p) => p.tipo === tipo && p.firma === firma && p.estado !== 'vencida');
};

/** Cuántas propuestas de este tipo se hicieron hoy para este pedido: el presupuesto de ruido. */
export const propuestasDelPedido = (tipo: TipoPropuesta, pedidoId: string): number =>
  propuestas.filter((p) => p.tipo === tipo && p.pedidoId === pedidoId).length;

/** Las pendientes, de la más nueva a la más vieja. */
export const pendientes = (ahoraMs = Date.now()): Propuesta[] => {
  expirar(ahoraMs);
  return propuestas.filter((p) => p.estado === 'pendiente').reverse();
};

/**
 * El «1» o el «3». Sin cita, aplica a la propuesta pendiente MÁS RECIENTE: en
 * el piloto hay un pedido a la vez y casi nunca más de una propuesta viva. Si
 * hubiera dos, se contesta la última y la anterior sigue esperando — se ve en
 * el grupo, no se pierde.
 *
 * Devuelve la propuesta decidida, o `null` si no había nada pendiente (un «1»
 * suelto en el grupo no es una aprobación de nada).
 */
export const decidir = (
  respuesta: string,
  decididaPor: string,
  ahoraMs = Date.now()
): Propuesta | null => {
  const voto = String(respuesta || '').trim();
  if (voto !== '1' && voto !== '3') return null;
  const [ultima] = pendientes(ahoraMs);
  if (!ultima) return null;
  ultima.estado = voto === '1' ? 'aprobada' : 'descartada';
  ultima.decididaPor = decididaPor;
  ultima.decididaMs = ahoraMs;
  return ultima;
};

/** ¿Es una respuesta de decisión? Para que el observador sepa qué mirar. */
export const esVoto = (texto: string): boolean => {
  const t = String(texto || '').trim();
  return t === '1' || t === '3';
};
