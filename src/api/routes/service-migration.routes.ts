import { Router } from 'express';
import { requireTenant } from '../../middleware/tenant.middleware.js';
import { createServiceMigration } from '../controllers/service-migration.controller.js';

const router = Router();

router.post('/', requireTenant, createServiceMigration);

export default router;
