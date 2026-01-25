import { Conversation, AgentResponse } from '../../types';
export declare class AgentService {
    private client;
    constructor();
    generateResponse(conversation: Conversation, userMessage: string): Promise<AgentResponse>;
    private prepareMessages;
    private analyzeResponse;
}
declare const _default: AgentService;
export default _default;
