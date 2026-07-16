import { Router } from 'express';
import * as pdfController from '../controllers/pdf.controller.js';
import { generateVale, previewValeTemplateGrid } from '../controllers/pdf-vale.controller.js';
import { downloadPlantSettlementPdf } from '../controllers/plant-dispatch-settlement-document.controller.js';
import { requireTenant } from '../../middleware/tenant.middleware.js';
import { heavyRequestGuard } from '../middlewares/heavyLoad.js';

const router = Router();

// Endpoints Puppeteer: requieren tenant (Portal siempre llama con JWT server-to-
// server) y pasan por el guard de capacidad (tope de cola → 503 si saturado).
// POST /api/pdf/generate - Generar PDF desde template
router.post('/generate', requireTenant, heavyRequestGuard, pdfController.generatePDF);

// POST /api/pdf/generate-vale - Generar vale desde template PDF
router.post('/generate-vale', requireTenant, heavyRequestGuard, generateVale);
router.post('/plant-dispatch-settlement', requireTenant, heavyRequestGuard, downloadPlantSettlementPdf);

// GET /api/pdf/templates/preview-grid - Preview template con grilla
router.get('/templates/preview-grid', requireTenant, heavyRequestGuard, previewValeTemplateGrid);

// POST /api/pdf/templates - Crear nuevo template
router.post('/templates', requireTenant, pdfController.createTemplate);

// GET /api/pdf/templates - Listar templates
router.get('/templates', requireTenant, pdfController.listTemplates);

// DELETE /api/pdf/templates/:templateId - Eliminar template
router.delete('/templates/:templateId', requireTenant, pdfController.deleteTemplate);

export default router;
