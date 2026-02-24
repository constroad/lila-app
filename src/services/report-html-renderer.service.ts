import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { DocumentSchema, SectionSchema, FieldSchema, ColumnSchema } from '../schemas/documents/types.js';
import { storagePathService } from './storage-path.service.js';
import { ImageCompressionService } from './image-compression.service.js';
import logger from '../utils/logger.js';

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
  progresiva?: string;
  base64?: string;
  url?: string;
  filePath?: string;
  path?: string;
  buffer?: Buffer;
  category?: string;
  tipo?: string;
  purpose?: string;
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

  constructor(schema: DocumentSchema, data: Record<string, any>, options: HtmlRendererOptions = {}) {
    this.schema = schema;
    this.data = data;
    this.options = {
      imageMaxWidth: 260,
      imageMaxHeight: 180,
      ...options,
    };
    this.headerSection = schema.sections.find((section) => section.type === 'header') || null;
  }

  async render(): Promise<string> {
    const sections: string[] = [];
    for (const section of this.schema.sections) {
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

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; }
    h1 { font-size: 18px; margin: 0 0 6px 0; text-align: center; }
    h2 { font-size: 14px; margin: 16px 0 6px 0; }
    h3 { font-size: 12px; margin: 12px 0 6px 0; }
    .section { margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #333; padding: 4px 6px; vertical-align: top; }
    th { background: #f1f1f1; }
    .kv-table td:first-child { width: 35%; font-weight: bold; }
    .photo-table td { text-align: center; }
    .photo-table img { max-width: 100%; height: auto; }
    .caption { font-size: 10px; margin-top: 4px; }
    .checklist { list-style: none; padding: 0; margin: 0; }
    .checklist li { margin-bottom: 4px; }
    .page-wrapper { }
    .page-break { break-before: page; page-break-before: always; }
    .page-landscape { page: landscape; }
    .page-portrait { page: portrait; }
    @page { size: ${pageSize} ${baseOrientation}; }
    @page portrait { size: ${pageSize} portrait; }
    @page landscape { size: ${pageSize} landscape; }
  </style>
</head>
<body>
  ${sections.join('\n')}
</body>
</html>`;
  }

  private async renderSection(section: SectionSchema): Promise<string> {
    switch (section.type) {
      case 'header':
        return this.renderHeader(section);
      case 'projectData':
      case 'simpleFields':
      case 'summary':
        return this.renderFieldsSection(section);
      case 'dataTable':
      case 'resultsTable':
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

  private async renderHeader(section: SectionSchema): Promise<string> {
    if (section.headerConfig) {
      const config = section.headerConfig;
      const logoValue = config.logoUrl || this.getValue(config.logoKey || '');
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
      ]
        .map((line) => `<div style="text-align:center;">${this.escapeHtml(String(line))}</div>`)
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

      return `<div class="section">
        <table style="width:100%; border:1px solid #333; border-collapse:collapse;">
          <tr>
            <td style="width:22%; text-align:center; border:1px solid #333; padding:6px;">
              ${
                logoSrc
                  ? `<img src="${logoSrc}" style="max-height:60px;max-width:120px;object-fit:contain;" />`
                  : leftText
                  ? `<div style="font-weight:700;">${this.escapeHtml(String(leftText))}</div>`
                  : ''
              }
            </td>
            <td style="width:56%; text-align:center; border:1px solid #333; padding:6px;">
              ${centerTitle ? `<div style="font-weight:700;">${this.escapeHtml(String(centerTitle))}</div>` : ''}
              ${centerSubtitle ? `<div>${this.escapeHtml(String(centerSubtitle))}</div>` : ''}
              ${centerLines}
            </td>
            <td style="width:22%; border:1px solid #333; padding:6px; font-size:10px;">
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
    const title = section.title ? `<h2>${this.escapeHtml(section.title)}</h2>` : '';
    const fields = section.fields || [];
    if (fields.length === 0) {
      return `<div class="section">${title}</div>`;
    }

    const rows = fields
      .map((field) => {
        const value = this.getValue(field.key);
        const formatted = this.escapeHtml(this.formatValue(value, field.type, field));
        return `<tr><td>${this.escapeHtml(field.label || '')}</td><td>${formatted}</td></tr>`;
      })
      .join('');

    return `<div class="section">${title}<table class="kv-table">${rows}</table></div>`;
  }

  private renderDataTable(section: SectionSchema): string {
    const title = section.title ? `<h2>${this.escapeHtml(section.title)}</h2>` : '';
    const columns = section.columns || [];
    if (columns.length === 0) {
      return `<div class="section">${title}</div>`;
    }

    const hasGroups = columns.some((col) => col.group);
    const headerCells: Array<
      | { type: 'group'; label: string; span: number }
      | { type: 'single'; column: ColumnSchema }
    > = [];

    let index = 0;
    while (index < columns.length) {
      const column = columns[index];
      if (!column.group) {
        headerCells.push({ type: 'single', column });
        index += 1;
        continue;
      }
      const groupLabel = column.group;
      let span = 1;
      while (index + span < columns.length && columns[index + span].group === groupLabel) {
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
      ? `<tr>${columns
          .filter((col) => col.group)
          .map((col) => {
            const width = col.width ? `width:${col.width}px;` : '';
            return `<th style="${width}text-align:${this.alignCss(col.align)}">${this.escapeHtml(col.label || col.key)}</th>`;
          })
          .join('')}</tr>`
      : '';

    const rowsData = this.resolveTableRows(section);
    const rows = rowsData
      .map((row) => {
        const cells = columns
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

    return `<div class="section">${title}<table>${headerRow}${subHeaderRow}${rows}</table></div>`;
  }

  private renderChecklist(section: SectionSchema): string {
    const title = section.title ? `<h2>${this.escapeHtml(section.title)}</h2>` : '';
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
    const title = section.title ? `<h2>${this.escapeHtml(section.title)}</h2>` : '';
    const photos = this.limitPhotos(this.resolvePhotos(section), section.maxImages);
    if (photos.length === 0) {
      return `<div class="section">${title}<div>Sin fotos registradas.</div></div>`;
    }

    const table = await this.renderPhotoTable(photos, section);
    return `<div class="section">${title}${table}</div>`;
  }

  private async renderPhotoSection(section: SectionSchema): Promise<string> {
    const title = section.title ? `<h2>${this.escapeHtml(section.title)}</h2>` : '';
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
    const title = section.title ? `<h2>${this.escapeHtml(section.title)}</h2>` : '';
    const value = this.getValue(section.id);
    if (!value) {
      return `<div class="section">${title}</div>`;
    }

    const lines = Array.isArray(value) ? value.map(String) : String(value).split(/\r?\n/);
    const html = lines.map((line) => `<p>${this.escapeHtml(line)}</p>`).join('');
    return `<div class="section">${title}${html}</div>`;
  }

  private async renderSignatures(section: SectionSchema): Promise<string> {
    const title = section.title ? `<h2>${this.escapeHtml(section.title)}</h2>` : '';
    const signatures = section.signatures || [];
    if (signatures.length === 0) {
      return `<div class="section">${title}</div>`;
    }

    const signaturePath = section.id || 'firmas';
    const cells = await Promise.all(
      signatures.map(async (signature) => {
        const info = this.getValue(`${signaturePath}.${signature.key}`) || {};
        const name = info.nombre || '';
        const role = info.cargo || signature.sublabel || '';
        const cip = signature.showCIP && info.cip ? `CIP: ${info.cip}` : '';
        const align = info.signatureAlign || 'center';
        const width = Number(info.signatureWidth) || 160;
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
            return `<img src="${item.src}" style="position:absolute;top:0;left:0;max-height:70px;max-width:${width}px;object-fit:contain;z-index:${zIndex};" />`;
          })
          .join('');
        const imageHtml = imageLayers
          ? `<div style="display:flex;justify-content:${justify};margin:6px 0;">
              <div style="position:relative;width:${width}px;height:80px;">${imageLayers}</div>
            </div>`
          : '';
        const lineHtml =
          section.signatureStyle === 'line'
            ? `<div style="border-top:1px solid #333; margin:6px 0 4px 0;"></div>`
            : '';
        return `<td>
          <div><strong>${this.escapeHtml(signature.label || '')}</strong></div>
          ${imageHtml}
          ${lineHtml}
          <div style="margin-top: 8px;">${this.escapeHtml(name)}</div>
          <div>${this.escapeHtml(role)}</div>
          <div>${this.escapeHtml(cip)}</div>
        </td>`;
      })
    );

    return `<div class="section">${title}<table><tr>${cells.join('')}</tr></table></div>`;
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

    return [];
  }

  private resolvePhotos(section: SectionSchema): PhotoItem[] {
    const direct = this.getValue(section.id);
    if (Array.isArray(direct)) {
      return direct as PhotoItem[];
    }
    if (direct && Array.isArray(direct.fotos)) {
      return direct.fotos as PhotoItem[];
    }

    const nested = this.getValue(`secciones.${section.id}.fotos`);
    if (Array.isArray(nested)) {
      return nested as PhotoItem[];
    }

    if (section.type === 'photoPanel') {
      const alt = this.getValue('registroFotografico.fotos');
      if (Array.isArray(alt)) {
        return alt as PhotoItem[];
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

  private async renderPhotoTable(photos: PhotoItem[], section: SectionSchema): Promise<string> {
    const [columns] = this.parseLayout(section.layout);
    const imageHeight = this.resolvePhotoHeight(columns);
    const rows: string[] = [];

    for (let i = 0; i < photos.length; i += columns) {
      const chunk = photos.slice(i, i + columns);
      const cells = await Promise.all(
        chunk.map(async (photo) => {
          const src = await this.resolveImageSrc(photo);
          const imgTag = src
            ? `<img src="${src}" style="width:100%;height:${imageHeight}px;object-fit:contain;background:#f8f8f8;" />`
            : `<div style="height:${imageHeight}px;display:flex;align-items:center;justify-content:center;background:#f8f8f8;">Sin imagen</div>`;
          const caption = this.buildPhotoCaption(photo, section);
          const captionHtml = caption ? `<div class="caption">${this.escapeHtml(caption)}</div>` : '';
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

  private buildPhotoCaption(photo: PhotoItem, section: SectionSchema): string {
    const parts: string[] = [];
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

    return parts.join(' | ');
  }

  private async resolveImageSrc(photo: PhotoItem): Promise<string | null> {
    if (photo.base64) {
      const base64 = photo.base64.includes(',') ? photo.base64 : `data:image/jpeg;base64,${photo.base64}`;
      return base64;
    }

    if (photo.url) {
      if (photo.url.startsWith('http')) {
        return photo.url;
      }
      if (photo.url.startsWith('/files/companies/')) {
        return this.buildAbsoluteUrl(photo.url);
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
