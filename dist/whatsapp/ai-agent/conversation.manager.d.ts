import { Conversation } from '../../types';
export declare class ConversationManager {
    private store;
    private conversationsDir;
    constructor();
    getOrCreate(chatId: string, sessionPhone: string): Promise<Conversation>;
    save(conversation: Conversation): Promise<void>;
    get(chatId: string, sessionPhone: string): Promise<Conversation | null>;
    delete(chatId: string, sessionPhone: string): Promise<void>;
    getAllForSession(sessionPhone: string): Promise<Conversation[]>;
    closeConversation(chatId: string, sessionPhone: string): Promise<void>;
    private getConversationKey;
    private extractPhoneNumber;
}
declare const _default: ConversationManager;
export default _default;
