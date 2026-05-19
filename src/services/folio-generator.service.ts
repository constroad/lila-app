import fs from 'fs-extra';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface FolioConfig {
  enabled: boolean;
  format: string;
  position: 'footer-right' | 'footer-center' | 'header-right' | 'header-center';
  startNumber: number;
  fontSize?: number;
  includeAnnexes: boolean;
}

interface FolioOptions {
  limitPages?: number;
  marginsMm?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export class FolioGeneratorService {
  static async addFolios(
    pdfPath: string,
    config: FolioConfig,
    outputPath: string,
    options: FolioOptions = {}
  ): Promise<void> {
    if (!config.enabled) {
      if (pdfPath !== outputPath) {
        await fs.copyFile(pdfPath, outputPath);
      }
      return;
    }

    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = config.fontSize || 10;

    const pages = pdfDoc.getPages();
    const totalPages = pdfDoc.getPageCount();
    const limit = options.limitPages ?? totalPages;

    for (let i = 0; i < pages.length; i += 1) {
      if (i >= limit) break;
      const page = pages[i];
      const { width, height } = page.getSize();

      const current = config.startNumber + i;
      const totalForText = config.includeAnnexes ? totalPages : limit;
      const folioText = this.formatFolio(config.format, current, totalForText);

      const { x, y } = this.calculatePosition(
        config.position,
        width,
        height,
        folioText,
        font,
        fontSize,
        options.marginsMm
      );

      page.drawText(folioText, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    }

    const modifiedPdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, modifiedPdfBytes);
  }

  private static formatFolio(template: string, current: number, total: number): string {
    return template
      .replace('{current}', String(current))
      .replace('{total}', String(total));
  }

  private static calculatePosition(
    position: FolioConfig['position'],
    pageWidth: number,
    pageHeight: number,
    text: string,
    font: any,
    fontSize: number,
    marginsMm?: FolioOptions['marginsMm']
  ): { x: number; y: number } {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const fallbackMargin = 20;
    const pointPerMm = 72 / 25.4;
    const margins = marginsMm
      ? {
          top: marginsMm.top * pointPerMm,
          right: marginsMm.right * pointPerMm,
          bottom: marginsMm.bottom * pointPerMm,
          left: marginsMm.left * pointPerMm,
        }
      : {
          top: fallbackMargin,
          right: fallbackMargin,
          bottom: fallbackMargin,
          left: fallbackMargin,
        };

    let y: number;
    if (position.startsWith('header')) {
      y = pageHeight - margins.top - fontSize;
    } else {
      y = margins.bottom;
    }

    let x: number;
    if (position.endsWith('left')) {
      x = margins.left;
    } else if (position.endsWith('center')) {
      x = (pageWidth - textWidth) / 2;
    } else {
      x = pageWidth - textWidth - margins.right;
    }

    return { x, y };
  }
}
