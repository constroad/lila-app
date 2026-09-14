/**
 * Persistencia de conversaciones del agente (F1 §3.4-3.5).
 * El store liviano de Baileys NO guarda mensajes a propósito — estas
 * colecciones son la única fuente del historial conversacional.
 */
import {
  getBotConversationMessageModel,
  getBotConversationModel,
} from '../../database/bot.models.js';
import type { InboundPersistInput, OutboundPersistInput } from './agent.types.js';

const LIMA_UTC_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5 fijo, Perú no tiene DST

export function limaMonthKey(date: Date): string {
  return new Date(date.getTime() - LIMA_UTC_OFFSET_MS).toISOString().slice(0, 7);
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: number }).code === 11000);
}

export async function saveInboundMessage(
  entry: InboundPersistInput
): Promise<{ duplicated: boolean; conversationId: string }> {
  const conversationModel = await getBotConversationModel();
  const conversation = await conversationModel
    .findOneAndUpdate(
      { companyId: entry.companyId, customerJid: entry.customerJid },
      {
        $set: {
          sessionPhone: entry.sessionPhone,
          lastMessageAt: entry.receivedAt,
          lastCustomerMessageAt: entry.receivedAt,
          ...(entry.customerName ? { customerName: entry.customerName } : {}),
        },
        $inc: { messageCount: 1 },
        $setOnInsert: {
          customerPhone: entry.customerPhone,
          status: 'bot',
          monthKey: limaMonthKey(entry.receivedAt),
        },
      },
      { upsert: true, new: true }
    )
    .lean();

  const conversationId = String(conversation._id);
  const messageModel = await getBotConversationMessageModel();
  try {
    await messageModel.create({
      conversationId,
      companyId: entry.companyId,
      role: 'customer',
      text: entry.text,
      ...(entry.channelMessageId ? { channelMessageId: entry.channelMessageId } : {}),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return { duplicated: true, conversationId };
    }
    throw error;
  }
  return { duplicated: false, conversationId };
}

export async function saveOutboundMessage(entry: OutboundPersistInput): Promise<void> {
  const messageModel = await getBotConversationMessageModel();
  await messageModel.create({
    conversationId: entry.conversationId,
    companyId: entry.companyId,
    role: 'bot',
    text: entry.text,
  });
  const conversationModel = await getBotConversationModel();
  await conversationModel.updateOne(
    { _id: entry.conversationId },
    { $set: { lastMessageAt: entry.sentAt }, $inc: { messageCount: 1 } }
  );
}

// ---- F2/F3: lo que el agente de ventas necesita leer y escribir ----

export interface ConversacionActiva {
  id: string;
  status: 'bot' | 'human' | 'closed';
  pausedUntil?: Date;
  lead?: Record<string, unknown>;
  leadNotifiedAt?: Date;
  customerName?: string;
}

export async function cargarConversacion(conversationId: string): Promise<ConversacionActiva | null> {
  const conversationModel = await getBotConversationModel();
  const c = await conversationModel.findById(conversationId).lean();
  if (!c) return null;
  return { id: String(c._id), status: c.status, pausedUntil: c.pausedUntil, lead: c.lead, leadNotifiedAt: c.leadNotifiedAt, customerName: c.customerName };
}

export async function conversacionDeCliente(companyId: string, customerJid: string): Promise<ConversacionActiva | null> {
  const conversationModel = await getBotConversationModel();
  const c = await conversationModel.findOne({ companyId, customerJid }).lean();
  if (!c) return null;
  return { id: String(c._id), status: c.status, pausedUntil: c.pausedUntil, lead: c.lead, leadNotifiedAt: c.leadNotifiedAt, customerName: c.customerName };
}

/** Los últimos mensajes de la conversación, del más viejo al más nuevo. */
export async function ultimosMensajes(conversationId: string, cantidad = 16): Promise<Array<{ role: string; text?: string; createdAt?: Date }>> {
  const messageModel = await getBotConversationMessageModel();
  const docs = await messageModel.find({ conversationId }).sort({ createdAt: -1 }).limit(cantidad).lean();
  return docs.reverse().map((d) => ({ role: d.role, text: d.text, createdAt: d.createdAt }));
}

export async function guardarLeadEnConversacion(conversationId: string, lead: Record<string, unknown>, notificadoAhora: boolean): Promise<void> {
  const conversationModel = await getBotConversationModel();
  await conversationModel.updateOne({ _id: conversationId }, { $set: { lead, ...(notificadoAhora ? { leadNotifiedAt: new Date() } : {}) } });
}

/** F3: una persona tomó la conversación; el bot calla hasta `pausedUntil`. */
export async function pausarConversacion(conversationId: string, minutos: number, motivo: 'owner' | 'escalada'): Promise<void> {
  const conversationModel = await getBotConversationModel();
  await conversationModel.updateOne(
    { _id: conversationId },
    { $set: { status: 'human', pausedUntil: new Date(Date.now() + minutos * 60_000), ...(motivo === 'escalada' ? { escalatedAt: new Date() } : {}) } }
  );
}

export async function reanudarConversacion(conversationId: string): Promise<void> {
  const conversationModel = await getBotConversationModel();
  await conversationModel.updateOne({ _id: conversationId }, { $set: { status: 'bot' }, $unset: { pausedUntil: 1 } });
}

export async function guardarMensajeDueno(companyId: string, conversationId: string, text: string): Promise<void> {
  const messageModel = await getBotConversationMessageModel();
  await messageModel.create({ conversationId, companyId, role: 'owner', text });
  const conversationModel = await getBotConversationModel();
  await conversationModel.updateOne({ _id: conversationId }, { $set: { lastMessageAt: new Date() }, $inc: { messageCount: 1 } });
}

export async function sumarTokens(conversationId: string, entrada: number, salida: number): Promise<void> {
  const conversationModel = await getBotConversationModel();
  await conversationModel.updateOne({ _id: conversationId }, { $inc: { tokensIn: entrada, tokensOut: salida } });
}
