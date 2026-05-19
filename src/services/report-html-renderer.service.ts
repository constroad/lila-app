import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import axios from 'axios';
import { DocumentSchema, SectionSchema, FieldSchema, ColumnSchema } from '../schemas/documents/types.js';
import { storagePathService } from './storage-path.service.js';
import { ImageCompressionService } from './image-compression.service.js';
import logger from '../utils/logger.js';
import { numberToWords } from '../utils/number-to-words.js';
import {
  getDocumentLetterhead,
  getDocumentLetterheadMargins,
  shouldHideDocumentLogo,
} from './document-letterhead.service.js';

interface HtmlRendererOptions {
  companyId?: string;
  baseUrl?: string;
  imageMaxWidth?: number;
  imageMaxHeight?: number;
}

interface PhotoItem {
  id?: string;
  filename?: string;
  descripcion?: string;
  fecha?: string;
  hora?: string;
  codigoMuestra?: string;
  progresiva?: string;
  base64?: string;
  url?: string;
  renderedUrl?: string;
  renderedThumbnailUrl?: string;
  filePath?: string;
  path?: string;
  buffer?: Buffer;
  category?: string;
  areaM2?: number;
  volumeM3?: number;
  tipo?: string;
  purpose?: string;
  includeInPdf?: boolean;
}

interface PhotoGroup {
  label?: string;
  photos: PhotoItem[];
}

export class ReportHtmlRenderer {
  private schema: DocumentSchema;
  private data: Record<string, any>;
  private options: HtmlRendererOptions;
  private headerSection: SectionSchema | null;
  private sectionTitleMap: Map<string, string>;

  constructor(schema: DocumentSchema, data: Record<string, any>, options: HtmlRendererOptions = {}) {
    this.schema = schema;
    this.data = data;
    this.options = {
      imageMaxWidth: 260,
      imageMaxHeight: 180,
      ...options,
    };
    this.headerSection = schema.sections.find((section) => section.type === 'header') || null;
    this.sectionTitleMap = this.buildSectionTitleMap();
  }

