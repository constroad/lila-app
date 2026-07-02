import { Router } from 'express';
import multer from 'multer';
// 🔄 USING SIMPLE CONTROLLER (notifications approach)
import * as messageController from '../controllers/message.controller.simple.js';
import {
  requireTenantOrApiKey,
  requireSenderOwnership,
} from '../../middleware/tenant.middleware.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Todo envío requiere identidad. JWT y API keys tenant quedan limitados al sender
// configurado de su empresa. El secreto global permanece para administración legacy.
const messageAuth = requireTenantOrApiKey;

// POST /api/messages/:sessionPhone/text - Enviar mensaje de texto
router.post(
  '/:sessionPhone/text',
  messageAuth,
  requireSenderOwnership,
  messageController.sendTextMessage
);

// POST /api/messages/:sessionPhone/image - Enviar imagen (Multi-tenant + Quotas)
router.post(
  '/:sessionPhone/image',
  messageAuth,
  requireSenderOwnership,
  upload.single('file'),
  messageController.sendImage
);

// POST /api/messages/:sessionPhone/video
router.post(
  '/:sessionPhone/video',
  messageAuth,
  requireSenderOwnership,
  upload.single('file'),
  messageController.sendVideo
);

// POST /api/messages/:sessionPhone/file
router.post(
  '/:sessionPhone/file',
  messageAuth,
  requireSenderOwnership,
  upload.single('file'),
  messageController.sendFile
);

// DISABLED: Simple controller doesn't have these endpoints
// If needed, can be added later from old controller
// GET /api/messages/:sessionPhone/:chatId - Obtener conversación específica
// router.get('/:sessionPhone/:chatId', messageController.getConversation);

// GET /api/messages/:sessionPhone - Obtener todas las conversaciones de una sesión
// router.get('/:sessionPhone', messageController.getAllConversations);

// DELETE /api/messages/:sessionPhone/:chatId - Cerrar conversación
// router.delete('/:sessionPhone/:chatId', messageController.closeConversation);

// POST /api/messages/:sessionPhone/poll - Enviar encuesta (Fase 11)
// router.post('/:sessionPhone/poll', messageController.sendPoll);

// POST /api/messages/:sessionPhone/menu - Enviar menú de texto (Fase 11)
// router.post('/:sessionPhone/menu', messageController.sendTextMenu);

export default router;
