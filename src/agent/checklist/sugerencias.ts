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
  /** El texto tal cual salió al grupo (con el pie): para reconocer la cita cuando el id no llegó. */
  textoPublicado?: string;
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
/**
 * Al rehidratar, lo pendiente que YA venció se marca vencido en silencio y se
 * devuelve para persistirlo: el 14/09 (21:20 y 21:40) cada reinicio volvía a
 * «vencer» las mismas tres propuestas y a avisarlo en error tracking, porque el
 * vencimiento solo vivía en memoria.
 */
export const hidratarPropuestas = (guardadas: Propuesta[], ahoraMs = Date.now()): Propuesta[] => {
  propuestas = [...guardadas].sort((a, b) => a.creadaMs - b.creadaMs).slice(-MAX_PROPUESTAS);
  return expirar(ahoraMs);
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
export const yaPropuesta = (tipo: TipoPropuesta, firma: string, ahoraMs = Date.now(), opciones: { incluirVencidas?: boolean } = {}): boolean => {
  expirar(ahoraMs);
  return propuestas.some((p) => p.tipo === tipo && p.firma === firma && (opciones.incluirVencidas || p.estado !== 'vencida'));
};

/**
 * ¿Este hecho ya se MANDÓ? Una propuesta aprobada del mismo tipo y día cuya
 * firma empiece igual (la manual lleva sufijo `|manual|…`). El 14/09 a las
 * 23:00 y el 15/09 a las 05:00 el detector volvió a proponer el aviso a planta
 * del 15/09 que José había aprobado a las 20:42: la aprobada era la manual, con
 * otra firma, y la automática había vencido.
 */
export const yaEnviada = (tipo: TipoPropuesta, firmaBase: string): Propuesta | undefined =>
  propuestas.find((p) => p.tipo === tipo && p.estado === 'aprobada' && p.firma.startsWith(firmaBase));

/**
 * ¿Planta ya recibió el AVISO de esa producción (el «Producción programada —
 * reunión 30 min antes»)? Es lo primero que le llega a planta de un día; el
 * checklist («por confirmar: PEN…») solo tiene sentido después. El 15/09 a las
 * 17:00 el aviso del 16/09 había vencido sin respuesta, salió el checklist con
 * su «responde 1 para enviarlo», José respondió 1 esperando el aviso, y a
 * planta le llegó un checklist de una producción que nadie les había anunciado.
 * `firmaBaseAviso` es `${firmaDia(dia)}|aviso` (la de `proponerAvisoDelDia`).
 */
export const plantaYaAvisada = (firmaBaseAviso: string): boolean => Boolean(yaEnviada('aviso-planta', firmaBaseAviso));

/**
 * Al aprobarse una, las demás pendientes del mismo tipo, día y destino quedan
 * superadas: se cierran en silencio (no «vencen» con aviso). Devuelve las
 * cerradas para persistirlas.
 */
export const cerrarSuperadas = (aprobada: Propuesta, ahoraMs = Date.now()): Propuesta[] => {
  const cerradas: Propuesta[] = [];
  for (const p of propuestas) {
    if (p.id === aprobada.id || p.estado !== 'pendiente') continue;
    if (p.tipo !== aprobada.tipo || p.fecha !== aprobada.fecha || p.destino !== aprobada.destino) continue;
    p.estado = 'descartada';
    p.decididaPor = 'superada';
    p.decididaMs = ahoraMs;
    cerradas.push(p);
  }
  return cerradas;
};

/** Todas las de un tipo (cualquier estado), de la más nueva a la más vieja. */
export const propuestasDe = (tipo: TipoPropuesta): Propuesta[] => propuestas.filter((p) => p.tipo === tipo).reverse();

/** Las pendientes, de la más nueva a la más vieja. */
export const pendientes = (ahoraMs = Date.now()): Propuesta[] => {
  expirar(ahoraMs);
  return propuestas.filter((p) => p.estado === 'pendiente').reverse();
};

/**
 * Cierra en silencio lo pendiente de los tipos que ya no existen (spec §14:
 * el aviso con «1», el checklist de planta y las menciones). Devuelve las
 * cerradas para persistirlas. Sin esto, la b88e1226 del 15/09 habría vencido
 * a las 01:21 con un «⌛ no se mandó» de un mecanismo que ya no está.
 */
export const cerrarTiposRetirados = (tipos: TipoPropuesta[], ahoraMs = Date.now()): Propuesta[] => {
  const cerradas: Propuesta[] = [];
  for (const p of propuestas) {
    if (p.estado !== 'pendiente' || !tipos.includes(p.tipo)) continue;
    p.estado = 'descartada';
    p.decididaPor = 'agente';
    p.decididaMs = ahoraMs;
    cerradas.push(p);
  }
  return cerradas;
};

/** Las que vencieron en esta pasada, para avisar en operaciones. */
export const vencidasAhora = (ahoraMs = Date.now()): Propuesta[] => expirar(ahoraMs);

export const porMensaje = (msgId: string): Propuesta | undefined =>
  msgId ? propuestas.find((p) => p.msgId === msgId) : undefined;

/** Se llama cuando se sabe qué texto salió al grupo (se persiste con la propuesta). */
export const anotarTextoPublicado = (id: string, texto: string): Propuesta | undefined => {
  const p = propuestas.find((x) => x.id === id);
  if (p) p.textoPublicado = texto;
  return p;
};

const compacto = (t: string): string => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 160);

