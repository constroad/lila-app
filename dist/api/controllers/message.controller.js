import connectionManager from '../../whatsapp/baileys/connection.manager';
import conversationManager from '../../whatsapp/ai-agent/conversation.manager';
import logger from '../../utils/logger';
import { HTTP_STATUS } from '../../config/constants';
export async function sendMessage(req, res, next) {
    try {
        const { sessionPhone, chatId, message } = req.body;
        if (!sessionPhone || !chatId || !message) {
            const error = new Error('sessionPhone, chatId, and message are required');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            return next(error);
        }
        const socket = connectionManager.getConnection(sessionPhone);
        if (!socket) {
            const error = new Error('Session not connected');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            return next(error);
        }
        await socket.sendMessage(chatId, { text: message });
        logger.info(`Message sent to ${chatId} via ${sessionPhone}`);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'Message sent successfully',
        });
    }
    catch (error) {
        next(error);
    }
}
export async function getConversation(req, res, next) {
    try {
        const { sessionPhone, chatId } = req.params;
        if (!sessionPhone || !chatId) {
            const error = new Error('sessionPhone and chatId are required');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            return next(error);
        }
        const conversation = await conversationManager.get(chatId, sessionPhone);
        if (!conversation) {
            const error = new Error('Conversation not found');
            error.statusCode = HTTP_STATUS.NOT_FOUND;
            return next(error);
        }
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: conversation,
        });
    }
    catch (error) {
        next(error);
    }
}
export async function getAllConversations(req, res, next) {
    try {
        const { sessionPhone } = req.params;
        if (!sessionPhone) {
            const error = new Error('sessionPhone is required');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            return next(error);
        }
        const conversations = await conversationManager.getAllForSession(sessionPhone);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                total: conversations.length,
                conversations,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
export async function closeConversation(req, res, next) {
    try {
        const { sessionPhone, chatId } = req.params;
        if (!sessionPhone || !chatId) {
            const error = new Error('sessionPhone and chatId are required');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            return next(error);
        }
        await conversationManager.closeConversation(chatId, sessionPhone);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'Conversation closed',
        });
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=message.controller.js.map