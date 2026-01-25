import { Router } from 'express';
import multer from 'multer';
import * as messageController from '../controllers/message.controller.js';
import { messageLimiter } from '../middlewares/rateLimiter.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// POST /api/messages - Enviar mensaje
router.post('/', messageLimiter, messageController.sendMessage);

// POST /api/messages/:sessionPhone/text - Enviar mensaje de texto
router.post('/:sessionPhone/text', messageLimiter, messageController.sendTextMessage);

// POST /api/messages/:sessionPhone/image - Enviar imagen
router.post(
  '/:sessionPhone/image',
  messageLimiter,
  upload.single('file'),
  messageController.sendImage
);

// POST /api/messages/:sessionPhone/video - Enviar video
router.post(
  '/:sessionPhone/video',
  messageLimiter,
  upload.single('file'),
  messageController.sendVideo
);

// POST /api/messages/:sessionPhone/file - Enviar archivo
router.post(
  '/:sessionPhone/file',
  messageLimiter,
  upload.single('file'),
  messageController.sendFile
);

// GET /api/messages/:sessionPhone/:chatId - Obtener conversación específica
router.get('/:sessionPhone/:chatId', messageController.getConversation);

// GET /api/messages/:sessionPhone - Obtener todas las conversaciones de una sesión
router.get('/:sessionPhone', messageController.getAllConversations);

// DELETE /api/messages/:sessionPhone/:chatId - Cerrar conversación
router.delete('/:sessionPhone/:chatId', messageController.closeConversation);

export default router;
