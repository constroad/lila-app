import { getBotConversationMessageModel, getBotConversationModel } from '../../database/bot.models.js';
import { guardarMensajeDueno, pausarConversacion, reanudarConversacion } from '../runtime/conversation.store.js';
import { leadDeConversacion, type LeadResumen } from './leads.js';

/**
 * LAS CONVERSACIONES DEL PANEL (pantallas A2 y A3): lo que el motor guarda en
 * `bot_conversations` y `bot_conversation_messages`, más las acciones del dueño
 * —tomar (Dali se calla), devolver (Dali sigue), cerrar, y escribirle al
 * cliente desde el número del negocio— que reusan el store del runtime.
 */
export type EstadoConversacion = 'bot' | 'human' | 'closed';

export interface ConversacionResumen {
  id: string;
  nombre: string;
  telefono: string;
  estado: EstadoConversacion;
  pausadaHastaMs?: number;
  escaladaMs?: number;
  ultimoMensajeMs: number;
  ultimoMensajeDelClienteMs: number;
  mensajes: number;
  /** El último texto, para la lista. */
  ultimoTexto?: string;
  ultimoRol?: string;
  tieneLead: boolean;
  /** Sin respuesta del bot después del último mensaje del cliente. */
  sinResponder: boolean;
}

export interface MensajeConversacion {
  id: string;
  rol: 'customer' | 'bot' | 'owner' | 'system';
  texto: string;
  enviadoMs: number;
}

export interface FiltroConversaciones {
  estado?: EstadoConversacion | 'atencion';
  q?: string;
  limite?: number;
}

const texto = (v: unknown): string => (v == null ? '' : String(v)).trim();

export const listarConversaciones = async (companyId: string, filtro: FiltroConversaciones = {}): Promise<{ conversaciones: ConversacionResumen[]; porEstado: Record<string, number> }> => {
  const [Conversation, Message] = await Promise.all([getBotConversationModel(), getBotConversationMessageModel()]);
  const query: Record<string, unknown> = { companyId };
  if (filtro.estado === 'atencion') query.status = 'human';
  else if (filtro.estado) query.status = filtro.estado;
  const docs = await Conversation.find(query).sort({ lastMessageAt: -1 }).limit(filtro.limite ?? 100).lean();
  const ids = docs.map((d) => String(d._id));
  // El último mensaje de cada una, en una sola consulta.
  const ultimos = ids.length
    ? await Message.aggregate<{ _id: string; text?: string; role: string }>([
        { $match: { conversationId: { $in: ids } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$conversationId', text: { $first: '$text' }, role: { $first: '$role' } } },
      ])
    : [];
  const ultimoPor = new Map(ultimos.map((u) => [String(u._id), u]));
  const totales = await Conversation.aggregate<{ _id: string; n: number }>([{ $match: { companyId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const q = filtro.q?.toLowerCase();
  const conversaciones = docs
    .map((d): ConversacionResumen => {
      const ultimo = ultimoPor.get(String(d._id));
      return {
        id: String(d._id),
        nombre: d.customerName || `+${d.customerPhone}`,
        telefono: d.customerPhone,
        estado: d.status,
        pausadaHastaMs: d.pausedUntil ? new Date(d.pausedUntil).getTime() : undefined,
        escaladaMs: d.escalatedAt ? new Date(d.escalatedAt).getTime() : undefined,
        ultimoMensajeMs: new Date(d.lastMessageAt).getTime(),
        ultimoMensajeDelClienteMs: new Date(d.lastCustomerMessageAt).getTime(),
        mensajes: d.messageCount,
        ultimoTexto: texto(ultimo?.text) || undefined,
        ultimoRol: ultimo?.role,
        tieneLead: Boolean(d.lead),
        sinResponder: d.status === 'bot' && new Date(d.lastCustomerMessageAt).getTime() >= new Date(d.lastMessageAt).getTime() && ultimo?.role === 'customer',
      };
    })
    .filter((c) => !q || [c.nombre, c.telefono, c.ultimoTexto].some((v) => (v ?? '').toLowerCase().includes(q)));
  return { conversaciones, porEstado: Object.fromEntries(totales.map((t) => [t._id, t.n])) };
};

export interface ConversacionDetalle {
  conversacion: ConversacionResumen;
  mensajes: MensajeConversacion[];
  lead: LeadResumen | null;
}

export const detalleDeConversacion = async (companyId: string, conversationId: string, ahoraMs = Date.now()): Promise<ConversacionDetalle | null> => {
  const { conversaciones } = await listarConversaciones(companyId, { limite: 500 });
  const conversacion = conversaciones.find((c) => c.id === conversationId);
  if (!conversacion) return null;
  const [Conversation, Message] = await Promise.all([getBotConversationModel(), getBotConversationMessageModel()]);
  const [doc, mensajes] = await Promise.all([Conversation.findById(conversationId).lean(), Message.find({ conversationId }).sort({ createdAt: 1 }).limit(500).lean()]);
  if (!doc) return null;
  return {
    conversacion,
    mensajes: mensajes.map((m) => ({ id: String(m._id), rol: m.role as MensajeConversacion['rol'], texto: texto(m.text), enviadoMs: new Date(m.createdAt as Date).getTime() })),
    lead: doc.lead ? leadDeConversacion({ ...doc, id: String(doc._id) }, ahoraMs) : null,
  };
};

const esDeLaEmpresa = async (companyId: string, conversationId: string): Promise<boolean> => {
  const Conversation = await getBotConversationModel();
  return Boolean(await Conversation.exists({ _id: conversationId, companyId }));
};

/** «Tomar»: una persona atiende; Dali se calla el tiempo de handoff (por defecto 30 min, como en el motor). */
export const tomarConversacion = async (companyId: string, conversationId: string, minutos = 30): Promise<boolean> => {
  if (!(await esDeLaEmpresa(companyId, conversationId))) return false;
  await pausarConversacion(conversationId, minutos, 'owner');
  return true;
};

export const devolverConversacion = async (companyId: string, conversationId: string): Promise<boolean> => {
  if (!(await esDeLaEmpresa(companyId, conversationId))) return false;
  await reanudarConversacion(conversationId);
  return true;
};

export const cerrarConversacion = async (companyId: string, conversationId: string): Promise<boolean> => {
  if (!(await esDeLaEmpresa(companyId, conversationId))) return false;
  const Conversation = await getBotConversationModel();
  await Conversation.updateOne({ _id: conversationId, companyId }, { $set: { status: 'closed', pausedUntil: undefined } });
  return true;
};

/**
 * El dueño le escribe al cliente desde el panel: sale por el número del
 * negocio (la sesión de la empresa) y se guarda como mensaje del dueño; Dali
 * queda en pausa como cuando el dueño escribe desde su WhatsApp.
 */
export const escribirAlCliente = async (
  companyId: string,
  conversationId: string,
  textoMensaje: string,
  enviar: (sessionPhone: string, customerJid: string, text: string) => Promise<void>
): Promise<boolean> => {
  const Conversation = await getBotConversationModel();
  const doc = await Conversation.findOne({ _id: conversationId, companyId }).select('sessionPhone customerJid').lean();
  if (!doc) return false;
  await enviar(doc.sessionPhone, doc.customerJid, textoMensaje);
  await guardarMensajeDueno(companyId, conversationId, textoMensaje);
  return true;
};
