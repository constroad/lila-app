import { Router } from 'express';
import { requireTenant } from '../../middleware/tenant.middleware.js';
import * as dispatchController from '../controllers/dispatch.controller.js';
import { postProcess } from '../controllers/dispatch-post-process.controller.js';

const router = Router();

router.post('/generate-vale', requireTenant, dispatchController.generateValeAndNotify);
router.post('/post-process', requireTenant, postProcess);

export default router;
