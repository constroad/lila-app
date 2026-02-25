import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { DocumentSchema, SectionSchema, FieldSchema, ColumnSchema } from '../schemas/documents/types.js';
import { ImageCompressionService } from './image-compression.service.js';
import { storagePathService } from './storage-path.service.js';
import logger from '../utils/logger.js';

interface DOCXGeneratorOptions {
  companyId?: string;
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

export class DOCXGenerator {
  private schema: DocumentSchema;
  private data: Record<string, any>;
  private options: DOCXGeneratorOptions;
  private sectionTitleMap: Map<string, string>;

  constructor(schema: DocumentSchema, data: Record<string, any>, options: DOCXGeneratorOptions = {}) {
    this.schema = schema;
    this.data = data;
    this.options = {
      imageMaxWidth: 260,
      imageMaxHeight: 180,
      ...options,
    };
    this.sectionTitleMap = this.buildSectionTitleMap();
  }

  async generate(): Promise<Buffer> {
    const sections: Array<{ properties: any; children: Array<Paragraph | Table> }> = [];
    let currentOrientation = this.schema.orientation;
    let currentSection = this.buildDocxSection(currentOrientation);
    const headerSection = this.schema.sections.find((section) => section.type === 'header');

    for (const section of this.schema.sections) {
      if (section.type === 'header') {
        const rendered = await this.renderSection(section);
        if (rendered.length > 0) {
          currentSection.children.push(...rendered);
        }
        continue;
      }
      const sectionOrientation = section.pageOrientation || this.schema.orientation;
      const needsNewSection =
        (section.pageBreakBefore && currentSection.children.length > 0) ||
        (sectionOrientation !== currentOrientation && currentSection.children.length > 0);

      if (needsNewSection) {
        sections.push(currentSection);
        currentOrientation = sectionOrientation;
        currentSection = this.buildDocxSection(currentOrientation);
      }

      if (section.includeHeader && headerSection?.headerConfig) {
        const header = await this.renderHeader({
          ...headerSection,
          headerConfig: {
            ...headerSection.headerConfig,
            ...(section.headerOverride || {}),
          },
        });
        if (header.length > 0) {
          currentSection.children.push(...header);
        }
      }

      const rendered = await this.renderSection(section);
      if (rendered.length > 0) {
        currentSection.children.push(...rendered);
      }
    }

    if (currentSection.children.length > 0) {
      sections.push(currentSection);
    }

    const doc = new Document({ sections });

    const buffer = await Packer.toBuffer(doc);
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
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

  private buildDocxSection(orientation: 'portrait' | 'landscape') {
    return {
      properties: {
        page: {
          size: {
            orientation:
              orientation === 'landscape'
                ? PageOrientation.LANDSCAPE
                : PageOrientation.PORTRAIT,
          },
          margin: this.schema.margins
            ? {
                top: this.mmToTwip(this.schema.margins.top),
                right: this.mmToTwip(this.schema.margins.right),
                bottom: this.mmToTwip(this.schema.margins.bottom),
                left: this.mmToTwip(this.schema.margins.left),
              }
            : undefined,
        },
      },
      children: [] as Array<Paragraph | Table>,
    };
  }

  private async renderSection(section: SectionSchema): Promise<Array<Paragraph | Table>> {
    switch (section.type) {
      case 'header':
        return this.renderHeader(section);
      case 'projectData':
        return this.renderFieldsSection(section);
      case 'simpleFields':
        if (section.id === 'levantamientoTopografico' && this.schema.code === 'IAA') {
          return this.renderLevantamientoTopografico(section);
        }
        return this.renderFieldsSection(section);
      case 'summary':
        return this.renderFieldsSection(section);
      case 'dataTable':
        if (section.id === 'cuadroMetrado' && this.schema.code === 'IAA') {
          return this.renderCuadroMetrado(section);
        }
        return this.renderDataTable(section);
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
        return [];
    }
  }

  private async renderHeader(section: SectionSchema): Promise<Paragraph[]> {
    const elements: Paragraph[] = [];

    if (section.headerConfig) {
      const config = section.headerConfig;
      const logoValue = config.logoUrl || this.getValue(config.logoKey || '');
      const leftText = config.leftTextKey ? this.getValue(config.leftTextKey) : '';
      const rightFields = config.rightFields || [];

      const logoRun = logoValue
        ? await this.buildLogoImageRun(String(logoValue))
        : null;

      const leftCell = new TableCell({
        children: [
          logoRun
            ? new Paragraph({ children: [logoRun], alignment: AlignmentType.CENTER })
            : new Paragraph({
                text: leftText ? String(leftText) : '',
                alignment: AlignmentType.CENTER,
              }),
        ],
      });

      const centerTitle = config.centerTitle || this.getValue(config.centerTitleKey || '');
      const centerSubtitle = config.centerSubtitle || this.getValue(config.centerSubtitleKey || '');
      const centerLineValues = [
        ...(config.centerLines || []),
        ...((config.centerLinesKeys || []).map((key) => this.getValue(key)).filter(Boolean)),
      ];

      const centerParagraphs: Paragraph[] = [];
      if (centerTitle) {
        centerParagraphs.push(
          new Paragraph({
            text: String(centerTitle),
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: String(centerTitle), bold: true })],
          })
        );
      }
      if (centerSubtitle) {
        centerParagraphs.push(
          new Paragraph({
            text: String(centerSubtitle),
            alignment: AlignmentType.CENTER,
          })
        );
      }
      centerLineValues.forEach((line) => {
        centerParagraphs.push(
          new Paragraph({
            text: String(line),
            alignment: AlignmentType.CENTER,
          })
        );
      });

