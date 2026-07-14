import { Router } from 'express';
// 🔄 USING SIMPLE CONTROLLER (notifications approach)
import * as sessionController from '../controllers/session.controller.simple.js';
import {
  requireTenantOrApiKey,
  requireSessionOwnership,
  guardSharedSenderDestructive,
} from '../../middleware/tenant.middleware.js';

const router = Router();

// TODOS los endpoints exigen auth de tenant (JWT de Portal o API key `lk_fe_...`) o,
// por compatibilidad, la API key global `x-api-key`. Los que operan un número concreto
// exigen además que el tenant sea dueño del sender (`requireSessionOwnership`): sin eso,
// cualquier tenant podía pedir el QR de un sender ajeno (account takeover), reiniciarle
// la sesión (DoS) o volcar sus grupos/contactos — con lila expuesta por HTTPS público,
// las lecturas sin auth eran un volcado de PII abierto a internet (hardening 2026-07-13).

// GET /api/sessions/list - Obtener todas las sesiones
router.get('/list', requireTenantOrApiKey, sessionController.listActiveSessions);

// POST /api/sessions - Crear nueva sesión WhatsApp (QR method; phoneNumber va en el body)
router.post('/', requireTenantOrApiKey, requireSessionOwnership, sessionController.createSession);

// GET /api/sessions/:phoneNumber/qr - Obtener QR como imagen PNG (dispara startSession internamente)
// El QR ES la credencial de emparejamiento: solo el dueño del número puede verlo.
router.get(
  '/:phoneNumber/qr',
  requireTenantOrApiKey,
  requireSessionOwnership,
  sessionController.getQRCodeImage
);

// POST /api/sessions/:phoneNumber/request-pairing-code - Solicitar código de emparejamiento
router.post(
  '/:phoneNumber/request-pairing-code',
  requireTenantOrApiKey,
  requireSessionOwnership,
  sessionController.createPairingSessionHandler
);

// GET /api/sessions/:phoneNumber/status - Obtener estado de sesión
router.get(
  '/:phoneNumber/status',
  requireTenantOrApiKey,
  requireSessionOwnership,
  sessionController.getSessionStatus
);

// POST /api/sessions/:phoneNumber/restart - Reinicio SUAVE (reconecta sin logout, conserva creds).
// Seguro para números compartidos entre companies → alternativa no-destructiva a /clear y /logout.
router.post(
  '/:phoneNumber/restart',
  requireTenantOrApiKey,
  requireSessionOwnership,
  sessionController.restartSession
);

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
router.get(
  '/:phoneNumber/groups',
  requireTenantOrApiKey,
  requireSessionOwnership,
  sessionController.getGroupList
);

// GET /api/sessions/:phoneNumber/syncGroups - Sincronizar grupos de WhatsApp (state-changing)
router.get(
  '/:phoneNumber/syncGroups',
  requireTenantOrApiKey,
  requireSessionOwnership,
  sessionController.syncGroups
);

// GET /api/sessions/:phoneNumber/contacts - Listar contactos de WhatsApp
router.get(
  '/:phoneNumber/contacts',
  requireTenantOrApiKey,
  requireSessionOwnership,
  sessionController.getContactsHandler
);

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
router.get('/', requireTenantOrApiKey, sessionController.getAllSessions);

export default router;
