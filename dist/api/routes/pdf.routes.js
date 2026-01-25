import { Router } from 'express';
import * as pdfController from '../controllers/pdf.controller';
const router = Router();
// POST /api/pdf/generate - Generar PDF desde template
router.post('/generate', pdfController.generatePDF);
// POST /api/pdf/templates - Crear nuevo template
router.post('/templates', pdfController.createTemplate);
// GET /api/pdf/templates - Listar templates
router.get('/templates', pdfController.listTemplates);
// DELETE /api/pdf/templates/:templateId - Eliminar template
router.delete('/templates/:templateId', pdfController.deleteTemplate);
export default router;
//# sourceMappingURL=pdf.routes.js.map