      const centerCell = new TableCell({
        children: centerParagraphs.length > 0 ? centerParagraphs : [new Paragraph({ text: '' })],
      });

      const rightCellParagraphs = rightFields.map((field) => {
        const value = this.getValue(field.key);
        const text = `${field.label}: ${this.formatValue(value)}`;
        return new Paragraph({
          children: [new TextRun({ text, font: 'Arial', size: 18 })],
        });
      });

      const rightCell = new TableCell({
        children: rightCellParagraphs.length > 0 ? rightCellParagraphs : [new Paragraph({ text: '' })],
      });

      const secondary = config.secondaryRow;
      const secondaryLeft =
        secondary?.leftText || (secondary?.leftTextKey ? this.getValue(secondary.leftTextKey) : '');
      const secondaryCenter =
        secondary?.centerText || (secondary?.centerTextKey ? this.getValue(secondary.centerTextKey) : '');
      const secondaryRightFields = secondary?.rightFields || [];
      const secondaryRightParagraphs = secondaryRightFields.map((field) => {
        const value = this.getValue(field.key);
        const text = `${field.label}: ${this.formatValue(value)}`;
        return new Paragraph({
          children: [new TextRun({ text, font: 'Arial', size: 18 })],
        });
      });

      const rows = [
        new TableRow({
          children: [leftCell, centerCell, rightCell],
        }),
      ];

