import { randomUUID } from 'crypto';

/**
 * Las PROPUESTAS que esperan una persona. Motor puro (solo `crypto`, builtin).
 *
 * MODO SUGERIDO (spec §4.3): el agente no le escribe a la gente que trabaja por
 * su cuenta. Lo que quiere mandar lo publica en el grupo de operaciones como una
 * propuesta y recién con la aprobación de una persona sale al grupo real.
 *
 * CÓMO SE APRUEBA — POR CITA, NO POR UN «1» SUELTO. José, 13/09/2026: «estamos
 * en un grupo. ¿Qué pasa si el contador escribe inmediatamente después de este
 * mensaje?». Tenía razón: un «1» en un grupo no es de nadie. Ahora se aprueba
 * RESPONDIENDO al mensaje de la propuesta (deslizar → responder con 1):
 * la respuesta trae el id del mensaje citado, y ese id es de UNA propuesta. Un
 * «1» sin cita no aprueba nada, y un «1» citando otra cosa tampoco.
 *
 * Y APRUEBA QUIEN PUEDE: `decidir` recibe si quien responde es aprobador; eso lo
 * decide el observador con los administradores del grupo de operaciones.
 */

/**
 * `aviso-planta` y `checklist-admin` nacen de un PEDIDO en Portal.
 * `aviso-mencion` (a planta) y `recordatorio-pedido` (al grupo admin) nacen de
 * una producción MENCIONADA en el chat que todavía no es pedido (`menciones.ts`).
 */
export type TipoPropuesta = 'aviso-planta' | 'checklist-admin' | 'checklist-planta' | 'aviso-mencion' | 'recordatorio-pedido';
export type EstadoPropuesta = 'pendiente' | 'aprobada' | 'descartada' | 'vencida';

export interface Propuesta {
  id: string;
  tipo: TipoPropuesta;
  /** Día de producción `YYYY-MM-DD` al que pertenece. */
  fecha: string;
  /** Firma semántica: para no volver a proponer lo mismo. */
  firma: string;
  /** JID del grupo real al que iría. */
  destino: string;
  nombreDestino: string;
  /** El texto tal cual saldría al grupo real. */
  texto: string;
  creadaMs: number;
  estado: EstadoPropuesta;
  /** Id del mensaje de WhatsApp con la propuesta: la cita que la decide apunta acá. */
  msgId?: string;
  decididaPor?: string;
  decididaMs?: number;
}

/** Una propuesta que nadie contesta en 6 h ya no se puede mandar: el momento pasó. */
export const VIGENCIA_MS = 6 * 60 * 60 * 1000;
const MAX_PROPUESTAS = 500;

let propuestas: Propuesta[] = [];

/** Solo para tests. */
export const _resetPropuestas = (): void => {
  propuestas = [];
};

/** Rehidratación desde la persistencia al arrancar. Reemplaza lo que haya. */
export const hidratarPropuestas = (guardadas: Propuesta[]): void => {
  propuestas = [...guardadas].sort((a, b) => a.creadaMs - b.creadaMs).slice(-MAX_PROPUESTAS);
};

const expirar = (ahoraMs: number): Propuesta[] => {
  const vencidas: Propuesta[] = [];
  for (const p of propuestas) {
    if (p.estado === 'pendiente' && ahoraMs - p.creadaMs > VIGENCIA_MS) {
      p.estado = 'vencida';
      vencidas.push(p);
    }
  }
  return vencidas;
};

export const proponer = (
  datos: Omit<Propuesta, 'id' | 'creadaMs' | 'estado'>,
  ahoraMs = Date.now()
): Propuesta => {
  const propuesta: Propuesta = {
    ...datos,
    id: randomUUID().slice(0, 8),
    creadaMs: ahoraMs,
    estado: 'pendiente',
  };
  propuestas.push(propuesta);
  if (propuestas.length > MAX_PROPUESTAS) propuestas.splice(0, propuestas.length - MAX_PROPUESTAS);
  return propuesta;
};

/** Se llama cuando se sabe el id del mensaje de WhatsApp que lleva la propuesta. */
export const anotarMensaje = (id: string, msgId: string): Propuesta | undefined => {
  const p = propuestas.find((x) => x.id === id);
  if (p) p.msgId = msgId;
  return p;
};

/**
 * ¿Ya se propuso esto? Una VENCIDA no cuenta: si nadie la contestó en 6 h y el
 * hecho sigue faltando, se vuelve a proponer — lo que se evita es el eco.
 */
export const yaPropuesta = (tipo: TipoPropuesta, firma: string, ahoraMs = Date.now()): boolean => {
  expirar(ahoraMs);
  return propuestas.some((p) => p.tipo === tipo && p.firma === firma && p.estado !== 'vencida');
};

/** Todas las de un tipo (cualquier estado), de la más nueva a la más vieja. */
export const propuestasDe = (tipo: TipoPropuesta): Propuesta[] => propuestas.filter((p) => p.tipo === tipo).reverse();

/** Las pendientes, de la más nueva a la más vieja. */
export const pendientes = (ahoraMs = Date.now()): Propuesta[] => {
  expirar(ahoraMs);
  return propuestas.filter((p) => p.estado === 'pendiente').reverse();
};

/** Las que vencieron en esta pasada, para avisar en operaciones. */
export const vencidasAhora = (ahoraMs = Date.now()): Propuesta[] => expirar(ahoraMs);

export const porMensaje = (msgId: string): Propuesta | undefined =>
  msgId ? propuestas.find((p) => p.msgId === msgId) : undefined;

/** ¿Es una respuesta de decisión? */
export const esVoto = (texto: string): boolean => {
  const t = String(texto || '').trim();
  return t === '1' || t === '3';
};

export type MotivoRechazo = 'sin-cita' | 'cita-desconocida' | 'no-pendiente' | 'no-aprobador' | 'no-es-voto';

export type ResultadoDecision =
  | { ok: true; propuesta: Propuesta }
  | { ok: false; motivo: MotivoRechazo };

/**
 * Decide la propuesta CITADA. Sin cita no hay decisión: en un grupo, un «1» no
 * es de nadie. Y sin permiso tampoco: aprueba quien administra el grupo de
 * operaciones.
 */
export const decidir = (
  args: { voto: string; citaMsgId?: string; quien: string; esAprobador: boolean },
  ahoraMs = Date.now()
): ResultadoDecision => {
  const voto = String(args.voto || '').trim();
  if (voto !== '1' && voto !== '3') return { ok: false, motivo: 'no-es-voto' };
  if (!args.citaMsgId) return { ok: false, motivo: 'sin-cita' };
  expirar(ahoraMs);
  const propuesta = porMensaje(args.citaMsgId);
  if (!propuesta) return { ok: false, motivo: 'cita-desconocida' };
  if (propuesta.estado !== 'pendiente') return { ok: false, motivo: 'no-pendiente' };
  if (!args.esAprobador) return { ok: false, motivo: 'no-aprobador' };

  propuesta.estado = voto === '1' ? 'aprobada' : 'descartada';
  propuesta.decididaPor = args.quien;
  propuesta.decididaMs = ahoraMs;
  return { ok: true, propuesta };
};
