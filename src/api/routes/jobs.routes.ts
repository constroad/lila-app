import { Router } from 'express';
import * as jobsController from '../controllers/jobs.controller.js';
import { jobsLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// POST /api/jobs - Crear nuevo cron job
router.post('/', jobsLimiter, jobsController.createJob);

// GET /api/jobs - Obtener todos los jobs
router.get('/', jobsController.getAllJobs);

// GET /api/jobs/:id - Obtener job específico
router.get('/:id', jobsController.getJob);

// PATCH /api/jobs/:id - Actualizar job
router.patch('/:id', jobsController.updateJob);

// PUT /api/jobs/:id - Actualizar job (compat)
router.put('/:id', jobsController.updateJob);

// DELETE /api/jobs/:id - Eliminar job
router.delete('/:id', jobsController.deleteJob);

// POST /api/jobs/:id/run - Ejecutar job inmediatamente
router.post('/:id/run', jobsController.runJobNow);

export default router;
