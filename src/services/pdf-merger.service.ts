import fs from 'fs-extra';
import { PDFDocument } from 'pdf-lib';
import { storagePathService } from './storage-path.service.js';
import logger from '../utils/logger.js';

export interface AnnexEntry {
  id: string;
  pdfUrl: string;
  order?: number;
}

export interface MergeResult {
  totalPages: number;
  mainPages: number;
  annexPages: number;
}

function resolveStoragePathFromUrl(url: string, companyId?: string): string | null {
  if (!url) return null;
  if (url.startsWith('http')) {
    return null;
  }

  if (url.startsWith('/files/companies/')) {
    const relative = url.replace('/files/companies/', '');
    const [companyFromUrl, ...rest] = relative.split('/');
    const resolvedCompany = companyId || companyFromUrl;
    if (!resolvedCompany) return null;
    return storagePathService.resolvePath(resolvedCompany, rest.join('/'));
  }

  return null;
}

export class PDFMergerService {
  static async getPageCount(pdfPath: string): Promise<number> {
    const bytes = await fs.readFile(pdfPath);
    const pdf = await PDFDocument.load(bytes);
    return pdf.getPageCount();
  }

  static async mergePDFWithAnnexes(
    mainPdfPath: string,
    annexes: AnnexEntry[],
    outputPath: string,
    companyId?: string
  ): Promise<MergeResult> {
    const mainPdfBytes = await fs.readFile(mainPdfPath);
    const mergedPdf = await PDFDocument.load(mainPdfBytes);
    const mainPageCount = mergedPdf.getPageCount();

    let totalAnnexPages = 0;
    const sorted = [ ...annexes ].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const annex of sorted) {
      const annexPath = resolveStoragePathFromUrl(annex.pdfUrl, companyId);
      if (!annexPath || !(await fs.pathExists(annexPath))) {
        logger.warn('Annex PDF not found, skipping', { annexId: annex.id, pdfUrl: annex.pdfUrl });
        continue;
      }

      const annexPdfBytes = await fs.readFile(annexPath);
      const annexPdf = await PDFDocument.load(annexPdfBytes);
      const copiedPages = await mergedPdf.copyPages(annexPdf, annexPdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      totalAnnexPages += annexPdf.getPageCount();
    }

    const mergedPdfBytes = await mergedPdf.save();
    await fs.writeFile(outputPath, mergedPdfBytes);

    return {
      totalPages: mergedPdf.getPageCount(),
      mainPages: mainPageCount,
      annexPages: totalAnnexPages,
    };
  }
}
