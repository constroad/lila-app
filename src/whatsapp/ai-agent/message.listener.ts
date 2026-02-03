import logger from '../../utils/logger.js';
import agentService from './agent.service.js';
import conversationManager from './conversation.manager.js';
import typingSimulator from './typing-simulator.js';
import { WhatsAppMessage, Conversation } from '../../types/index.js';
import { config } from '../../config/environment.js';
import { sendClientReportAction } from '../../services/portal-actions.service.js';
import { quotaValidatorService } from '../../services/quota-validator.service.js';

export class MessageListener {
  private activeConversations: Map<string, Conversation> = new Map();
  private companySettingsCache: Map<string, { aiEnabled: boolean; updatedAt: number }> = new Map();

  async handleIncomingMessage(
    message: WhatsAppMessage,
    sessionPhone: string,
    whatsAppClient: any
  ): Promise<void> {
    try {
      // 1. Filtrar mensajes propios
      if (message.key.fromMe) {
        return;
      }

      // 2. Extraer información del remitente y texto (incluye wrappers ephemeral/viewOnce)
      const chatId = message.key.remoteJid;
      const { text: messageText, quotedText } = this.extractMessageText(message);

      if (!messageText.trim()) {
        logger.debug(`Skipping non-text message from ${chatId}`);
        return;
      }

      // 4. Ignorar si es un grupo y el bot no está habilitado
      const isGroup = chatId.endsWith('@g.us');
      if (isGroup && !this.isGroupEnabled(chatId)) {
        logger.debug(`Group ${chatId} not enabled for bot`);
        return;
      }

      // 4.1 Acciones internas (client-report)
      const actionHandled = await this.handleClientReportAction(
        messageText,
        quotedText,
        chatId,
        sessionPhone,
        whatsAppClient
      );
      if (actionHandled) {
        return;
      }

      const hasAnthropicKey = Boolean(config.anthropic?.apiKey);
      const aiEnabled = await this.isAiEnabledForSession(sessionPhone);
      if (!aiEnabled || !hasAnthropicKey) {
        return;
      }

      // 4.2 Respetar modo IA desactivado o modo prueba
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
    return !isGroup;
  }

  private async isAiEnabledForSession(sessionPhone: string): Promise<boolean> {
    const cacheKey = sessionPhone;
    const cached = this.companySettingsCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.updatedAt < 5 * 60 * 1000) {
      return cached.aiEnabled;
    }

    try {
      const company = await quotaValidatorService.getCompanyByWhatsappSender(sessionPhone);
      const enabled = Boolean(company?.whatsappConfig?.aiEnabled);
      this.companySettingsCache.set(cacheKey, { aiEnabled: enabled, updatedAt: now });
      return enabled;
    } catch (error) {
      return false;
    }
  }

  private parseActionCommand(messageText: string, quotedText?: string): { action: string; token: string } | null {
    const trimmed = messageText.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/\s+/);

    const actionRaw = parts[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
    const rawToken = parts.length > 1 ? parts.slice(1).join('').trim() : '';

    const extractTokenFromText = (text: string): string => {
      const matchCode = text.match(/ACT-[A-Z0-9]{4,10}/i);
      if (matchCode?.[0]) return matchCode[0].toUpperCase();
      const matchSigned = text.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
      if (matchSigned?.[0]) return matchSigned[0];
      return '';
    };

    const tokenFromQuoted = quotedText ? extractTokenFromText(quotedText) : '';
    const tokenFromMessage = rawToken
      ? extractTokenFromText(rawToken) || rawToken
      : extractTokenFromText(trimmed);
    const rawTokenValue = tokenFromMessage || tokenFromQuoted || '';
    const hasSignature = rawTokenValue.includes('.');
    const normalizedToken = hasSignature ? rawTokenValue : rawTokenValue.toUpperCase();
    const isShortCode = !hasSignature && /^[A-Z0-9]{2,5}-[A-Z0-9]{4,10}$/.test(normalizedToken);

    const map: Record<string, string> = {
      '1': 'approve-send',
      'aprobar': 'approve-send',
      'aprobado': 'approve-send',
      'enviar': 'approve-send',
      'send': 'approve-send',
      '2': 'approve-only',
      'generar': 'approve-only',
      'admin': 'approve-only',
      'solo': 'approve-only',
      '3': 'reject',
      'rechazar': 'reject',
      'rechazo': 'reject',
      'cancelar': 'reject',
    };

    const action = map[actionRaw];

    if (normalizedToken && (hasSignature || isShortCode)) {
      if (action) {
        return { action, token: normalizedToken };
      }
      return { action: 'approve-send', token: normalizedToken };
    }

    if (!rawTokenValue && action && tokenFromQuoted) {
      return { action, token: tokenFromQuoted };
    }

    if (!rawTokenValue && action && parts.length === 1) {
      return { action, token: '' };
    }

    return null;
  }

