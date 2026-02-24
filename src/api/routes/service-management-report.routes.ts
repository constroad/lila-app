import { Router } from 'express';
import * as reportController from '../controllers/service-management-report.controller.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';

const router = Router();

router.get('/', reportController.listReports);
router.post('/', requireAdmin, reportController.createReport);
router.get('/:id', reportController.getReport);
router.put('/:id', requireAdmin, reportController.updateReport);
router.delete('/:id', requireAdmin, reportController.deleteReport);
router.post('/:id/lock', requireAdmin, reportController.acquireLock);
router.post('/:id/unlock', requireAdmin, reportController.releaseLock);
router.post('/:id/heartbeat', requireAdmin, reportController.heartbeatLock);

export default router;
