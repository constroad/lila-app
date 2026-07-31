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