  private async handleClientReportAction(
    messageText: string,
    quotedText: string,
    chatId: string,
    sessionPhone: string,
    whatsAppClient: any
  ): Promise<boolean> {
    const parsed = this.parseActionCommand(messageText, quotedText);
    if (!parsed) return false;

    const isGroup = chatId.endsWith('@g.us');
    if (!isGroup) {
      await whatsAppClient.sendMessage(chatId, {
        text: '🤖 ConstRoadBot\n\nEsta acción solo puede ejecutarse desde el grupo administrador.',
      });
      return true;
    }

    try {
      const result = await sendClientReportAction(parsed.action, parsed.token, chatId);
      const actionLabels: Record<string, string> = {
        'approve-send': 'Aprobar y enviar',
        'approve-only': 'Generar solo admin',
        'reject': 'Rechazar',
      };
      const actionLabel = actionLabels[parsed.action] ?? parsed.action;
      const codeLine = result?.actionCode ? `Código: ${result.actionCode}\n` : '';
      const clientLine = result?.clientName ? `Cliente: ${result.clientName}\n` : '';
      const orderLine = result?.orderLabel ? `Pedido: ${result.orderLabel}\n` : '';
      await whatsAppClient.sendMessage(chatId, {
        text: `🤖 ConstRoadBot\n\nAcción: ${actionLabel}\n${codeLine}${clientLine}${orderLine}Estado: ${result?.status ?? 'ok'}\n${result?.linkUrl ? `Link: ${result.linkUrl}` : ''}`,
      });
      logger.info(`Client report action handled for ${chatId}`);
      return true;
    } catch (error: any) {
      logger.error('Error handling client report action:', error);
      const status = error?.response?.status;
      let message = 'No se pudo procesar la acción.';
      if (status === 400) {
        message = 'Código inválido o incompleto.';
      } else if (status === 401) {
        message = 'Acción no autorizada.';
      } else if (status === 403) {
        message = 'Este grupo no está autorizado para procesar solicitudes.';
      } else if (status === 404) {
        message = 'No hay solicitudes pendientes para este grupo.';
      } else if (status === 409) {
        message = 'Esta solicitud ya fue atendida.';
      } else if (status === 410) {
        message = 'Esta solicitud ya expiró. Solicita un nuevo enlace.';
      }
      await whatsAppClient.sendMessage(chatId, {
        text: `🤖 ConstRoadBot\n\n${message}`.trim(),
      });
      return true;
    }
  }

  private extractMessageText(message: WhatsAppMessage): { text: string; quotedText: string } {
    const unwrapContent = (content: any): any => {
      let current = content;
      for (let i = 0; i < 4; i += 1) {
        if (current?.ephemeralMessage?.message) {
          current = current.ephemeralMessage.message;
          continue;
        }
        if (current?.viewOnceMessage?.message) {
          current = current.viewOnceMessage.message;
          continue;
        }
        if (current?.viewOnceMessageV2?.message) {
          current = current.viewOnceMessageV2.message;
          continue;
        }
        if (current?.viewOnceMessageV2Extension?.message) {
          current = current.viewOnceMessageV2Extension.message;
          continue;
        }
        break;
      }
      return current;
    };

    const extractText = (content: any): string => {
      if (!content || typeof content !== 'object') return '';
      return (
        content.conversation ||
        content.extendedTextMessage?.text ||
        content.imageMessage?.caption ||
        content.videoMessage?.caption ||
        content.documentMessage?.caption ||
        content.buttonsResponseMessage?.selectedButtonId ||
        content.buttonsResponseMessage?.selectedDisplayText ||
        content.listResponseMessage?.title ||
        content.listResponseMessage?.singleSelectReply?.selectedRowId ||
        ''
      );
    };

    const content = unwrapContent(message.message);
    const text = extractText(content);

    const contextInfo =
      content?.extendedTextMessage?.contextInfo ||
      content?.buttonsResponseMessage?.contextInfo ||
      content?.listResponseMessage?.contextInfo;
    const quoted = unwrapContent(contextInfo?.quotedMessage);
    const quotedText = extractText(quoted);

    return { text, quotedText };
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
