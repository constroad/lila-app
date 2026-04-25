import { Router } from 'express';
import { requireTenant } from '../../middleware/tenant.middleware.js';
import * as domainEventsController from '../controllers/domain-events.controller.js';

const router = Router();

router.post('/', requireTenant, domainEventsController.ingestDomainEvent);

export default router;
