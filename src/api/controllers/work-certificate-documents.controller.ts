import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
// `CustomError` es una INTERFAZ, no una clase: se anota un Error normal con su
// `statusCode`. Instanciarla revienta el arranque de lila en tiempo de import.
import type { CustomError } from '../middlewares/errorHandler.js';
import pdfGenerator from '../../pdf/generator.service.js';
import { config } from '../../config/environment.js';
import { PDFMergerService } from '../../services/pdf-merger.service.js';
import { getDocumentLetterhead } from '../../services/document-letterhead.service.js';
import { inlineCanvasHtmlImages } from '../../services/canvas-html-image-inliner.service.js';
import {
  CANVAS_QUOTE_LETTERHEAD_PDF_MARGIN,
  CANVAS_QUOTE_PDF_MARGIN,
} from './quote-documents.helpers.js';

/**
 * PDF de la Constancia de Trabajo (`CONS-TRA`).
 *
 * **Canvas-only, sin fallback.** A diferencia de cotizaciones y órdenes, este
 * tipo nació con el editor canvas: no existe ni existió un renderer Handlebars
 * para él, así que no hay documentos históricos que proteger. Por eso
 * `payload.html` es OBLIGATORIO y su ausencia es un 400 explícito — un
 * fallback silencioso acá solo serviría para producir un PDF en blanco y que
 * nadie supiera por qué.
 *
 * Es también el motivo de que este controller sean ~120 líneas y el de órdenes
 * 900: casi todo aquello es la rama legacy.
 */

interface WorkCertificateDocumentPayload {
  /** Correlativo del documento; solo se usa para nombrar el archivo. */
  code?: string;
  schemaData?: Record<string, unknown>;
  /** Passthrough "canvas = PDF": HTML serializado del canvas de Portal. */
  html?: string;
}

const buildAbsoluteUrl = (req: Request, relativeUrl: string): string => {
  const host = req.get('host');
  if (!host) return relativeUrl;
  return `${req.protocol}://${host}${relativeUrl}`;
};

/**
 * Márgenes de Puppeteer. Con membrete el HTML del serializer ya trae
 * `@page margin: 0` y sus propios márgenes como padding (el fondo va a sangre
 * completa): si Puppeteer agregara los suyos, recortaría el membrete con un
 * marco blanco. Sin membrete, los 14mm estándar.
 */
const canvasPdfMargin = (payload: WorkCertificateDocumentPayload) => ({
  margin: getDocumentLetterhead(payload.schemaData || {})
    ? CANVAS_QUOTE_LETTERHEAD_PDF_MARGIN
    : CANVAS_QUOTE_PDF_MARGIN,
});

const buildRenderContext = async (req: Request) => {
  const companyId = (req as Request & { companyId?: string }).companyId;
  if (!companyId) {
    const err: CustomError = new Error('Company ID is required');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const payload = (req.body ?? {}) as WorkCertificateDocumentPayload;
  if (!payload.html) {
    const err: CustomError = new Error(
      'La constancia se imprime desde el canvas: falta el HTML del documento.'
    );
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  // Resuelve cada <img src> a data URL. Firmas y sellos son PNG con alfa: el
  // inliner ramifica por `hasAlpha` para no aplanarlos sobre negro (L12).
  const html = await inlineCanvasHtmlImages(payload.html, companyId);
  return { companyId, payload, html };
};

const renderToTempFile = async (
  payload: WorkCertificateDocumentPayload,
  html: string,
  prefix: string
) => {
  await fs.ensureDir(config.pdf.tempDir);
  const fileId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const fileName = `${fileId}.pdf`;
  const filePath = path.join(config.pdf.tempDir, fileName);

  await pdfGenerator.generateFromHtml(html, {
    outputPath: filePath,
    format: 'A4',
    landscape: false,
    ...canvasPdfMargin(payload),
  });

  const totalPages = await PDFMergerService.getPageCount(filePath);
  const stat = await fs.stat(filePath);
  return { fileName, filePath, totalPages, sizeBytes: stat.size };
};

export async function previewWorkCertificateDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const startedAt = Date.now();
  try {
    const { payload, html } = await buildRenderContext(req);
    const rendered = await renderToTempFile(payload, html, 'cons-tra');
    const previewUrl = path.posix.join(config.pdf.tempPublicBaseUrl, rendered.fileName);

    logger.info('work_certificate_documents.preview.completed', {
      durationMs: Date.now() - startedAt,
      totalPages: rendered.totalPages,
      sizeBytes: rendered.sizeBytes,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        previewUrl,
        previewUrlAbsolute: buildAbsoluteUrl(req, previewUrl),
        totalPages: rendered.totalPages,
        sizeBytes: rendered.sizeBytes,
      },
    });
  } catch (error) {
    logger.error('work_certificate_documents.preview.failed', {
      error,
      durationMs: Date.now() - startedAt,
    });
    next(error);
  }
}
