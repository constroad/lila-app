import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { PDFMergerService } from './pdf-merger.service.js';

const tmpDir = path.join(os.tmpdir(), 'lila-merger-test');

const makeMainPdf = async (file: string): Promise<void> => {
  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  doc.addPage([595.28, 841.89]);
  await fs.writeFile(file, await doc.save());
};

const makeImageDataUrl = async (): Promise<string> => {
  const png = await sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 20, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
};

const makePdfDataUrl = async (): Promise<string> => {
  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  const bytes = await doc.save();
  return `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`;
};

describe('PDFMergerService.mergePDFWithAnnexes', () => {
  beforeEach(() => fs.ensureDir(tmpDir));
  afterEach(() => fs.remove(tmpDir));

  it('anexo IMAGEN (PNG) se envuelve en una página A4', async () => {
    const main = path.join(tmpDir, 'main.pdf');
    const out = path.join(tmpDir, 'out.pdf');
    await makeMainPdf(main);
    const result = await PDFMergerService.mergePDFWithAnnexes(
      main,
      [{ id: 'a1', pdfUrl: await makeImageDataUrl(), order: 0 }],
      out
    );
    expect(result.mainPages).toBe(2);
    expect(result.annexPages).toBe(1);
    expect(result.totalPages).toBe(3);
    const merged = await PDFDocument.load(await fs.readFile(out));
    expect(merged.getPageCount()).toBe(3);
  });

  it('anexo PDF copia todas sus páginas', async () => {
    const main = path.join(tmpDir, 'main.pdf');
    const out = path.join(tmpDir, 'out.pdf');
    await makeMainPdf(main);
    const result = await PDFMergerService.mergePDFWithAnnexes(
      main,
      [{ id: 'a1', pdfUrl: await makePdfDataUrl(), order: 0 }],
      out
    );
    expect(result.annexPages).toBe(1);
    expect(result.totalPages).toBe(3);
  });

  it('anexo no resoluble se salta sin romper', async () => {
    const main = path.join(tmpDir, 'main.pdf');
    const out = path.join(tmpDir, 'out.pdf');
    await makeMainPdf(main);
    const result = await PDFMergerService.mergePDFWithAnnexes(
      main,
      [{ id: 'a1', pdfUrl: '/files/companies/x/no-existe.pdf', order: 0 }],
      out
    );
    expect(result.annexPages).toBe(0);
    expect(result.totalPages).toBe(2);
  });
});
