import { Router } from 'express';
import multer from 'multer';
// 🔄 USING SIMPLE CONTROLLER (notifications approach)
import * as messageController from '../controllers/message.controller.simple.js';
import { messageLimiter } from '../middlewares/rateLimiter.js';
import { requireTenant } from '../../middleware/tenant.middleware.js';
import { requireWhatsAppQuota } from '../../middleware/quota.middleware.js';
import { whatsappRateLimiter } from '../../middleware/company-rate-limiter.middleware.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// POST /api/messages - Enviar mensaje (legacy, sin multi-tenant)
// DISABLED: Simple controller doesn't have sendMessage (use /:sessionPhone/text instead)
// router.post('/', messageLimiter, messageController.sendMessage);

// POST /api/messages/:sessionPhone/text - Enviar mensaje de texto (Multi-tenant + Quotas)
// 🧪 TESTING MODE: Middlewares deshabilitados
router.post(
  '/:sessionPhone/text',
  // requireTenant,
  // whatsappRateLimiter,
  // requireWhatsAppQuota,
  messageController.sendTextMessage
);

// POST /api/messages/:sessionPhone/image - Enviar imagen (Multi-tenant + Quotas)
// 🧪 TESTING MODE: Middlewares deshabilitados
router.post(
  '/:sessionPhone/image',
  // requireTenant,
  // whatsappRateLimiter,
  // requireWhatsAppQuota,
  upload.single('file'),
  messageController.sendImage
);

// POST /api/messages/:sessionPhone/video - Enviar video (Multi-tenant + Quotas)
// 🧪 TESTING MODE: Middlewares deshabilitados
router.post(
  '/:sessionPhone/video',
  // requireTenant,
  // whatsappRateLimiter,
  // requireWhatsAppQuota,
  upload.single('file'),
  messageController.sendVideo
);

// POST /api/messages/:sessionPhone/file - Enviar archivo (Multi-tenant + Quotas)
// 🧪 TESTING MODE: Middlewares deshabilitados
router.post(
  '/:sessionPhone/file',
  // requireTenant,
  // whatsappRateLimiter,
  // requireWhatsAppQuota,
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
