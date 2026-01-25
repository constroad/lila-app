import { Router } from 'express';
import multer from 'multer';
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

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.drive.maxFileSizeMb * 1024 * 1024 },
});

router.get('/list', listEntries);
router.get('/info', getInfo);
router.post('/folders', createFolder);
router.post('/files', upload.single('file'), uploadFile);
router.delete('/entry', deleteEntry);
router.patch('/move', moveEntry);
router.get('/pdf/info', getPdfMetadata);
router.get('/pdf/page', getPdfPageImage);
router.get('/pdf/preview-grid', getPdfPagePreviewGrid);

export default router;
