import fs from 'fs-extra';
import path from 'path';
import QRCode from 'qrcode';
import logger from '../utils/logger.js';
import { HTTP_STATUS } from '../config/constants.js';
import { CustomError } from '../api/middlewares/errorHandler.js';
import { getSchemaByCode } from '../schemas/documents/registry.js';
import pdfGenerator from '../pdf/generator.service.js';
import { config } from '../config/environment.js';
import { storagePathService } from './storage-path.service.js';
import { getCompanyModel } from '../database/models.js';

export interface DispatchNoteDocumentPayload {
  schemaCode?: string;
  orderNumber?: string | number;
  schemaData?: Record<string, any>;
}

type BuildRenderContextInput = {
  companyId: string;
  baseUrl: string;
  payload?: DispatchNoteDocumentPayload;
};

export interface PreviewDispatchNoteDocumentResult {
  previewUrl: string;
  previewUrlAbsolute: string;
  totalPages: number;
  sizeBytes: number;
}

export interface GenerateDispatchNoteDocumentResult {
  pdfUrl: string;
  pdfUrlAbsolute: string;
  totalPages: number;
  sizeBytes: number;
  relativeDir: string;
  fileName: string;
  filePath: string;
}

const DEFAULT_SERVICES_TITLE = 'Servicios de Asfalto y Pavimentacion';
const DEFAULT_SERVICE_LINES = [
  'Venta de asfalto · Certificado de calidad de PEN',
  'Ensayo Marshall (ASTM D 6926 - 6927)',
  'Ensayo Rice (AASHTO T 209 / ASTM D 2041)',
  'Certificado de calidad del MC-30',
  'Lavado de mezcla asfaltica en caliente (MAC)',
];

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

