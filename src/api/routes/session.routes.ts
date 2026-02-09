import { Router } from 'express';
// 🔄 USING SIMPLE CONTROLLER (notifications approach)
import * as sessionController from '../controllers/session.controller.simple.js';
import { sessionLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// GET /api/sessions/list - Obtener todas las sesiones
router.get('/list', sessionController.listActiveSessions);

// POST /api/sessions - Crear nueva sesión WhatsApp (QR method)
// 🧪 TESTING MODE: Middlewares deshabilitados
router.post('/', /* sessionLimiter, */ sessionController.createSession);

// GET /api/sessions/:phoneNumber/qr - Obtener QR como imagen PNG
router.get('/:phoneNumber/qr', sessionController.getQRCodeImage);

// POST /api/sessions/:phoneNumber/request-pairing-code - Solicitar código de emparejamiento
// 🧪 TESTING MODE: Middlewares deshabilitados
router.post('/:phoneNumber/request-pairing-code', /* sessionLimiter, */ sessionController.createPairingSessionHandler);

// GET /api/sessions/:phoneNumber/status - Obtener estado de sesión
router.get('/:phoneNumber/status', sessionController.getSessionStatus);

// POST /api/sessions/:phoneNumber/logout - Cerrar sesión activa
router.post('/:phoneNumber/logout', sessionController.logoutSession);

// DISABLED: Simple controller doesn't have clearSession (use logout/disconnect)
// router.post('/:phoneNumber/clear', sessionController.clearSession);

// GET /api/sessions/:phoneNumber/groups - Listar grupos de WhatsApp
router.get('/:phoneNumber/groups', sessionController.getGroupList);

// GET /api/sessions/:phoneNumber/syncGroups - Sincronizar grupos de WhatsApp
router.get('/:phoneNumber/syncGroups', sessionController.syncGroups);

// GET /api/sessions/:phoneNumber/contacts - Listar contactos de WhatsApp
router.get('/:phoneNumber/contacts', sessionController.getContactsHandler);

// DELETE /api/sessions/:phoneNumber - Desconectar sesión
router.delete('/:phoneNumber', sessionController.disconnectSession);

// DISABLED: Simple controller doesn't have backup features
// router.post('/:phoneNumber/restore', sessionController.restoreSessionFromBackup);
// router.get('/:phoneNumber/backups', sessionController.listSessionBackups);
// router.post('/:phoneNumber/reset-reconnect', sessionController.resetReconnectState);

// GET /api/sessions - Obtener todas las sesiones
router.get('/', sessionController.getAllSessions);

export default router;
