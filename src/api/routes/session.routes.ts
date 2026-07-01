import { Router } from 'express';
// 🔄 USING SIMPLE CONTROLLER (notifications approach)
import * as sessionController from '../controllers/session.controller.simple.js';
import {
  requireTenantOrApiKey,
  guardSharedSenderDestructive,
} from '../../middleware/tenant.middleware.js';

const router = Router();

// Endpoints destructivos / state-changing aceptan auth de tenant (JWT de Portal o
// API key `lk_fe_...`) y, por compatibilidad, la API key global `x-api-key`.
// Los GET de sólo-lectura (/list, /status, /groups, /contacts) quedan abiertos para
// no romper consumidores existentes; protegerlos puede hacerse en un follow-up.

// GET /api/sessions/list - Obtener todas las sesiones
router.get('/list', sessionController.listActiveSessions);

// POST /api/sessions - Crear nueva sesión WhatsApp (QR method)
router.post('/', requireTenantOrApiKey, sessionController.createSession);

// GET /api/sessions/:phoneNumber/qr - Obtener QR como imagen PNG (dispara startSession internamente)
router.get('/:phoneNumber/qr', requireTenantOrApiKey, sessionController.getQRCodeImage);

// POST /api/sessions/:phoneNumber/request-pairing-code - Solicitar código de emparejamiento
router.post('/:phoneNumber/request-pairing-code', requireTenantOrApiKey, sessionController.createPairingSessionHandler);

// GET /api/sessions/:phoneNumber/status - Obtener estado de sesión
router.get('/:phoneNumber/status', sessionController.getSessionStatus);

// POST /api/sessions/:phoneNumber/restart - Reinicio SUAVE (reconecta sin logout, conserva creds).
// Seguro para números compartidos entre companies → alternativa no-destructiva a /clear y /logout.
router.post('/:phoneNumber/restart', requireTenantOrApiKey, sessionController.restartSession);

// POST /api/sessions/:phoneNumber/logout - Cerrar sesión activa (logout en servidor WA → DESTRUCTIVO)
router.post(
  '/:phoneNumber/logout',
  requireTenantOrApiKey,
  guardSharedSenderDestructive,
  sessionController.logoutSession
);

// POST /api/sessions/:phoneNumber/clear - Reset completo (logout + borra creds/store + clear queue → DESTRUCTIVO)
router.post(
  '/:phoneNumber/clear',
  requireTenantOrApiKey,
  guardSharedSenderDestructive,
  sessionController.clearSession
);

// GET /api/sessions/:phoneNumber/groups - Listar grupos de WhatsApp
router.get('/:phoneNumber/groups', sessionController.getGroupList);

// GET /api/sessions/:phoneNumber/syncGroups - Sincronizar grupos de WhatsApp (state-changing)
router.get('/:phoneNumber/syncGroups', requireTenantOrApiKey, sessionController.syncGroups);

// GET /api/sessions/:phoneNumber/contacts - Listar contactos de WhatsApp
router.get('/:phoneNumber/contacts', sessionController.getContactsHandler);

// DELETE /api/sessions/:phoneNumber - Desconectar sesión (logout en servidor WA → DESTRUCTIVO)
router.delete(
  '/:phoneNumber',
  requireTenantOrApiKey,
  guardSharedSenderDestructive,
  sessionController.disconnectSession
);

// DISABLED: Simple controller doesn't have backup features
// router.post('/:phoneNumber/restore', sessionController.restoreSessionFromBackup);
// router.get('/:phoneNumber/backups', sessionController.listSessionBackups);
// router.post('/:phoneNumber/reset-reconnect', sessionController.resetReconnectState);

// GET /api/sessions - Obtener todas las sesiones
router.get('/', sessionController.getAllSessions);

export default router;
