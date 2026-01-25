import Anthropic from '@anthropic-ai/sdk';
import logger from '../../utils/logger';
import { SYSTEM_PROMPT, getUserContextPrompt } from './prompts/asphalt-sales.prompt';
import { CLAUDE_MODEL, CLAUDE_MAX_TOKENS } from '../../config/constants';
export class AgentService {
    constructor() {
        this.client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }
    async generateResponse(conversation, userMessage) {
        try {
            logger.debug(`Generating response for conversation ${conversation.chatId}`);
            // Preparar mensajes para Claude
            const messages = this.prepareMessages(conversation, userMessage);
            // Llamar a Claude API
            const response = await this.client.messages.create({
                model: CLAUDE_MODEL,
                max_tokens: CLAUDE_MAX_TOKENS,
                system: SYSTEM_PROMPT + '\n\n' + getUserContextPrompt(conversation),
                messages: messages,
            });
            const assistantMessage = response.content[0].type === 'text'
                ? response.content[0].text
                : '';
            if (!assistantMessage) {
                throw new Error('No text in response from Claude');
            }
            // Analizar respuesta para detectar cambios de estado
            const analysis = this.analyzeResponse(assistantMessage, conversation);
            logger.debug(`Response generated. Next state: ${analysis.nextState}, Handoff: ${analysis.shouldHandoff}`);
            return {
                text: assistantMessage,
                nextState: analysis.nextState,
                shouldHandoff: analysis.shouldHandoff,
            };
        }
        catch (error) {
            logger.error('Error calling Claude API:', error);
            throw error;
        }
    }
    prepareMessages(conversation, newMessage) {
        // Tomar últimos 10 mensajes para contexto
        const recentMessages = conversation.messageHistory.slice(-10);
        const messages = recentMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));
        // Agregar nuevo mensaje
        messages.push({
            role: 'user',
            content: newMessage,
        });
        return messages;
    }
    analyzeResponse(text, conversation) {
        // Detectar keywords de handoff
        const handoffKeywords = [
            'conectarte con un supervisor',
            'derivar',
            'hablar con un especialista',
            'ingeniero especializado',
            'permíteme conectarte',
            'déjame conectarte',
        ];
        const shouldHandoff = handoffKeywords.some((keyword) => text.toLowerCase().includes(keyword));
        // Detectar si se completó la recopilación
        const completionKeywords = [
            'con esta información',
            'te contactará',
            'preparará una cotización',
            'próximas 2 horas',
        ];
        const isComplete = completionKeywords.some((keyword) => text.toLowerCase().includes(keyword));
        let nextState = conversation.state;
        if (shouldHandoff) {
            nextState = 'waiting_human';
        }
        else if (isComplete) {
            nextState = 'closed';
        }
        return { nextState, shouldHandoff };
    }
}
export default new AgentService();
//# sourceMappingURL=agent.service.js.map