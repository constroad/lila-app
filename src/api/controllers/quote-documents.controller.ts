import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import { getSchemaByCode } from '../../schemas/documents/registry.js';
import { ReportHtmlRenderer } from '../../services/report-html-renderer.service.js';
import pdfGenerator from '../../pdf/generator.service.js';
import { config } from '../../config/environment.js';
import { storagePathService } from '../../services/storage-path.service.js';
import { PDFMergerService } from '../../services/pdf-merger.service.js';
import { FolioGeneratorService } from '../../services/folio-generator.service.js';

interface QuoteDocumentPayload {
  schemaCode?: string;
  quoteNumber?: string | number;
  schemaData?: Record<string, any>;
}

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
  const proto = resolveProto(req);
  return `${proto}://${host}${relativeUrl}`;
}

function isPlainObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep<T extends Record<string, any>>(target: T, ...sources: Record<string, any>[]): T {
  const output = { ...target } as T;
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
  return output;
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

function getPayload(req: Request): QuoteDocumentPayload {
  const body = (req.body || {}) as QuoteDocumentPayload;
  return {
    schemaCode: body.schemaCode || 'COT-ASF',
    quoteNumber: body.quoteNumber,
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

function formatMoney(value: unknown): string {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value: unknown): string {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0.000';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function toLines(value: unknown): string[] {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

function renderAsphaltQuoteHtml(data: Record<string, any>, baseUrl: string): string {
  const MIN_VISIBLE_ITEM_ROWS = 8;
  const header = data.header || {};
  const customer = data.customer || {};
  const totals = data.totals || {};
  const terms = data.commercialTerms || {};
  const seller = data.seller || {};
  const footer = data.footer || {};

  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const items = itemsRaw.length > 0 ? itemsRaw : [
    {
      itemCode: '-',
      description: '-',
      unit: '-',
      quantity: 0,
      unitPrice: 0,
      lineTotal: 0,
      lineNotes: '',
    },
  ];

  const computedSubtotal = items.reduce((acc, item) => acc + Number(item?.lineTotal || 0), 0);
  const subtotal = Number.isFinite(Number(totals.subtotal)) ? Number(totals.subtotal) : computedSubtotal;
  const igv = Number.isFinite(Number(totals.igv)) ? Number(totals.igv) : Number((subtotal * 0.18).toFixed(2));
  const total = Number.isFinite(Number(totals.total)) ? Number(totals.total) : Number((subtotal + igv).toFixed(2));

  const bankAccounts = Array.isArray(data.issuerBankAccounts) ? data.issuerBankAccounts : [];
  const logoUrl = resolveImageUrl(baseUrl, header.logoUrl);
  const intro = String(data.intro || '');
  const observations = String(data.observations || '');
  const amountInWords = String(totals.amountInWords || '');
  const issuerEmail = String(header.issuerEmail || footer.email || '');
  const signatureImageUrl = resolveImageUrl(baseUrl, seller.signatureImageUrl || '');
  const sellerRole = String(seller.role || '').trim();
  const printableItems = [...items];
  while (printableItems.length < MIN_VISIBLE_ITEM_ROWS) {
    printableItems.push({ __empty: true });
  }

  const rowsHtml = printableItems
    .map((item) => {
      const isEmptyRow = Boolean((item as any).__empty);
      if (isEmptyRow) {
        return `
          <tr>
            <td class="col-item">&nbsp;</td>
            <td class="col-desc">&nbsp;</td>
            <td class="col-unit">&nbsp;</td>
            <td class="col-qty">&nbsp;</td>
            <td class="col-money">&nbsp;</td>
            <td class="col-money">&nbsp;</td>
          </tr>
        `;
      }
      const itemCode = escapeHtml(item.itemCode || '');
      const description = escapeHtml(item.description || '');
      const unit = escapeHtml(item.unit || '');
      const quantity = formatQuantity(item.quantity);
      const unitPrice = formatMoney(item.unitPrice);
      const lineTotal = formatMoney(item.lineTotal);
      const lineNotes = toLines(item.lineNotes)
        .map((line) => `<div class=\"line-notes\">${escapeHtml(line)}</div>`)
        .join('');

      return `
        <tr>
          <td class="col-item">${itemCode}</td>
          <td class="col-desc">${description}${lineNotes}</td>
          <td class="col-unit">${unit}</td>
          <td class="col-qty">${quantity}</td>
          <td class="col-money">${unitPrice}</td>
          <td class="col-money">${lineTotal}</td>
        </tr>
      `;
    })
    .join('');

  const bankRows = bankAccounts.length > 0
    ? bankAccounts
      .map((acc) => {
        return `
          <tr>
            <td>${escapeHtml(acc.bank || '')}</td>
            <td>${escapeHtml(acc.account || '')}</td>
            <td>${escapeHtml(acc.cci || '')}</td>
            <td>${escapeHtml(acc.type || '')}</td>
          </tr>
        `;
      })
      .join('')
    : `
      <tr>
        <td colspan="4" class="empty-row">Sin cuentas bancarias configuradas</td>
      </tr>
    `;

  const obsLines = toLines(observations)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #1f2937;
      margin: 0;
      padding: 0;
      line-height: 1.25;
    }
    .sheet {
      width: 100%;
      max-width: 190mm;
      margin: 0 auto;
    }
    .top {
      display: flex;
      justify-content: flex-start;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 8px;
    }
    .logo-block {
      width: 175px;
      min-height: 68px;
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
    }
    .issuer-panel {
      flex: 1;
      min-height: 68px;
      display: flex;
      gap: 10px;
      justify-content: space-between;
      align-items: flex-start;
    }
    .issuer {
      flex: 1;
    }
    .issuer-logo {
      display: block;
      max-height: 60px;
      max-width: 170px;
      width: auto;
      object-fit: contain;
      margin-bottom: 0;
    }
    .issuer-name { font-weight: 700; font-size: 11px; margin-bottom: 2px; text-transform: uppercase; }
    .issuer-meta { font-size: 9.4px; color: #374151; margin-bottom: 1px; }
    .quote-head {
      min-width: 178px;
      border: 1px solid #111827;
      padding: 6px 8px;
    }
    .quote-head-title { font-weight: 700; font-size: 12px; text-align: center; margin-bottom: 2px; }
    .quote-head-number { font-weight: 700; text-align: center; font-size: 12px; }
    .quote-date { text-align: right; font-size: 10.2px; margin: 2px 0 7px 0; }

    .meta {
      margin-bottom: 7px;
      font-size: 10.5px;
    }
    .meta-row { display: flex; margin-bottom: 2px; }
    .meta-label { width: 84px; font-weight: 700; }
    .meta-value { flex: 1; }

    .intro { font-size: 10.4px; margin-bottom: 7px; }

    table { width: 100%; border-collapse: collapse; }
    .items th, .items td {
      border: 1px solid #1f2937;
      padding: 4px 5px;
      vertical-align: top;
      font-size: 9.8px;
    }
    .items thead th {
      background: #f3f4f6;
      text-align: center;
      font-weight: 700;
    }
    .items tbody tr { min-height: 24px; }
    .col-item { width: 36px; text-align: center; font-weight: 700; }
    .col-desc { width: auto; }
    .col-unit { width: 52px; text-align: center; }
    .col-qty { width: 82px; text-align: right; }
    .col-money { width: 98px; text-align: right; }
    .line-notes {
      margin-top: 2px;
      color: #374151;
      font-size: 9.2px;
      line-height: 1.2;
    }

    .totals {
      margin-top: 7px;
      display: grid;
      grid-template-columns: 1fr 280px;
      gap: 12px;
    }
    .amount-words {
      font-size: 10.2px;
      font-weight: 700;
      align-self: end;
    }
    .totals-table td {
      border: 1px solid #1f2937;
      padding: 4px 6px;
      font-size: 10px;
    }
    .totals-table .label { font-weight: 700; width: 58%; }
    .totals-table .value { text-align: right; font-weight: 700; }

    .section-title {
      margin-top: 8px;
      margin-bottom: 3px;
      font-weight: 700;
      font-size: 10.6px;
      text-transform: uppercase;
    }
    .obs-box {
      min-height: 46px;
      padding: 2px 0;
      font-size: 9.8px;
      line-height: 1.28;
    }

    .terms {
      margin-top: 6px;
      border: 1px solid #1f2937;
      padding: 6px;
      font-size: 9.8px;
    }
    .term-row {
      display: grid;
      grid-template-columns: 145px 1fr;
      gap: 8px;
      margin-bottom: 2px;
    }
    .term-label { font-weight: 700; }

    .seller {
      margin-top: 8px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .seller-role {
      font-size: 9.6px;
      font-weight: 700;
      text-transform: uppercase;
      margin-top: 1px;
    }
    .seller-contact {
      font-size: 9.8px;
      margin-top: 2px;
      text-transform: uppercase;
    }
    .seller-image-wrap {
      min-height: 78px;
      margin-top: 4px;
      display: flex;
      align-items: flex-end;
    }
    .seller-image {
      max-height: 76px;
      max-width: 230px;
      width: auto;
      object-fit: contain;
    }

    .banks {
      margin-top: 7px;
      border: 1px solid #1f2937;
    }
    .banks th, .banks td {
      border: 1px solid #1f2937;
      padding: 4px 5px;
      font-size: 9.4px;
      text-align: left;
    }
    .banks th {
      background: #f3f4f6;
      font-weight: 700;
    }
    .empty-row { text-align: center; color: #6b7280; }

    .footer {
      margin-top: 8px;
      border-top: 1px solid #1f2937;
      padding-top: 4px;
      font-size: 8.8px;
      color: #374151;
      line-height: 1.2;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="logo-block">
        ${logoUrl ? `<img class="issuer-logo" src="${escapeHtml(logoUrl)}" />` : ''}
      </div>
      <div class="issuer-panel">
        <div class="issuer">
          <div class="issuer-name">${escapeHtml(header.issuerName || '')}</div>
          <div class="issuer-meta">RUC: ${escapeHtml(header.issuerRuc || '')}</div>
          <div class="issuer-meta">${escapeHtml(issuerEmail)}</div>
          <div class="issuer-meta">${escapeHtml(header.issuerPhone || '')}</div>
          <div class="issuer-meta">${escapeHtml(header.issuerAddress || '')}</div>
        </div>
        <div class="quote-head">
          <div class="quote-head-title">COTIZACIÓN N°</div>
          <div class="quote-head-number">${escapeHtml(header.quoteNumber || '')}</div>
        </div>
      </div>
    </div>

    <div class="quote-date">${escapeHtml(header.quoteDate || '')}</div>

    <div class="meta">
      <div class="meta-row">
        <div class="meta-label">Señor(es):</div>
        <div class="meta-value">${escapeHtml(customer.name || '')}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">ATT.:</div>
        <div class="meta-value">${escapeHtml(customer.attention || '')}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">REF.:</div>
        <div class="meta-value">${escapeHtml(customer.reference || '')}</div>
      </div>
    </div>

    <div class="intro">${escapeHtml(intro)}</div>

    <table class="items">
      <thead>
        <tr>
          <th>ITEM</th>
          <th>DESCRIPCIÓN</th>
          <th>UND.</th>
          <th>CANTIDAD</th>
          <th>P. UNIT. PEN</th>
          <th>PARCIAL PEN</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="totals">
      <div class="amount-words">${escapeHtml(amountInWords)}</div>
      <table class="totals-table">
        <tbody>
          <tr><td class="label">V. VENTA</td><td class="value">${formatMoney(subtotal)}</td></tr>
          <tr><td class="label">IGV (18%)</td><td class="value">${formatMoney(igv)}</td></tr>
          <tr><td class="label">TOTAL</td><td class="value">${formatMoney(total)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section-title">Observaciones</div>
    <div class="obs-box">${obsLines || '&nbsp;'}</div>

    <div class="section-title">Condiciones comerciales</div>
    <div class="terms">
      <div class="term-row"><div class="term-label">FORMA DE PAGO:</div><div>${escapeHtml(terms.paymentTerms || '')}</div></div>
      <div class="term-row"><div class="term-label">LUGAR DE ENTREGA:</div><div>${escapeHtml(terms.deliveryPlace || '')}</div></div>
      <div class="term-row"><div class="term-label">OFERTA VALIDA HASTA:</div><div>${escapeHtml(terms.offerValidUntil || '')}</div></div>
      <div class="term-row"><div class="term-label">PLAZO DE ENTREGA:</div><div>${escapeHtml(terms.deliveryLeadTime || '')}</div></div>
    </div>

    <div class="seller">ATENTAMENTE,</div>
    <div class="seller-image-wrap">
      ${signatureImageUrl ? `<img class="seller-image" src="${escapeHtml(signatureImageUrl)}" alt="Firma" />` : ''}
    </div>
    <div class="seller">${escapeHtml(seller.name || '')}</div>
    ${sellerRole ? `<div class="seller-role">${escapeHtml(sellerRole)}</div>` : ''}
    <div class="seller-contact">${escapeHtml(seller.phone || '')} ${seller.phone && seller.email ? '/' : ''} ${escapeHtml(seller.email || '')}</div>

    <table class="banks">
      <thead>
        <tr>
          <th>BANCO</th>
          <th>CUENTA</th>
          <th>CCI</th>
          <th>TIPO</th>
        </tr>
      </thead>
      <tbody>
        ${bankRows}
      </tbody>
    </table>

    <div class="footer">
      <div>${escapeHtml(footer.address || '')}</div>
      <div>${escapeHtml(footer.phone || '')} ${footer.phone && footer.email ? ' - ' : ''}${escapeHtml(footer.email || '')}</div>
      <div>${escapeHtml(footer.website || '')}</div>
    </div>
  </div>
</body>
</html>`;
}

async function buildRenderContext(req: Request) {
  const companyId = (req as any).companyId;
  if (!companyId) {
    const err: CustomError = new Error('Company ID is required');
    err.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw err;
  }

  const payload = getPayload(req);
  const schema = getSchemaByCode(payload.schemaCode || 'COT-ASF');

  if (!schema) {
    const err: CustomError = new Error('Schema not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const data = mergeDeep({}, schema.defaultData || {}, payload.schemaData || {});
  const baseUrl = buildAbsoluteUrl(req, '');
  const html = payload.schemaCode === 'COT-ASF'
    ? renderAsphaltQuoteHtml(data, baseUrl)
    : await new ReportHtmlRenderer(schema, data, { companyId, baseUrl }).render();

  return {
    companyId,
    payload,
    html,
  };
}

export async function previewAsphaltQuoteDocument(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  try {
    const { html } = await buildRenderContext(req);

    await fs.ensureDir(config.pdf.tempDir);

    const previewId = `cot-asf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const previewFilename = `${previewId}.pdf`;
    const previewPath = path.join(config.pdf.tempDir, previewFilename);

    await pdfGenerator.generateFromHtml(html, {
      outputPath: previewPath,
      format: 'A4',
      landscape: false,
    });

    await FolioGeneratorService.addFolios(
      previewPath,
      {
        enabled: true,
        format: 'Página {current} de {total}',
        position: 'footer-right',
        startNumber: 1,
        fontSize: 9,
        includeAnnexes: true,
      },
      previewPath
    );

    const totalPages = await PDFMergerService.getPageCount(previewPath);
    const stat = await fs.stat(previewPath);
    const previewUrl = path.posix.join(config.pdf.tempPublicBaseUrl, previewFilename);

    logger.info('quote_documents.preview.completed', {
      companyId: (req as any).companyId,
      durationMs: Date.now() - startedAt,
      totalPages,
      sizeBytes: stat.size,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        previewUrl,
        previewUrlAbsolute: buildAbsoluteUrl(req, previewUrl),
        totalPages,
        sizeBytes: stat.size,
      },
    });
  } catch (error) {
    logger.error('quote_documents.preview.failed', { error, durationMs: Date.now() - startedAt });
    next(error);
  }
}

export async function generateAsphaltQuoteDocument(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  try {
    const { companyId, payload, html } = await buildRenderContext(req);

    const quoteNumberRaw = String(
      payload.quoteNumber ||
      payload.schemaData?.header?.quoteNumber ||
      payload.schemaData?.quoteNumber ||
      'sin-numero'
    );
    const safeQuoteNumber = sanitizePathSegment(quoteNumberRaw);

    const relativeDir = path.posix.join('cotizaciones', 'asfalto', `nro-${safeQuoteNumber}`);
    const outputDir = storagePathService.getModulePath(
      companyId,
      'cotizaciones',
      path.posix.join('asfalto', `nro-${safeQuoteNumber}`)
    );
    await fs.ensureDir(outputDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `cotizacion-asfalto-${safeQuoteNumber}-${timestamp}.pdf`;
    const outputPath = path.join(outputDir, filename);

    await pdfGenerator.generateFromHtml(html, {
      outputPath,
      format: 'A4',
      landscape: false,
    });

    await FolioGeneratorService.addFolios(
      outputPath,
      {
        enabled: true,
        format: 'Página {current} de {total}',
        position: 'footer-right',
        startNumber: 1,
        fontSize: 9,
        includeAnnexes: true,
      },
      outputPath
    );

    const totalPages = await PDFMergerService.getPageCount(outputPath);
    const stat = await fs.stat(outputPath);
    const pdfUrl = `/files/companies/${companyId}/${relativeDir}/${filename}`;

    logger.info('quote_documents.generate.completed', {
      companyId,
      quoteNumber: safeQuoteNumber,
      outputPath,
      durationMs: Date.now() - startedAt,
      totalPages,
      sizeBytes: stat.size,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        pdfUrl,
        pdfUrlAbsolute: buildAbsoluteUrl(req, pdfUrl),
        totalPages,
        sizeBytes: stat.size,
        relativeDir,
      },
    });
  } catch (error) {
    logger.error('quote_documents.generate.failed', { error, durationMs: Date.now() - startedAt });
    next(error);
  }
}
