import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import { getSchemaByCode } from '../../schemas/documents/registry.js';
import pdfGenerator from '../../pdf/generator.service.js';
import { config } from '../../config/environment.js';
import { storagePathService } from '../../services/storage-path.service.js';
import { getCompanyModel } from '../../database/models.js';

interface DispatchNoteDocumentPayload {
  schemaCode?: string;
  orderNumber?: string | number;
  schemaData?: Record<string, any>;
}

const DEFAULT_SERVICES_TITLE = 'Servicios de Asfalto y Pavimentacion';
const DEFAULT_SERVICE_LINES = [
  'Venta de asfalto · Certificado de calidad de PEN',
  'Ensayo Marshall (ASTM D 6926 - 6927)',
  'Ensayo Rice (AASHTO T 209 / ASTM D 2041)',
  'Certificado de calidad del MC-30',
  'Lavado de mezcla asfaltica en caliente (MAC)',
];

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

function buildAbsoluteUrl(req: Request, relativeUrl: string) {
  if (!relativeUrl) return relativeUrl;
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return relativeUrl;
  return `${resolveProto(req)}://${host}${relativeUrl}`;
}

function isPlainObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep<T extends Record<string, any>>(target: T, ...sources: Record<string, any>[]): T {
  const output: Record<string, any> = { ...target };
  sources.forEach((source) => {
    if (!isPlainObject(source)) return;
    Object.keys(source).forEach((key) => {
      const value = source[key];
      if (isPlainObject(value)) {
        output[key] = mergeDeep((output[key] as Record<string, any>) || {}, value);
      } else {
        output[key] = value as any;
      }
    });
  });
  return output as T;
}

function sanitizePathSegment(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'sin-numero';
}

function getPayload(req: Request): DispatchNoteDocumentPayload {
  const body = (req.body || {}) as DispatchNoteDocumentPayload;
  return {
    schemaCode: body.schemaCode || 'DISPATCH-NOTE',
    orderNumber: body.orderNumber,
    schemaData: isPlainObject(body.schemaData) ? body.schemaData : {},
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function resolveImageUrl(baseUrl: string, source: unknown): string {
  const raw = String(source || '').trim();
  if (!raw) return '';
  const encoded = encodeURI(raw);
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return encoded;
  }
  if (raw.startsWith('/')) {
    return `${baseUrl}${encoded}`;
  }
  return `${baseUrl}/${encoded}`;
}

function formatAmountLabel(value: unknown, fallback?: unknown): string {
  const raw = String(fallback ?? '').trim();
  if (raw) return raw;

  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2);
}

function normalizeServiceLines(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SERVICE_LINES;
  }
  const lines = value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : DEFAULT_SERVICE_LINES;
}

function buildNoteLines(note: string) {
  const normalized = note.trim();
  if (!normalized) {
    return '<div class="note-line"></div><div class="note-line"></div>';
  }

  const lines = normalized
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => `<div class="note-line">${escapeHtml(line)}</div>`);

  while (lines.length < 2) {
    lines.push('<div class="note-line"></div>');
  }

  return lines.join('');
}

function renderServiceLines(lines: string[]) {
  return lines
    .map(
      (line) =>
        `<div class="service-line"><span class="service-bullet">•</span><span>${escapeHtml(line)}</span></div>`
    )
    .join('');
}

