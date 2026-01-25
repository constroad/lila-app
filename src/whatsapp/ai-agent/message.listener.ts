import logger from '../../utils/logger.js';
import agentService from './agent.service.js';
import conversationManager from './conversation.manager.js';
import typingSimulator from './typing-simulator.js';
import { WhatsAppMessage, Conversation } from '../../types/index.js';
import { validateMessage } from '../../utils/validators.js';
import { config } from '../../config/environment.js';

export class MessageListener {
  private activeConversations: Map<string, Conversation> = new Map();

  async handleIncomingMessage(
    message: WhatsAppMessage,
    sessionPhone: string,
    whatsAppClient: any
  ): Promise<void> {
    try {
      // disabled for test 
      return
      // 1. Filtrar mensajes propios
      if (message.key.fromMe) {
        return;
      }

      // 2. Validar que es un mensaje de texto
      if (!validateMessage(message.message)) {
        logger.debug(`Skipping non-text message from ${message.key.remoteJid}`);
        return;
      }

      // 3. Extraer información del remitente
      const chatId = message.key.remoteJid;
      const messageText =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        '';

      if (!messageText.trim()) {
        return;
      }

      // 4. Ignorar si es un grupo y el bot no está habilitado
      const isGroup = chatId.endsWith('@g.us');
      if (isGroup && !this.isGroupEnabled(chatId)) {
        logger.debug(`Group ${chatId} not enabled for bot`);
        return;
      }

      // 4.1 Respetar modo IA desactivado o modo prueba
      if (!this.isAiAllowed(chatId, isGroup)) {
        logger.debug(`AI disabled or not allowed for ${chatId}`);
        return;
      }

      logger.info(
        `Incoming message from ${chatId} (session: ${sessionPhone}): ${messageText.substring(0, 50)}`
      );

      // 5. Obtener o crear conversación
      const conversation = await conversationManager.getOrCreate(chatId, sessionPhone);

      // 6. Verificar si está en handoff a humano
      if (conversation.state === 'waiting_human') {
        await this.notifyHumanAgent(conversation, messageText);
        return;
      }

      // 7. Agregar mensaje al historial
      conversation.messageHistory.push({
        role: 'user',
        content: messageText,
        timestamp: new Date().toISOString(),
      });

      // 8. Procesar con IA
      await this.processWithAI(conversation, messageText, whatsAppClient);
    } catch (error) {
      logger.error('Error handling incoming message:', error);
    }
  }

  private async processWithAI(
    conversation: Conversation,
    message: string,
    whatsAppClient: any
  ): Promise<void> {
    try {
      // 1. Simular "escribiendo..."
      await whatsAppClient.sendPresenceUpdate('composing', conversation.chatId);

      // 2. Obtener respuesta del agente
      const response = await agentService.generateResponse(conversation, message);

      // 3. Simular tiempo de escritura humano
      await typingSimulator.simulateTyping(response.text);

      // 4. Enviar respuesta
      await whatsAppClient.sendMessage(conversation.chatId, {
        text: response.text,
      });

      logger.info(
        `Response sent to ${conversation.chatId}: ${response.text.substring(0, 50)}`
      );

      // 5. Actualizar conversación
      conversation.messageHistory.push({
        role: 'assistant',
        content: response.text,
        timestamp: new Date().toISOString(),
      });

      conversation.lastMessageAt = new Date().toISOString();

      // 6. Actualizar estado si es necesario
      if (response.nextState) {
        conversation.state = response.nextState;
      }

      // 7. Guardar conversación
      await conversationManager.save(conversation);

      // 8. Detener "escribiendo..."
      await whatsAppClient.sendPresenceUpdate('paused', conversation.chatId);
    } catch (error) {
      logger.error('Error processing message with AI:', error);
      await this.sendErrorMessage(conversation.chatId, whatsAppClient);
    }
  }

  private isGroupEnabled(groupId: string): boolean {
    // Por ahora todos los grupos están habilitados
    // En el futuro se puede hacer más sofisticado
    return true;
  }

  private isAiAllowed(chatId: string, isGroup: boolean): boolean {
    if (config.whatsapp.aiEnabled) {
      return true;
    }

    if (isGroup) {
      return false;
    }

    const raw = chatId.split('@')[0] || '';
    const phone = raw.replace(/[^\d]/g, '');
    return phone === config.whatsapp.aiTestNumber;
  }

  private async notifyHumanAgent(
    conversation: Conversation,
    message: string
  ): Promise<void> {
    logger.info(
      `New message for human agent in conversation ${conversation.chatId}: ${message}`
    );
    // Aquí iría lógica para notificar a un asesor humano
    // Por ejemplo, enviar webhook, email, etc.
  }

  private async sendErrorMessage(chatId: string, whatsAppClient: any): Promise<void> {
    try {
      await whatsAppClient.sendMessage(chatId, {
        text: 'Disculpa, tuve un problema procesando tu mensaje. ¿Podrías repetirlo?',
      });
    } catch (error) {
      logger.error('Error sending error message:', error);
    }
  }
}

export default new MessageListener();