      if (secondaryLeft || secondaryCenter || secondaryRightParagraphs.length > 0) {
        rows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({ text: secondaryLeft ? String(secondaryLeft) : '', alignment: AlignmentType.CENTER }),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph({ text: secondaryCenter ? String(secondaryCenter) : '', alignment: AlignmentType.CENTER }),
                ],
              }),
              new TableCell({
                children: secondaryRightParagraphs.length > 0 ? secondaryRightParagraphs : [new Paragraph({ text: '' })],
              }),
            ],
          })
        );
      }

      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
      });

      elements.push(table);
      elements.push(new Paragraph({ text: '' }));
      return elements;
    }

    if (section.title) {
      elements.push(
        new Paragraph({
          text: section.title,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
        })
      );
    }

    if (section.subtitle) {
      elements.push(
        new Paragraph({
          text: section.subtitle,
          alignment: AlignmentType.CENTER,
        })
      );
    }

    elements.push(new Paragraph({ text: '' }));
    return elements;
  }

  private renderFieldsSection(section: SectionSchema): Array<Paragraph | Table> {
    const elements: Array<Paragraph | Table> = [];
    const title = this.resolveSectionTitle(section);
    if (title) {
      elements.push(this.renderSectionTitle(title));
    }

    const fields = section.fields || [];
    if (fields.length === 0) {
      return elements;
    }

    const rows = fields.map((field) => {
      const value = this.getValue(field.key);
      const formatted = this.formatValue(value, field.type, field);
      return new TableRow({
        children: [
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: field.label || '', bold: true })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ text: formatted })],
          }),
        ],
      });
    });

    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
      })
    );

    elements.push(new Paragraph({ text: '' }));
    return elements;
  }

  private renderLevantamientoTopografico(section: SectionSchema): Array<Paragraph | Table> {
    const elements: Array<Paragraph | Table> = [];
    if (!this.getValue('levantamiento.incluir')) {
      return elements;
    }
    const title = this.resolveSectionTitle(section);
    if (title) {
      elements.push(this.renderSectionTitle(title));
    }

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

    const tableRows: TableRow[] = [];
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 4,
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'DATOS DEL LEVANTAMIENTO TOPOGRAFICO', bold: true })],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        ],
      })
    );

    rows.forEach((row) => {
      const leftValue = this.formatValue(this.getValue(row.leftKey), row.leftType);
      if (row.colspan) {
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: row.leftLabel, bold: true })],
                  }),
                ],
              }),
              new TableCell({
                columnSpan: row.colspan,
                children: [new Paragraph({ text: leftValue })],
              }),
            ],
          })
        );
        return;
      }

      const rightValue = this.formatValue(this.getValue(row.rightKey || ''), row.rightType);
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: row.leftLabel, bold: true })],
                }),
              ],
            }),
            new TableCell({ children: [new Paragraph({ text: leftValue })] }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: row.rightLabel || '', bold: true })],
                }),
              ],
            }),
            new TableCell({ children: [new Paragraph({ text: rightValue })] }),
          ],
        })
      );
    });

    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
      })
    );

    elements.push(new Paragraph({ text: '' }));
    return elements;
  }

  private renderDataTable(section: SectionSchema): Array<Paragraph | Table> {
    const elements: Array<Paragraph | Table> = [];
    const title = this.resolveSectionTitle(section);
    if (title) {
      elements.push(this.renderSectionTitle(title));
    }

    const rowsData = this.resolveTableRows(section);
    const columns = section.columns || [];

    if (columns.length === 0) {
      return elements;
    }

    const hasGroups = columns.some((column) => column.group);
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

    const headerRow = new TableRow({
      children: headerCells.map((cell) => {
        if (cell.type === 'group') {
          return new TableCell({
            columnSpan: cell.span,
            children: [
              new Paragraph({
                children: [new TextRun({ text: cell.label, bold: true })],
                alignment: AlignmentType.CENTER,
              }),
            ],
          });
        }
        const width = cell.column.width ? this.pxToTwip(cell.column.width) : undefined;
        return new TableCell({
          width: width ? { size: width, type: WidthType.DXA } : undefined,
          rowSpan: hasGroups ? 2 : 1,
          children: [
            new Paragraph({
              children: [new TextRun({ text: cell.column.label || cell.column.key, bold: true })],
              alignment: this.alignFor(cell.column.align),
            }),
          ],
        });
      }),
    });

    const subHeaderRow = hasGroups
      ? new TableRow({
          children: columns
            .filter((column) => column.group)
            .map((column) => {
              const width = column.width ? this.pxToTwip(column.width) : undefined;
              return new TableCell({
                width: width ? { size: width, type: WidthType.DXA } : undefined,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: column.label || column.key, bold: true })],
                    alignment: this.alignFor(column.align),
                  }),
                ],
              });
            }),
        })
      : null;

    const dataRows = rowsData.map((row) =>
      new TableRow({
        children: columns.map((column) => {
          const rawValue = this.getValue(column.key, row);
          const formatted = this.formatValue(rawValue, column.type, column);
          const width = column.width ? this.pxToTwip(column.width) : undefined;
          return new TableCell({
            width: width ? { size: width, type: WidthType.DXA } : undefined,
            children: [
              new Paragraph({
                text: formatted,
                alignment: this.alignFor(column.align),
              }),
            ],
          });
        }),
      })
    );

    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...(subHeaderRow ? [subHeaderRow] : []), ...dataRows],
      })
    );

    elements.push(new Paragraph({ text: '' }));
    return elements;
  }

  private renderCuadroMetrado(section: SectionSchema): Array<Paragraph | Table> {
    const elements: Array<Paragraph | Table> = [];
    const title = this.resolveSectionTitle(section);
    if (title) {
      elements.push(this.renderSectionTitle(title));
    }

    const rowsData = this.resolveTableRows(section);
    const columns = section.columns || [];
    if (columns.length === 0) {
      return elements;
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

    const headerRow = new TableRow({
      children: headerCells.map((cell) => {
        if (cell.type === 'group') {
          return new TableCell({
            columnSpan: cell.span,
            children: [
              new Paragraph({
                children: [new TextRun({ text: cell.label, bold: true })],
                alignment: AlignmentType.CENTER,
              }),
            ],
          });
        }
        const width = cell.column.width ? this.pxToTwip(cell.column.width) : undefined;
        return new TableCell({
          width: width ? { size: width, type: WidthType.DXA } : undefined,
          rowSpan: hasGroups ? 2 : 1,
          children: [
            new Paragraph({
              children: [new TextRun({ text: cell.column.label || cell.column.key, bold: true })],
              alignment: this.alignFor(cell.column.align),
            }),
          ],
        });
      }),
    });

    const subHeaderRow = hasGroups
      ? new TableRow({
          children: displayColumns
            .filter((column) => column.group)
            .map((column) => {
              const width = column.width ? this.pxToTwip(column.width) : undefined;
              return new TableCell({
                width: width ? { size: width, type: WidthType.DXA } : undefined,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: column.label || column.key, bold: true })],
                    alignment: this.alignFor(column.align),
                  }),
                ],
              });
            }),
        })
      : null;

    if (!hasPartida) {
      const dataRows = rowsData.map((row) =>
        new TableRow({
          children: displayColumns.map((column) => {
            const rawValue = this.getValue(column.key, row);
            const formatted = this.formatValue(rawValue, column.type, column);
            const width = column.width ? this.pxToTwip(column.width) : undefined;
            return new TableCell({
              width: width ? { size: width, type: WidthType.DXA } : undefined,
              children: [
                new Paragraph({
                  text: formatted,
                  alignment: this.alignFor(column.align),
                }),
              ],
            });
          }),
        })
      );

      elements.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...(subHeaderRow ? [subHeaderRow] : []), ...dataRows],
        })
      );
      elements.push(new Paragraph({ text: '' }));
      return elements;
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

    const tableRows: TableRow[] = [headerRow, ...(subHeaderRow ? [subHeaderRow] : [])];

    groups.forEach((group) => {
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: displayColumns.length,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: `PARTIDA: ${group.label}`, bold: true })],
                }),
              ],
            }),
          ],
        })
      );

      group.rows.forEach((row) => {
        tableRows.push(
          new TableRow({
            children: displayColumns.map((column) => {
              const rawValue = this.getValue(column.key, row);
              const formatted = this.formatValue(rawValue, column.type, column);
              const width = column.width ? this.pxToTwip(column.width) : undefined;
              return new TableCell({
                width: width ? { size: width, type: WidthType.DXA } : undefined,
                children: [
                  new Paragraph({
                    text: formatted,
                    alignment: this.alignFor(column.align),
                  }),
                ],
              });
            }),
          })
        );
      });

      tableRows.push(
        new TableRow({
          children: displayColumns.map((column, columnIndex) => {
            const width = column.width ? this.pxToTwip(column.width) : undefined;
            if (column.key === 'area' || column.key === 'volumen') {
              const sum = group.rows.reduce((acc, row) => acc + Number(row?.[column.key] || 0), 0);
              const formatted = this.formatValue(sum, column.type, column);
              return new TableCell({
                width: width ? { size: width, type: WidthType.DXA } : undefined,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: formatted, bold: true })],
                    alignment: this.alignFor(column.align),
                  }),
                ],
              });
            }
            if (columnIndex === 0) {
              return new TableCell({
                width: width ? { size: width, type: WidthType.DXA } : undefined,
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: `SUBTOTAL ${group.label}`, bold: true })],
                  }),
                ],
              });
            }
            return new TableCell({
              width: width ? { size: width, type: WidthType.DXA } : undefined,
              children: [new Paragraph({ text: '' })],
            });
          }),
        })
      );
    });

    if (groups.length > 0) {
      const summaryParts = groups.map((group) => {
        const areaTotal = group.rows.reduce((acc, row) => acc + Number(row?.area || 0), 0);
        const volumenTotal = group.rows.reduce((acc, row) => acc + Number(row?.volumen || 0), 0);
        const areaText = this.formatValue(areaTotal, 'number');
        const volumenText = this.formatValue(volumenTotal, 'number');
        const volumenLabel = volumenTotal ? ` (${volumenText} m3)` : '';
        return `${group.label}: ${areaText} m2${volumenLabel}`;
      });
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              columnSpan: displayColumns.length,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `RESUMEN DE METRADOS ADICIONALES: ${summaryParts.join(' | ')}`,
                      bold: true,
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
    }

    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
      })
    );

    elements.push(new Paragraph({ text: '' }));
    return elements;
  }

  private renderChecklist(section: SectionSchema): Paragraph[] {
    const elements: Paragraph[] = [];
    const title = this.resolveSectionTitle(section);
    if (title) {
      elements.push(this.renderSectionTitle(title));
    }

    const items = section.items || [];
    if (items.length === 0) {
      return elements;
    }

    items.forEach((item) => {
      const value = this.getValue(`${section.id}.${item.key}`);
      const checked = Boolean(value);
      const mark = checked ? '[x]' : '[ ]';
      elements.push(new Paragraph({ text: `${mark} ${item.label}` }));
    });

    elements.push(new Paragraph({ text: '' }));
    return elements;
  }

  private async renderPhotoPanel(section: SectionSchema): Promise<Array<Paragraph | Table>> {
    const elements: Array<Paragraph | Table> = [];
    const title = this.resolveSectionTitle(section);
    if (title) {
      elements.push(this.renderSectionTitle(title));
    }

    const photos = this.limitPhotos(this.resolvePhotos(section), section.maxImages);
    if (photos.length === 0) {
      elements.push(new Paragraph({ text: 'Sin fotos registradas.' }));
      elements.push(new Paragraph({ text: '' }));
      return elements;
    }

    const table = await this.renderPhotoTable(photos, section);
    elements.push(table);
    elements.push(new Paragraph({ text: '' }));
    return elements;
  }

  private async renderPhotoSection(section: SectionSchema): Promise<Array<Paragraph | Table>> {
    const elements: Array<Paragraph | Table> = [];
    const title = this.resolveSectionTitle(section);
    if (title) {
      elements.push(this.renderSectionTitle(title));
    }

    const groups = this.resolvePhotoGroups(section);
    if (groups.length === 0) {
      elements.push(new Paragraph({ text: 'Sin fotos registradas.' }));
      elements.push(new Paragraph({ text: '' }));
      return elements;
    }

    for (const group of groups) {
      if (group.label) {
        elements.push(
          new Paragraph({
            text: group.label,
            heading: HeadingLevel.HEADING_3,
          })
        );
      }

      const limited = this.limitPhotos(group.photos, section.maxImages);
      if (limited.length === 0) {
        elements.push(new Paragraph({ text: 'Sin fotos para esta categoria.' }));
        continue;
      }

      const table = await this.renderPhotoTable(limited, section);
      elements.push(table);
    }

    elements.push(new Paragraph({ text: '' }));
    return elements;
  }

  private renderRichText(section: SectionSchema): Paragraph[] {
    const elements: Paragraph[] = [];
    const title = this.resolveSectionTitle(section);
    if (title) {
      elements.push(this.renderSectionTitle(title));
    }

    const value = this.getValue(section.id);
    const lines = value
      ? Array.isArray(value)
        ? value.map((line) => String(line))
        : String(value).split(/\r?\n/)
      : [''];

    const paragraphs = lines.map((line) => new Paragraph({ text: line }));

    if (this.schema.code === 'IAA' && ['antecedentes', 'justificacionTecnica', 'conclusiones'].includes(section.id)) {
      elements.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: paragraphs.length > 0 ? paragraphs : [new Paragraph({ text: '' })],
                }),
              ],
            }),
          ],
        })
      );
      elements.push(new Paragraph({ text: '' }));
      return elements;
    }

    paragraphs.forEach((p) => elements.push(p));
    elements.push(new Paragraph({ text: '' }));
    return elements;
  }

  private async renderSignatures(section: SectionSchema): Promise<Array<Paragraph | Table>> {
    const elements: Array<Paragraph | Table> = [];
    const title = this.resolveSectionTitle(section);
    if (title) {
      elements.push(this.renderSectionTitle(title));
    }

    const signatures = section.signatures || [];
    if (signatures.length === 0) {
      return elements;
    }

    const signaturePath = section.id || 'firmas';
    const cells = await Promise.all(
      signatures.map(async (signature) => {
        const info = this.getValue(`${signaturePath}.${signature.key}`) || {};
        const name = info.nombre || '';
        const role = info.cargo || signature.sublabel || '';
        const cip = signature.showCIP && info.cip ? `CIP: ${info.cip}` : '';
        const align = this.resolveSignatureAlignment(info.signatureAlign);
        const width = this.resolveSignatureWidth(info.signatureWidth);
        const order = info.signatureOrder || 'firma-first';
        const ordered = order === 'sello-first' ? ['sello', 'firma'] : ['firma', 'sello'];

        const children: Paragraph[] = [
          new Paragraph({
            children: [new TextRun({ text: signature.label || '', bold: true })],
            alignment: align,
          }),
        ];

        for (const kind of ordered) {
          const imageRun = await this.buildSignatureImageRun(info, kind as 'firma' | 'sello', width);
          if (imageRun) {
            children.push(
              new Paragraph({
                children: [imageRun],
                alignment: align,
              })
            );
          }
        }

        if (section.signatureStyle === 'line') {
          children.push(
            new Paragraph({
              text: '__________________________',
              alignment: align,
            })
          );
        } else {
          children.push(new Paragraph({ text: '' }));
        }

        children.push(new Paragraph({ text: name, alignment: align }));
        children.push(new Paragraph({ text: role, alignment: align }));
        children.push(new Paragraph({ text: cip, alignment: align }));

        return new TableCell({ children });
      })
    );

    const row = new TableRow({ children: cells });

    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [row],
      })
    );

    elements.push(new Paragraph({ text: '' }));
    return elements;
  }

  private async buildSignatureImageRun(
    info: Record<string, any>,
    kind: 'firma' | 'sello',
    maxWidth: number
  ): Promise<ImageRun | null> {
    const photo: PhotoItem =
      kind === 'sello'
        ? {
            url: info.selloUrl,
            base64: info.selloBase64,
            filePath: info.selloPath,
            filename: info.selloFilename || 'sello',
          }
        : {
            url: info.firmaUrl || info.signatureUrl,
            base64: info.firmaBase64 || info.signatureBase64,
            filePath: info.firmaPath || info.signaturePath,
            filename: info.firmaFilename || info.signatureFilename || 'firma',
          };
    if (!photo.url && !photo.base64 && !photo.filePath) {
      return null;
    }

    try {
      const buffer = await this.resolveImageBuffer(photo);
      if (!buffer) return null;

      const processed = await ImageCompressionService.processImage(buffer, photo.filename || 'firma');
      const { width, height } = await this.computeImageSizeWithLimits(processed, maxWidth, 70);
      return new ImageRun({
        data: processed,
        transformation: {
          width,
          height,
        },
      });
    } catch (error) {
      logger.warn('Failed to embed signature image in DOCX', { error: String(error) });
      return null;
    }
  }

  private async buildLogoImageRun(value: string): Promise<ImageRun | null> {
    try {
      const photo: PhotoItem = value.startsWith('data:')
        ? { base64: value, filename: 'logo' }
        : { url: value, filename: 'logo' };
      const buffer = await this.resolveImageBuffer(photo);
      if (!buffer) return null;

      const processed = await ImageCompressionService.processImage(buffer, 'logo');
      const { width, height } = await this.computeImageSizeWithLimits(processed, 120, 60);
      return new ImageRun({
        data: processed,
        transformation: {
          width,
          height,
        },
      });
    } catch (error) {
      logger.warn('Failed to embed logo image in DOCX', { error: String(error) });
      return null;
    }
  }

  private renderSectionTitle(title: string): Paragraph {
    return new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 120 },
    });
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
      return direct.fotos as PhotoItem[];
    }
    if (Array.isArray(direct)) {
      return direct as PhotoItem[];
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

  private async renderPhotoTable(photos: PhotoItem[], section: SectionSchema): Promise<Table> {
    const [columns] = this.parseLayout(section.layout);
    const chunkSize = columns;
    const rows: TableRow[] = [];

    for (let i = 0; i < photos.length; i += chunkSize) {
      const rowPhotos = photos.slice(i, i + chunkSize);
      const cells = await Promise.all(
        rowPhotos.map(async (photo, index) => {
          const children: Paragraph[] = [];
          const imageRun = await this.buildImageRun(photo, columns);
          if (imageRun) {
            children.push(new Paragraph({ children: [imageRun], alignment: AlignmentType.CENTER }));
          }

          const caption = this.buildPhotoCaption(photo, section, i + index + 1);
          if (caption) {
            children.push(new Paragraph({ text: caption, alignment: AlignmentType.CENTER }));
          }

          return new TableCell({
            width: { size: Math.floor(100 / columns), type: WidthType.PERCENTAGE },
            children,
          });
        })
      );

      if (cells.length < chunkSize) {
        const missing = chunkSize - cells.length;
        for (let m = 0; m < missing; m += 1) {
          cells.push(new TableCell({ children: [new Paragraph({ text: '' })] }));
        }
      }

      rows.push(new TableRow({ children: cells }));
    }

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    });
  }

  private buildPhotoCaption(photo: PhotoItem, section: SectionSchema, index: number): string {
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

    return parts.join(' | ');
  }

  private async buildImageRun(photo: PhotoItem, columns: number): Promise<ImageRun | null> {
    try {
      const buffer = await this.resolveImageBuffer(photo);
      if (!buffer) {
        return null;
      }

      const processed = await ImageCompressionService.processImage(
        buffer,
        photo.filename || photo.id || 'image'
      );

      const { width, height } = await this.computeImageSize(processed, columns);

      return new ImageRun({
        data: processed,
        transformation: {
          width,
          height,
        },
      });
    } catch (error) {
      logger.warn('Failed to embed image in DOCX', { error: String(error), photo });
      return null;
    }
  }

  private async resolveImageBuffer(photo: PhotoItem): Promise<Buffer | null> {
    if (photo.buffer) {
      return photo.buffer;
    }

    if (photo.base64) {
      const base64 = photo.base64.includes(',') ? photo.base64.split(',')[1] : photo.base64;
      return Buffer.from(base64, 'base64');
    }

    const urlCandidate =
      photo.url ||
      (photo as any).thumbnailUrl ||
      (photo as any).fileUrl ||
      (photo as any).lilaAppUrl ||
      (photo as any).metadata?.lilaAppUrl ||
      (photo as any).metadata?.fileUrl ||
      '';

    if (urlCandidate) {
      if (urlCandidate.startsWith('http')) {
        const response = await axios.get(urlCandidate, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });
        return Buffer.from(response.data);
      }

      if (urlCandidate.startsWith('/files/companies/')) {
        const relativePath = urlCandidate.replace('/files/companies/', '');
        const fullPath = this.resolveCompanyStoragePath(relativePath);
        if (fullPath && (await fs.pathExists(fullPath))) {
          return fs.readFile(fullPath);
        }
      }
    }

    const filePath = photo.filePath || photo.path;
    if (filePath) {
      if (path.isAbsolute(filePath)) {
        if (await fs.pathExists(filePath)) {
          return fs.readFile(filePath);
        }
      } else {
        const resolved = this.resolveCompanyStoragePath(filePath);
        if (resolved && (await fs.pathExists(resolved))) {
          return fs.readFile(resolved);
        }
      }
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

  private async computeImageSize(buffer: Buffer, columns: number): Promise<{ width: number; height: number }> {
    const maxWidth = this.resolveMaxWidth(columns);
    const maxHeight = this.options.imageMaxHeight || 180;

    try {
      const metadata = await sharp(buffer).metadata();
      if (metadata.width && metadata.height) {
        const ratio = metadata.width / metadata.height;
        if (ratio >= 1) {
          return { width: maxWidth, height: Math.round(maxWidth / ratio) };
        }
        return { width: Math.round(maxHeight * ratio), height: maxHeight };
      }
    } catch (error) {
      logger.warn('Failed to read image metadata for size', { error: String(error) });
    }

    return { width: maxWidth, height: maxHeight };
  }

  private async computeImageSizeWithLimits(
    buffer: Buffer,
    maxWidth: number,
    maxHeight: number
  ): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(buffer).metadata();
      if (metadata.width && metadata.height) {
        const ratio = metadata.width / metadata.height;
        if (ratio >= 1) {
          return { width: maxWidth, height: Math.round(maxWidth / ratio) };
        }
        return { width: Math.round(maxHeight * ratio), height: maxHeight };
      }
    } catch (error) {
      logger.warn('Failed to read image metadata for signature size', { error: String(error) });
    }

    return { width: maxWidth, height: maxHeight };
  }

  private resolveSignatureAlignment(align?: string): AlignmentType {
    if (align === 'left') return AlignmentType.LEFT;
    if (align === 'right') return AlignmentType.RIGHT;
    return AlignmentType.CENTER;
  }

  private resolveSignatureWidth(width?: number): number {
    const parsed = Number(width);
    if (!Number.isFinite(parsed)) return 160;
    return Math.min(260, Math.max(80, parsed));
  }

  private resolveMaxWidth(columns: number): number {
    if (columns <= 1) return 420;
    if (columns === 2) return 260;
    if (columns === 3) return 180;
    return 130;
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

  private alignFor(align?: 'left' | 'center' | 'right'): AlignmentType {
    switch (align) {
      case 'center':
        return AlignmentType.CENTER;
      case 'right':
        return AlignmentType.RIGHT;
      default:
        return AlignmentType.LEFT;
    }
  }

  private pxToTwip(px: number): number {
    return Math.round(px * 15);
  }

  private mmToTwip(mm: number): number {
    return Math.round((mm / 25.4) * 1440);
  }
}

export default DOCXGenerator;