function renderDispatchNoteHtml(data: Record<string, any>, baseUrl: string) {
  const header = data.header || {};
  const dispatch = data.dispatch || {};
  const footer = data.footer || {};
  const serviceLines = normalizeServiceLines(header.serviceLines);
  const noteMarkup = buildNoteLines(String(dispatch.notes || ''));
  const logoUrl = resolveImageUrl(baseUrl, header.logoUrl);
  const companyName = String(header.companyName || '').trim();
  const servicesTitle = String(header.servicesTitle || '').trim() || DEFAULT_SERVICES_TITLE;
  const generatedBy = String(footer.generatedBy || '').trim() || `Generated by ${companyName}`;
  const hasLogo = Boolean(logoUrl);

  return `
  <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Vale de despacho</title>
      <style>
        * { box-sizing: border-box; }
        @page { size: A4 portrait; margin: 0; }
        html, body {
          margin: 0;
          padding: 0;
          font-family: Arial, Helvetica, sans-serif;
          color: #101010;
          background: #ffffff;
        }
        body {
          width: 210mm;
          min-height: 297mm;
        }
        .sheet {
          width: 210mm;
          min-height: 148.5mm;
          padding: 12mm 11mm 14mm;
          position: relative;
        }
        .header {
          display: grid;
          grid-template-columns: 39mm 1fr 52mm;
          gap: 7mm;
          align-items: start;
        }
        .brand {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          justify-content: flex-start;
          min-height: 28mm;
          padding-top: 8mm;
        }
        .brand-logo {
          width: 33mm;
          max-height: 27mm;
          object-fit: contain;
        }
        .brand-fallback {
          font-size: 8.8mm;
          font-weight: 900;
          line-height: 0.92;
          letter-spacing: -0.04em;
          text-transform: uppercase;
        }
        .brand-name {
          display: none;
        }
        .services {
          text-align: center;
          padding-top: 1mm;
        }
        .services-title {
          font-size: 5.5mm;
          line-height: 0.96;
          font-weight: 900;
          letter-spacing: -0.03em;
          text-transform: uppercase;
        }
        .services-list {
          margin-top: 3mm;
          display: flex;
          flex-direction: column;
          gap: 0.8mm;
          font-size: 3.4mm;
          font-weight: 500;
        }
        .service-line {
          display: flex;
          justify-content: center;
          gap: 1.6mm;
        }
        .service-bullet {
          font-weight: 800;
        }
        .vale-card {
          border: 0.55mm solid #111;
          border-radius: 4mm;
          overflow: hidden;
          width: 100%;
          background: #fff;
        }
        .vale-title {
          background: #dddddd;
          border-bottom: 0.55mm solid #111;
          text-align: center;
          font-weight: 900;
          font-size: 6.6mm;
          line-height: 1;
          padding: 2.8mm 0 2.4mm;
          text-transform: uppercase;
        }
        .vale-number {
          display: flex;
          align-items: center;
          min-height: 11mm;
          padding: 0 4.8mm;
          font-weight: 900;
          color: #ef3c2d;
          font-size: 4.5mm;
          line-height: 1.1;
          white-space: nowrap;
        }
        .date-line {
          margin-top: 9mm;
          padding-left: 2mm;
          font-size: 4mm;
          font-weight: 700;
        }
        .date-line .line-value {
          display: inline-block;
          min-width: 28mm;
          border-bottom: 0.5mm dotted #111;
          padding-bottom: 0.6mm;
          margin-left: 2mm;
          font-weight: 600;
        }
        .content {
          margin-top: 12mm;
          display: flex;
          flex-direction: column;
          gap: 5.4mm;
        }
        .field-row {
          display: grid;
          grid-template-columns: 22mm 1fr;
          align-items: end;
          gap: 2mm;
          font-size: 4.4mm;
          font-weight: 700;
        }
        .field-value {
          min-height: 5.8mm;
          border-bottom: 0.5mm dotted #111;
          font-weight: 600;
          text-transform: uppercase;
          padding: 0 1mm 0.6mm;
        }
        .detail-grid {
          display: grid;
          grid-template-columns: 1.1fr 0.95fr;
          gap: 9mm;
          margin-top: 2mm;
          align-items: start;
        }
        .amount-stack {
          padding-left: 16mm;
          display: flex;
          flex-direction: column;
          gap: 5.4mm;
        }
        .amount-line {
          font-size: 5.2mm;
          font-weight: 800;
          display: flex;
          align-items: flex-end;
          gap: 3mm;
        }
        .amount-line .value {
          display: inline-block;
          min-width: 52mm;
          border-bottom: 0.5mm dotted #111;
          padding-bottom: 0.8mm;
          text-align: center;
        }
        .amount-line .unit {
          font-size: 5.4mm;
        }
        .note-line {
          min-height: 5.8mm;
          border-bottom: 0.5mm dotted #111;
          padding-bottom: 0.8mm;
          font-size: 4.4mm;
          font-weight: 600;
          text-transform: uppercase;
        }
        .meta-stack {
          display: flex;
          flex-direction: column;
          gap: 5.2mm;
        }
        .meta-row {
          display: grid;
          grid-template-columns: 16mm 1fr;
          gap: 2mm;
          align-items: end;
          font-size: 4.4mm;
          font-weight: 700;
        }
        .meta-row .value {
          min-height: 5.8mm;
          border-bottom: 0.5mm dotted #111;
          padding: 0 1mm 0.6mm;
          font-weight: 600;
          text-transform: uppercase;
        }
        .signatures {
          margin-top: 13mm;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18mm;
          align-items: end;
        }
        .signature {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.4mm;
        }
        .signature-line {
          width: 62mm;
          border-bottom: 0.55mm dotted #111;
          height: 0;
        }
        .signature-label {
          font-size: 4.4mm;
          font-weight: 800;
        }
        .footer {
          position: absolute;
          right: 11mm;
          bottom: 6mm;
          font-size: 3.4mm;
          font-weight: 700;
        }
      </style>
    </head>
    <body>
      <main class="sheet">
        <section class="header">
          <div class="brand">
            ${hasLogo
              ? `<img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="Logo" />`
              : `<div class="brand-fallback">${escapeHtml(companyName || 'Company')}</div>`}
          </div>

          <div class="services">
            <div class="services-title">${escapeHtml(servicesTitle)}</div>
            <div class="services-list">${renderServiceLines(serviceLines)}</div>
          </div>

          <div>
            <div class="vale-card">
              <div class="vale-title">Vale</div>
              <div class="vale-number">No.&nbsp;${escapeHtml(dispatch.valeNumber || '')}</div>
            </div>
            <div class="date-line">
              Fecha:<span class="line-value">${escapeHtml(dispatch.dispatchDate || '')}</span>
            </div>
          </div>
        </section>

        <section class="content">
          <div class="field-row">
            <div>Señores</div>
            <div class="field-value">${escapeHtml(dispatch.customerName || '')}</div>
          </div>
          <div class="field-row">
            <div>Obra</div>
            <div class="field-value">${escapeHtml(dispatch.projectName || '')}</div>
          </div>
          <div class="field-row">
            <div>Tipo de Material</div>
            <div class="field-value">${escapeHtml(dispatch.materialName || '')}</div>
          </div>

          <div class="detail-grid">
            <div class="amount-stack">
              <div class="amount-line">
                <span class="value">${escapeHtml(dispatch.quantityLabel || '')}</span>
                <span class="unit">M3</span>
              </div>
              ${noteMarkup}
            </div>

            <div class="meta-stack">
              <div class="meta-row">
                <div>Placa</div>
                <div class="value">${escapeHtml(dispatch.plate || '')}</div>
              </div>
              <div class="meta-row">
                <div>Chofer</div>
                <div class="value">${escapeHtml(dispatch.driverName || '')}</div>
              </div>
              <div class="meta-row">
                <div>Hora</div>
                <div class="value">${escapeHtml(dispatch.dispatchHour || '')}</div>
              </div>
            </div>
          </div>
        </section>

        <section class="signatures">
          <div class="signature">
            <div class="signature-line"></div>
            <div class="signature-label">${escapeHtml(companyName)}</div>
          </div>
          <div class="signature">
            <div class="signature-line"></div>
            <div class="signature-label">Recibí conforme</div>
          </div>
        </section>

        <footer class="footer">${escapeHtml(generatedBy)}</footer>
      </main>
    </body>
  </html>`;
}