function getPayload(payload?: DispatchNoteDocumentPayload): DispatchNoteDocumentPayload {
  const body = (payload || {}) as DispatchNoteDocumentPayload;
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

const DEFAULT_ACCENT_COLOR = '#1a2b23';

function sanitizeHexColor(value: unknown, fallback: string): string {
  const raw = String(value || '').trim();
  return /^#([0-9A-Fa-f]{6})$/.test(raw) ? raw : fallback;
}

function mixHexColor(hexColor: string, target: number, amount: number): string {
  const hex = hexColor.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16);
    const mixed = Math.round(channel + (target - channel) * amount);
    return Math.min(255, Math.max(0, mixed)).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

/** Paleta del vale derivada del acento de la company (tinte, borde y tonos). */
function buildValePalette(accentColor: string) {
  return {
    accent: accentColor,
    accentDark: mixHexColor(accentColor, 0, 0.45),
    heroBg: mixHexColor(accentColor, 255, 0.93),
    heroBorder: mixHexColor(accentColor, 255, 0.68),
    heroLabel: mixHexColor(accentColor, 0, 0.25),
  };
}

type ValeRenderExtras = {
  /** URL pública del PDF para el QR de verificación (solo en generate). */
  verificationUrl?: string;
  qrDataUrl?: string;
};

export function renderDispatchNoteHtml(
  data: Record<string, any>,
  baseUrl: string,
  extras: ValeRenderExtras = {}
) {
  const header = data.header || {};
  const dispatch = data.dispatch || {};
  const footer = data.footer || {};
  const logoUrl = resolveImageUrl(baseUrl, header.logoUrl);
  const companyName = String(header.companyName || '').trim();
  const companySubtitle = String(header.companySubtitle || '').trim();
  const generatedBy = String(footer.generatedBy || '').trim() || `Generated by ${companyName}`;
  const hasLogo = Boolean(logoUrl);
  const palette = buildValePalette(sanitizeHexColor(header.accentColor, DEFAULT_ACCENT_COLOR));
  const note = String(dispatch.notes || '').trim();
  const unitLabel = String(dispatch.unitLabel || '').trim();
  const driverPhone = String(dispatch.driverPhone || '').trim();
  // La nota suele ser la unidad ("Unidad 1"); si unitLabel ya la cubre, no se duplica.
  const extraNote = note && note.toLowerCase() !== unitLabel.toLowerCase() ? note : '';

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
          color: #1a2b23;
          background: #ffffff;
        }
        body { width: 210mm; min-height: 297mm; }
        .sheet {
          width: 210mm;
          height: 148.5mm;
          padding: 0 12mm 5mm;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .accent-bar { height: 1.6mm; background: ${palette.accent}; margin: 0 -12mm; }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6mm;
          padding: 4mm 0 3mm;
        }
        .brand { display: flex; align-items: center; gap: 3mm; min-width: 0; }
        .brand-logo { max-width: 34mm; max-height: 14mm; object-fit: contain; }
        .brand-fallback {
          width: 14mm; height: 14mm; border-radius: 2.4mm;
          background: ${palette.accent}; color: #ffffff;
          display: flex; align-items: center; justify-content: center;
          font-size: 5mm; font-weight: 700;
        }
        .brand-text { min-width: 0; }
        .brand-name { font-size: 4.2mm; font-weight: 700; white-space: nowrap; }
        .brand-subtitle { font-size: 2.5mm; color: #5b6b62; white-space: nowrap; margin-top: 0.6mm; }
        .vale-id { text-align: right; flex: none; }
        .vale-id .kicker { font-size: 2.4mm; letter-spacing: 0.32mm; color: #5b6b62; }
        .vale-id .number { font-size: 4.4mm; font-weight: 700; color: ${palette.accentDark}; white-space: nowrap; margin-top: 0.7mm; }
        .vale-id .date { font-size: 2.8mm; color: #5b6b62; margin-top: 0.6mm; }
        .hero {
          display: flex;
          align-items: stretch;
          background: ${palette.heroBg};
          border: 0.35mm solid ${palette.heroBorder};
          border-radius: 2.4mm;
          overflow: hidden;
        }
        .hero-cell { flex: 1; padding: 2.6mm 4mm; }
        .hero-cell.plate { flex: 1.25; }
        .hero-divider { width: 0.35mm; background: ${palette.heroBorder}; }
        .hero-label { font-size: 2.3mm; letter-spacing: 0.28mm; color: ${palette.heroLabel}; }
        .hero-value {
          font-size: 6.6mm; font-weight: 700; letter-spacing: 0.2mm;
          color: ${palette.accentDark}; white-space: nowrap; margin-top: 0.5mm;
        }
        .hero-value .unit { font-size: 3.4mm; }
        .rows { padding-top: 1.6mm; }
        .row { padding: 1.7mm 0; border-bottom: 0.18mm solid #e2e8e4; }
        .row:last-child { border-bottom: none; }
        .row-label { font-size: 2.2mm; letter-spacing: 0.26mm; color: #8a988f; }
        .row-value {
          font-size: 3.3mm; font-weight: 600; line-height: 1.3; margin-top: 0.4mm;
          overflow-wrap: break-word;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .row-split { display: flex; gap: 8mm; }
        .row-split .cell { flex: 1.4; min-width: 0; }
        .row-split .cell.tight { flex: none; }
        .row-split .cell .row-value { white-space: nowrap; -webkit-line-clamp: 1; }
        .bottom {
          margin-top: auto;
          display: flex;
          align-items: flex-end;
          gap: 8mm;
          padding-bottom: 2mm;
        }
        .signature { flex: 1; text-align: center; }
        .signature .line { border-bottom: 0.3mm solid #1a2b23; height: 9mm; }
        .signature .label { font-size: 2.7mm; font-weight: 700; margin-top: 1.2mm; }
        .signature .hint { font-size: 2.2mm; color: #8a988f; margin-top: 0.3mm; }
        .qr { flex: none; display: flex; align-items: center; gap: 2.4mm; }
        .qr img { width: 15mm; height: 15mm; border: 0.18mm solid #e2e8e4; border-radius: 1.2mm; }
        .qr-text { font-size: 2.2mm; color: #8a988f; line-height: 1.4; max-width: 26mm; overflow-wrap: break-word; }
        .qr-text .strong { font-weight: 700; color: #1a2b23; }
        .foot {
          border-top: 0.18mm solid #e2e8e4;
          padding-top: 1.6mm;
          display: flex;
          justify-content: space-between;
          gap: 6mm;
          font-size: 2.2mm;
          color: #8a988f;
          white-space: nowrap;
        }
        .cut-line {
          position: absolute;
          left: 0; right: 0; top: 148.5mm;
          border-top: 0.3mm dashed #c9d3cc;
        }
      </style>
    </head>
    <body>
      <main class="sheet">
        <div class="accent-bar"></div>

        <section class="header">
          <div class="brand">
            ${hasLogo
              ? `<img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="Logo" />`
              : `<div class="brand-fallback">${escapeHtml((companyName || 'C').slice(0, 2).toUpperCase())}</div>`}
            <div class="brand-text">
              <div class="brand-name">${escapeHtml(companyName)}</div>
              ${companySubtitle ? `<div class="brand-subtitle">${escapeHtml(companySubtitle)}</div>` : ''}
            </div>
          </div>
          <div class="vale-id">
            <div class="kicker">VALE DE DESPACHO</div>
            <div class="number">N.&ordm; ${escapeHtml(dispatch.valeNumber || '')}</div>
            <div class="date">${escapeHtml(dispatch.dispatchDate || '')}</div>
          </div>
        </section>

        <section class="hero">
          <div class="hero-cell plate">
            <div class="hero-label">PLACA</div>
            <div class="hero-value">${escapeHtml(dispatch.plate || '—')}</div>
          </div>
          <div class="hero-divider"></div>
          <div class="hero-cell">
            <div class="hero-label">CANTIDAD</div>
            <div class="hero-value">${escapeHtml(dispatch.quantityLabel || '0')} <span class="unit">m&sup3;</span></div>
          </div>
          <div class="hero-divider"></div>
          <div class="hero-cell">
            <div class="hero-label">SALIDA</div>
            <div class="hero-value">${escapeHtml(dispatch.dispatchHour || '—')}</div>
          </div>
        </section>

        <section class="rows">
          <div class="row">
            <div class="row-label">CLIENTE</div>
            <div class="row-value">${escapeHtml(dispatch.customerName || '—')}</div>
          </div>
          <div class="row">
            <div class="row-label">OBRA / DESTINO</div>
            <div class="row-value">${escapeHtml(dispatch.projectName || '—')}</div>
          </div>
          <div class="row row-split">
            <div class="cell">
              <div class="row-label">MATERIAL</div>
              <div class="row-value">${escapeHtml(dispatch.materialName || '—')}</div>
            </div>
            ${unitLabel
              ? `<div class="cell tight">
              <div class="row-label">UNIDAD</div>
              <div class="row-value">${escapeHtml(unitLabel)}</div>
            </div>`
              : ''}
          </div>
          <div class="row row-split">
            <div class="cell">
              <div class="row-label">CHOFER</div>
              <div class="row-value">${escapeHtml(dispatch.driverName || '—')}</div>
            </div>
            ${driverPhone
              ? `<div class="cell tight">
              <div class="row-label">CEL.</div>
              <div class="row-value">${escapeHtml(driverPhone)}</div>
            </div>`
              : ''}
          </div>
          ${extraNote
            ? `<div class="row">
            <div class="row-label">NOTA</div>
            <div class="row-value">${escapeHtml(extraNote)}</div>
          </div>`
            : ''}
        </section>

        <section class="bottom">
          <div class="signature">
            <div class="line"></div>
            <div class="label">Despachado por</div>
            <div class="hint">${escapeHtml(companyName)}</div>
          </div>
          <div class="signature">
            <div class="line"></div>
            <div class="label">Recib&iacute; conforme</div>
            <div class="hint">Nombre y DNI</div>
          </div>
          ${extras.qrDataUrl
            ? `<div class="qr">
            <img src="${escapeHtml(extras.qrDataUrl)}" alt="QR de verificaci&oacute;n" />
            <div class="qr-text"><span class="strong">Verificar vale</span><br/>Escanea para abrir el documento original</div>
          </div>`
            : ''}
        </section>

        <footer class="foot">
          <div>${escapeHtml(generatedBy)} &middot; generado autom&aacute;ticamente al cierre del despacho</div>
          <div>PEN &middot; Marshall D6926 &middot; Rice T209</div>
        </footer>
        <div class="cut-line"></div>
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
      // Acento del vale = branding de la company (mismo criterio que el portal).
      if (!String(header.accentColor || '').trim()) {
        header.accentColor =
          company?.branding?.accentColor || company?.branding?.primaryColor || '';
      }
    } catch (error) {
      logger.warn('dispatch_note_documents.branding_lookup_failed', {
        companyId,
        error: String(error),
      });
    }
  }

  header.companyName = String(header.companyName || '').trim() || 'ConstRoad';
  header.companySubtitle = String(header.companySubtitle || '').trim();
  header.servicesTitle = String(header.servicesTitle || '').trim() || DEFAULT_SERVICES_TITLE;
  header.serviceLines = normalizeServiceLines(header.serviceLines);
  dispatch.quantityLabel = formatAmountLabel(dispatch.quantity, dispatch.quantityLabel);
  footer.generatedBy =
    String(footer.generatedBy || '').trim() ||
    `Generated by ${String(header.companyName || '').trim() || 'Company'}`;
}

async function buildRenderContext(
  params: BuildRenderContextInput & { verificationUrl?: string }
) {
  const { companyId, baseUrl } = params;
  if (!companyId) {
    const err: CustomError = new Error('Company ID is required');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const payload = getPayload(params.payload);
  const schema = getSchemaByCode(payload.schemaCode || 'DISPATCH-NOTE');
  if (!schema) {
    const err: CustomError = new Error('Schema not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const data = mergeDeep({}, schema.defaultData || {}, payload.schemaData || {});
  await applyBrandingDefaults(companyId, data);

  // QR de verificación (solo generate, que conoce la URL final). Nunca bloquea
  // la generación del vale: si el QR falla, sale sin él.
  let qrDataUrl = '';
  if (params.verificationUrl) {
    try {
      qrDataUrl = await QRCode.toDataURL(params.verificationUrl, {
        margin: 0,
        width: 220,
        color: { dark: '#1a2b23', light: '#ffffff' },
      });
    } catch (error) {
      logger.warn('dispatch_note_documents.qr_failed', {
        companyId,
        error: String(error),
      });
    }
  }

  const html = renderDispatchNoteHtml(data, baseUrl, {
    verificationUrl: params.verificationUrl,
    qrDataUrl,
  });

  return {
    companyId,
    payload,
    data,
    html,
  };
}

export async function previewDispatchNoteDocument(
  params: BuildRenderContextInput
): Promise<PreviewDispatchNoteDocumentResult> {
  const startedAt = Date.now();
  const { html, companyId } = await buildRenderContext(params);

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

  return {
    previewUrl,
    previewUrlAbsolute: `${params.baseUrl}${previewUrl}`,
    totalPages: 1,
    sizeBytes: stat.size,
  };
}

export async function generateDispatchNoteDocumentFile(
  params: BuildRenderContextInput
): Promise<GenerateDispatchNoteDocumentResult> {
  const startedAt = Date.now();
  // Puppeteer carga imágenes del HTML usando http://127.0.0.1 para evitar pasar por
  // la URL pública (Tailscale / dominio externo), que puede ocasionar timeout de red.
  // El baseUrl externo solo se usa para la URL absoluta del PDF (y el QR del vale).
  const localBaseUrl = `http://127.0.0.1:${config.port}`;

  // El nombre/URL del PDF se resuelve ANTES del render: el QR de verificación
  // del vale apunta al propio documento publicado.
  const prePayload = getPayload(params.payload);
  const dispatchNumberRaw = String(
    prePayload.orderNumber || prePayload.schemaData?.dispatch?.valeNumber || 'sin-numero'
  );
  const safeDispatchNumber = sanitizePathSegment(dispatchNumberRaw);
  const relativeDir = path.posix.join('vales', `nro-${safeDispatchNumber}`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `vale-despacho-${safeDispatchNumber}-${timestamp}.pdf`;

  const { companyId, html } = await buildRenderContext({
    ...params,
    baseUrl: localBaseUrl,
    verificationUrl: `${params.baseUrl}/files/companies/${params.companyId}/dispatches/${relativeDir}/${fileName}`,
  });

  await storagePathService.ensureCompanyStructure(companyId);
  const outputDir = storagePathService.getModulePath(companyId, 'dispatches', relativeDir);
  await fs.ensureDir(outputDir);
  const outputPath = path.join(outputDir, fileName);

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
  const pdfUrl = `/files/companies/${companyId}/dispatches/${relativeDir}/${fileName}`;
  const filePath = path.posix.join('dispatches', relativeDir, fileName);

  logger.info('dispatch_note_documents.generate.completed', {
    companyId,
    dispatchNumber: safeDispatchNumber,
    durationMs: Date.now() - startedAt,
    sizeBytes: stat.size,
  });

  return {
    pdfUrl,
    pdfUrlAbsolute: `${params.baseUrl}${pdfUrl}`,
    totalPages: 1,
    sizeBytes: stat.size,
    relativeDir,
    fileName,
    filePath,
  };
}
