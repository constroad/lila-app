import { Router } from 'express';
// 🔄 USING SIMPLE CONTROLLER (notifications approach)
import * as sessionController from '../controllers/session.controller.simple.js';
import { validateApiKey } from '../middlewares/errorHandler.js';

const router = Router();

// Endpoints destructivos / state-changing requieren x-api-key === API_SECRET_KEY.
// Los GET de sólo-lectura (/list, /status, /groups, /contacts) quedan abiertos para
// no romper consumidores existentes; protegerlos puede hacerse en un follow-up.

// GET /api/sessions/list - Obtener todas las sesiones
router.get('/list', sessionController.listActiveSessions);

// POST /api/sessions - Crear nueva sesión WhatsApp (QR method)
router.post('/', validateApiKey, sessionController.createSession);

// GET /api/sessions/:phoneNumber/qr - Obtener QR como imagen PNG (dispara startSession internamente)
router.get('/:phoneNumber/qr', validateApiKey, sessionController.getQRCodeImage);

// POST /api/sessions/:phoneNumber/request-pairing-code - Solicitar código de emparejamiento
router.post('/:phoneNumber/request-pairing-code', validateApiKey, sessionController.createPairingSessionHandler);

// GET /api/sessions/:phoneNumber/status - Obtener estado de sesión
router.get('/:phoneNumber/status', sessionController.getSessionStatus);

// POST /api/sessions/:phoneNumber/logout - Cerrar sesión activa (logout en servidor WA)
router.post('/:phoneNumber/logout', validateApiKey, sessionController.logoutSession);

// POST /api/sessions/:phoneNumber/clear - Reset completo de sesión (logout + delete files + clear queue)
router.post('/:phoneNumber/clear', validateApiKey, sessionController.clearSession);

// GET /api/sessions/:phoneNumber/groups - Listar grupos de WhatsApp
router.get('/:phoneNumber/groups', sessionController.getGroupList);

// GET /api/sessions/:phoneNumber/syncGroups - Sincronizar grupos de WhatsApp (state-changing)
router.get('/:phoneNumber/syncGroups', validateApiKey, sessionController.syncGroups);

// GET /api/sessions/:phoneNumber/contacts - Listar contactos de WhatsApp
router.get('/:phoneNumber/contacts', sessionController.getContactsHandler);

// DELETE /api/sessions/:phoneNumber - Desconectar sesión (logout en servidor WA)
router.delete('/:phoneNumber', validateApiKey, sessionController.disconnectSession);

// DISABLED: Simple controller doesn't have backup features
// router.post('/:phoneNumber/restore', sessionController.restoreSessionFromBackup);
// router.get('/:phoneNumber/backups', sessionController.listSessionBackups);
// router.post('/:phoneNumber/reset-reconnect', sessionController.resetReconnectState);

// GET /api/sessions - Obtener todas las sesiones
router.get('/', sessionController.getAllSessions);

export default router;