async function applyBrandingDefaults(companyId: string, data: Record<string, any>) {
  if (!isPlainObject(data.header)) {
    data.header = {};
  }
  if (!isPlainObject(data.dispatch)) {
    data.dispatch = {};
  }
  if (!isPlainObject(data.footer)) {
    data.footer = {};
  }

  const header = data.header as Record<string, any>;
  const dispatch = data.dispatch as Record<string, any>;
  const footer = data.footer as Record<string, any>;

  const needsCompanyName = !String(header.companyName || '').trim();
  const needsLogo = !String(header.logoUrl || '').trim();
  if (needsCompanyName || needsLogo) {
    try {
      const CompanyModel = await getCompanyModel();
      const company = await CompanyModel.findOne({ companyId }).lean();
      if (needsCompanyName && company?.name) {
        header.companyName = company.name;
      }
      if (needsLogo) {
        header.logoUrl =
          company?.branding?.logoLight ||
          company?.branding?.logoDark ||
          company?.branding?.favicon ||
          '';
      }
    } catch (error) {
      logger.warn('dispatch_note_documents.branding_lookup_failed', {
        companyId,
        error: String(error),
      });
    }
  }

  header.companySubtitle = String(header.companySubtitle || '').trim();
  header.servicesTitle = String(header.servicesTitle || '').trim() || DEFAULT_SERVICES_TITLE;
  header.serviceLines = normalizeServiceLines(header.serviceLines);
  dispatch.quantityLabel = formatAmountLabel(dispatch.quantity, dispatch.quantityLabel);
  footer.generatedBy =
    String(footer.generatedBy || '').trim() ||
    `Generated by ${String(header.companyName || '').trim() || 'Company'}`;
}

