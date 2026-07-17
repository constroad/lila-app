import { Router } from 'express';
import { requireTenant } from '../../middleware/tenant.middleware.js';
import { triggerAcademyTranscode } from '../controllers/academy.controller.js';

/**
 * Academia / Material Didáctico — transcode de tutoriales. Portal (super-admin)
 * llama con JWT de `academia`. Ver Portal/specs/ACADEMY-TUTORIALS.as-is.md §4/§7.
 */
const router = Router();

router.post('/transcode', requireTenant, triggerAcademyTranscode);

export default router;
