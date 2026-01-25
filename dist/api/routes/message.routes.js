import { Router } from 'express';
import * as messageController from '../controllers/message.controller';
import { messageLimiter } from '../middlewares/rateLimiter';
const router = Router();
// POST /api/messages - Enviar mensaje
router.post('/', messageLimiter, messageController.sendMessage);
// GET /api/messages/:sessionPhone/:chatId - Obtener conversación específica
router.get('/:sessionPhone/:chatId', messageController.getConversation);
// GET /api/messages/:sessionPhone - Obtener todas las conversaciones de una sesión
router.get('/:sessionPhone', messageController.getAllConversations);
// DELETE /api/messages/:sessionPhone/:chatId - Cerrar conversación
router.delete('/:sessionPhone/:chatId', messageController.closeConversation);
export default router;
//# sourceMappingURL=message.routes.js.map