async function buildRenderContext(req: Request) {
  const companyId = (req as any).companyId;
  if (!companyId) {
    const err: CustomError = new Error('Company ID is required');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const payload = getPayload(req);
  const schema = getSchemaByCode(payload.schemaCode || 'DISPATCH-NOTE');
  if (!schema) {
    const err: CustomError = new Error('Schema not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const data = mergeDeep({}, schema.defaultData || {}, payload.schemaData || {});
  await applyBrandingDefaults(companyId, data);
  const baseUrl = buildAbsoluteUrl(req, '');
  const html = renderDispatchNoteHtml(data, baseUrl);

  return {
    companyId,
    payload,
    data,
    html,
  };
}

async function previewDispatchNote(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  try {
    const { html, companyId } = await buildRenderContext(req);

    await fs.ensureDir(config.pdf.tempDir);
    const previewId = `dispatch-note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const previewFilename = `${previewId}.pdf`;
    const previewPath = path.join(config.pdf.tempDir, previewFilename);

    await pdfGenerator.generateFromHtml(html, {
      outputPath: previewPath,
      format: 'A4',
      landscape: false,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });

    const stat = await fs.stat(previewPath);
    const previewUrl = path.posix.join(config.pdf.tempPublicBaseUrl, previewFilename);

    logger.info('dispatch_note_documents.preview.completed', {
      companyId,
      durationMs: Date.now() - startedAt,
      sizeBytes: stat.size,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        previewUrl,
        previewUrlAbsolute: buildAbsoluteUrl(req, previewUrl),
        totalPages: 1,
        sizeBytes: stat.size,
      },
    });
  } catch (error) {
    logger.error('dispatch_note_documents.preview.failed', {
      error,
      durationMs: Date.now() - startedAt,
    });
    next(error);
  }
}

async function generateDispatchNote(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  try {
    const { companyId, payload, data, html } = await buildRenderContext(req);

    await storagePathService.ensureCompanyStructure(companyId);

    const dispatchNumberRaw = String(
      payload.orderNumber ||
      data?.dispatch?.valeNumber ||
      'sin-numero'
    );
    const safeDispatchNumber = sanitizePathSegment(dispatchNumberRaw);
    const relativeDir = path.posix.join('vales', `nro-${safeDispatchNumber}`);
    const outputDir = storagePathService.getModulePath(
      companyId,
      'dispatches',
      relativeDir
    );
    await fs.ensureDir(outputDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `vale-despacho-${safeDispatchNumber}-${timestamp}.pdf`;
    const outputPath = path.join(outputDir, filename);

    await pdfGenerator.generateFromHtml(html, {
      outputPath,
      format: 'A4',
      landscape: false,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });

    const stat = await fs.stat(outputPath);
    const pdfUrl = `/files/companies/${companyId}/dispatches/${relativeDir}/${filename}`;

    logger.info('dispatch_note_documents.generate.completed', {
      companyId,
      dispatchNumber: safeDispatchNumber,
      durationMs: Date.now() - startedAt,
      sizeBytes: stat.size,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        pdfUrl,
        pdfUrlAbsolute: buildAbsoluteUrl(req, pdfUrl),
        totalPages: 1,
        sizeBytes: stat.size,
        relativeDir,
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

export async function previewDispatchNoteDocument(req: Request, res: Response, next: NextFunction) {
  return previewDispatchNote(req, res, next);
}

export async function generateDispatchNoteDocument(req: Request, res: Response, next: NextFunction) {
  return generateDispatchNote(req, res, next);
}
