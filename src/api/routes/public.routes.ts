import { Router } from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
import {
  getCompanyLogin,
  submitPublicFinancialMovement,
  submitPublicReception,
} from '../controllers/public.controller.js';
import { requireTenant } from '../../middleware/tenant.middleware.js';
import { config } from '../../config/environment.js';

const router = Router();
const receptionUploadsDir = path.join(config.storage.root, 'temp', 'public-receptions');

fs.ensureDirSync(receptionUploadsDir);

const sanitizeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'upload';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, receptionUploadsDir);
    },
    filename: (_req, file, callback) => {
      const fileName = `${Date.now()}-${sanitizeFileName(file.originalname)}`;
      callback(null, fileName);
    },
  }),
  limits: {
    fileSize: 18 * 1024 * 1024,
    files: 6,
  },
});

router.get('/company-login', getCompanyLogin);
router.post('/receptions', requireTenant, upload.array('files', 6), submitPublicReception);
router.post(
  '/financial-movements',
  requireTenant,
  upload.array('files', 4),
  submitPublicFinancialMovement
);

export default router;
