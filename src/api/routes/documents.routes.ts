import { Router } from 'express';
import * as documentsController from '../controllers/documents.controller.js';
import * as quoteDocumentsController from '../controllers/quote-documents.controller.js';
import * as purchaseOrderDocumentsController from '../controllers/purchase-order-documents.controller.js';
import * as dispatchNoteDocumentsController from '../controllers/dispatch-note-documents.controller.js';
import * as workCertificateDocumentsController from '../controllers/work-certificate-documents.controller.js';
import { optionalTenant, requireTenant } from '../../middleware/tenant.middleware.js';
import { heavyRequestGuard } from '../middlewares/heavyLoad.js';

const router = Router();

// Los render de documentos (Puppeteer) requieren tenant: Portal SIEMPRE llama con
// JWT server-to-server (proxy admin `documents/[...path]` y rutas públicas que
// mintean `generateLilaAppToken`). `heavyRequestGuard` acota la concurrencia
// total (tope de cola → 503 si saturado) y protege la memoria de la Mac mini.
router.get('/schemas', documentsController.getSchemas);
router.get('/schemas/:code', documentsController.getSchema);
router.post('/generate', requireTenant, heavyRequestGuard, documentsController.generateDocument);
router.post('/preview', requireTenant, heavyRequestGuard, documentsController.previewDocument);
router.post('/quotes/asphalt/preview', requireTenant, heavyRequestGuard, quoteDocumentsController.previewAsphaltQuoteDocument);
router.post('/quotes/asphalt/generate', requireTenant, heavyRequestGuard, quoteDocumentsController.generateAsphaltQuoteDocument);
router.post('/quotes/service/preview', requireTenant, heavyRequestGuard, quoteDocumentsController.previewServiceQuoteDocument);
router.post('/quotes/service/generate', requireTenant, heavyRequestGuard, quoteDocumentsController.generateServiceQuoteDocument);
router.post('/purchase-orders/preview', requireTenant, heavyRequestGuard, purchaseOrderDocumentsController.previewPurchaseOrderDocument);
router.post('/purchase-orders/generate', requireTenant, heavyRequestGuard, purchaseOrderDocumentsController.generatePurchaseOrderDocument);
router.post('/dispatch-notes/preview', requireTenant, heavyRequestGuard, dispatchNoteDocumentsController.previewDispatchNoteDocument);
router.post('/dispatch-notes/generate', requireTenant, heavyRequestGuard, dispatchNoteDocumentsController.generateDispatchNoteDocument);
router.post('/work-certificates/preview', requireTenant, heavyRequestGuard, workCertificateDocumentsController.previewWorkCertificateDocument);
router.get('/report-data/:serviceId/:type', optionalTenant, documentsController.getReportData);
router.post('/sandbox/random-data', optionalTenant, documentsController.generateRandomData);
router.get('/:id', documentsController.getDocument);
router.get('/:id/download', documentsController.downloadDocument);

export default router;
