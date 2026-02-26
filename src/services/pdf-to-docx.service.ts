import fs from 'fs-extra';
import { Document, ImageRun, Packer, Paragraph, PageBreak } from 'docx';
import { createRequire } from 'module';
// pdfjs-dist legacy build does not ship typed ESM entrypoints.
type PdfJsModule = typeof import('pdfjs-dist');
import { createCanvas } from '@napi-rs/canvas';

type PdfToDocxOptions = {
  scale?: number;
};

export async function convertPdfToDocx(
  pdfPath: string,
  outputPath: string,
  options: PdfToDocxOptions = {}
): Promise<void> {
  const scale = options.scale ?? 1.8;
  const pdfBuffer = await fs.readFile(pdfPath);
  const pdfData = Buffer.isBuffer(pdfBuffer)
    ? new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength)
    : new Uint8Array(pdfBuffer);
  const require = createRequire(import.meta.url);
  const candidates = [
    'pdfjs-dist/legacy/build/pdf.mjs',
    'pdfjs-dist/legacy/build/pdf.js',
    'pdfjs-dist/build/pdf.mjs',
    'pdfjs-dist/build/pdf.js',
  ];
  let pdfjsLib: any = null;
  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(candidate);
      pdfjsLib = await import(resolved);
      break;
    } catch {
      // try next
    }
  }
  if (!pdfjsLib) {
    throw new Error('pdfjs-dist no disponible. Verifica la instalación de pdfjs-dist.');
  }
  const getDocument = (pdfjsLib as any).getDocument || (pdfjsLib as any).default?.getDocument;
  if (!getDocument) {
    throw new Error('pdfjs-dist no expone getDocument.');
  }
  const loadingTask = getDocument({ data: pdfData, disableWorker: true });
  const pdf = await loadingTask.promise;

  const children: Paragraph[] = [];
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx as any, viewport }).promise;
    const imageBuffer = canvas.toBuffer('image/png');

    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: imageBuffer,
            transformation: {
              width: Math.round(viewport.width),
              height: Math.round(viewport.height),
            },
          }),
        ],
        spacing: { after: 0 },
      })
    );

    if (pageIndex < pdf.numPages) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const docxBuffer = await Packer.toBuffer(doc);
  await fs.writeFile(outputPath, docxBuffer);
}
