import { Schema, type Model } from 'mongoose';
import logger from '../../utils/logger.js';
import { getSharedConnection } from '../../database/sharedConnection.js';
import type { MensajeGrupo } from './mensajes.js';
import type { Propuesta } from './sugerencias.js';

/**
 * LA MEMORIA DEL AGENTE SOBREVIVE UN DEPLOY.
 *
 * Hasta el 12/09/2026 los mensajes observados y las propuestas vivían en RAM.
 * Cada deploy —y hubo cuatro ese día— dejaba al agente amnésico: volvía a
 * proponer todo, olvidaba lo que el grupo ya había confirmado, y las propuestas
 * pendientes desaparecían con sus aprobaciones. Acá se escribe TODO lo que
 * importa, y al arrancar se vuelve a leer.
 *
 * Es también el registro que el spec pide para medir si el agente acierta
 * (§11): cada propuesta lleva quién la aprobó o descartó y cuándo.
 *
 * Nunca lanza: si Mongo no está, el agente sigue con lo que tiene en memoria y
 * lo dice en el log. La memoria degradada es mejor que un agente caído.
 */

const mensajeSchema = new Schema(
  {
    grupo: { type: String, index: true },
    texto: String,
    autor: String,
    ts: { type: Number, index: true },
    esPropio: Boolean,
    /** Para no guardar dos veces el mismo mensaje de WhatsApp. */
    waId: { type: String, index: true },
  },
  { collection: 'agent_messages', versionKey: false }
);
// Se limpian solos a las 72 h: la ventana del agente es de 36.
mensajeSchema.index({ creadoEn: 1 }, { expireAfterSeconds: 72 * 3600 });
mensajeSchema.add({ creadoEn: { type: Date, default: Date.now } });

const propuestaSchema = new Schema(
  {
    id: { type: String, unique: true },
    tipo: String,
    fecha: String,
    firma: { type: String, index: true },
    destino: String,
    nombreDestino: String,
    texto: String,
    creadaMs: Number,
    estado: String,
    decididaPor: String,
    decididaMs: Number,
    /** Id del mensaje de WhatsApp con la propuesta: la cita que la aprueba apunta acá. */
    msgId: { type: String, index: true },
    creadoEn: { type: Date, default: Date.now },
  },
  { collection: 'agent_proposals', versionKey: false }
);
propuestaSchema.index({ creadoEn: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

type Doc = Record<string, unknown>;
let mensajes: Model<Doc> | null = null;
let propuestas: Model<Doc> | null = null;

const modelos = async (): Promise<{ mensajes: Model<Doc>; propuestas: Model<Doc> }> => {
  if (mensajes && propuestas) return { mensajes, propuestas };
  const conn = await getSharedConnection();
  mensajes =
    (conn.models.AgentMessage as Model<Doc>) || conn.model<Doc>('AgentMessage', mensajeSchema);
  propuestas =
    (conn.models.AgentProposal as Model<Doc>) || conn.model<Doc>('AgentProposal', propuestaSchema);
  return { mensajes, propuestas };
};

const avisar = (que: string, error: unknown): void => {
  logger.warn(`[agente] persistencia: ${que}: ${error instanceof Error ? error.message : String(error)}`);
};

export const guardarMensaje = async (grupo: string, m: MensajeGrupo & { waId?: string }): Promise<void> => {
  try {
    const { mensajes } = await modelos();
    if (m.waId) {
      await mensajes.updateOne({ waId: m.waId }, { $setOnInsert: { grupo, ...m } }, { upsert: true });
    } else {
      await mensajes.create({ grupo, ...m });
    }
  } catch (error) {
    avisar('no pude guardar un mensaje', error);
  }
};

export const cargarMensajes = async (
  desdeMs: number
): Promise<Array<{ grupo: string } & MensajeGrupo>> => {
  try {
    const { mensajes } = await modelos();
    const docs = (await mensajes.find({ ts: { $gte: desdeMs } }).sort({ ts: 1 }).lean()) as Doc[];
    return docs.map((d) => ({
      grupo: String(d.grupo || ''),
      texto: String(d.texto || ''),
      autor: String(d.autor || ''),
      ts: Number(d.ts) || 0,
      esPropio: Boolean(d.esPropio),
    }));
  } catch (error) {
    avisar('no pude cargar mensajes', error);
    return [];
  }
};

export const guardarPropuesta = async (p: Propuesta): Promise<void> => {
  try {
    const { propuestas } = await modelos();
    await propuestas.updateOne({ id: p.id }, { $set: { ...p } }, { upsert: true });
  } catch (error) {
    avisar(`no pude guardar la propuesta ${p.id}`, error);
  }
};

export const cargarPropuestas = async (desdeMs: number): Promise<Propuesta[]> => {
  try {
    const { propuestas } = await modelos();
    const docs = (await propuestas.find({ creadaMs: { $gte: desdeMs } }).sort({ creadaMs: 1 }).lean()) as Doc[];
    return docs.map((d) => ({
      id: String(d.id),
      tipo: d.tipo as Propuesta['tipo'],
      fecha: String(d.fecha || ''),
      firma: String(d.firma || ''),
      destino: String(d.destino || ''),
      nombreDestino: String(d.nombreDestino || ''),
      texto: String(d.texto || ''),
      creadaMs: Number(d.creadaMs) || 0,
      estado: d.estado as Propuesta['estado'],
      decididaPor: d.decididaPor ? String(d.decididaPor) : undefined,
      decididaMs: d.decididaMs ? Number(d.decididaMs) : undefined,
      msgId: d.msgId ? String(d.msgId) : undefined,
    }));
  } catch (error) {
    avisar('no pude cargar propuestas', error);
    return [];
  }
};
