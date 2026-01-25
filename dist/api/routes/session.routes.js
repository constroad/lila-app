import { Router } from 'express';
import * as sessionController from '../controllers/session.controller';
import { sessionLimiter } from '../middlewares/rateLimiter';
const router = Router();
// POST /api/sessions - Crear nueva sesión WhatsApp
router.post('/', sessionLimiter, sessionController.createSession);
// GET /api/sessions/:phoneNumber/status - Obtener estado de sesión
router.get('/:phoneNumber/status', sessionController.getSessionStatus);
// DELETE /api/sessions/:phoneNumber - Desconectar sesión
router.delete('/:phoneNumber', sessionController.disconnectSession);
// GET /api/sessions - Obtener todas las sesiones
router.get('/', sessionController.getAllSessions);
export default router;
//# sourceMappingURL=session.routes.js.map