import { Router } from 'express';
import * as documentsController from '../controllers/documents.controller.js';
import * as quoteDocumentsController from '../controllers/quote-documents.controller.js';
import { optionalTenant } from '../../middleware/tenant.middleware.js';

const router = Router();

router.get('/schemas', documentsController.getSchemas);
router.get('/schemas/:code', documentsController.getSchema);
router.post('/generate', optionalTenant, documentsController.generateDocument);
router.post('/preview', optionalTenant, documentsController.previewDocument);
router.post('/quotes/asphalt/preview', optionalTenant, quoteDocumentsController.previewAsphaltQuoteDocument);
router.post('/quotes/asphalt/generate', optionalTenant, quoteDocumentsController.generateAsphaltQuoteDocument);
router.post('/quotes/service/preview', optionalTenant, quoteDocumentsController.previewServiceQuoteDocument);
router.post('/quotes/service/generate', optionalTenant, quoteDocumentsController.generateServiceQuoteDocument);
router.get('/report-data/:serviceId/:type', optionalTenant, documentsController.getReportData);
router.post('/sandbox/random-data', optionalTenant, documentsController.generateRandomData);
router.get('/:id', documentsController.getDocument);
router.get('/:id/download', documentsController.downloadDocument);

export default router;
