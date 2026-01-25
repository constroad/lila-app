import { WhatsAppMessage } from '../../types';
export declare class MessageListener {
    private activeConversations;
    handleIncomingMessage(message: WhatsAppMessage, sessionPhone: string, whatsAppClient: any): Promise<void>;
    private processWithAI;
    private isGroupEnabled;
    private notifyHumanAgent;
    private sendErrorMessage;
}
declare const _default: MessageListener;
export default _default;
