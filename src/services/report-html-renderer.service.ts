import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import axios from 'axios';
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

      return `<div class="section">
        <table style="width:100%; border:1px solid #333; border-collapse:collapse;">
          <tr>
            <td style="width:22%; text-align:center; border:1px solid #333; padding:6px;">
              ${
                logoSrc
                  ? `<img src="${logoSrc}" style="max-height:60px;max-width:120px;object-fit:contain;" />`
                  : leftText
                  ? `<div style="font-weight:700;font-size:14px;">${this.escapeHtml(String(leftText))}</div>`
                  : ''
              }
            </td>
            <td style="width:56%; text-align:center; border:1px solid #333; padding:6px;">
              ${centerTitle ? `<div style="font-weight:700;">${this.escapeHtml(String(centerTitle))}</div>` : ''}
              ${centerSubtitle ? `<div>${this.escapeHtml(String(centerSubtitle))}</div>` : ''}
              ${centerLinesHtml}
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

    const rowsData = this.resolveTableRows(section);
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
      return `<div class="section">${title}<table>${headerRow}${subHeaderRow}${rows}</table></div>`;
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
    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';
    const photos = this.limitPhotos(this.resolvePhotos(section), section.maxImages);
    if (photos.length === 0) {
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
    const html = lines.length > 0
      ? lines.map((line) => `<p>${this.escapeHtml(line)}</p>`).join('')
      : '<p>&nbsp;</p>';

    const shouldPageBreak = this.schema.code === 'CTL-PIS' && section.id === 'observaciones';

    if (this.schema.code === 'IAA' && ['antecedentes', 'justificacionTecnica', 'conclusiones'].includes(section.id)) {
      return `<div class="section"${shouldPageBreak ? ' style="page-break-before:always;"' : ''}>${title}<table><tr><td>${html}</td></tr></table></div>`;
    }

    return `<div class="section"${shouldPageBreak ? ' style="page-break-before:always;"' : ''}>${title}${html}</div>`;
  }

  private async renderSignatures(section: SectionSchema): Promise<string> {
    const resolvedTitle = this.resolveSectionTitle(section);
    const title = resolvedTitle ? `<h2>${this.escapeHtml(resolvedTitle)}</h2>` : '';
    const signatures = section.signatures || [];
    if (signatures.length === 0) {
      return `<div class="section">${title}</div>`;
    }

    const actaTipo = this.schema.code === 'ACT-CNF'
      ? String(this.getValue('acta.tipo') || '').toUpperCase()
      : '';
    const cipLabel = this.schema.code === 'ACT-CNF' ? 'DNI' : 'CIP';

    const signaturePath = section.id || 'firmas';
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
      (photo as any).renderedThumbnailUrl ||
      (photo as any).renderedUrl ||
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
