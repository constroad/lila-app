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

function formatQuoteFolio(value: unknown, prefix: string): string {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return `${prefix} - ${raw || '0000000'}`;
  return `${prefix} - ${digits.padStart(7, '0')}`;
}

function formatCompactQuantity(value: unknown): string {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  if (Number.isInteger(num)) {
    return num.toLocaleString('en-US');
  }
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
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

function renderBankItems(bankAccounts: any[]): string {
  if (bankAccounts.length === 0) {
    return '<div class="empty-row">Sin cuentas bancarias configuradas</div>';
  }

  return bankAccounts
    .map((acc) => `
      <div class="bank-item">
        <div class="bank-line bank-line-top">
          <span class="bank-name">${escapeHtml(acc.bank || '')}</span>
          ${acc.type ? `<span class="bank-type">${escapeHtml(acc.type || '')}</span>` : ''}
        </div>
        <div class="bank-line">
          <span><span class="bank-label">CUENTA:</span> ${escapeHtml(acc.account || '')}</span>
          <span><span class="bank-label">CCI:</span> ${escapeHtml(acc.cci || '')}</span>
        </div>
      </div>
    `)
    .join('');
}

function groupServiceItems(itemsRaw: any[]) {
  const groups = new Map<string, any[]>();
  const orderedKeys: string[] = [];

  itemsRaw.forEach((item) => {
    const key = String(item?.phase || '').trim().toUpperCase() || 'OTROS';
    if (!groups.has(key)) {
      groups.set(key, []);
      orderedKeys.push(key);
    }
    groups.get(key)?.push(item);
  });

  const others = orderedKeys.filter((key) => key === 'OTROS');
  const regular = orderedKeys.filter((key) => key !== 'OTROS');

  return [...regular, ...others].map((phaseKey, groupIndex) => ({
    title: phaseKey,
    index: groupIndex + 1,
    items: groups.get(phaseKey) || [],
  }));
}

function normalizeServiceSections(rawSections: any[]): Array<{ title: string; lines: string[] }> {
  return rawSections
    .map((section) => ({
      title: String(section?.title || '').trim(),
      lines: Array.isArray(section?.lines) ? section.lines.map((line: unknown) => String(line || '').trim()).filter(Boolean) : [],
    }))
    .filter((section) => section.title || section.lines.length > 0);
}

function renderAsphaltQuoteHtml(data: Record<string, any>, baseUrl: string): string {
  const MIN_VISIBLE_ITEM_ROWS = 12;
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
  const formattedQuoteFolio = formatQuoteFolio(header.quoteNumber, 'ASF');
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

  const bankRows = renderBankItems(bankAccounts);

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
      margin-bottom: 0;
    }
    .issuer-name { font-weight: 700; font-size: 10.6px; margin-bottom: 1px; text-transform: uppercase; }
    .issuer-meta { font-size: 9.1px; color: #374151; margin-bottom: 0.5px; }
    .quote-head {
      min-width: 48mm;
      border: 1px solid #111827;
      padding: 2mm 3mm;
      min-height: 14mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .quote-head-title { font-weight: 700; font-size: 11.4px; text-align: center; line-height: 1.05; }
    .quote-head-series { font-weight: 700; font-size: 12.4px; text-align: center; line-height: 1.1; margin-top: 1.2mm; }
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
    .items {
      border: 1px solid #1f2937;
      table-layout: fixed;
    }
    .items th, .items td {
      padding: 4px 5px;
      vertical-align: top;
      font-size: 9.8px;
    }
    .items thead th {
      background: #f3f4f6;
      text-align: center;
      font-weight: 700;
      border-bottom: 1px solid #1f2937;
      border-left: 1px solid #1f2937;
      border-right: 1px solid #1f2937;
    }
    .items tbody tr { min-height: 42px; }
    .items tbody td {
      border-left: 1px solid #1f2937;
      border-right: 1px solid #1f2937;
      border-top: none;
      border-bottom: none;
    }
    .col-item { width: 18px; text-align: center; font-weight: 700; }
    .col-desc { width: auto; }
    .col-unit { width: 22px; text-align: center; }
    .col-qty { width: 44px; text-align: right; }
    .col-money { width: 86px; text-align: right; }
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
      padding: 0;
      font-size: 9.8px;
    }
    .term-row {
      display: grid;
      grid-template-columns: 145px 1fr;
      gap: 8px;
      margin-bottom: 2px;
    }
    .term-label { font-weight: 700; }

    .farewell {
      margin-top: 8px;
      font-size: 9.8px;
      line-height: 1.2;
    }
    .closing-grid {
      margin-top: 8px;
      padding-top: 8px;
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 18px;
      align-items: start;
    }
    .closing-left {
      min-height: 100px;
    }
    .seller {
      margin-top: 4px;
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
      margin-top: 6px;
      display: flex;
      align-items: flex-end;
    }
    .seller-image {
      max-height: 76px;
      max-width: 230px;
      width: auto;
      object-fit: contain;
    }
    .signature-line {
      width: 58mm;
      border-top: 1px solid #1f2937;
      margin-top: 1px;
      margin-bottom: 3px;
    }
    .banks-panel {
      min-height: 100px;
      padding-left: 6px;
    }
    .banks-title {
      font-size: 9.6px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 6px;
      text-align: left;
    }
    .bank-item {
      margin-bottom: 8px;
      font-size: 9.2px;
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
      font-size: 8.8px;
      color: #4b5563;
      text-transform: uppercase;
    }
    .bank-label {
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
          <div class="quote-head-title">COTIZACION</div>
          <div class="quote-head-series">${escapeHtml(formattedQuoteFolio)}</div>
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
          <th class="col-item">ITEM</th>
          <th class="col-desc">DESCRIPCIÓN</th>
          <th class="col-unit">UND.</th>
          <th class="col-qty">CANT.</th>
          <th class="col-money">P. UNIT.</th>
          <th class="col-money">PARCIAL</th>
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

    <div class="closing-grid">
      <div class="closing-left">
        <div class="farewell">Sin otro particular, quedamos de ustedes.</div>
        <div class="seller">ATENTAMENTE,</div>
        <div class="seller-image-wrap">
          ${signatureImageUrl ? `<img class="seller-image" src="${escapeHtml(signatureImageUrl)}" alt="Firma" />` : ''}
        </div>
        <div class="signature-line"></div>
        <div class="seller">${escapeHtml(seller.name || '')}</div>
        ${sellerRole ? `<div class="seller-role">${escapeHtml(sellerRole)}</div>` : ''}
        ${seller.phone ? `<div class="seller-contact">${escapeHtml(seller.phone)}</div>` : ''}
      </div>
      <div class="banks-panel">
        <div class="banks-title">Cuentas bancarias</div>
        ${bankRows}
      </div>
    </div>

    <div class="footer">
      <div>${escapeHtml(footer.address || '')}</div>
      <div>${escapeHtml(footer.phone || '')}</div>
      <div>${escapeHtml(footer.website || '')}</div>
    </div>
  </div>
</body>
</html>`;
}

function renderServiceQuoteHtml(data: Record<string, any>, baseUrl: string): string {
  const MIN_VISIBLE_ITEM_ROWS = 20;
  const header = data.header || {};
  const customer = data.customer || {};
  const totals = data.totals || {};
  const seller = data.seller || {};
  const footer = data.footer || {};
  const bankAccounts = Array.isArray(data.issuerBankAccounts) ? data.issuerBankAccounts : [];
  const sections = normalizeServiceSections(Array.isArray(data.sections) ? data.sections : []);
  const intro = String(data.intro || '');
  const logoUrl = resolveImageUrl(baseUrl, header.logoUrl);
  const signatureImageUrl = resolveImageUrl(baseUrl, seller.signatureImageUrl || '');
  const sellerRole = String(seller.role || '').trim();
  const formattedQuoteFolio = formatQuoteFolio(header.quoteNumber, 'SER');
  const serviceGroups = groupServiceItems(Array.isArray(data.items) ? data.items : []);
  const subtotal = Number(totals.subtotal || 0);
  const igv = Number(totals.igv || 0);
  const total = Number(totals.total || 0);
  const amountInWords = String(totals.amountInWords || '').trim();
  const bankRows = renderBankItems(bankAccounts);
  const paymentSection = sections.find((section) => section.title.toLowerCase() === 'condiciones de pago');
  const scopeSections = sections.filter((section) => section !== paymentSection);
  const leftSections = scopeSections.filter((_, index) => index % 2 === 0);
  const rightSections = scopeSections.filter((_, index) => index % 2 === 1);

  const renderSectionsColumn = (columnSections: Array<{ title: string; lines: string[] }>) =>
    columnSections
      .map(
        (section) => `
          <section class="note-section">
            <div class="note-title">${escapeHtml(section.title)}</div>
            <div class="note-list">
              ${section.lines.map((line) => `<div class="note-line">- ${escapeHtml(line)}</div>`).join('')}
            </div>
          </section>
        `
      )
      .join('');

  const renderedItemRows = serviceGroups.length > 0
    ? serviceGroups
      .map((group) => {
        const phaseTitle = escapeHtml(group.title);
        const itemsHtml = group.items
          .map((item: any, itemIndex: number) => `
            <tr class="service-item-row">
              <td class="col-item">${escapeHtml(`${group.index}.${itemIndex + 1}`)}</td>
              <td class="col-desc service-desc-cell">${escapeHtml(item.description || '')}</td>
              <td class="col-unit">${escapeHtml(item.unit || '')}</td>
              <td class="col-qty">${formatCompactQuantity(item.quantity)}</td>
              <td class="col-money">${formatMoney(item.unitPrice)}</td>
              <td class="col-money">${formatMoney(item.lineTotal)}</td>
            </tr>
          `)
          .join('');

        return `
          <tr class="phase-row ${group.index > 1 ? 'phase-row-spaced' : 'phase-row-first'}">
            <td class="col-item phase-code">${group.index}</td>
            <td class="col-desc phase-title">${phaseTitle}</td>
            <td class="col-unit"></td>
            <td class="col-qty"></td>
            <td class="col-money"></td>
            <td class="col-money"></td>
          </tr>
          ${itemsHtml}
        `;
      })
      .join('')
    : `
      <tr>
        <td class="col-item">1</td>
        <td class="col-desc service-desc-cell">SIN ITEMS REGISTRADOS</td>
        <td class="col-unit">-</td>
        <td class="col-qty">0</td>
        <td class="col-money">0.00</td>
        <td class="col-money">0.00</td>
      </tr>
    `;

  const visibleItemRowCount = serviceGroups.reduce((totalRows, group) => totalRows + group.items.length, 0);
  const fillerRowsHtml = Array.from({
    length: Math.max(0, MIN_VISIBLE_ITEM_ROWS - visibleItemRowCount),
  })
    .map(
      () => `
        <tr class="service-item-row service-item-row-empty">
          <td class="col-item">&nbsp;</td>
          <td class="col-desc service-desc-cell">&nbsp;</td>
          <td class="col-unit">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
          <td class="col-money">&nbsp;</td>
          <td class="col-money">&nbsp;</td>
        </tr>
      `
    )
    .join('');

  const groupRowsHtml = `${renderedItemRows}${fillerRowsHtml}`;
  const paymentSectionHtml = paymentSection
    ? `
      <section class="payment-section">
        <div class="payment-title">${escapeHtml(paymentSection.title)}</div>
        <div class="payment-list">
          ${paymentSection.lines.map((line) => `<div class="payment-line">- ${escapeHtml(line)}</div>`).join('')}
        </div>
      </section>
    `
    : '';
  const scopeSectionsHtml = leftSections.length || rightSections.length
    ? `
      <div class="sections-grid">
        <div>${renderSectionsColumn(leftSections)}</div>
        <div>${renderSectionsColumn(rightSections)}</div>
      </div>
    `
    : '<div class="empty-row">Sin alcance adicional registrado.</div>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4 portrait; margin: 10mm; }
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
    .sheet + .sheet {
      page-break-before: always;
    }
    .sheet-secondary {
      min-height: 272mm;
      display: flex;
      flex-direction: column;
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
    .quote-head {
      min-width: 48mm;
      border: 1px solid #111827;
      padding: 2mm 3mm;
      min-height: 14mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .quote-head-title { font-weight: 700; font-size: 11.2px; text-align: center; line-height: 1.05; }
    .quote-head-series { font-weight: 700; font-size: 12.2px; text-align: center; line-height: 1.1; margin-top: 1.2mm; }
    .quote-date { text-align: right; font-size: 10.1px; margin: 2px 0 8px 0; }

    .customer-block {
      margin-bottom: 8px;
      font-size: 10.1px;
    }
    .customer-line {
      display: flex;
      gap: 5px;
      margin-bottom: 2px;
    }
    .customer-label {
      font-weight: 700;
      min-width: 74px;
      text-transform: uppercase;
    }
    .intro { font-size: 10px; margin-bottom: 8px; }

    table { width: 100%; border-collapse: collapse; }
    .items {
      border: 1px solid #1f2937;
      table-layout: fixed;
    }
    .items th, .items td {
      padding: 4px 5px;
      vertical-align: top;
      font-size: 9.3px;
    }
    .items thead th {
      background: #f3f4f6;
      text-align: center;
      font-weight: 700;
      border-left: 1px solid #1f2937;
      border-right: 1px solid #1f2937;
      border-bottom: 1px solid #1f2937;
    }
    .items tbody td {
      border-left: 1px solid #1f2937;
      border-right: 1px solid #1f2937;
      border-top: none;
      border-bottom: none;
    }
    .service-item-row td {
      padding-top: 2px;
      padding-bottom: 2px;
    }
    .service-item-row-empty td {
      padding-top: 0;
      padding-bottom: 0;
      height: 20px;
    }
    .col-item { width: 24px; text-align: center; font-weight: 700; }
    .col-desc { width: auto; }
    .service-desc-cell {
      padding-right: 8px;
      line-height: 1.15;
    }
    .col-unit { width: 36px; text-align: center; }
    .col-qty { width: 52px; text-align: right; }
    .col-money { width: 72px; text-align: right; }
    .phase-row td {
      padding-top: 4px;
      padding-bottom: 2px;
      font-weight: 700;
      background: #fbfbfc;
    }
    .phase-row-spaced td {
      padding-top: 10px;
      padding-bottom: 3px;
    }
    .phase-code {
      text-align: center;
    }
    .phase-title {
      text-transform: uppercase;
    }
    .payment-section {
      margin-top: 20px;
      border: 1px solid #1f2937;
      padding: 6px 8px;
    }
    .payment-title {
      font-size: 9.7px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .payment-list {
      font-size: 9.1px;
      line-height: 1.34;
    }
    .payment-line {
      margin-bottom: 2px;
    }

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
    .totals-table .label { font-weight: 700; width: 58%; }
    .totals-table .value { text-align: right; font-weight: 700; }

    .page-title {
      font-size: 10.6px;
      font-weight: 700;
      text-transform: uppercase;
      margin: 0 0 8px 0;
    }
    .sections-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      align-items: start;
    }
    .note-section {
      margin-bottom: 10px;
      break-inside: avoid;
    }
    .note-title {
      font-size: 9.8px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .note-list {
      font-size: 9.2px;
      line-height: 1.34;
    }
    .note-line {
      margin-bottom: 2px;
    }

    .closing-grid {
      margin-top: auto;
      padding-top: 10px;
      display: grid;
      grid-template-columns: 1.08fr 0.92fr;
      gap: 18px;
      align-items: start;
    }
    .farewell {
      margin-top: 0;
      font-size: 9.8px;
      line-height: 1.25;
    }
    .seller {
      margin-top: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .seller-role {
      font-size: 9.4px;
      font-weight: 700;
      text-transform: uppercase;
      margin-top: 1px;
    }
    .seller-image-wrap {
      min-height: 80px;
      margin-top: 8px;
      display: flex;
      align-items: flex-end;
    }
    .seller-image {
      max-height: 78px;
      max-width: 230px;
      width: auto;
      object-fit: contain;
    }
    .signature-line {
      width: 58mm;
      border-top: 1px solid #1f2937;
      margin-top: 2px;
      margin-bottom: 3px;
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
    .empty-row { text-align: center; color: #6b7280; }
    .footer {
      margin-top: 10px;
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
          <div class="issuer-meta">${escapeHtml(header.issuerEmail || '')}</div>
          <div class="issuer-meta">${escapeHtml(header.issuerPhone || '')}</div>
          <div class="issuer-meta">${escapeHtml(header.issuerAddress || '')}</div>
        </div>
        <div class="quote-head">
          <div class="quote-head-title">COTIZACION</div>
          <div class="quote-head-series">${escapeHtml(formattedQuoteFolio)}</div>
        </div>
      </div>
    </div>

    <div class="quote-date">${escapeHtml(header.quoteDate || '')}</div>

    <div class="customer-block">
      <div class="customer-line">
        <div class="customer-label">Cliente:</div>
        <div>${escapeHtml(customer.name || '')}</div>
      </div>
      ${customer.ruc ? `
        <div class="customer-line">
          <div class="customer-label">RUC:</div>
          <div>${escapeHtml(customer.ruc || '')}</div>
        </div>
      ` : ''}
      ${customer.attention ? `
        <div class="customer-line">
          <div class="customer-label">ATT.:</div>
          <div>${escapeHtml(customer.attention || '')}</div>
        </div>
      ` : ''}
    </div>

    <div class="intro">${escapeHtml(intro)}</div>

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
      <tbody>
        ${groupRowsHtml}
      </tbody>
    </table>

    <div class="totals-wrap">
      <div class="amount-words">${amountInWords ? escapeHtml(amountInWords) : '&nbsp;'}</div>
      <table class="totals-table">
        <tbody>
          <tr><td class="label">SUBTOTAL</td><td class="value">${formatMoney(subtotal)}</td></tr>
          <tr><td class="label">IGV (18%)</td><td class="value">${formatMoney(igv)}</td></tr>
          <tr><td class="label">TOTAL</td><td class="value">${formatMoney(total)}</td></tr>
        </tbody>
      </table>
    </div>

    ${paymentSectionHtml}
  </div>

  <div class="sheet sheet-secondary">
    <div>
      <div class="page-title">Alcance del servicio</div>
      ${scopeSectionsHtml}
    </div>

    <div class="closing-grid">
      <div>
        <div class="farewell">Sin otro particular, quedamos de ustedes.</div>
        <div class="seller">ATENTAMENTE,</div>
        <div class="seller-image-wrap">
          ${signatureImageUrl ? `<img class="seller-image" src="${escapeHtml(signatureImageUrl)}" alt="Firma" />` : ''}
        </div>
        <div class="signature-line"></div>
        <div class="seller">${escapeHtml(seller.name || '')}</div>
        ${sellerRole ? `<div class="seller-role">${escapeHtml(sellerRole)}</div>` : ''}
      </div>
      <div>
        <div class="banks-title">Cuentas bancarias</div>
        ${bankRows}
      </div>
    </div>

    <div class="footer">
      <div>${escapeHtml(footer.address || '')}</div>
      <div>${escapeHtml(footer.phone || '')}</div>
      <div>${escapeHtml(footer.email || '')}</div>
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
  let html = '';

  if (payload.schemaCode === 'COT-ASF') {
    html = renderAsphaltQuoteHtml(data, baseUrl);
  } else if (payload.schemaCode === 'COT-SER') {
    html = renderServiceQuoteHtml(data, baseUrl);
  } else {
    html = await new ReportHtmlRenderer(schema, data, { companyId, baseUrl }).render();
  }

  return {
    companyId,
    payload,
    html,
  };
}

async function previewQuoteDocument(req: Request, res: Response, next: NextFunction, previewPrefix: string) {
  const startedAt = Date.now();
  try {
    const { html } = await buildRenderContext(req);

    await fs.ensureDir(config.pdf.tempDir);

    const previewId = `${previewPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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

type GenerateQuoteOptions = {
  relativeRoot: string;
  filenamePrefix: string;
};

async function generateQuoteDocument(
  req: Request,
  res: Response,
  next: NextFunction,
  options: GenerateQuoteOptions
) {
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

    const relativeDir = path.posix.join('cotizaciones', options.relativeRoot, `nro-${safeQuoteNumber}`);
    const outputDir = storagePathService.getModulePath(
      companyId,
      'cotizaciones',
      path.posix.join(options.relativeRoot, `nro-${safeQuoteNumber}`)
    );
    await fs.ensureDir(outputDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${options.filenamePrefix}-${safeQuoteNumber}-${timestamp}.pdf`;
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

export async function previewAsphaltQuoteDocument(req: Request, res: Response, next: NextFunction) {
  return previewQuoteDocument(req, res, next, 'cot-asf');
}

export async function generateAsphaltQuoteDocument(req: Request, res: Response, next: NextFunction) {
  return generateQuoteDocument(req, res, next, {
    relativeRoot: 'asfalto',
    filenamePrefix: 'cotizacion-asfalto',
  });
}

export async function previewServiceQuoteDocument(req: Request, res: Response, next: NextFunction) {
  return previewQuoteDocument(req, res, next, 'cot-ser');
}

export async function generateServiceQuoteDocument(req: Request, res: Response, next: NextFunction) {
  return generateQuoteDocument(req, res, next, {
    relativeRoot: 'servicios',
    filenamePrefix: 'cotizacion-servicio',
  });
}
