import path from 'path';
import logger from '../../utils/logger';
import JsonStore from '../../storage/json.store';
import { config } from '../../config/environment';
export class ConversationManager {
    constructor() {
        this.conversationsDir = path.join(config.whatsapp.sessionDir, '../conversations');
        this.store = new JsonStore({
            baseDir: this.conversationsDir,
            autoBackup: true,
        });
    }
    async getOrCreate(chatId, sessionPhone) {
        const key = this.getConversationKey(sessionPhone, chatId);
        const existing = await this.store.get(key);
        if (existing) {
            return existing;
        }
        // Crear nueva conversación
        const conversation = {
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
    async save(conversation) {
        try {
            const key = this.getConversationKey(conversation.sessionPhone, conversation.chatId);
            conversation.lastMessageAt = new Date().toISOString();
            await this.store.set(key, conversation);
            logger.debug(`Conversation saved: ${key}`);
        }
        catch (error) {
            logger.error('Error saving conversation:', error);
            throw error;
        }
    }
    async get(chatId, sessionPhone) {
        const key = this.getConversationKey(sessionPhone, chatId);
        return await this.store.get(key);
    }
    async delete(chatId, sessionPhone) {
        const key = this.getConversationKey(sessionPhone, chatId);
        await this.store.delete(key);
        logger.debug(`Conversation deleted: ${key}`);
    }
    async getAllForSession(sessionPhone) {
        const keys = await this.store.getAllKeys();
        const conversations = [];
        for (const key of keys) {
            if (key.startsWith(`${sessionPhone}:`)) {
                const conv = await this.store.get(key);
                if (conv) {
                    conversations.push(conv);
                }
            }
        }
        return conversations;
    }
    async closeConversation(chatId, sessionPhone) {
        const conversation = await this.get(chatId, sessionPhone);
        if (conversation) {
            conversation.state = 'closed';
            await this.save(conversation);
            logger.info(`Conversation closed: ${chatId}`);
        }
    }
    getConversationKey(sessionPhone, chatId) {
        return `${sessionPhone}:${chatId}`;
    }
    extractPhoneNumber(chatId) {
        // Eliminar sufijo @s.whatsapp.net o @g.us
        return chatId.replace(/@[sg]\.whatsapp\.net|@g\.us/, '');
    }
}
export default new ConversationManager();
//# sourceMappingURL=conversation.manager.js.map