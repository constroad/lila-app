import { Router } from 'express';
import { checkGpsToken, ingestGpsPositions } from '../controllers/gps.controller.js';
import { requireGpsToken } from '../../middleware/gps-token.middleware.js';
import { generousRateLimiter } from '../../middleware/company-rate-limiter.middleware.js';

const router = Router();

/**
 * Ingest del rastro GPS del proveedor de hardware (Flota F4 §3.4).
 *
 * `requireGpsToken` va PRIMERO para que el rate limiter tenga `companyId`: sin él
 * el limitador se saltea (está keyeado por empresa) y un equipo mal configurado
 * podría golpear sin techo. 200/min por empresa da holgura de sobra — 20 unidades
 * reportando cada minuto son 20 requests, y en lote uno solo.
 */
router.get('/check', requireGpsToken, checkGpsToken);
router.post('/positions', requireGpsToken, generousRateLimiter, ingestGpsPositions);

export default router;
