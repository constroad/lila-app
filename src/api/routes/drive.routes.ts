import { Router } from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
import {
  createFolder,
  deleteEntry,
  getInfo,
  listEntries,
  moveEntry,
  uploadFile,
} from '../controllers/drive.controller.js';
import {
  getPdfMetadata,
  getPdfPageImage,
  getPdfPagePreviewGrid,
} from '../controllers/drive-pdf.controller.js';
import { config } from '../../config/environment.js';
import { requireTenant } from '../../middleware/tenant.middleware.js';
import { requireStorageQuota } from '../../middleware/quota.middleware.js';
import { uploadRateLimiter } from '../../middleware/company-rate-limiter.middleware.js';

const router = Router();
const MAX_DRIVE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const tempDir = path.join(config.storage.root, 'temp', 'uploads');
fs.ensureDirSync(tempDir);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tempDir),
    filename: (_req, file, cb) => {
      const safeName = `${Date.now()}-${file.originalname}`;
      cb(null, safeName);
    },
  }),
  limits: { fileSize: MAX_DRIVE_BYTES },
});

// Multi-tenant routes (require JWT authentication + quotas)
router.get('/list', requireTenant, listEntries);
router.get('/info', requireTenant, getInfo);
router.post('/folders', requireTenant, createFolder);
router.post('/files', requireTenant, uploadRateLimiter, upload.single('file'), requireStorageQuota, uploadFile);
router.delete('/entry', requireTenant, deleteEntry);
router.patch('/move', requireTenant, moveEntry);
router.get('/pdf/info', requireTenant, getPdfMetadata);
router.get('/pdf/page', requireTenant, getPdfPageImage);
router.get('/pdf/preview-grid', requireTenant, getPdfPagePreviewGrid);

export default router;
