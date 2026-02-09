import path from 'path';
import logger from '../../utils/logger.js';
import JsonStore from '../../storage/json.store.js';
import { Conversation } from '../../types/index.js';
import { config } from '../../config/environment.js';

export class ConversationManager {
  private store: JsonStore;
  private conversationsDir: string;

  constructor() {
    this.conversationsDir = path.join(config.whatsapp.sessionDir, '../conversations');
    this.store = new JsonStore({
      baseDir: this.conversationsDir,
      autoBackup: true,
    });
  }

  async getOrCreate(chatId: string, sessionPhone: string): Promise<Conversation> {
    const key = this.getConversationKey(sessionPhone, chatId);
    const existing = await this.store.get<Conversation>(key);

    if (existing) {
      return existing;
    }

    // Crear nueva conversación
    const conversation: Conversation = {
      chatId,
      phoneNumber: this.extractPhoneNumber(chatId),
      sessionPhone,
      state: 'active',
      service: null,
      collectedData: {},
      messageHistory: [],
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    };

    await this.save(conversation);
    logger.info(`Created new conversation: ${key}`);

    return conversation;
  }

  async save(conversation: Conversation): Promise<void> {
    try {
      const key = this.getConversationKey(
        conversation.sessionPhone,
        conversation.chatId
      );
      conversation.lastMessageAt = new Date().toISOString();
      await this.store.set(key, conversation);
      logger.debug(`Conversation saved: ${key}`);
    } catch (error) {
      logger.error('Error saving conversation:', error);
      throw error;
    }
  }

  async get(chatId: string, sessionPhone: string): Promise<Conversation | null> {
    const key = this.getConversationKey(sessionPhone, chatId);
    return await this.store.get<Conversation>(key);
  }

  async delete(chatId: string, sessionPhone: string): Promise<void> {
    const key = this.getConversationKey(sessionPhone, chatId);
    await this.store.delete(key);
    logger.debug(`Conversation deleted: ${key}`);
  }

  async getAllForSession(sessionPhone: string): Promise<Conversation[]> {
    const keys = await this.store.getAllKeys();
    const conversations: Conversation[] = [];

    for (const key of keys) {
      if (key.startsWith(`${sessionPhone}:`)) {
        const conv = await this.store.get<Conversation>(key);
        if (conv) {
          conversations.push(conv);
        }
      }
    }

    return conversations;
  }

  async closeConversation(chatId: string, sessionPhone: string): Promise<void> {
    const conversation = await this.get(chatId, sessionPhone);
    if (conversation) {
      conversation.state = 'closed';
      await this.save(conversation);
      logger.info(`Conversation closed: ${chatId}`);
    }
  }

  private getConversationKey(sessionPhone: string, chatId: string): string {
    return `${sessionPhone}:${chatId}`;
  }

  private extractPhoneNumber(chatId: string): string {
    // Eliminar sufijo @s.whatsapp.net o @g.us
    return chatId.replace(/@[sg]\.whatsapp\.net|@g\.us/, '');
  }
}

export default new ConversationManager();
