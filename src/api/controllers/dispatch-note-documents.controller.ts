import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import {
  generateDispatchNoteDocumentFile,
  previewDispatchNoteDocument as previewDispatchNoteDocumentFile,
} from '../../services/dispatch-note-document.service.js';

function resolveProto(req: Request): string {
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0];
  }
  return req.protocol;
}

function buildAbsoluteBaseUrl(req: Request) {
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return '';
  return `${resolveProto(req)}://${host}`;
}

export async function previewDispatchNoteDocument(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  try {
    const data = await previewDispatchNoteDocumentFile({
      companyId: (req as any).companyId,
      baseUrl: buildAbsoluteBaseUrl(req),
      payload: req.body,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('dispatch_note_documents.preview.failed', {
      error,
      durationMs: Date.now() - startedAt,
    });
    next(error);
  }
}

export async function generateDispatchNoteDocument(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  try {
    const data = await generateDispatchNoteDocumentFile({
      companyId: (req as any).companyId,
      baseUrl: buildAbsoluteBaseUrl(req),
      payload: req.body,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        pdfUrl: data.pdfUrl,
        pdfUrlAbsolute: data.pdfUrlAbsolute,
        totalPages: data.totalPages,
        sizeBytes: data.sizeBytes,
        relativeDir: data.relativeDir,
      },
    });
  } catch (error) {
    logger.error('dispatch_note_documents.generate.failed', {
      error,
      durationMs: Date.now() - startedAt,
    });
    next(error);
  }
}
