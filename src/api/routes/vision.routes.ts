import { Router } from 'express';
import { readWeighNote } from '../controllers/vision.controller.js';
import { requireTenant } from '../../middleware/tenant.middleware.js';
import { strictRateLimiter } from '../../middleware/company-rate-limiter.middleware.js';

const router = Router();

/**
 * Lectura de tickets de balanza por LLM (Flota §11.3-11).
 *
 * `requireTenant` primero: es una ruta de ADMIN (Portal llama con el JWT
 * compartido), nunca pública — cada lectura cuesta tokens y un endpoint abierto
 * sería una factura abierta. El rate limiter estricto va después para que tenga
 * `companyId` y el tope sea POR EMPRESA.
 */
router.post('/weigh-note', requireTenant, strictRateLimiter, readWeighNote);

export default router;
