import { Router } from 'express';
import multer from 'multer';
// 🔄 USING SIMPLE CONTROLLER (notifications approach)
import * as messageController from '../controllers/message.controller.simple.js';
import {
  requireTenantOrApiKey,
  optionalTenant,
  requireSenderOwnership,
} from '../../middleware/tenant.middleware.js';
import { config } from '../../config/environment.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Auth de envío. Backward-compatible por defecto:
//  - WHATSAPP_RLS_ENFORCE != 'true' → `optionalTenant`: identifica el tenant si viene
//    JWT (mejora el conteo y permite avisar de mismatches) pero NUNCA bloquea.
//  - WHATSAPP_RLS_ENFORCE == 'true' → `requireTenantOrApiKey`: exige JWT de Portal,
//    API key `lk_fe_` (producto) o el secreto global.
// `requireSenderOwnership` valida que el sender pertenezca a la company (solo avisa
// salvo que el flag esté activo). Ver SCALABILITY-MULTI-SESSION.spec §4.
const messageAuth = config.whatsapp.rlsEnforce ? requireTenantOrApiKey : optionalTenant;

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