  async render(): Promise<string> {
    if (this.schema.code === 'CTL-IMP') {
      return this.renderControlImprimacionDocument();
    }
    if (this.schema.code === 'CONT-SRV') {
      return this.renderContractDocument();
    }
    const sections: string[] = [];
    for (const section of this.schema.sections) {
      if (!this.shouldRenderSection(section)) {
        continue;
      }
      if (section.type === 'header') {
        const output = await this.renderSection(section);
        if (output) {
          sections.push(this.wrapSectionOutput(section, output));
        }
        continue;
      }

      let output = await this.renderSection(section);
      if (!output) continue;
      if (section.includeHeader && this.headerSection) {
        const headerHtml = await this.renderHeaderWithOverride(section);
        output = `${headerHtml}${output}`;
      }
      sections.push(this.wrapSectionOutput(section, output));
    }

    const pageSize = this.schema.pageSize || 'A4';
    const baseOrientation = this.schema.orientation === 'landscape' ? 'landscape' : 'portrait';
    const backgroundHtml = await this.buildBackgroundHtml();
    const letterhead = getDocumentLetterhead(this.data);
    const margins = letterhead
      ? getDocumentLetterheadMargins(letterhead, this.schema.margins)
      : { top: 0, right: 0, bottom: 0, left: 0 };
    const pageMargin = letterhead
      ? `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`
      : '20px';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1 { font-size: 18px; margin: 0 0 6px 0; text-align: center; }
    h2 { font-size: 14px; margin: 16px 0 6px 0; }
    h3 { font-size: 12px; margin: 12px 0 6px 0; }
    .section { margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #333; padding: 4px 6px; vertical-align: top; }
    th { background: #f1f1f1; }
    .kv-table.kv-2 td:first-child { width: 35%; font-weight: bold; }
    .kv-table.kv-4 td:nth-child(odd) { width: 20%; font-weight: bold; }
    .kv-table.kv-4 td:nth-child(even) { width: 30%; }
    .photo-table td { text-align: center; }
    .photo-table img { max-width: 100%; height: auto; }
    .caption { font-size: 10px; margin-top: 4px; }
    .checklist { list-style: none; padding: 0; margin: 0; }
    .checklist li { margin-bottom: 4px; }
    .page-wrapper { }
    .page-break { break-before: page; page-break-before: always; }
    .signature-section { break-inside: avoid; page-break-inside: avoid; }
    .page-landscape { page: landscape; }
    .page-portrait { page: portrait; }
    .letterhead-bg { position: fixed; inset: 0; width: 100%; height: 100%; z-index: -1; }
    .letterhead-bg img { width: 100%; height: 100%; object-fit: cover; }
    .document-content { padding: 0; }
    @page { size: ${pageSize} ${baseOrientation}; margin: ${pageMargin}; }
    @page portrait { size: ${pageSize} portrait; margin: ${pageMargin}; }
    @page landscape { size: ${pageSize} landscape; margin: ${pageMargin}; }
  </style>
</head>
<body>
  ${backgroundHtml}
  <div class="document-content">
    ${sections.join('\n')}
  </div>
</body>
</html>`;
  }

  private async buildBackgroundHtml(): Promise<string> {
    if (getDocumentLetterhead(this.data)) return '';
    const letterhead = getDocumentLetterhead(this.data);
    const imageUrl = String(letterhead?.url || '').trim();
    if (!imageUrl) return '';
    try {
      const src = await this.resolveImageSrc({ url: imageUrl } as any);
      if (!src) return '';
      return `<div class="letterhead-bg"><img src="${src}" alt="" /></div>`;
    } catch {
      return '';
    }
  }

  private async renderControlImprimacionDocument(): Promise<string> {
    const pageSections: string[] = [];
    const headerSection = this.schema.sections.find((section) => section.id === 'header');
    const controls = this.getCtlImpControls();

    for (let index = 0; index < controls.length; index += 1) {
      const control = this.normalizeCtlImpControl(controls[index]);
      const headerHtml = headerSection ? await this.renderHeader(headerSection) : '';
      const pageBreak = index === 0 ? '' : ' page-break';
      pageSections.push(`
        <section class="ctl-imp-page${pageBreak}">
          ${headerHtml}
          ${this.renderCtlImpMetadata(control)}
          ${this.renderCtlImpMaterials(control)}
          ${this.renderCtlImpRateTable(control)}
        </section>
      `);
    }

    const photoSection = this.schema.sections.find((section) => section.id === 'registroFotografico');
    if (photoSection) {
      const photos = this.resolvePhotos(photoSection);
      if (photos.length > 0) {
        const title = photoSection.title
          ? `<h2>${this.escapeHtml(photoSection.title)}</h2>`
          : '';
        const table = await this.renderPhotoTable(photos, photoSection);
        const headerHtml = photoSection.includeHeader && this.headerSection
          ? await this.renderHeaderWithOverride(photoSection)
          : '';
        pageSections.push(`
          <section class="ctl-imp-page page-break">
            ${headerHtml}
            ${title}
            ${table}
          </section>
        `);
      }
    }

    const signatureSection = this.schema.sections.find((section) => section.id === 'firmas');
    if (signatureSection && this.hasCtlImpSignatureContent()) {
      const headerHtml = signatureSection.includeHeader && this.headerSection
        ? await this.renderHeaderWithOverride(signatureSection)
        : headerSection
        ? await this.renderHeader(headerSection)
        : '';
      const signaturesHtml = await this.renderSignatures(signatureSection);
      pageSections.push(`
        <section class="ctl-imp-page page-break">
          ${headerHtml}
          ${signaturesHtml}
        </section>
      `);
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; font-size: 10px; color: #111; margin: 0; }
    h2 { margin: 0 0 8px 0; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #222; padding: 4px; vertical-align: middle; }
    .ctl-imp-page { width: 100%; }
    .page-break { break-before: page; page-break-before: always; }
    .ctl-imp-meta td { font-size: 10px; font-weight: 700; }
    .ctl-imp-meta .label { width: 9%; white-space: nowrap; }
    .ctl-imp-meta .value { font-weight: 600; }
    .ctl-imp-title td { font-size: 14px; font-weight: 800; text-align: center; }
    .ctl-imp-block-title { font-size: 12px; font-weight: 800; text-transform: uppercase; text-decoration: underline; }
    .ctl-imp-rate-title td { font-size: 13px; font-weight: 800; text-align: center; }
    .ctl-imp-rate th { background: #f3f3f3; font-weight: 800; }
    .ctl-imp-rate .left-label { width: 38%; }
    .ctl-imp-rate .tray-col { width: 11%; text-align: center; }
    .ctl-imp-rate .unit-col { width: 8%; text-align: center; font-weight: 700; }
    .ctl-imp-rate .truck-label { width: 24%; }
    .ctl-imp-rate .truck-value { width: 14%; text-align: center; font-weight: 700; }
    .ctl-imp-rate .truck-unit { width: 8%; text-align: center; font-weight: 700; }
    .ctl-imp-rate .center { text-align: center; }
    .ctl-imp-rate .bold { font-weight: 800; }
    .ctl-imp-observaciones { min-height: 80px; }
    .ctl-imp-observaciones .line { border-bottom: 1px solid #555; height: 20px; }
    .photo-table td { text-align: center; }
    .photo-table img { max-width: 100%; height: auto; }
    .caption { font-size: 10px; margin-top: 4px; }
    @page { size: ${this.schema.pageSize || 'A4'} portrait; margin: 8mm; }
  </style>
</head>
<body>
  ${pageSections.join('\n')}
</body>
</html>`;
  }

  private async renderContractDocument(): Promise<string> {
    const d = this.data;
    const e = (s: any) => this.escapeHtml(String(s ?? ''));
    const fmt = (n: any) => (typeof n === 'number' ? n.toFixed(2) : e(n));
    const backgroundHtml = await this.buildBackgroundHtml();
    const letterhead = getDocumentLetterhead(this.data);
    const margins = letterhead
      ? getDocumentLetterheadMargins(letterhead, this.schema.margins)
      : this.schema.margins || { top: 20, right: 20, bottom: 20, left: 20 };
    const pageMargin = letterhead
      ? `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`
      : '20px';

    const titulo = e(d.titulo?.texto || 'CONTRATO DE SERVICIO');
    const proveedor = d.proveedor || {};
    const cliente = d.cliente || {};
    const monto = d.monto || {};

    const montoTotal = typeof monto.total === 'number' ? monto.total : parseFloat(monto.total) || 0;
    const montoEnLetras = monto.totalEnLetras && String(monto.totalEnLetras).trim()
      ? String(monto.totalEnLetras).trim()
      : montoTotal > 0 ? `SON: ${numberToWords(montoTotal)} SOLES` : '';

    const partiesHtml = `
<p style="text-align:justify;margin-bottom:12pt;">
  Conste por el presente documento que celebra de una parte la empresa
  <strong>${e(cliente.razonSocial)}</strong>${e(cliente.ruc) ? `, identificado con RUC N° ${e(cliente.ruc)}` : ''},
  con domicilio legal en ${e(cliente.domicilio)},
  debidamente representada por <strong>${e(cliente.representante)}</strong>${e(cliente.dniRepresentante) ? `, con DNI N° ${e(cliente.dniRepresentante)}` : ''},
  a quien en adelante se denominará <strong>"EL CLIENTE"</strong>.
</p>
<p style="text-align:justify;margin-bottom:12pt;">
  Y de otra parte, la empresa
  <strong>${e(proveedor.razonSocial)}</strong>${e(proveedor.ruc) ? `, identificado con RUC N° ${e(proveedor.ruc)}` : ''},
  domiciliado en ${e(proveedor.domicilio)},
  debidamente representada por <strong>${e(proveedor.representante)}</strong>${e(proveedor.dniRepresentante) ? `, con DNI N° ${e(proveedor.dniRepresentante)}` : ''},
  a quien en adelante se denominará <strong>"EL PROVEEDOR"</strong>.
</p>
<p style="text-align:justify;margin-bottom:12pt;">
  En los términos y condiciones del presente contrato, que se sujetan a las siguientes cláusulas:
</p>`;

    const renderClauseText = (content: string): string => {
      const lines = content ? content.split(/\r?\n/) : [];
      return lines.map((line) => {
        if (!line.trim()) return '';
        // Lines matching "a) Title" or "a. Title" pattern render as bold sub-headings
        if (/^[a-z]\)[ \t]/.test(line.trim())) {
          const [prefix, ...rest] = line.trim().split(/[ \t]/);
          return `<p style="margin:8pt 0 2pt 0;"><strong>${e(prefix)} ${e(rest.join(' '))}</strong></p>`;
        }
        return `<p style="text-align:justify;margin:6pt 0;">${e(line)}</p>`;
      }).join('');
    };

    const renderClause = (title: string, content: string) => {
      const body = renderClauseText(content) || '<p>&nbsp;</p>';
      return title
        ? `<h2 style="font-size:12pt;font-weight:bold;text-align:center;margin:14pt 0 6pt 0;">${e(title)}</h2>${body}`
        : body;
    };

    const priceRows = Array.isArray(d.preciosUnitarios) ? d.preciosUnitarios : [];
    const priceTableHtml = priceRows.length > 0 ? `
<table style="width:100%;border-collapse:collapse;margin:8pt 0;font-size:11pt;">
  <thead>
    <tr style="background:#e8e8e8;">
      <th style="border:1px solid #000;padding:5pt 8pt;text-align:left;">DETALLE</th>
      <th style="border:1px solid #000;padding:5pt 8pt;text-align:center;">UND.</th>
      <th style="border:1px solid #000;padding:5pt 8pt;text-align:right;">COSTO (S/)</th>
    </tr>
  </thead>
  <tbody>
    ${priceRows.map((row: any) => `
    <tr>
      <td style="border:1px solid #000;padding:4pt 8pt;">${e(row.detalle)}</td>
      <td style="border:1px solid #000;padding:4pt 8pt;text-align:center;">${e(row.unidad)}</td>
      <td style="border:1px solid #000;padding:4pt 8pt;text-align:right;">${fmt(row.costo)}</td>
    </tr>`).join('')}
  </tbody>
</table>` : '';

    const bankRows = Array.isArray(d.cuentasBancarias) ? d.cuentasBancarias : [];
    const bankTableHtml = bankRows.length > 0 ? `
<p style="margin:8pt 0 4pt 0;"><strong>Datos bancarios para el pago:</strong></p>
<table style="width:100%;border-collapse:collapse;margin:4pt 0 8pt 0;font-size:11pt;">
  <thead>
    <tr style="background:#e8e8e8;">
      <th style="border:1px solid #000;padding:5pt 8pt;text-align:left;">BANCO</th>
      <th style="border:1px solid #000;padding:5pt 8pt;text-align:left;">CUENTA</th>
      <th style="border:1px solid #000;padding:5pt 8pt;text-align:left;">CCI</th>
      <th style="border:1px solid #000;padding:5pt 8pt;text-align:left;">TIPO</th>
    </tr>
  </thead>
  <tbody>
    ${bankRows.map((row: any) => `
    <tr>
      <td style="border:1px solid #000;padding:4pt 8pt;">${e(row.banco)}</td>
      <td style="border:1px solid #000;padding:4pt 8pt;">${e(row.cuenta)}</td>
      <td style="border:1px solid #000;padding:4pt 8pt;">${e(row.cci)}</td>
      <td style="border:1px solid #000;padding:4pt 8pt;">${e(row.tipo)}</td>
    </tr>`).join('')}
  </tbody>
</table>` : '';

    const sectorRows = Array.isArray(d.sectoresPago) ? d.sectoresPago : [];
    const sectorTableHtml = this.renderSectorTables(sectorRows, e, fmt);

    const obra = d.obra || {};
    const plazos = d.plazos || {};
    const cierre = d.cierre || {};

    const obraHtml = `
<p style="text-align:justify;margin:6pt 0;">
  <strong>OBRA:</strong> ${e(obra.nombre)}${e(obra.cui) ? ` &mdash; CUI N.° ${e(obra.cui)}` : ''}
  ${e(obra.ubicacion) ? `<br/><strong>UBICACIÓN:</strong> ${e(obra.ubicacion)}` : ''}
</p>`;

    const montoHtml = `
<p style="text-align:justify;margin:6pt 0;">
  El monto total del presente contrato asciende a <strong>S/. ${fmt(montoTotal)}</strong>
  ${montoEnLetras ? `(<strong>${e(montoEnLetras)}</strong>)` : ''}.
</p>
<p style="text-align:justify;margin:6pt 0;">
  El importe total, podrá tener variación, ya que se rige a nivel de precios unitarios, por tal motivo los precios son los siguientes:
</p>
${priceTableHtml}
${e(monto.descripcionMetrado) ? `<p style="text-align:justify;margin:6pt 0;">${e(monto.descripcionMetrado)}</p>` : ''}`;

    const plazosHtml = `
${e(plazos.fechaInicio) ? `<p style="margin:6pt 0;"><strong>Inicio:</strong> ${e(plazos.fechaInicio)}</p>` : ''}
${e(plazos.fechaCulminacion) ? `<p style="margin:6pt 0;"><strong>Culminación:</strong> ${e(plazos.fechaCulminacion)}</p>` : ''}
${e(plazos.responsableInicio) ? `<p style="margin:6pt 0;"><strong>Responsable:</strong> ${e(plazos.responsableInicio)}</p>` : ''}
${e(plazos.descripcion) ? `<p style="text-align:justify;margin:6pt 0;">${e(plazos.descripcion)}</p>` : ''}`;

    const signaturesHtml = `
<div style="display:flex;justify-content:space-around;margin-top:80pt;gap:20pt;page-break-inside:avoid;">
  <div style="text-align:center;width:45%;">
    <div style="border-top:2px solid #000;padding-top:10pt;margin-top:60pt;">
      <div style="font-weight:bold;">${e(cliente.representante) || 'EL CLIENTE'}</div>
      <div>${e(cliente.razonSocial)}</div>
      ${e(cliente.ruc) ? `<div>RUC N° ${e(cliente.ruc)}</div>` : ''}
    </div>
  </div>
  <div style="text-align:center;width:45%;">
    <div style="border-top:2px solid #000;padding-top:10pt;margin-top:60pt;">
      <div style="font-weight:bold;">${e(proveedor.representante) || 'EL PROVEEDOR'}</div>
      <div>${e(proveedor.razonSocial)}</div>
      ${e(proveedor.ruc) ? `<div>RUC N° ${e(proveedor.ruc)}</div>` : ''}
    </div>
  </div>
</div>`;

    const cierreHtml = e(cierre.ciudad) || e(cierre.fechaFirma) ? `
<p style="text-align:center;margin-top:24pt;">
  Las partes firman la presente por duplicado en señal de conformidad en la Ciudad de
  <strong>${e(cierre.ciudad)}</strong>, a los ${e(cierre.fechaFirma)}.
</p>` : '';

    const body = `
<h1 style="text-align:center;font-size:14pt;font-weight:bold;margin-bottom:16pt;line-height:1.4;">${titulo}</h1>
${partiesHtml}
${renderClause('CLAUSULA PRIMERA: ANTECEDENTES', d.clausula1 || '')}
<h2 style="font-size:12pt;font-weight:bold;text-align:center;margin:14pt 0 6pt 0;">CLAUSULA SEGUNDA: OBJETO</h2>
<p style="text-align:justify;margin:6pt 0;">Es objeto del presente contrato la instalación de asfalto resultante al terreno en la cual el contratante está ejecutando la siguiente:</p>
${obraHtml}
${renderClause('Descripción de los Trabajos', d.clausula2Trabajos || '')}
<h2 style="font-size:12pt;font-weight:bold;text-align:center;margin:14pt 0 6pt 0;">CLAUSULA TERCERA: MONTO CONTRACTUAL</h2>
${montoHtml}
<h2 style="font-size:12pt;font-weight:bold;text-align:center;margin:14pt 0 6pt 0;">CLAUSULA CUARTA: FORMA DE PAGO Y GARANTÍA DE CRÉDITO</h2>
${renderClause('', d.clausula4FormaPago || '')}
${sectorTableHtml}
${bankTableHtml}
<h2 style="font-size:12pt;font-weight:bold;text-align:center;margin:14pt 0 6pt 0;">CLAUSULA QUINTA: INICIO Y CULMINACIÓN DE LA PRESTACIÓN</h2>
${plazosHtml}
${renderClause('', d.clausula5Texto || '')}
${renderClause('CLAUSULA SEXTA: MARCO LEGAL DEL CONTRATO', d.clausula6Marco || '')}
${renderClause('CLAUSULA SEPTIMA: RESPONSABILIDAD DEL CLIENTE Y EL PROVEEDOR', d.clausula7Responsabilidades || '')}
${renderClause('CLAUSULA OCTAVA: ARBITRAJE', d.clausula8Arbitraje || '')}
${renderClause('CLAUSULA NOVENA: VERACIDAD DE DOMICILIOS', d.clausula9Domicilios || '')}
${cierreHtml}
${signaturesHtml}`;

    const bodyPadding = letterhead
      ? '0'
      : `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #000;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .contract-body {
      padding: ${bodyPadding};
    }
    .letterhead-bg {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
    }
    .letterhead-bg img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    @page { size: A4 portrait; margin: ${pageMargin}; }
    p { margin: 6pt 0; }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  ${backgroundHtml}
  <div class="contract-body">
    ${body}
  </div>
</body>
</html>`;
  }

  private renderSectorTables(
    rows: any[],
    e: (s: any) => string,
    fmt: (n: any) => string,
  ): string {
    if (rows.length === 0) return '';

    const IGV_RATE = 0.18;
    const groups = new Map<string, any[]>();
    for (const row of rows) {
      const key = String(row.sector || 'SECTOR 1');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const tables = Array.from(groups.entries()).map(([sector, items]) => {
      const subtotal = items.reduce((sum: number, r: any) => {
        const val = typeof r.parcial === 'number' ? r.parcial : (parseFloat(r.parcial) || 0);
        return sum + val;
      }, 0);
      const igv = subtotal * IGV_RATE;
      const total = subtotal + igv;

      const itemRows = items.map((r: any) => `
      <tr>
        <td style="border:1px solid #000;padding:3pt 6pt;text-align:center;">${e(r.itemCode)}</td>
        <td style="border:1px solid #000;padding:3pt 6pt;">${e(r.descripcion)}</td>
        <td style="border:1px solid #000;padding:3pt 6pt;text-align:center;">${e(r.unidad)}</td>
        <td style="border:1px solid #000;padding:3pt 6pt;text-align:right;">${fmt(r.metrado)}</td>
        <td style="border:1px solid #000;padding:3pt 6pt;text-align:right;">${fmt(r.precioUnit)}</td>
        <td style="border:1px solid #000;padding:3pt 6pt;text-align:right;">${fmt(r.parcial)}</td>
      </tr>`).join('');

      return `
<p style="margin:10pt 0 4pt 0;"><strong>${e(sector)}</strong></p>
<table style="width:100%;border-collapse:collapse;margin:4pt 0;font-size:10pt;">
  <thead>
    <tr style="background:#e8e8e8;">
      <th style="border:1px solid #000;padding:4pt 6pt;text-align:center;width:8%;">ITEM</th>
      <th style="border:1px solid #000;padding:4pt 6pt;text-align:left;">DESCRIPCIÓN</th>
      <th style="border:1px solid #000;padding:4pt 6pt;text-align:center;width:8%;">UNID.</th>
      <th style="border:1px solid #000;padding:4pt 6pt;text-align:right;width:10%;">METRADO</th>
      <th style="border:1px solid #000;padding:4pt 6pt;text-align:right;width:12%;">PRECIO UNIT.</th>
      <th style="border:1px solid #000;padding:4pt 6pt;text-align:right;width:12%;">P. PARCIAL</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
    <tr>
      <td colspan="5" style="border:1px solid #000;padding:3pt 6pt;text-align:right;font-weight:bold;">SUBTOTAL</td>
      <td style="border:1px solid #000;padding:3pt 6pt;text-align:right;font-weight:bold;">${subtotal.toFixed(2)}</td>
    </tr>
    <tr>
      <td colspan="5" style="border:1px solid #000;padding:3pt 6pt;text-align:right;">IGV (18%)</td>
      <td style="border:1px solid #000;padding:3pt 6pt;text-align:right;">${igv.toFixed(2)}</td>
    </tr>
    <tr>
      <td colspan="5" style="border:1px solid #000;padding:3pt 6pt;text-align:right;font-weight:bold;">TOTAL</td>
      <td style="border:1px solid #000;padding:3pt 6pt;text-align:right;font-weight:bold;">${total.toFixed(2)}</td>
    </tr>
  </tbody>
</table>`;
    });

    const grandTotal = rows.reduce((sum: number, r: any) => {
      const val = typeof r.parcial === 'number' ? r.parcial : (parseFloat(r.parcial) || 0);
      return sum + val;
    }, 0);
    const grandIgv = grandTotal * IGV_RATE;
    const grandTotalConIgv = grandTotal + grandIgv;

    const totalRow = groups.size > 1 ? `
<table style="width:100%;border-collapse:collapse;margin:8pt 0;font-size:11pt;">
  <tbody>
    <tr>
      <td style="border:1px solid #000;padding:4pt 8pt;text-align:right;font-weight:bold;width:75%;">TOTAL A PAGAR (incluye IGV)</td>
      <td style="border:1px solid #000;padding:4pt 8pt;text-align:right;font-weight:bold;">S/. ${grandTotalConIgv.toFixed(2)}</td>
    </tr>
  </tbody>
</table>` : '';

    return tables.join('') + totalRow;
  }

  private buildCtlImpEmptyControl() {
    return {
      material: {
        ligante: 'MC-30',
        gravilla: '',
        pesoEspecifico: '',
        velocidad: '',
        alturaBarraEsparcidor: '',
        penetracion: '',
      },
      equipo: {
        camionLabel: 'Camión',
        camion: '',
      },
      bandeja: {
        pesoBandejaSinAsfalto: { uno: '', dos: '', tres: '' },
        pesoBandejaConAsfalto: { uno: '', dos: '', tres: '' },
        pesoAsfalto: { uno: '', dos: '', tres: '' },
        areaBandeja: { uno: '', dos: '', tres: '' },
        rangoEsparcido: { uno: '', dos: '', tres: '' },
        volumenEsparcido: { uno: '', dos: '', tres: '' },
        volumenCorregido15_6: { uno: '', dos: '', tres: '' },
        volumenCorregidoGalones: { uno: '', dos: '', tres: '' },
        rangoEsparcidoPromedio: '',
      },
      camionImprimador: {
        lecturaInicial: '',
        lecturaFinal: '',
        consumo: '',
        longitud: '',
        ancho: '',
        areaTerreno: '',
        tasaRiegoCorregida: '',
        tasaRiegoCorregidaGalones: '',
      },
      temperaturaRiegoAsfaltico: '',
      temperaturaAmbiente: '',
      factorCorreccionTemperatura: '',
      observaciones: '',
      tramo: '',
      progresivaDesde: '',
      progresivaHasta: '',
      carril: '',
      horaInicio: '',
      horaFinal: '',
    };
  }

  private getCtlImpControls() {
    if (Array.isArray(this.data.controles) && this.data.controles.length > 0) {
      return this.data.controles;
    }
    return [this.buildCtlImpLegacyControl()];
  }

  private buildCtlImpLegacyControl() {
    const control = this.buildCtlImpEmptyControl();
    const materiales = Array.isArray(this.data.materialesInsumos)
      ? this.data.materialesInsumos
      : [];
    const firstMaterial = materiales[0] || {};
    const tasa = this.getValue('tasa') || {};
    const tasaRows = Array.isArray(this.data.tasaRegistroDatos)
      ? this.data.tasaRegistroDatos
      : [];
    const findRow = (key: string) =>
      tasaRows.find((row: Record<string, any>) => String(row?.key || '') === key) || {};
    const mapAxis = (row: Record<string, any>) => ({
      uno: row?.a ?? '',
      dos: row?.b ?? '',
      tres: row?.c ?? '',
    });

    return {
      ...control,
      tramo: String(this.getValue('proyecto.descripcion') || ''),
      material: {
        ...control.material,
        ligante: String(firstMaterial?.tipoLigante || control.material.ligante),
        pesoEspecifico: tasa?.gravedadEspecifica ?? '',
      },
      bandeja: {
        ...control.bandeja,
        pesoBandejaSinAsfalto: mapAxis(findRow('pesoBandejaSinAsfalto')),
        pesoBandejaConAsfalto: mapAxis(findRow('pesoBandejaConAsfalto')),
        pesoAsfalto: mapAxis(findRow('pesoAsfalto')),
        areaBandeja: mapAxis(findRow('areaBandeja')),
        rangoEsparcido: mapAxis(findRow('tasaRiego')),
        volumenEsparcido: mapAxis(findRow('tasaRiego10')),
        volumenCorregido15_6: mapAxis(findRow('tasaCorregida')),
        volumenCorregidoGalones: mapAxis(findRow('tasaPromedio')),
        rangoEsparcidoPromedio: findRow('criterioAceptacion')?.b ?? '',
      },
      temperaturaAmbiente: tasa?.temperaturaAtmosferica ?? '',
      temperaturaRiegoAsfaltico: tasa?.temperaturaLigante ?? '',
      observaciones: String(
        this.getValue('observacionesTasa') || this.getValue('observacionesProtocolo') || ''
      ),
    };
  }

  private normalizeCtlImpControl(control: Record<string, any> = {}) {
    return {
      ...this.buildCtlImpEmptyControl(),
      ...control,
      material: {
        ...this.buildCtlImpEmptyControl().material,
        ...(control.material || {}),
      },
      equipo: {
        ...this.buildCtlImpEmptyControl().equipo,
        ...(control.equipo || {}),
      },
      bandeja: {
        ...this.buildCtlImpEmptyControl().bandeja,
        ...(control.bandeja || {}),
        pesoBandejaSinAsfalto: {
          ...this.buildCtlImpEmptyControl().bandeja.pesoBandejaSinAsfalto,
          ...(control.bandeja?.pesoBandejaSinAsfalto || {}),
        },
        pesoBandejaConAsfalto: {
          ...this.buildCtlImpEmptyControl().bandeja.pesoBandejaConAsfalto,
          ...(control.bandeja?.pesoBandejaConAsfalto || {}),
        },
        pesoAsfalto: {
          ...this.buildCtlImpEmptyControl().bandeja.pesoAsfalto,
          ...(control.bandeja?.pesoAsfalto || {}),
        },
        areaBandeja: {
          ...this.buildCtlImpEmptyControl().bandeja.areaBandeja,
          ...(control.bandeja?.areaBandeja || {}),
        },
        rangoEsparcido: {
          ...this.buildCtlImpEmptyControl().bandeja.rangoEsparcido,
          ...(control.bandeja?.rangoEsparcido || {}),
        },
        volumenEsparcido: {
          ...this.buildCtlImpEmptyControl().bandeja.volumenEsparcido,
          ...(control.bandeja?.volumenEsparcido || {}),
        },
        volumenCorregido15_6: {
          ...this.buildCtlImpEmptyControl().bandeja.volumenCorregido15_6,
          ...(control.bandeja?.volumenCorregido15_6 || {}),
        },
        volumenCorregidoGalones: {
          ...this.buildCtlImpEmptyControl().bandeja.volumenCorregidoGalones,
          ...(control.bandeja?.volumenCorregidoGalones || {}),
        },
      },
      camionImprimador: {
        ...this.buildCtlImpEmptyControl().camionImprimador,
        ...(control.camionImprimador || {}),
      },
    };
  }

  private renderCtlImpMetadata(control: Record<string, any>) {
    const general = this.getValue('general') || {};
    const legacyProject = this.getValue('proyecto') || {};
    const fecha = this.formatValue(this.getValue('header.fecha'), 'date');
    return `
      <table class="ctl-imp-meta" style="margin-bottom:0;">
        <tr>
          <td class="label">CLIENTE</td>
          <td class="value" style="width:66%;">: ${this.escapeHtml(String(general.cliente || legacyProject.cliente || ''))}</td>
          <td class="label" style="width:12%;">HECHO POR</td>
          <td class="value" style="width:13%;">: ${this.escapeHtml(String(general.responsable || ''))}</td>
        </tr>
        <tr>
          <td class="label">PROYECTO</td>
          <td class="value">: ${this.escapeHtml(String(general.proyecto || legacyProject.obra || ''))}</td>
          <td class="label">FECHA</td>
          <td class="value">: ${this.escapeHtml(fecha)}</td>
        </tr>
        <tr>
          <td class="label">UBICACIÓN</td>
          <td colspan="3" class="value">: ${this.escapeHtml(String(general.ubicacion || legacyProject.ubicacion || ''))}</td>
        </tr>
        <tr>
          <td class="label">TRAMO</td>
          <td colspan="3" class="value">: ${this.escapeHtml(String(control.tramo || ''))}</td>
        </tr>
      </table>
      <table class="ctl-imp-title" style="margin-bottom:0;">
        <tr>
          <td>CONTROL : IMPRIMACIÓN DE BASE GRANULAR CON ${this.escapeHtml(
            String(control.material?.ligante || 'MC-30').toUpperCase()
          )}</td>
        </tr>
      </table>
    `;
  }

  private renderCtlImpMaterials(control: Record<string, any>) {
    return `
      <table style="margin-bottom:0;">
        <tr>
          <td style="width:60%; border-bottom:none;">
            <div class="ctl-imp-block-title">Datos de los materiales</div>
          </td>
          <td style="width:40%; border-bottom:none;"></td>
        </tr>
        <tr>
          <td style="border-top:none;">
            <table style="margin:0;">
              <tr>
                <td style="width:18%; border:none; font-weight:700;">Ligante</td>
                <td style="width:82%; border:none;">: ${this.escapeHtml(String(control.material?.ligante || ''))}</td>
              </tr>
              <tr>
                <td style="border:none; font-weight:700;">Gravilla</td>
                <td style="border:none;">: ${this.escapeHtml(String(control.material?.gravilla || ''))}</td>
              </tr>
            </table>
          </td>
          <td style="border-top:none;">
            <table style="margin:0;">
              <tr>
                <td style="width:58%; border:none; font-weight:700; text-align:right;">Peso Específico :</td>
                <td style="width:42%; text-align:center; font-weight:700;">${this.escapeHtml(
                  this.formatCtlImpNumber(control.material?.pesoEspecifico, 4)
                )}</td>
              </tr>
              <tr>
                <td style="border:none; font-weight:700; text-align:right;">Altura de Barra del Esparcidor :</td>
                <td style="text-align:center; font-weight:700;">${this.escapeHtml(String(control.material?.alturaBarraEsparcidor || ''))}</td>
              </tr>
              <tr>
                <td style="border:none; font-weight:700; text-align:right;">Velocidad (km/hr) :</td>
                <td style="text-align:center; font-weight:700;">${this.escapeHtml(
                  this.formatCtlImpNumber(control.material?.velocidad, 2)
                )}</td>
              </tr>
              <tr>
                <td style="border:none; font-weight:700; text-align:right;">Penetración :</td>
                <td style="text-align:center; font-weight:700;">${this.escapeHtml(String(control.material?.penetracion || ''))}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td colspan="2">
            <div class="ctl-imp-block-title">Datos del equipo</div>
            <div style="margin-top:8px; font-size:12px; font-weight:700;">
              ${this.escapeHtml(String(control.equipo?.camionLabel || 'Camión'))}
              <span style="font-weight:600; margin-left:12px;">: ${this.escapeHtml(String(control.equipo?.camion || ''))}</span>
            </div>
          </td>
        </tr>
      </table>
    `;
  }

  private renderCtlImpRateTable(control: Record<string, any>) {
    const trayValue = (key: string, axis: 'uno' | 'dos' | 'tres', decimals = 3) =>
      this.escapeHtml(this.formatCtlImpNumber(control.bandeja?.[key]?.[axis], decimals));
    const truckValue = (key: string, decimals = 3) =>
      this.escapeHtml(this.formatCtlImpNumber(control.camionImprimador?.[key], decimals));
    const factorCorreccion = this.escapeHtml(
      this.formatCtlImpNumber(control.factorCorreccionTemperatura, 2)
    );

    return `
      <table class="ctl-imp-rate-title" style="margin-bottom:0;">
        <tr><td>TASA DE RIEGO DEL IMPRIMANTE</td></tr>
      </table>
      <table class="ctl-imp-rate">
        <tr>
          <td colspan="3" class="bold">PROGRESIVA (Km.)</td>
          <td colspan="3" class="center">De: Km ${this.escapeHtml(String(control.progresivaDesde || ''))}</td>
          <td colspan="3" class="center">Al: Km ${this.escapeHtml(String(control.progresivaHasta || ''))}</td>
        </tr>
        <tr>
          <td colspan="3" class="bold">CARRIL: ${this.escapeHtml(String(control.carril || ''))}</td>
          <td colspan="3" class="bold center">HORA INICIO: ${this.escapeHtml(String(control.horaInicio || ''))}</td>
          <td colspan="3" class="bold center">HORA FINAL: ${this.escapeHtml(String(control.horaFinal || ''))}</td>
        </tr>
        <tr>
          <th class="left-label">BANDEJA</th>
          <th class="tray-col">=</th>
          <th class="tray-col">1</th>
          <th class="tray-col">2</th>
          <th class="tray-col">3</th>
          <th class="unit-col">Unidad</th>
          <th class="truck-label center">CAMIÓN IMPRIMADOR</th>
          <th class="truck-value center">Valor</th>
          <th class="truck-unit center">Unidad</th>
        </tr>
        ${this.renderCtlImpRateRow(
          '1) Peso de la bandeja sin asfalto',
          [trayValue('pesoBandejaSinAsfalto', 'uno', 3), trayValue('pesoBandejaSinAsfalto', 'dos', 3), trayValue('pesoBandejaSinAsfalto', 'tres', 3)],
          'Kgs.',
          'Lectura Inicial',
          truckValue('lecturaInicial', 3),
          'Lts'
        )}
        ${this.renderCtlImpRateRow(
          '2) Peso de la bandeja con asfalto',
          [trayValue('pesoBandejaConAsfalto', 'uno', 3), trayValue('pesoBandejaConAsfalto', 'dos', 3), trayValue('pesoBandejaConAsfalto', 'tres', 3)],
          'Kgs.',
          'Lectura Final',
          truckValue('lecturaFinal', 3),
          'Lts'
        )}
        ${this.renderCtlImpRateRow(
          '3) Peso del asfalto (2-1) / 1000',
          [trayValue('pesoAsfalto', 'uno', 3), trayValue('pesoAsfalto', 'dos', 3), trayValue('pesoAsfalto', 'tres', 3)],
          'Kgs.',
          'Consumo',
          truckValue('consumo', 3),
          'Lts'
        )}
        ${this.renderCtlImpRateRow(
          '4) Área de la bandeja',
          [trayValue('areaBandeja', 'uno', 3), trayValue('areaBandeja', 'dos', 3), trayValue('areaBandeja', 'tres', 3)],
          'm2',
          'Longitud',
          truckValue('longitud', 2),
          'm'
        )}
        ${this.renderCtlImpRateRow(
          '5) Rango de esparcido (3)/(4)',
          [trayValue('rangoEsparcido', 'uno', 3), trayValue('rangoEsparcido', 'dos', 3), trayValue('rangoEsparcido', 'tres', 3)],
          'Kg/m2',
          'Ancho',
          truckValue('ancho', 2),
          'm'
        )}
        ${this.renderCtlImpRateRow(
          `6) Volumen de esparcido (5/${this.formatCtlImpNumber(control.material?.pesoEspecifico, 4) || 'pe'})`,
          [trayValue('volumenEsparcido', 'uno', 3), trayValue('volumenEsparcido', 'dos', 3), trayValue('volumenEsparcido', 'tres', 3)],
          'lts/m2',
          'Área Terreno (4*5)',
          truckValue('areaTerreno', 2),
          'm2'
        )}
        ${this.renderCtlImpRateRow(
          `7) Volumen Corregido a 15.6°C por factor de corrección (6/${factorCorreccion || '1'})`,
          [trayValue('volumenCorregido15_6', 'uno', 3), trayValue('volumenCorregido15_6', 'dos', 3), trayValue('volumenCorregido15_6', 'tres', 3)],
          'lts/m2',
          'Tasa de Riego en Volumen, Corregida (3/6*3.785*1)',
          truckValue('tasaRiegoCorregida', 3),
          'lts/m2'
        )}
        ${this.renderCtlImpRateRow(
          '8) Volumen Corregido en galones m/2 (7/3.785)',
          [trayValue('volumenCorregidoGalones', 'uno', 3), trayValue('volumenCorregidoGalones', 'dos', 3), trayValue('volumenCorregidoGalones', 'tres', 3)],
          'Gal/m2',
          'Tasa de Riego Corregida (7/3.785)',
          truckValue('tasaRiegoCorregidaGalones', 3),
          'Gls/m2'
        )}
        <tr>
          <td class="left-label bold">9) Rango Esparcido Promedio</td>
          <td class="center">=</td>
          <td class="center"></td>
          <td class="center bold">${this.escapeHtml(
            this.formatCtlImpNumber(control.bandeja?.rangoEsparcidoPromedio, 3)
          )}</td>
          <td class="center"></td>
          <td class="unit-col bold">Gal/m2</td>
          <td colspan="3"></td>
        </tr>
        <tr>
          <td colspan="3">Temperatura Riego Asfaltico</td>
          <td class="center">=</td>
          <td class="center bold">${this.escapeHtml(
            this.formatCtlImpNumber(control.temperaturaRiegoAsfaltico, 2)
          )}</td>
          <td class="center bold">° C</td>
          <td colspan="2" class="center">Factor de Corrección por temperatura</td>
          <td class="center bold">${factorCorreccion}</td>
        </tr>
        <tr>
          <td colspan="3">Temperatura Ambiente</td>
          <td class="center">=</td>
          <td class="center bold">${this.escapeHtml(
            this.formatCtlImpNumber(control.temperaturaAmbiente, 2)
          )}</td>
          <td class="center bold">° C</td>
          <td colspan="3"></td>
        </tr>
        <tr>
          <td colspan="9" class="ctl-imp-observaciones">
            <div class="bold" style="margin-bottom:8px;">OBSERVACIONES :</div>
            ${this.renderCtlImpObservationLines(control.observaciones)}
          </td>
        </tr>
      </table>
    `;
  }