/**
 * LA CITA POR SU TEXTO, cuando el id no sirve. 15/09 19:21: el envío a
 * WhatsApp expiró («Timed Out»), la propuesta quedó en la cola de salida y
 * salió a las 19:25 con un id que nadie asoció; José la citó con «1» y el voto
 * fue «cita desconocida» — en silencio. WhatsApp manda el texto citado junto
 * con el id: si el texto es el de una propuesta, es esa propuesta. Se compara
 * el comienzo (160 caracteres compactados): dos propuestas distintas del mismo
 * día difieren desde la primera línea.
 */
export const porTextoCitado = (textoCitado: string): Propuesta | undefined => {
  const c = compacto(textoCitado);
  if (c.length < 20) return undefined;
  // Por el texto publicado si se guardó; si no (propuestas anteriores a este
  // cambio, como la b88e1226 del 15/09), por el CUERPO: es el comienzo del
  // mensaje publicado, el pie va después.
  return propuestas.find((p) => {
    if (p.textoPublicado) return compacto(p.textoPublicado) === c;
    const cuerpo = compacto(p.texto).slice(0, 120);
    return cuerpo.length >= 20 && c.startsWith(cuerpo);
  });
};

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
  args: { voto: string; citaMsgId?: string; citaTexto?: string; quien: string; esAprobador: boolean },
  ahoraMs = Date.now()
): ResultadoDecision => {
  const voto = String(args.voto || '').trim();
  if (voto !== '1' && voto !== '3') return { ok: false, motivo: 'no-es-voto' };
  if (!args.citaMsgId && !args.citaTexto) return { ok: false, motivo: 'sin-cita' };
  expirar(ahoraMs);
  const propuesta = porMensaje(args.citaMsgId ?? '') ?? porTextoCitado(args.citaTexto ?? '');
  if (!propuesta) return { ok: false, motivo: 'cita-desconocida' };
  if (propuesta.estado !== 'pendiente') return { ok: false, motivo: 'no-pendiente' };
  if (!args.esAprobador) return { ok: false, motivo: 'no-aprobador' };

  propuesta.estado = voto === '1' ? 'aprobada' : 'descartada';
  propuesta.decididaPor = args.quien;
  propuesta.decididaMs = ahoraMs;
  return { ok: true, propuesta };
};
