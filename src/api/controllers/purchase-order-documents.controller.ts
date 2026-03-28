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
import { PDFMergerService } from '../../services/pdf-merger.service.js';
import { FolioGeneratorService } from '../../services/folio-generator.service.js';

interface PurchaseOrderDocumentPayload {
  schemaCode?: string;
  orderNumber?: string | number;
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

function getPayload(req: Request): PurchaseOrderDocumentPayload {
  const body = (req.body || {}) as PurchaseOrderDocumentPayload;
  return {
    schemaCode: body.schemaCode || 'ORD-COM',
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
  if (!Number.isFinite(num)) return '0';
  if (Number.isInteger(num)) {
    return num.toLocaleString('en-US');
  }
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
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

function renderBankRows(accounts: any[]) {
  if (!accounts.length) {
    return '<div class="empty-row">Sin cuentas bancarias registradas</div>';
  }

  return accounts
    .map(
      (account) => `
        <div class="bank-item">
          <div class="bank-line bank-line-top">
            <span class="bank-name">${escapeHtml(account.bank || '')}</span>
            <span class="bank-type">${escapeHtml(account.type || '')}</span>
          </div>
          <div class="bank-line">
            <span><span class="bank-label">Cuenta:</span> ${escapeHtml(account.account || '')}</span>
          </div>
          <div class="bank-line">
            <span><span class="bank-label">CCI:</span> ${escapeHtml(account.cci || '')}</span>
          </div>
        </div>
      `
    )
    .join('');
}

function renderPurchaseOrderHtml(data: Record<string, any>, baseUrl: string) {
  const MIN_VISIBLE_ROWS = 16;
  const header = data.header || {};
  const supplier = data.supplier || {};
  const meta = data.meta || {};
  const totals = data.totals || {};
  const seller = data.seller || {};
  const footer = data.footer || {};
  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const bankAccounts = Array.isArray(data.bankAccounts) ? data.bankAccounts : [];
  const printableItems = itemsRaw.length > 0 ? [...itemsRaw] : [];

  while (printableItems.length < MIN_VISIBLE_ROWS) {
    printableItems.push({ __empty: true });
  }

  const logoUrl = resolveImageUrl(baseUrl, header.logoUrl);
  const signatureImageUrl = seller.includeSignature !== false
    ? resolveImageUrl(baseUrl, seller.signatureImageUrl || '')
    : '';
  const hasFxData = meta.currencyCode && meta.currencyCode !== 'PEN';
  const subtotal = Number(totals.subtotal || 0);
  const igv = Number(totals.igv || 0);
  const total = Number(totals.total || 0);
  const amountInWords = String(totals.amountInWords || '').trim();
  const intro = 'Sírvase atender la siguiente orden de compra según lo detallado a continuación.';
  const termsLines = String(data.termsText || '')
    .split(/\.\s+/)
    .map((line) => line.trim().replace(/\.$/, ''))
    .filter(Boolean);
  const observationsText = String(data.observations || '').trim();

  const rowsHtml = printableItems
    .map((item, index) => {
      if ((item as any).__empty) {
        return `
          <tr class="item-row item-row-empty">
            <td class="col-item">&nbsp;</td>
            <td class="col-desc">&nbsp;</td>
            <td class="col-unit">&nbsp;</td>
            <td class="col-qty">&nbsp;</td>
            <td class="col-money">&nbsp;</td>
            <td class="col-money">&nbsp;</td>
          </tr>
        `;
      }

      return `
        <tr class="item-row">
          <td class="col-item">${escapeHtml(item.itemCode || String(index + 1))}</td>
          <td class="col-desc">${escapeHtml(item.description || '')}</td>
          <td class="col-unit">${escapeHtml(item.unit || '')}</td>
          <td class="col-qty">${formatQuantity(item.quantity)}</td>
          <td class="col-money">${formatMoney(item.unitPrice)}</td>
          <td class="col-money">${formatMoney(item.lineTotal)}</td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Orden de compra</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
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
      align-items: center;
      gap: 3mm;
      margin-bottom: 6px;
    }
    .logo-block {
      width: 44mm;
      min-height: 24mm;
      display: flex;
      align-items: center;
      justify-content: flex-start;
    }
    .issuer-panel {
      flex: 1;
      min-height: 24mm;
      display: flex;
      gap: 2.5mm;
      justify-content: space-between;
      align-items: center;
    }
    .issuer {
      flex: 1;
      min-height: 24mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .issuer-logo {
      display: block;
      max-width: 100%;
      max-height: 24mm;
      width: auto;
      height: auto;
      object-fit: contain;
      object-position: left center;
    }
    .issuer-name { font-weight: 700; font-size: 10.6px; margin-bottom: 1px; text-transform: uppercase; }
    .issuer-meta { font-size: 9.1px; color: #374151; margin-bottom: 0.5px; }
    .doc-head {
      min-width: 50mm;
      border: 1px solid #111827;
      padding: 2mm 3mm;
      min-height: 14mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .doc-head-title { font-weight: 700; font-size: 11.2px; text-align: center; line-height: 1.05; }
    .doc-head-series { font-weight: 700; font-size: 12.2px; text-align: center; line-height: 1.1; margin-top: 1.2mm; }
    .doc-date { text-align: right; font-size: 10.1px; margin: 2px 0 8px 0; }

    .supplier-block {
      margin-bottom: 8px;
      font-size: 10.1px;
    }
    .supplier-line {
      display: flex;
      gap: 5px;
      margin-bottom: 2px;
    }
    .supplier-label {
      font-weight: 700;
      min-width: 98px;
      text-transform: uppercase;
    }
    .intro {
      font-size: 10px;
      margin-bottom: 8px;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 14px;
      margin-bottom: 8px;
      font-size: 9.5px;
    }
    .meta-item {
      display: flex;
      gap: 5px;
      min-width: 0;
    }
    .meta-label {
      font-weight: 700;
      text-transform: uppercase;
      min-width: 96px;
    }
    .meta-value {
      flex: 1;
      min-width: 0;
      word-break: break-word;
    }

    table { width: 100%; border-collapse: collapse; }
    .items {
      border: 1px solid #1f2937;
      table-layout: fixed;
    }
    .items th,
    .items td {
      padding: 4px 5px;
      vertical-align: top;
      font-size: 9.3px;
      border-left: 1px solid #1f2937;
      border-right: 1px solid #1f2937;
    }
    .items thead th {
      background: #f3f4f6;
      text-align: center;
      font-weight: 700;
      border-bottom: 1px solid #1f2937;
    }
    .items tbody td {
      border-top: none;
      border-bottom: none;
    }
    .item-row td {
      padding-top: 3px;
      padding-bottom: 3px;
    }
    .item-row-empty td {
      padding-top: 0;
      padding-bottom: 0;
      height: 20px;
      color: transparent;
    }
    .col-item { width: 24px; text-align: center; font-weight: 700; }
    .col-desc { width: auto; line-height: 1.15; padding-right: 8px; }
    .col-unit { width: 38px; text-align: center; }
    .col-qty { width: 58px; text-align: right; }
    .col-money { width: 74px; text-align: right; }

    .totals-wrap {
      margin-top: 10px;
      display: grid;
      grid-template-columns: 1fr 82mm;
      gap: 14px;
      align-items: end;
    }
    .amount-words {
      font-size: 10px;
      font-weight: 700;
      line-height: 1.25;
      align-self: end;
      padding-bottom: 2px;
    }
    .totals-table {
      width: 82mm;
      justify-self: end;
    }
    .totals-table td {
      border: 1px solid #1f2937;
      padding: 4px 6px;
      font-size: 9.8px;
    }
    .totals-label { font-weight: 700; width: 58%; }
    .totals-value { text-align: right; font-weight: 700; }

    .detail-grid {
      margin-top: 16px;
      display: grid;
      grid-template-columns: 1.05fr 0.95fr;
      gap: 14px;
      align-items: start;
    }
    .detail-panel {
      border: 1px solid #1f2937;
      padding: 6px 8px;
      break-inside: avoid;
    }
    .detail-title {
      font-size: 9.8px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .detail-list,
    .detail-text {
      font-size: 9.2px;
      line-height: 1.34;
    }
    .detail-line {
      margin-bottom: 2px;
    }

    .closing-grid {
      margin-top: 18px;
      display: grid;
      grid-template-columns: 1.08fr 0.92fr;
      gap: 18px;
      align-items: start;
    }
    .banks-title {
      font-size: 9.6px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .bank-item {
      margin-bottom: 8px;
      font-size: 9px;
      line-height: 1.3;
    }
    .bank-line {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .bank-line-top {
      margin-bottom: 2px;
    }
    .bank-name {
      font-weight: 700;
    }
    .bank-type {
      font-size: 8.6px;
      color: #4b5563;
      text-transform: uppercase;
    }
    .bank-label {
      font-weight: 700;
    }
    .approval-block {
      text-align: center;
      justify-self: end;
      width: 100%;
      max-width: 82mm;
    }
    .approval-title {
      font-size: 9.6px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .signature-image-wrap {
      min-height: 80px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .signature-image {
      max-height: 78px;
      max-width: 230px;
      width: auto;
      object-fit: contain;
    }
    .signature-line {
      width: 58mm;
      border-top: 1px solid #1f2937;
      margin: 2px auto 3px auto;
    }
    .signature-name {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .signature-role {
      font-size: 9.4px;
      font-weight: 700;
      text-transform: uppercase;
      margin-top: 1px;
    }
    .empty-row {
      text-align: center;
      color: #6b7280;
    }
    .footer {
      margin-top: 12px;
      border-top: 1px solid #1f2937;
      padding-top: 4px;
      font-size: 8.8px;
      color: #374151;
      line-height: 1.2;
      text-align: left;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="logo-block">
        ${logoUrl ? `<img class="issuer-logo" src="${escapeHtml(logoUrl)}" alt="Logo" />` : ''}
      </div>
      <div class="issuer-panel">
        <div class="issuer">
          <div class="issuer-name">${escapeHtml(header.issuerName || '')}</div>
          <div class="issuer-meta">RUC: ${escapeHtml(header.issuerRuc || '')}</div>
          <div class="issuer-meta">${escapeHtml(header.issuerAddress || '')}</div>
        </div>
        <div class="doc-head">
          <div class="doc-head-title">ORDEN DE COMPRA</div>
          <div class="doc-head-series">${escapeHtml(header.orderNumber || '')}</div>
        </div>
      </div>
    </div>

    <div class="doc-date">${escapeHtml(header.orderDate || '')}</div>

    <div class="supplier-block">
      <div class="supplier-line">
        <div class="supplier-label">Proveedor:</div>
        <div>${escapeHtml(supplier.name || '')}</div>
      </div>
      ${supplier.ruc ? `
        <div class="supplier-line">
          <div class="supplier-label">RUC:</div>
          <div>${escapeHtml(supplier.ruc || '')}</div>
        </div>
      ` : ''}
      ${supplier.address ? `
        <div class="supplier-line">
          <div class="supplier-label">Dirección:</div>
          <div>${escapeHtml(supplier.address || '')}</div>
        </div>
      ` : ''}
    </div>

    <div class="intro">${escapeHtml(intro)}</div>

    <div class="meta-grid">
      <div class="meta-item">
        <div class="meta-label">Forma de pago:</div>
        <div class="meta-value">${escapeHtml(meta.paymentMethod || '-')}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Moneda:</div>
        <div class="meta-value">${escapeHtml(meta.currencyLabel || '-')}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Proyecto:</div>
        <div class="meta-value">${escapeHtml(meta.project || '-')}</div>
      </div>
      ${hasFxData ? `
        <div class="meta-item">
          <div class="meta-label">Tipo de cambio:</div>
          <div class="meta-value">${meta.exchangeRateUsed ? formatMoney(meta.exchangeRateUsed) : '-'}</div>
        </div>
      ` : ''}
      ${hasFxData ? `
        <div class="meta-item">
          <div class="meta-label">Total en soles:</div>
          <div class="meta-value">${meta.totalInSoles ? formatMoney(meta.totalInSoles) : '-'}</div>
        </div>
      ` : ''}
    </div>

    <table class="items">
      <thead>
        <tr>
          <th class="col-item">ITEM</th>
          <th class="col-desc">DESCRIPCIÓN</th>
          <th class="col-unit">UND.</th>
          <th class="col-qty">CANT.</th>
          <th class="col-money">P. UNIT.</th>
          <th class="col-money">TOTAL</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="totals-wrap">
      <div class="amount-words">${amountInWords ? escapeHtml(amountInWords) : '&nbsp;'}</div>
      <table class="totals-table">
        <tbody>
          <tr>
            <td class="totals-label">SUBTOTAL</td>
            <td class="totals-value">${formatMoney(subtotal)}</td>
          </tr>
          <tr>
            <td class="totals-label">IGV (18%)</td>
            <td class="totals-value">${formatMoney(igv)}</td>
          </tr>
          <tr>
            <td class="totals-label">TOTAL</td>
            <td class="totals-value">${formatMoney(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="detail-grid">
      <div class="detail-panel">
        <div class="detail-title">Condiciones y cumplimiento</div>
        <div class="detail-list">
          ${termsLines.length > 0
            ? termsLines.map((line) => `<div class="detail-line">- ${escapeHtml(line)}</div>`).join('')
            : '<div class="empty-row">Sin condiciones registradas.</div>'}
        </div>
      </div>

      <div class="detail-panel">
        <div class="detail-title">Observaciones</div>
        <div class="detail-text">
          ${observationsText ? escapeHtml(observationsText) : '<div class="empty-row">Sin observaciones</div>'}
        </div>
      </div>
    </div>

    <div class="closing-grid">
      <div>
        <div class="banks-title">Cuentas bancarias del proveedor</div>
        ${renderBankRows(bankAccounts)}
      </div>

      <div class="approval-block">
        <div class="approval-title">Aprobación</div>
        <div class="signature-image-wrap">
          ${signatureImageUrl ? `<img class="signature-image" src="${escapeHtml(signatureImageUrl)}" alt="Firma" />` : ''}
        </div>
        <div class="signature-line"></div>
        <div class="signature-name">${escapeHtml(seller.name || footer.issuerName || '')}</div>
        <div class="signature-role">${escapeHtml(seller.role || '')}</div>
      </div>
    </div>

    <div class="footer">
      <div>${escapeHtml(footer.issuerName || '')}</div>
      <div>RUC ${escapeHtml(footer.issuerRuc || '')}</div>
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
  const schema = getSchemaByCode(payload.schemaCode || 'ORD-COM');

  if (!schema) {
    const err: CustomError = new Error('Schema not found');
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const data = mergeDeep({}, schema.defaultData || {}, payload.schemaData || {});
  const baseUrl = buildAbsoluteUrl(req, '');
  const html = renderPurchaseOrderHtml(data, baseUrl);

  return {
    companyId,
    payload,
    html,
  };
}

async function previewPurchaseOrder(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  try {
    const { html } = await buildRenderContext(req);

    await fs.ensureDir(config.pdf.tempDir);

    const previewId = `ord-com-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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

    logger.info('purchase_order_documents.preview.completed', {
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
    logger.error('purchase_order_documents.preview.failed', {
      error,
      durationMs: Date.now() - startedAt,
    });
    next(error);
  }
}

async function generatePurchaseOrder(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  try {
    const { companyId, payload, html } = await buildRenderContext(req);

    const orderNumberRaw = String(
      payload.orderNumber ||
      payload.schemaData?.header?.orderNumber ||
      payload.schemaData?.orderNumber ||
      'sin-numero'
    );
    const safeOrderNumber = sanitizePathSegment(orderNumberRaw);
    const relativeDir = path.posix.join('ordenes-compra', `nro-${safeOrderNumber}`);
    const outputDir = storagePathService.getModulePath(
      companyId,
      'ordenes-compra',
      `nro-${safeOrderNumber}`
    );
    await fs.ensureDir(outputDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `orden-compra-${safeOrderNumber}-${timestamp}.pdf`;
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

    logger.info('purchase_order_documents.generate.completed', {
      companyId,
      orderNumber: safeOrderNumber,
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
    logger.error('purchase_order_documents.generate.failed', {
      error,
      durationMs: Date.now() - startedAt,
    });
    next(error);
  }
}

export async function previewPurchaseOrderDocument(req: Request, res: Response, next: NextFunction) {
  return previewPurchaseOrder(req, res, next);
}

export async function generatePurchaseOrderDocument(req: Request, res: Response, next: NextFunction) {
  return generatePurchaseOrder(req, res, next);
}
