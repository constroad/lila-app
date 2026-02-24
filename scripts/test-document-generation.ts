import fs from 'fs-extra';
import { getSchemaByCode } from '../src/schemas/documents/registry.js';
import { generateRandomDataForSchema } from '../src/services/random-data-generator.service.js';
import { DOCXGenerator } from '../src/services/docx-generator.service.js';
import { ReportHtmlRenderer } from '../src/services/report-html-renderer.service.js';
import pdfGenerator from '../src/pdf/generator.service.js';

async function main() {
  const schema = getSchemaByCode('PNL-FOT');
  if (!schema) {
    throw new Error('Schema PNL-FOT not found');
  }

  const data = generateRandomDataForSchema(schema);

  const docx = new DOCXGenerator(schema, data);
  const buffer = await docx.generate();
  const docxPath = '/tmp/test-pnl-fot.docx';
  await fs.writeFile(docxPath, buffer);
  console.log(`✅ DOCX generado: ${docxPath}`);

  if (process.argv.includes('--pdf')) {
    await pdfGenerator.initialize();
    const htmlRenderer = new ReportHtmlRenderer(schema, data);
    const html = await htmlRenderer.render();
    const pdfPath = '/tmp/test-pnl-fot.pdf';
    await pdfGenerator.generateFromHtml(html, { outputPath: pdfPath, format: schema.pageSize || 'A4' });
    await pdfGenerator.shutdown();
    console.log(`✅ PDF generado: ${pdfPath}`);
  }
}

main().catch((error) => {
  console.error('❌ Error en test-document-generation:', error);
  process.exit(1);
});
