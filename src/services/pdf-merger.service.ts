import fs from 'fs-extra';
import axios from 'axios';
import { PDFDocument } from 'pdf-lib';
import { storagePathService } from './storage-path.service.js';
import logger from '../utils/logger.js';
import type { DocumentLetterheadSnapshot } from './document-letterhead.service.js';

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
    try {
      const parsedUrl = new URL(url);
      return resolveStoragePathFromUrl(parsedUrl.pathname, companyId);
    } catch {
      return null;
    }
  }

  if (url.startsWith('data:')) {
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

async function resolveLetterheadBytes(
  letterhead: DocumentLetterheadSnapshot,
  companyId?: string
): Promise<Buffer | null> {
  const url = String(letterhead.url || '').trim();
  if (!url) return null;

  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1];
    return base64 ? Buffer.from(base64, 'base64') : null;
  }

  const storagePath = resolveStoragePathFromUrl(url, companyId);
  if (storagePath && (await fs.pathExists(storagePath))) {
    return fs.readFile(storagePath);
  }

  if (url.startsWith('http')) {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });
    return Buffer.from(response.data);
  }

  return null;
}

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString('utf8') === '%PDF';
}

function isPngBuffer(buffer: Buffer): boolean {
  return buffer.subarray(1, 4).toString('utf8') === 'PNG';
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

  static async applyLetterheadBackground(
    pdfPath: string,
    letterhead: DocumentLetterheadSnapshot | null,
    outputPath: string,
    companyId?: string
  ): Promise<void> {
    if (!letterhead) {
      if (pdfPath !== outputPath) await fs.copyFile(pdfPath, outputPath);
      return;
    }

    try {
      const letterheadBytes = await resolveLetterheadBytes(letterhead, companyId);
      if (!letterheadBytes) {
        if (pdfPath !== outputPath) await fs.copyFile(pdfPath, outputPath);
        return;
      }

      const sourcePdf = await PDFDocument.load(await fs.readFile(pdfPath));
      const outputPdf = await PDFDocument.create();
      const embeddedBackground = await this.embedBackground(outputPdf, letterheadBytes);

      for (const sourcePage of sourcePdf.getPages()) {
        const { width, height } = sourcePage.getSize();
        const [embeddedPage] = await outputPdf.embedPages([sourcePage]);
        const outputPage = outputPdf.addPage([width, height]);
        this.drawBackground(outputPage, embeddedBackground, width, height);
        outputPage.drawPage(embeddedPage, { x: 0, y: 0, width, height });
      }

      await fs.writeFile(outputPath, await outputPdf.save());
    } catch (error) {
      logger.warn('Letterhead background failed, copying original PDF', {
        error: String(error),
        letterheadId: letterhead.id,
      });
      if (pdfPath !== outputPath) await fs.copyFile(pdfPath, outputPath);
    }
  }

  private static async embedBackground(outputPdf: PDFDocument, bytes: Buffer) {
    if (isPdfBuffer(bytes)) {
      const backgroundPdf = await PDFDocument.load(bytes);
      const [backgroundPage] = await outputPdf.embedPdf(backgroundPdf, [0]);
      return { type: 'pdf' as const, value: backgroundPage };
    }

    const image = isPngBuffer(bytes)
      ? await outputPdf.embedPng(bytes)
      : await outputPdf.embedJpg(bytes);
    return { type: 'image' as const, value: image };
  }

  private static drawBackground(
    page: ReturnType<PDFDocument['addPage']>,
    background: Awaited<ReturnType<typeof PDFMergerService.embedBackground>>,
    width: number,
    height: number
  ): void {
    if (background.type === 'pdf') {
      page.drawPage(background.value, { x: 0, y: 0, width, height });
      return;
    }
    page.drawImage(background.value, { x: 0, y: 0, width, height });
  }
}
