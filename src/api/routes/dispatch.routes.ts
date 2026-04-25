import { Router } from 'express';
import { requireTenant } from '../../middleware/tenant.middleware.js';
import * as dispatchController from '../controllers/dispatch.controller.js';

const router = Router();

router.post('/generate-vale', requireTenant, dispatchController.generateValeAndNotify);
router.post(
  '/complete-post-process',
  requireTenant,
  dispatchController.enqueueDispatchPostProcess
);

export default router;
