import type { Model } from 'mongoose';
import { getSharedConnection } from './sharedConnection.js';
import {
  BotConfigSchema,
  BotConversationMessageSchema,
  BotConversationSchema,
  type IBotConfig,
  type IBotConversation,
  type IBotConversationMessage,
} from '../models/bot.model.js';

let botConfigModel: Model<IBotConfig> | null = null;
let botConversationModel: Model<IBotConversation> | null = null;
let botConversationMessageModel: Model<IBotConversationMessage> | null = null;

export async function getBotConfigModel(): Promise<Model<IBotConfig>> {
  if (botConfigModel) return botConfigModel;
  const conn = await getSharedConnection();
  botConfigModel =
    (conn.models.BotConfig as Model<IBotConfig>) ||
    conn.model<IBotConfig>('BotConfig', BotConfigSchema);
  return botConfigModel;
}

export async function getBotConversationModel(): Promise<Model<IBotConversation>> {
  if (botConversationModel) return botConversationModel;
  const conn = await getSharedConnection();
  botConversationModel =
    (conn.models.BotConversation as Model<IBotConversation>) ||
    conn.model<IBotConversation>('BotConversation', BotConversationSchema);
  return botConversationModel;
}

export async function getBotConversationMessageModel(): Promise<
  Model<IBotConversationMessage>
> {
  if (botConversationMessageModel) return botConversationMessageModel;
  const conn = await getSharedConnection();
  botConversationMessageModel =
    (conn.models.BotConversationMessage as Model<IBotConversationMessage>) ||
    conn.model<IBotConversationMessage>(
      'BotConversationMessage',
      BotConversationMessageSchema
    );
  return botConversationMessageModel;
}
