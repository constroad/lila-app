import { Router } from 'express';
import { jobsLimiter } from '../middlewares/rateLimiter.js';
import { JobsControllerV2 } from '../controllers/jobs.controller.v2.js';
import jobSchedulerV2 from '../../jobs/scheduler.v2.instance.js';
import { validateCompany } from '../middlewares/validateCompany.middleware.js';
import { validateSender } from '../middlewares/validateSender.middleware.js';

const router = Router();
const controller = new JobsControllerV2(jobSchedulerV2);

router.post('/', jobsLimiter, validateCompany, validateSender, controller.createJob);
router.get('/', controller.listJobs);
router.get('/:id', controller.getJob);
router.patch('/:id', controller.updateJob);
router.put('/:id', controller.updateJob);
router.delete('/:id', controller.deleteJob);
router.post('/:id/run', controller.runJobNow);

export default router;