  private renderCtlImpRateRow(
    label: string,
    values: string[],
    unit: string,
    truckLabel: string,
    truckValue: string,
    truckUnit: string
  ) {
    return `
      <tr>
        <td class="left-label">${this.escapeHtml(label)}</td>
        <td class="center">=</td>
        <td class="center">${values[0] || ''}</td>
        <td class="center">${values[1] || ''}</td>
        <td class="center">${values[2] || ''}</td>
        <td class="unit-col">${this.escapeHtml(unit)}</td>
        <td class="truck-label">${this.escapeHtml(truckLabel)}</td>
        <td class="truck-value">${truckValue || ''}</td>
        <td class="truck-unit">${this.escapeHtml(truckUnit)}</td>
      </tr>
    `;
  }

  private renderCtlImpObservationLines(value: string) {
    const lines = String(value || '').split(/\r?\n/).filter((line) => line.trim().length > 0);
    const paddedLines = [...lines];
    while (paddedLines.length < 3) {
      paddedLines.push('');
    }
    return paddedLines
      .slice(0, 4)
      .map((line) => `<div class="line">${this.escapeHtml(line)}</div>`)
      .join('');
  }

  private formatCtlImpNumber(value: any, decimals: number) {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return String(value);
    }
    return parsed
      .toFixed(decimals)
      .replace(/\.0+$/, '')
      .replace(/(\.\d*?)0+$/, '$1');
  }

  private hasCtlImpSignatureContent() {
    const firmas = this.getValue('firmas') || {};
    return Object.values(firmas).some((signature: any) =>
      Boolean(
        String(signature?.nombre || '').trim() ||
          String(signature?.empresa || '').trim() ||
          String(signature?.cip || '').trim()
      )
    );
  }

  private buildSectionTitleMap(): Map<string, string> {
    const map = new Map<string, string>();
    if (this.schema.code !== 'IAA') {
      return map;
    }
    const includeLevantamiento = Boolean(this.getValue('levantamiento.incluir'));
    const sections = this.schema.sections.filter((section) => {
      if (section.type === 'header') return false;
      if (section.id === 'levantamientoTopografico' && !includeLevantamiento) {
        return false;
      }
      return true;
    });
    let index = 1;
    for (const section of sections) {
      if (!section.title) continue;
      map.set(section.id, `${this.toRoman(index)}. ${section.title}`);
      index += 1;
    }
    return map;
  }

  private resolveSectionTitle(section: SectionSchema): string {
    return this.sectionTitleMap.get(section.id) || section.title || '';
  }

  private toRoman(value: number): string {
    const roman: Array<[number, string]> = [
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ];
    let num = value;
    let out = '';
    for (const [n, symbol] of roman) {
      while (num >= n) {
        out += symbol;
        num -= n;
      }
    }
    return out || String(value);
  }

  private async renderSection(section: SectionSchema): Promise<string> {
    if (this.schema.code === 'CTL-PIS' && section.id === 'controlPistaColumns') {
      return '';
    }
    switch (section.type) {
      case 'header':
        return this.renderHeader(section);
      case 'projectData':
      case 'simpleFields':
      case 'summary':
        if (section.id === 'levantamientoTopografico' && this.schema.code === 'IAA') {
          return this.renderLevantamientoTopografico(section);
        }
        return this.renderFieldsSection(section);
      case 'dataTable':
      case 'resultsTable':
        if (section.id === 'cuadroMetrado' && this.schema.code === 'IAA') {
          return this.renderCuadroMetrado(section);
        }
        return this.renderDataTable(section);
      case 'checklist':
        return this.renderChecklist(section);
      case 'photoPanel':
        return this.renderPhotoPanel(section);
      case 'photoSection':
        return this.renderPhotoSection(section);
      case 'richText':
        return this.renderRichText(section);
      case 'signatures':
        return this.renderSignatures(section);
      default:
        return '';
    }
  }

  private async renderHeaderWithOverride(section: SectionSchema): Promise<string> {
    if (!this.headerSection?.headerConfig) return '';
    const baseConfig = this.headerSection.headerConfig || {};
    const override = section.headerOverride || {};
    const headerSection: SectionSchema = {
      ...this.headerSection,
      headerConfig: {
        ...baseConfig,
        ...override,
      },
    };
    return this.renderHeader(headerSection);
  }

  private wrapSectionOutput(section: SectionSchema, html: string): string {
    const classes: string[] = ['page-wrapper'];
    if (section.pageBreakBefore) {
      classes.push('page-break');
    }
    const orientation = section.pageOrientation || this.schema.orientation;
    if (orientation === 'landscape') {
      classes.push('page-landscape');
    } else if (orientation === 'portrait') {
      classes.push('page-portrait');
    }

    return `<div class="${classes.join(' ')}">${html}</div>`;
  }

  private evaluateShowIf(condition: SectionSchema['showIf']): boolean {
    if (!condition) return true;
    const actual = this.getValue(condition.field);
    const expected = condition.value;
    switch (condition.operator) {
      case 'eq':
        return actual === expected;
      case 'ne':
        return actual !== expected;
      case 'gt':
        return Number(actual) > Number(expected);
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
      case 'contains':
        if (Array.isArray(actual)) return actual.includes(expected);
        if (typeof actual === 'string') return actual.includes(String(expected));
        return false;
      case 'in':
        if (Array.isArray(expected)) return expected.includes(actual);
        return false;
      default:
        return true;
    }
  }

  private shouldRenderSection(section: SectionSchema): boolean {
    if (section.visible === false) return false;
    if (section.showIf && !this.evaluateShowIf(section.showIf)) return false;
    return true;
  }

  private computeActaTitulo(): string | null {
    const tipo = String(this.getValue('acta.tipo') || '').toUpperCase();
    if (tipo === 'VENTA') return 'ACTA DE CONFORMIDAD POR BIENES';
    if (tipo === 'SERVICIO') return 'ACTA DE CONFORMIDAD POR SERVICIO';
    return 'ACTA DE CONFORMIDAD';
  }

  private async renderHeader(section: SectionSchema): Promise<string> {
    if (section.headerConfig) {
      const config = section.headerConfig;
      const hideLogo = shouldHideDocumentLogo(this.data);
      const logoValue = hideLogo ? '' : config.logoUrl || this.getValue(config.logoKey || '');
      const leftText = config.leftTextKey ? this.getValue(config.leftTextKey) : '';
      const logoSrc = logoValue
        ? await this.resolveImageSrc({ url: String(logoValue) } as PhotoItem)
        : null;
      const rightFields = config.rightFields || [];

      const centerTitle = config.centerTitle || this.getValue(config.centerTitleKey || '');
      const centerSubtitle = config.centerSubtitle || this.getValue(config.centerSubtitleKey || '');
      const centerLines = [
        ...(config.centerLines || []),
        ...((config.centerLinesKeys || []).map((key) => this.getValue(key)).filter(Boolean)),
      ];
      if (this.schema.code === 'ACT-CNF') {
        const computed = this.computeActaTitulo();
        const hasActaTitle = centerLines.some((line) => String(line).toUpperCase().includes('ACTA DE CONFORMIDAD'));
        if (computed && !hasActaTitle) {
          centerLines.push(computed);
        }
      }
      const centerLinesHtml = centerLines
        .map(
          (line) =>
            `<div style="text-align:center;font-size:13px;font-weight:700;">${this.escapeHtml(String(line))}</div>`
        )
        .join('');

      const rightHtml = rightFields
        .map((field) => {
          const value = this.getValue(field.key);
          return `<div><strong>${this.escapeHtml(field.label)}</strong>: ${this.escapeHtml(this.formatValue(value))}</div>`;
        })
        .join('');

      const secondary = config.secondaryRow;
      const secondaryLeft =
        secondary?.leftText || (secondary?.leftTextKey ? this.getValue(secondary.leftTextKey) : '');
      const secondaryCenter =
        secondary?.centerText || (secondary?.centerTextKey ? this.getValue(secondary.centerTextKey) : '');
      const secondaryRight = (secondary?.rightFields || [])
        .map((field) => {
          const value = this.getValue(field.key);
          return `<div><strong>${this.escapeHtml(field.label)}</strong>: ${this.escapeHtml(this.formatValue(value))}</div>`;
        })
        .join('');

      const secondaryRow = secondaryLeft || secondaryCenter || secondaryRight
        ? `<tr>
            <td style="width:22%; border:1px solid #333; padding:6px; font-size:10px; text-align:center;">
              ${secondaryLeft ? this.escapeHtml(String(secondaryLeft)) : ''}
            </td>
            <td style="width:56%; border:1px solid #333; padding:6px; text-align:center;">
              ${secondaryCenter ? this.escapeHtml(String(secondaryCenter)) : ''}
            </td>
            <td style="width:22%; border:1px solid #333; padding:6px; font-size:10px;">
              ${secondaryRight}
            </td>
          </tr>`
        : '';

      const leftCell = hideLogo
        ? ''
        : `<td style="width:22%; text-align:center; border:1px solid #333; padding:6px;">
              ${
                logoSrc
                  ? `<img src="${logoSrc}" style="max-height:60px;max-width:120px;object-fit:contain;" />`
                  : leftText
                  ? `<div style="font-weight:700;font-size:14px;">${this.escapeHtml(String(leftText))}</div>`
                  : ''
              }
            </td>`;
      const centerWidth = hideLogo ? '70%' : '56%';
      const rightWidth = hideLogo ? '30%' : '22%';

      return `<div class="section">
        <table style="width:100%; border:1px solid #333; border-collapse:collapse;">
          <tr>
            ${leftCell}
            <td style="width:${centerWidth}; text-align:center; border:1px solid #333; padding:6px;">
              ${centerTitle ? `<div style="font-weight:700;">${this.escapeHtml(String(centerTitle))}</div>` : ''}
              ${centerSubtitle ? `<div>${this.escapeHtml(String(centerSubtitle))}</div>` : ''}
              ${centerLinesHtml}
            </td>
            <td style="width:${rightWidth}; border:1px solid #333; padding:6px; font-size:10px;">
              ${rightHtml}
            </td>
          </tr>
          ${secondaryRow}
        </table>
      </div>`;
    }

    const title = section.title ? `<h1>${this.escapeHtml(section.title)}</h1>` : '';
    const subtitle = section.subtitle ? `<div style="text-align:center;">${this.escapeHtml(section.subtitle)}</div>` : '';
    return `<div class="section">${title}${subtitle}</div>`;
  }

  private renderFieldsSection(section: SectionSchema): string {
    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';
    const fields = (() => {
      const baseFields = section.fields || [];
      if (this.schema.code !== 'CTL-PIS' || section.id !== 'resumenControl') return baseFields;
      const config = this.getValue('controlPistaColumns') || {};
      const hiddenKeys = new Set<string>();
      if (config.hideTempRodilloLiso) hiddenKeys.add('resumenControl.tempRodilloLisoProm');
      if (config.hideTempRodilloNeumatico) hiddenKeys.add('resumenControl.tempRodilloNeumaticoProm');
      return hiddenKeys.size > 0
        ? baseFields.filter((field) => !hiddenKeys.has(field.key))
        : baseFields;
    })();
    if (fields.length === 0) {
      return `<div class="section">${title}</div>`;
    }

    const useFourColumns =
      (this.schema.code === 'CTL-PIS' &&
        (section.gridColumns === 4 ||
          section.id === 'controlInfo' ||
          section.id === 'resumenControl' ||
          /informacion de control/i.test(resolvedTitle || '') ||
          /resumen de control/i.test(resolvedTitle || ''))) ||
      (this.schema.code === 'IPP' &&
        section.id === 'datosPlanta' &&
        section.gridColumns === 4);

    if (useFourColumns) {
      const rowPairs: string[] = [];
      for (let i = 0; i < fields.length; i += 2) {
        const left = fields[i];
        const right = fields[i + 1];
        const leftValue = left ? this.escapeHtml(this.formatValue(this.getValue(left.key), left.type, left)) : '';
        const rightValue = right ? this.escapeHtml(this.formatValue(this.getValue(right.key), right.type, right)) : '';
        rowPairs.push(
          `<tr>
            <td>${this.escapeHtml(left?.label || '')}</td>
            <td>${leftValue}</td>
            <td>${this.escapeHtml(right?.label || '')}</td>
            <td>${rightValue}</td>
          </tr>`
        );
      }
      return `<div class="section">${title}<table class="kv-table kv-4">${rowPairs.join('')}</table></div>`;
    }

    const rows = fields
      .map((field) => {
        const value = this.getValue(field.key);
        const formatted = this.escapeHtml(this.formatValue(value, field.type, field));
        return `<tr><td>${this.escapeHtml(field.label || '')}</td><td>${formatted}</td></tr>`;
      })
      .join('');

    return `<div class="section">${title}<table class="kv-table kv-2">${rows}</table></div>`;
  }

  private renderLevantamientoTopografico(section: SectionSchema): string {
    if (!this.getValue('levantamiento.incluir')) {
      return '';
    }
    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';

    const rows = [
      {
        leftLabel: 'TOPOGRAFO RESPONSABLE',
        leftKey: 'levantamiento.topografo',
        rightLabel: 'CIP',
        rightKey: 'levantamiento.cip',
      },
      {
        leftLabel: 'EQUIPO UTILIZADO',
        leftKey: 'levantamiento.equipo',
        rightLabel: 'NRO SERIE',
        rightKey: 'levantamiento.nroSerie',
      },
      {
        leftLabel: 'CERT. CALIBRACION',
        leftKey: 'levantamiento.certCalibracion',
        rightLabel: 'FECHA CALIBRACION',
        rightKey: 'levantamiento.fechaCalibracion',
        rightType: 'date',
      },
      {
        leftLabel: 'FECHA LEVANTAMIENTO',
        leftKey: 'levantamiento.fechaLevantamiento',
        leftType: 'date',
        rightLabel: 'SISTEMA REFERENCIA',
        rightKey: 'levantamiento.sistemaReferencia',
      },
      {
        leftLabel: 'PLANO DE REFERENCIA',
        leftKey: 'levantamiento.planoReferencia',
        colspan: 3,
      },
    ];

    const headerRow = `<tr><th colspan="4" style="text-align:center;">DATOS DEL LEVANTAMIENTO TOPOGRAFICO</th></tr>`;
    const bodyRows = rows
      .map((row) => {
        const leftValue = this.formatValue(this.getValue(row.leftKey), row.leftType);
        if (row.colspan) {
          return `<tr>
            <td style="font-weight:bold;">${this.escapeHtml(row.leftLabel)}</td>
            <td colspan="3">${this.escapeHtml(leftValue)}</td>
          </tr>`;
        }
        const rightValue = this.formatValue(this.getValue(row.rightKey || ''), row.rightType);
        return `<tr>
          <td style="font-weight:bold;">${this.escapeHtml(row.leftLabel)}</td>
          <td>${this.escapeHtml(leftValue)}</td>
          <td style="font-weight:bold;">${this.escapeHtml(row.rightLabel || '')}</td>
          <td>${this.escapeHtml(rightValue)}</td>
        </tr>`;
      })
      .join('');

    return `<div class="section">${title}<table>${headerRow}${bodyRows}</table></div>`;
  }

  private renderDataTable(section: SectionSchema): string {
    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';
    const columns = section.columns || [];
    if (columns.length === 0) {
      return `<div class="section">${title}</div>`;
    }

    const hiddenColumns = (() => {
      if (this.schema.code !== 'CTL-PIS' || section.id !== 'controlPista') return new Set<string>();
      const config = this.getValue('controlPistaColumns') || {};
      const hidden = new Set<string>();
      if (config.hideHoraFinalColocacion) hidden.add('horaFinalColocacion');
      if (config.hideTempRodilloLiso) hidden.add('tempRodilloLiso');
      if (config.hideTempRodilloNeumatico) hidden.add('tempRodilloNeumatico');
      return hidden;
    })();

    const displayColumns = hiddenColumns.size > 0
      ? columns.filter((col) => !hiddenColumns.has(col.key))
      : columns;

    if (displayColumns.length === 0) {
      return `<div class="section">${title}</div>`;
    }

    const hasGroups = displayColumns.some((col) => col.group);
    const groupWidths = new Map<string, number>();
    if (hasGroups) {
      displayColumns.forEach((col) => {
        if (!col.group) return;
        const width = col.width ?? 0;
        if (!width) return;
        groupWidths.set(col.group, (groupWidths.get(col.group) || 0) + width);
      });
    }
    const headerCells: Array<
      | { type: 'group'; label: string; span: number }
      | { type: 'single'; column: ColumnSchema }
    > = [];

    let index = 0;
    while (index < displayColumns.length) {
      const column = displayColumns[index];
      if (!column.group) {
        headerCells.push({ type: 'single', column });
        index += 1;
        continue;
      }
      const groupLabel = column.group;
      let span = 1;
      while (index + span < displayColumns.length && displayColumns[index + span].group === groupLabel) {
        span += 1;
      }
      headerCells.push({ type: 'group', label: groupLabel, span });
      index += span;
    }

    const headerRow = `<tr>${headerCells
      .map((cell) => {
        if (cell.type === 'group') {
          const width = groupWidths.get(cell.label);
          const widthStyle = width ? `width:${width}px;` : '';
          return `<th colspan="${cell.span}" style="${widthStyle}text-align:center; white-space:normal; line-height:1.2;">${this.escapeHtml(cell.label)}</th>`;
        }
        const col = cell.column;
        const width = col.width ? `width:${col.width}px;` : '';
        const rowSpan = hasGroups ? 'rowspan="2"' : '';
        return `<th ${rowSpan} style="${width}text-align:${this.alignCss(col.align)}; white-space:normal; line-height:1.2;">${this.escapeHtml(col.label || col.key)}</th>`;
      })
      .join('')}</tr>`;

    const subHeaderRow = hasGroups
      ? `<tr>${displayColumns
          .filter((col) => col.group)
          .map((col) => {
            const width = col.width ? `width:${col.width}px;` : '';
            return `<th style="${width}text-align:${this.alignCss(col.align)}; white-space:normal; line-height:1.2;">${this.escapeHtml(col.label || col.key)}</th>`;
          })
          .join('')}</tr>`
      : '';

    let rowsData = this.resolveTableRows(section);
    if (this.schema.code === 'IPP' && section.id === 'registroDespachos') {
      const toMinutes = (value?: string) => {
        if (!value) return null;
        const parts = value.split(':').map((part) => Number(part));
        if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) return null;
        return parts[0] * 60 + parts[1];
      };
      rowsData = [ ...rowsData ].sort((a: any, b: any) => {
        const aOrder = Number(a?.ordenDespacho);
        const bOrder = Number(b?.ordenDespacho);
        const aHasOrder = Number.isFinite(aOrder) && aOrder > 0;
        const bHasOrder = Number.isFinite(bOrder) && bOrder > 0;
        if (aHasOrder || bHasOrder) {
          if (!aHasOrder) return 1;
          if (!bHasOrder) return -1;
          return aOrder - bOrder;
        }
        const aMinutes = toMinutes(a?.horaSalida) ?? Number.MAX_SAFE_INTEGER;
        const bMinutes = toMinutes(b?.horaSalida) ?? Number.MAX_SAFE_INTEGER;
        return aMinutes - bMinutes;
      });
    }
    const rows = rowsData
      .map((row) => {
        const cells = displayColumns
          .map((col) => {
            const rawValue = this.getValue(col.key, row);
            const formatted = this.escapeHtml(this.formatValue(rawValue, col.type, col));
            const width = col.width ? `width:${col.width}px;` : '';
            return `<td style="${width}text-align:${this.alignCss(col.align)}">${formatted}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    const useFixedLayout =
      this.schema.code === 'CTL-PIS' && section.id === 'controlPista';
    const tableStyle = useFixedLayout ? ' style="table-layout:fixed;"' : '';
    const totalsRow = this.renderTableTotalsRow(section, displayColumns, rowsData);
    return `<div class="section">${title}<table${tableStyle}>${headerRow}${subHeaderRow}${rows}${totalsRow}</table></div>`;
  }

  private renderTableTotalsRow(
    section: SectionSchema,
    columns: ColumnSchema[],
    rowsData: Array<Record<string, any>>
  ): string {
    if (this.schema.code !== 'IPP' || section.id !== 'registroDespachos') {
      return '';
    }

    const totalCubos = rowsData.reduce((acc, row) => acc + Number(row?.nroCubos || 0), 0);
    const tempValues = rowsData
      .map((row) => Number(row?.tempSalida || 0))
      .filter((value) => value > 0);
    const tempPromedio = tempValues.length > 0
      ? tempValues.reduce((acc, value) => acc + value, 0) / tempValues.length
      : 0;

    const cells = columns.map((col, index) => {
      if (col.key === 'nroCubos') {
        const formatted = this.escapeHtml(this.formatValue(totalCubos, col.type, col));
        return `<td style="font-weight:bold;text-align:${this.alignCss(col.align)}">${formatted}</td>`;
      }
      if (col.key === 'tempSalida') {
        const formatted = this.escapeHtml(this.formatValue(tempPromedio, col.type, col));
        return `<td style="font-weight:bold;text-align:${this.alignCss(col.align)}">${formatted}</td>`;
      }
      if (index === 0) {
        return `<td style="font-weight:bold;">TOTALES</td>`;
      }
      return '<td></td>';
    });

    return `<tr>${cells.join('')}</tr>`;
  }

  private renderCuadroMetrado(section: SectionSchema): string {
    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';

    const rowsData = this.schema.code === 'IAA'
      ? this.getIaaAreaRows()
      : this.resolveTableRows(section);
    const columns = section.columns || [];
    if (columns.length === 0) {
      return `<div class="section">${title}</div>`;
    }

    const hasPartida = rowsData.some((row) => row?.partida || row?.partidaCodigo || row?.partidaId);
    const displayColumns = hasPartida
      ? columns.filter((col) => col.key !== 'partida')
      : columns;

    const hasGroups = displayColumns.some((column) => column.group);
    const headerCells: Array<
      | { type: 'group'; label: string; span: number }
      | { type: 'single'; column: ColumnSchema }
    > = [];

    let index = 0;
    while (index < displayColumns.length) {
      const column = displayColumns[index];
      if (!column.group) {
        headerCells.push({ type: 'single', column });
        index += 1;
        continue;
      }
      const groupLabel = column.group;
      let span = 1;
      while (index + span < displayColumns.length && displayColumns[index + span].group === groupLabel) {
        span += 1;
      }
      headerCells.push({ type: 'group', label: groupLabel, span });
      index += span;
    }

    const headerRow = `<tr>${headerCells
      .map((cell) => {
        if (cell.type === 'group') {
          return `<th colspan="${cell.span}" style="text-align:center;">${this.escapeHtml(cell.label)}</th>`;
        }
        const col = cell.column;
        const width = col.width ? `width:${col.width}px;` : '';
        const rowSpan = hasGroups ? 'rowspan="2"' : '';
        return `<th ${rowSpan} style="${width}text-align:${this.alignCss(col.align)}">${this.escapeHtml(col.label || col.key)}</th>`;
      })
      .join('')}</tr>`;

    const subHeaderRow = hasGroups
      ? `<tr>${displayColumns
          .filter((col) => col.group)
          .map((col) => {
            const width = col.width ? `width:${col.width}px;` : '';
            return `<th style="${width}text-align:${this.alignCss(col.align)}">${this.escapeHtml(col.label || col.key)}</th>`;
          })
          .join('')}</tr>`
      : '';

    if (!hasPartida) {
      const rows = rowsData
        .map((row) => {
          const cells = displayColumns
            .map((col) => {
              const rawValue = this.getValue(col.key, row);
              const formatted = this.escapeHtml(this.formatValue(rawValue, col.type, col));
              const width = col.width ? `width:${col.width}px;` : '';
              return `<td style="${width}text-align:${this.alignCss(col.align)}">${formatted}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      const totalRow = this.schema.code === 'IAA'
        ? this.renderIaaTotalAreaRow(displayColumns, rowsData)
        : '';
      return `<div class="section">${title}<table>${headerRow}${subHeaderRow}${rows}${totalRow}</table></div>`;
    }

    const groups: Array<{ label: string; rows: Array<Record<string, any>> }> = [];
    const groupMap = new Map<string, { label: string; rows: Array<Record<string, any>> }>();

    rowsData.forEach((row, rowIndex) => {
      const rawLabel = row?.partida || row?.partidaCodigo || row?.partidaId || row?.descripcion || '';
      const label = String(rawLabel || `Partida ${rowIndex + 1}`);
      const key = String(row?.partidaId || row?.partidaCodigo || row?.partida || label);
      if (!groupMap.has(key)) {
        const group = { label, rows: [] as Array<Record<string, any>> };
        groupMap.set(key, group);
        groups.push(group);
      }
      groupMap.get(key)!.rows.push(row);
    });

    const bodyRows = groups
      .map((group) => {
        const groupHeader = `<tr><td colspan="${displayColumns.length}" style="font-weight:bold;">PARTIDA: ${this.escapeHtml(group.label)}</td></tr>`;
        const groupRows = group.rows
          .map((row) => {
            const cells = displayColumns
              .map((col) => {
                const rawValue = this.getValue(col.key, row);
                const formatted = this.escapeHtml(this.formatValue(rawValue, col.type, col));
                const width = col.width ? `width:${col.width}px;` : '';
                return `<td style="${width}text-align:${this.alignCss(col.align)}">${formatted}</td>`;
              })
              .join('');
            return `<tr>${cells}</tr>`;
          })
          .join('');

        const totals = displayColumns.map((col, index) => {
          if (col.key === 'area' || col.key === 'volumen') {
            const sum = group.rows.reduce((acc, row) => acc + Number(row?.[col.key] || 0), 0);
            const formatted = this.escapeHtml(this.formatValue(sum, col.type, col));
            return `<td style="font-weight:bold;text-align:${this.alignCss(col.align)}">${formatted}</td>`;
          }
          if (index === 0) {
            return `<td style="font-weight:bold;">SUBTOTAL ${this.escapeHtml(group.label)}</td>`;
          }
          return `<td></td>`;
        }).join('');
        const totalRow = `<tr>${totals}</tr>`;
        return `${groupHeader}${groupRows}${totalRow}`;
      })
      .join('');

    const summaryParts = groups.map((group) => {
      const areaTotal = group.rows.reduce((acc, row) => acc + Number(row?.area || 0), 0);
      const volumenTotal = group.rows.reduce((acc, row) => acc + Number(row?.volumen || 0), 0);
      const areaText = this.formatValue(areaTotal, 'number');
      const volumenText = this.formatValue(volumenTotal, 'number');
      const volumenLabel = volumenTotal ? ` (${volumenText} m3)` : '';
      return `${this.escapeHtml(group.label)}: ${this.escapeHtml(areaText)} m2${volumenLabel}`;
    });
    const summaryRow = summaryParts.length > 0
      ? `<tr><td colspan="${displayColumns.length}" style="font-weight:bold;">RESUMEN DE METRADOS ADICIONALES: ${summaryParts.join(' | ')}</td></tr>`
      : '';

    return `<div class="section">${title}<table>${headerRow}${subHeaderRow}${bodyRows}${summaryRow}</table></div>`;
  }

  private renderChecklist(section: SectionSchema): string {
    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';
    const items = section.items || [];
    const list = items
      .map((item) => {
        const value = this.getValue(`${section.id}.${item.key}`);
        const checked = Boolean(value);
        const mark = checked ? '[x]' : '[ ]';
        return `<li>${mark} ${this.escapeHtml(item.label)}</li>`;
      })
      .join('');

    return `<div class="section">${title}<ul class="checklist">${list}</ul></div>`;
  }

  private async renderPhotoPanel(section: SectionSchema): Promise<string> {
    if (this.schema.code === 'IAA' && section.id === 'panelFotografico') {
      return this.renderIaaPhotoPanel(section);
    }

    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';
    const photos = this.limitPhotos(this.resolvePhotos(section), section.maxImages);
    if (photos.length === 0) {
      if (this.schema.code === 'CTL-PIS') {
        return '';
      }
      if (this.schema.code === 'ACT-CNF') {
        return '';
      }
      if (this.schema.code === 'IPP' && section.id === 'panelFotograficoLaboratorio') {
        return '';
      }
      return `<div class="section">${title}<div>Sin fotos registradas.</div></div>`;
    }

    const table = await this.renderPhotoTable(photos, section);
    return `<div class="section">${title}${table}</div>`;
  }

  private async renderPhotoSection(section: SectionSchema): Promise<string> {
    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';
    const groups = this.resolvePhotoGroups(section);
    if (groups.length === 0) {
      return `<div class="section">${title}<div>Sin fotos registradas.</div></div>`;
    }

    const groupHtml: string[] = [];
    for (const group of groups) {
      const groupTitle = group.label ? `<h3>${this.escapeHtml(group.label)}</h3>` : '';
      const limited = this.limitPhotos(group.photos, section.maxImages);
      if (limited.length === 0) {
        groupHtml.push(`${groupTitle}<div>Sin fotos para esta categoria.</div>`);
        continue;
      }
      const table = await this.renderPhotoTable(limited, section);
      groupHtml.push(`${groupTitle}${table}`);
    }

    return `<div class="section">${title}${groupHtml.join('')}</div>`;
  }

  private renderRichText(section: SectionSchema): string {
    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';
    const value = this.getValue(section.id);
    const lines = value
      ? Array.isArray(value)
        ? value.map(String)
        : String(value).split(/\r?\n/)
      : [];
    const hasMeaningfulText = lines.some((line) => line.trim().length > 0);
    if (this.schema.code === 'IPP' && section.id === 'observaciones' && !hasMeaningfulText) {
      return '';
    }
    const html = lines.length > 0
      ? lines.map((line) => `<p>${this.escapeHtml(line)}</p>`).join('')
      : '<p>&nbsp;</p>';

    const shouldPageBreak = this.schema.code === 'CTL-PIS' && section.id === 'observaciones';

    const iaaTextSections = [
      'objetoInforme',
      'antecedentes',
      'descripcionTrabajos',
      'justificacionTecnica',
      'conclusiones',
    ];

    if (this.schema.code === 'IAA' && iaaTextSections.includes(section.id)) {
      return `<div class="section"${shouldPageBreak ? ' style="page-break-before:always;"' : ''}>${title}<table><tr><td>${html}</td></tr></table></div>`;
    }

    return `<div class="section"${shouldPageBreak ? ' style="page-break-before:always;"' : ''}>${title}${html}</div>`;
  }

  private async renderSignatures(section: SectionSchema): Promise<string> {
    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';
    const signaturePath = section.id || 'firmas';
    const signatures = (section.signatures || []).filter((signature) => {
      if (this.schema.code !== 'IPP' && this.schema.code !== 'CTL-PIS') {
        return true;
      }

      const info = this.getValue(`${signaturePath}.${signature.key}`) || {};
      return Boolean(
        String(info.nombre || '').trim() ||
          String(info.cip || '').trim() ||
          String(info.empresa || '').trim() ||
          String(info.firmaUrl || info.signatureUrl || '').trim() ||
          String(info.firmaBase64 || info.signatureBase64 || '').trim() ||
          String(info.firmaPath || info.signaturePath || '').trim() ||
          String(info.selloUrl || '').trim() ||
          String(info.selloBase64 || '').trim() ||
          String(info.selloPath || '').trim()
      );
    });
    if (signatures.length === 0) {
      return this.schema.code === 'IPP' || this.schema.code === 'CTL-PIS'
        ? ''
        : `<div class="section">${title}</div>`;
    }

    const actaTipo = this.schema.code === 'ACT-CNF'
      ? String(this.getValue('acta.tipo') || '').toUpperCase()
      : '';
    const cipLabel = this.schema.code === 'ACT-CNF' ? 'DNI' : 'CIP';
    const cells = await Promise.all(
      signatures.map(async (signature) => {
        const info = this.getValue(`${signaturePath}.${signature.key}`) || {};
        const name = info.nombre || '';
        const role = info.cargo || signature.sublabel || '';
        const cip = signature.showCIP && info.cip ? `${cipLabel}: ${info.cip}` : '';
        const signatureLabel = (() => {
          if (this.schema.code !== 'ACT-CNF') return signature.label || '';
          if (actaTipo === 'VENTA') {
            if (signature.key === 'representanteCliente') return 'RECIBI CONFORME';
            if (signature.key === 'representanteContratista') return 'ENTREGUE CONFORME';
          }
          if (actaTipo === 'SERVICIO') {
            if (signature.key === 'representanteCliente') return 'CLIENTE';
            if (signature.key === 'representanteContratista') return 'SUBCONTRATISTA';
          }
          return signature.label || '';
        })();
        const align = info.signatureAlign || 'center';
        const width = Number(info.signatureWidth) || 160;
        const firmaOffsetX = Number(info.firmaOffsetX) || 0;
        const order = info.signatureOrder || 'firma-first';
        const firmaSrc = await this.resolveSignatureImageSrc(info, 'firma');
        const selloSrc = await this.resolveSignatureImageSrc(info, 'sello');
        const ordered = order === 'sello-first'
          ? [
              { key: 'sello', src: selloSrc },
              { key: 'firma', src: firmaSrc },
            ]
          : [
              { key: 'firma', src: firmaSrc },
              { key: 'sello', src: selloSrc },
            ];
        const justify =
          align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
        const imageLayers = ordered
          .map((item) => {
            if (!item.src) return '';
            const zIndex =
              order === 'firma-first'
                ? item.key === 'firma'
                  ? 2
                  : 1
                : item.key === 'sello'
                ? 2
                : 1;
            const translate =
              item.key === 'firma' && firmaOffsetX
                ? `transform: translateX(${firmaOffsetX}px);`
                : '';
            const blend =
              item.key === 'firma'
                ? 'mix-blend-mode:multiply;'
                : '';
            return `<img src="${item.src}" style="position:absolute;top:0;left:0;max-height:70px;max-width:${width}px;object-fit:contain;z-index:${zIndex};${translate}${blend}" />`;
          })
          .join('');
        const imageHtml = `<div style="display:flex;justify-content:${justify};margin:6px 0;">
            <div style="position:relative;width:${width}px;height:80px;">${imageLayers}</div>
          </div>`;
        const lineHtml =
          section.signatureStyle === 'line'
            ? `<div style="border-top:1px solid #333; margin:6px 0 4px 0;"></div>`
            : '';
        return `<td>
          <div><strong>${this.escapeHtml(signatureLabel)}</strong></div>
          ${imageHtml}
          ${lineHtml}
          <div style="margin-top: 8px;">${this.escapeHtml(name)}</div>
          <div>${this.escapeHtml(role)}</div>
          <div>${this.escapeHtml(cip)}</div>
        </td>`;
      })
    );

    return `<div class="section signature-section">${title}<table><tr>${cells.join('')}</tr></table></div>`;
  }

  private async resolveSignatureImageSrc(
    info: Record<string, any>,
    kind: 'firma' | 'sello'
  ): Promise<string | null> {
    const photo =
      kind === 'sello'
        ? {
            url: info.selloUrl,
            base64: info.selloBase64,
            filePath: info.selloPath,
          }
        : {
            url: info.firmaUrl || info.signatureUrl,
            base64: info.firmaBase64 || info.signatureBase64,
            filePath: info.firmaPath || info.signaturePath,
          };
    if (!photo.url && !photo.base64 && !photo.filePath) {
      return null;
    }
    return this.resolveImageSrc(photo);
  }

  private resolveTableRows(section: SectionSchema): Array<Record<string, any>> {
    const direct = this.getValue(section.id);
    if (Array.isArray(direct)) {
      return direct;
    }

    if (direct && Array.isArray(direct.rows)) {
      return direct.rows;
    }

    if (direct && Array.isArray(direct.items)) {
      return direct.items;
    }

    if (direct && typeof direct === 'object') {
      const numericKeys = Object.keys(direct)
        .filter((key) => /^\d+$/.test(key))
        .sort((a, b) => Number(a) - Number(b));
      if (numericKeys.length > 0) {
        return numericKeys.map((key) => (direct as Record<string, any>)[key]);
      }
    }

    return [];
  }

  private resolvePhotos(section: SectionSchema): PhotoItem[] {
    const direct = this.getValue(section.id);
    if (direct && Array.isArray(direct.fotos) && direct.fotos.length > 0) {
      return (direct.fotos as PhotoItem[]).filter((photo) => photo?.includeInPdf !== false);
    }
    if (Array.isArray(direct)) {
      return (direct as PhotoItem[]).filter((photo) => photo?.includeInPdf !== false);
    }

    const nested = this.getValue(`secciones.${section.id}.fotos`);
    if (Array.isArray(nested)) {
      return (nested as PhotoItem[]).filter((photo) => photo?.includeInPdf !== false);
    }

    if (section.type === 'photoPanel') {
      const alt = this.getValue('registroFotografico.fotos');
      if (Array.isArray(alt)) {
        return (alt as PhotoItem[]).filter((photo) => photo?.includeInPdf !== false);
      }
    }

    return [];
  }

  private resolvePhotoGroups(section: SectionSchema): PhotoGroup[] {
    const photos = this.resolvePhotos(section);
    if (photos.length === 0) {
      return [];
    }

    if (!section.categories || section.categories.length === 0) {
      return [{ photos }];
    }

    const groups: PhotoGroup[] = section.categories.map((category) => {
      const filtered = photos.filter((photo) => {
        const value = photo.category || photo.tipo || photo.purpose;
        return value === category.key;
      });
      return { label: category.label, photos: filtered };
    });

    const hasAny = groups.some((group) => group.photos.length > 0);
    if (!hasAny) {
      return [{ photos }];
    }

    return groups.filter((group) => group.photos.length > 0);
  }

  private limitPhotos(photos: PhotoItem[], max?: number): PhotoItem[] {
    if (!max || photos.length <= max) {
      return photos;
    }
    return photos.slice(0, max);
  }

  private isImagePhoto(photo: PhotoItem): boolean {
    const mime = (photo as any).mimeType || (photo as any).mime || (photo as any).metadata?.mimeType || '';
    const candidates = [
      (photo as any).filename,
      (photo as any).name,
      photo.url,
      (photo as any).thumbnailUrl,
      (photo as any).fileUrl,
      (photo as any).lilaAppUrl,
      (photo as any).metadata?.fileUrl,
      (photo as any).metadata?.lilaAppUrl,
    ].filter(Boolean) as string[];
    const normalizedCandidates = candidates.map((value) =>
      typeof value === 'string' ? value.split('?')[0].split('#')[0].toLowerCase() : ''
    );
    const hasVideoExtension = normalizedCandidates.some((value) =>
      value.endsWith('.mp4') ||
      value.endsWith('.webm') ||
      value.endsWith('.mov') ||
      value.endsWith('.mkv') ||
      value.endsWith('.avi') ||
      value.endsWith('.m4v') ||
      value.endsWith('.mpeg') ||
      value.endsWith('.mpg') ||
      value.endsWith('.3gp')
    );
    const hasImageExtension = normalizedCandidates.some((value) =>
      value.endsWith('.jpg') ||
      value.endsWith('.jpeg') ||
      value.endsWith('.png') ||
      value.endsWith('.webp') ||
      value.endsWith('.gif') ||
      value.endsWith('.bmp') ||
      value.endsWith('.heic') ||
      value.endsWith('.heif')
    );

    if (typeof mime === 'string' && mime) {
      const normalizedMime = mime.toLowerCase();
      if (normalizedMime.includes('video') || normalizedMime.includes('pdf') || normalizedMime.includes('application')) {
        return false;
      }
      if (normalizedMime.includes('image')) {
        return !hasVideoExtension;
      }
    }

    if ((photo as any).base64) {
      return !hasVideoExtension;
    }

    if (hasVideoExtension) {
      return false;
    }

    return hasImageExtension;
  }

  private async renderPhotoTable(photos: PhotoItem[], section: SectionSchema): Promise<string> {
    const imagePhotos = photos.filter((photo) => this.isImagePhoto(photo));
    const [columns] = this.parseLayout(section.layout);
    const imageHeight = this.resolvePhotoHeight(columns);
    const rows: string[] = [];

    for (let i = 0; i < imagePhotos.length; i += columns) {
      const chunk = imagePhotos.slice(i, i + columns);
      const cells = await Promise.all(
        chunk.map(async (photo, index) => {
          const src = await this.resolveImageSrc(photo);
          const imgTag = src
            ? `<img src="${src}" style="width:100%;height:${imageHeight}px;object-fit:contain;background:#f8f8f8;" />`
            : `<div style="height:${imageHeight}px;display:flex;align-items:center;justify-content:center;background:#f8f8f8;">Sin imagen</div>`;
          const caption = this.buildPhotoCaption(photo, section, i + index + 1);
          const captionHtml = caption
            ? `<div class="caption">${this.renderCaptionLines(caption)}</div>`
            : '';
          const cellWidth = `${(100 / columns).toFixed(2)}%`;
          return `<td style="width:${cellWidth};">${imgTag}${captionHtml}</td>`;
        })
      );

      if (cells.length < columns) {
        const missing = columns - cells.length;
        for (let m = 0; m < missing; m += 1) {
          cells.push('<td></td>');
        }
      }

      rows.push(`<tr>${cells.join('')}</tr>`);
    }

    return `<table class="photo-table" style="table-layout:fixed;">${rows.join('')}</table>`;
  }

  private getIaaAreaRows(): Array<Record<string, any>> {
    const rows = this.getValue('cuadroMetrado');
    if (!Array.isArray(rows)) return [];
    const photos = this.resolvePhotos({ id: 'panelFotografico' } as SectionSchema);
    const totals = photos.reduce<Record<string, { area: number; volume: number; hasArea: boolean; hasVolume: boolean }>>((acc, photo) => {
      const category = String(photo.category || '');
      if (!category) return acc;
      const current = acc[category] || { area: 0, volume: 0, hasArea: false, hasVolume: false };
      acc[category] = {
        area: current.area + Number(photo.areaM2 || 0),
        volume: current.volume + Number(photo.volumeM3 || 0),
        hasArea: current.hasArea || photo.areaM2 !== undefined,
        hasVolume: current.hasVolume || photo.volumeM3 !== undefined,
      };
      return acc;
    }, {});
    return rows.map((row) => {
      const id = String(row?.id || row?.item || '');
      return {
        ...row,
        area: totals[id]?.hasArea ? Number(totals[id].area || 0) : Number(row?.area || 0),
        volumen: totals[id]?.hasVolume ? Number(totals[id].volume || 0) : Number(row?.volumen || 0),
      };
    });
  }

  private renderIaaTotalAreaRow(
    columns: ColumnSchema[],
    rowsData: Array<Record<string, any>>
  ): string {
    const totalArea = rowsData.reduce((sum, row) => sum + Number(row?.area || 0), 0);
    const totalVolume = rowsData.reduce((sum, row) => sum + Number(row?.volumen || 0), 0);
    const cells = columns.map((column, index) => {
      if (column.key === 'area') {
        return `<td style="font-weight:bold;text-align:center;">${this.escapeHtml(this.formatValue(totalArea, 'number'))}</td>`;
      }
      if (column.key === 'volumen') {
        return `<td style="font-weight:bold;text-align:center;">${this.escapeHtml(this.formatValue(totalVolume, 'number'))}</td>`;
      }
      if (index === 0) return '<td style="font-weight:bold;">TOTAL ADICIONAL</td>';
      return '<td></td>';
    });
    return `<tr>${cells.join('')}</tr>`;
  }

  private async renderIaaPhotoPanel(section: SectionSchema): Promise<string> {
    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';
    const photos = this.limitPhotos(this.resolvePhotos(section), section.maxImages);
    if (photos.length === 0) return '';

    const groups = this.getIaaAreaRows()
      .map((row, index) => {
        const id = String(row?.id || row?.item || '');
        const label = String(row?.ubicacion || row?.tramoZona || `Zona ${index + 1}`);
        return {
          id,
          label,
          area: Number(row?.area || 0),
          photos: photos.filter((photo) => String(photo.category || '') === id),
        };
      })
      .filter((group) => group.photos.length > 0);

    const groupedPhotos = new Set(groups.flatMap((group) => group.photos));
    const ungrouped = photos.filter((photo) => !groupedPhotos.has(photo));
    if (ungrouped.length > 0) {
      groups.push({ id: 'otros', label: 'Sin zona asignada', area: 0, photos: ungrouped });
    }

    const groupHtml: string[] = [];
    for (const group of groups) {
      const areaText = group.area > 0
        ? ` - Area: ${this.escapeHtml(this.formatValue(group.area, 'number'))} m2`
        : '';
      const groupTitle = `<h3>${this.escapeHtml(group.label)}${areaText}</h3>`;
      groupHtml.push(`${groupTitle}${await this.renderPhotoTable(group.photos, section)}`);
    }

    return `<div class="section">${title}${groupHtml.join('')}</div>`;
  }

  private buildPhotoCaption(photo: PhotoItem, section: SectionSchema, index: number): string {
    if (this.schema.code === 'IPP') {
      const prefix = section.id === 'panelFotograficoLaboratorio'
        ? `FOTO L-${String(index).padStart(2, '0')}`
        : `FOTO P-${String(index).padStart(2, '0')}`;
      const categoryLabel = this.resolvePhotoCategoryLabel(photo, section);
      const lines: string[] = [];
      lines.push(categoryLabel ? `${prefix} [${categoryLabel}]` : prefix);
      if (photo.descripcion) {
        lines.push(photo.descripcion);
      } else if (photo.filename) {
        lines.push(photo.filename);
      }
      const hora = photo.hora || (section.showHora ? photo.fecha : undefined);
      const metaParts: string[] = [];
      if (hora) metaParts.push(`Hora: ${hora}`);
      if (photo.codigoMuestra) metaParts.push(`Muestra: ${photo.codigoMuestra}`);
      if (metaParts.length > 0) {
        lines.push(metaParts.join(' | '));
      }
      return lines.join('\n');
    }

    const parts: string[] = [];
    if (this.schema.code === 'IAA' && section.id === 'panelFotografico') {
      parts.push(`Foto ${index}`);
      if (photo.areaM2 !== undefined && Number(photo.areaM2) > 0) {
        parts.push(`Area: ${this.formatValue(Number(photo.areaM2), 'number')} m2`);
      }
      if (photo.volumeM3 !== undefined && Number(photo.volumeM3) > 0) {
        parts.push(`Volumen: ${this.formatValue(Number(photo.volumeM3), 'number')} m3`);
      }
    }
    if (photo.descripcion) {
      parts.push(photo.descripcion);
    } else if (photo.filename) {
      parts.push(photo.filename);
    }

    if (section.showProgresiva && photo.progresiva) {
      parts.push(`Prog: ${photo.progresiva}`);
    }
    if (section.showFecha && photo.fecha) {
      parts.push(`Fecha: ${photo.fecha}`);
    }
    if (section.showHora && photo.hora) {
      parts.push(`Hora: ${photo.hora}`);
    }
    if (photo.codigoMuestra) {
      parts.push(`Muestra: ${photo.codigoMuestra}`);
    }

    return parts.join(' | ');
  }

  private resolvePhotoCategoryLabel(photo: PhotoItem, section: SectionSchema): string | null {
    const value = photo.category || photo.tipo || photo.purpose;
    if (!value) return null;
    const categories = section.categories || [];
    const found = categories.find((category) => category.key === value);
    return found?.label || value;
  }

  private renderCaptionLines(caption: string): string {
    if (!caption) return '';
    const lines = caption.split('\n');
    return lines.map((line) => this.escapeHtml(line)).join('<br/>');
  }

  private async resolveImageSrc(photo: PhotoItem): Promise<string | null> {
    if (photo.base64) {
      return this.resolveBase64Image(photo.base64);
    }

    const urlCandidate =
      (photo as any).renderedUrl ||
      (photo as any).renderedThumbnailUrl ||
      (photo as any).thumbnailUrl ||
      photo.url ||
      (photo as any).fileUrl ||
      (photo as any).lilaAppUrl ||
      (photo as any).metadata?.lilaAppUrl ||
      (photo as any).metadata?.fileUrl ||
      '';

    if (urlCandidate) {
      const buffer = await this.resolveImageBufferFromUrl(urlCandidate);
      if (buffer) {
        return this.bufferToDataUrl(buffer);
      }

      const isInternalFile = urlCandidate.includes('/files/companies/');
      if (isInternalFile) {
        if (urlCandidate.startsWith('/files/companies/')) {
          return this.buildAbsoluteUrl(urlCandidate);
        }
        // Fallback: permitir URL absoluta interna si no se pudo resolver localmente.
        if (urlCandidate.startsWith('http')) {
          return urlCandidate;
        }
        return null;
      }

      if (urlCandidate.startsWith('http')) {
        return urlCandidate;
      }
    }

    const filePath = photo.filePath || photo.path;
    if (filePath) {
      const buffer = await this.resolveFileBuffer(filePath);
      if (buffer) {
        return this.bufferToDataUrl(buffer);
      }
    }

    return null;
  }

  private async resolveFileBuffer(filePath: string): Promise<Buffer | null> {
    try {
      if (path.isAbsolute(filePath)) {
        if (await fs.pathExists(filePath)) {
          const raw = await fs.readFile(filePath);
          return ImageCompressionService.processImage(raw, path.basename(filePath));
        }
        return null;
      }

      if (!this.options.companyId) {
        return null;
      }

      const resolved = this.resolveCompanyStoragePath(filePath);
      if (resolved && (await fs.pathExists(resolved))) {
        const raw = await fs.readFile(resolved);
        return ImageCompressionService.processImage(raw, path.basename(resolved));
      }
    } catch (error) {
      logger.warn('Failed to read photo file for PDF', { error: String(error), filePath });
    }
    return null;
  }

  private async resolveBase64Image(base64: string): Promise<string | null> {
    try {
      const raw = base64.includes(',') ? base64.split(',')[1] : base64;
      const buffer = Buffer.from(raw, 'base64');
      const compressed = await ImageCompressionService.processImage(buffer, 'inline-image');
      return this.bufferToDataUrl(compressed);
    } catch (error) {
      logger.warn('Failed to process inline base64 image', { error: String(error) });
      const fallback = base64.includes(',') ? base64 : `data:image/jpeg;base64,${base64}`;
      return fallback;
    }
  }

  private resolveStoragePathFromUrl(urlCandidate: string): string | null {
    if (!this.options.companyId) return null;
    try {
      const rawPath = urlCandidate.startsWith('http')
        ? new URL(urlCandidate).pathname
        : urlCandidate;
      const marker = '/files/companies/';
      const idx = rawPath.indexOf(marker);
      if (idx === -1) return null;
      const remainder = rawPath.slice(idx + marker.length);
      const parts = remainder.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      const companyId = parts[0];
      const relative = parts.slice(1).join('/');
      return storagePathService.resolvePath(companyId, relative);
    } catch (error) {
      logger.warn('Failed to resolve storage path from url', { error: String(error), urlCandidate });
      return null;
    }
  }

  private async resolveImageBufferFromUrl(urlCandidate: string): Promise<Buffer | null> {
    try {
      const storagePath = this.resolveStoragePathFromUrl(urlCandidate);
      if (storagePath) {
        if (await fs.pathExists(storagePath)) {
          const raw = await fs.readFile(storagePath);
          return ImageCompressionService.processImage(raw, path.basename(storagePath));
        }
        // Permitir fallback HTTP cuando el archivo no existe localmente.
      }
    } catch (error) {
      logger.warn('Failed to read image from storage path', { error: String(error), urlCandidate });
    }

    if (!urlCandidate.startsWith('http')) {
      return null;
    }

    try {
      const response = await axios.get(urlCandidate, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });
      const buffer = Buffer.from(response.data);
      return ImageCompressionService.processImage(buffer, path.basename(urlCandidate));
    } catch (error) {
      logger.warn('Failed to download image for PDF compression', {
        error: String(error),
        urlCandidate,
      });
      return null;
    }
  }

  private resolveCompanyStoragePath(relativePath: string): string | null {
    if (!this.options.companyId) {
      return null;
    }
    try {
      const cleaned = relativePath.replace(/^[\\/]+/g, '');
      const companyPrefix = `${this.options.companyId}/`;
      const companiesPrefix = `companies/${this.options.companyId}/`;
      const normalized = cleaned.startsWith(companiesPrefix)
        ? cleaned.slice(companiesPrefix.length)
        : cleaned.startsWith(companyPrefix)
        ? cleaned.slice(companyPrefix.length)
        : cleaned;
      return storagePathService.resolvePath(this.options.companyId, normalized);
    } catch (error) {
      logger.warn('Failed to resolve company storage path', { error: String(error), relativePath });
      return null;
    }
  }

  private async bufferToDataUrl(buffer: Buffer): Promise<string> {
    let format = 'jpeg';
    try {
      const metadata = await sharp(buffer).metadata();
      if (metadata.format) {
        format = metadata.format;
      }
    } catch (error) {
      logger.warn('Failed to detect image format', { error: String(error) });
    }

    const base64 = buffer.toString('base64');
    return `data:image/${format};base64,${base64}`;
  }

  private buildAbsoluteUrl(relativePath: string): string {
    const base = this.options.baseUrl?.replace(/\/+$/, '') || '';
    if (!base) return relativePath;
    return `${base}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
  }

  private parseLayout(layout?: string): [number, number] {
    if (!layout) {
      return [2, 2];
    }
    const parts = layout.split('x').map((value) => Number(value));
    if (parts.length === 2 && parts.every((n) => Number.isFinite(n) && n > 0)) {
      return [parts[0], parts[1]];
    }
    return [2, 2];
  }

  private resolvePhotoHeight(columns: number): number {
    const base = this.options.imageMaxHeight || 180;
    if (columns <= 2) return base;
    if (columns === 3) return Math.round(base * 0.7);
    return Math.round(base * 0.6);
  }

  private formatValue(value: any, type?: string, field?: FieldSchema | ColumnSchema): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (value === '') {
      return '';
    }

    if (type === 'checkbox') {
      return value ? '✓' : '';
    }

    if (type === 'currency') {
      return this.formatCurrency(value);
    }

    if (type === 'number' || type === 'percentage') {
      const num = Number(value);
      if (Number.isNaN(num)) return String(value);
      if (type === 'percentage') {
        return `${num.toFixed(2)}%`;
      }
      return num.toLocaleString('es-PE');
    }

    if (type === 'date' || type === 'datetime') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString('es-PE');
    }

    if (type === 'select' && field && 'options' in field && field.options) {
      const option = field.options.find((opt) => opt.value === value);
      if (option) return option.label;
    }

    if (typeof value === 'boolean') {
      return value ? 'Si' : 'No';
    }

    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join(', ');
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  private formatCurrency(value: any): string {
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    try {
      return new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    } catch {
      return `S/ ${num.toFixed(2)}`;
    }
  }

  private getValue(pathKey: string, source?: Record<string, any>): any {
    if (!pathKey) return undefined;
    const keys = pathKey.split('.');
    let current: any = source || this.data;

    for (const key of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }

    return current;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private alignCss(align?: 'left' | 'center' | 'right'): string {
    if (align === 'center') return 'center';
    if (align === 'right') return 'right';
    return 'left';
  }
}

export default ReportHtmlRenderer;
