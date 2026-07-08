/**
 * Genera los HTML de REFERENCIA del diseño legacy de cotizaciones (Handlebars
 * de `quote-documents.controller`) con las fixtures compartidas de Portal.
 * Son el criterio visual que el canvas debe emular antes de evolucionar el
 * diseño ("canvas = única fuente de diseño").
 *
 * Uso: npx esbuild scripts/design-refs/render-legacy-quotes.ts --bundle \
 *        --platform=node --format=esm --packages=external \
 *        --outfile=scripts/design-refs/.out/render-legacy-quotes.mjs \
 *      && node scripts/design-refs/.out/render-legacy-quotes.mjs
 * (o `node scripts/design-refs/run.mjs legacy`)
 */
import fs from 'fs-extra';
import path from 'path';
import {
  renderAsphaltQuoteHtml,
  renderServiceQuoteHtml,
} from '../../src/api/controllers/quote-documents.controller.js';
import { ReportHtmlRenderer } from '../../src/services/report-html-renderer.service.js';
import { getSchemaByCode } from '../../src/schemas/documents/registry.js';

const PORTAL_REFS_DIR = path.resolve(process.cwd(), '../Portal/specs/design-references');
const FIXTURES_DIR = path.join(PORTAL_REFS_DIR, 'fixtures');
const QUOTES_OUT_DIR = path.join(PORTAL_REFS_DIR, 'quotes');
const REPORTS_OUT_DIR = path.join(PORTAL_REFS_DIR, 'reports');
const BASE_URL = 'http://localhost:4000';

/** Renderer genérico de informes (no cotización): el mismo Handlebars por sección
 * que usa la generación de PDF (`documents.controller`), que el canvas debe emular. */
const renderReportHtml = (data: Record<string, any>, baseUrl: string, schema: any): Promise<string> =>
  new ReportHtmlRenderer(schema, data, { companyId: 'design-refs', baseUrl }).render();

function mergeDeepPlain(base: Record<string, any>, extra: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof merged[key] === 'object') {
      merged[key] = mergeDeepPlain(merged[key] || {}, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

type RenderFn = (
  data: Record<string, any>,
  baseUrl: string,
  schema: any
) => string | Promise<string>;

async function main() {
  const targets: Array<{ code: string; fixture: string; render: RenderFn; outDir: string }> = [
    { code: 'COT-ASF', fixture: 'cot-asf.sample.json', render: (d, b) => renderAsphaltQuoteHtml(d, b), outDir: QUOTES_OUT_DIR },
    { code: 'COT-SER', fixture: 'cot-ser.sample.json', render: (d, b) => renderServiceQuoteHtml(d, b), outDir: QUOTES_OUT_DIR },
    { code: 'INF-ACT', fixture: 'inf-act.sample.json', render: renderReportHtml, outDir: REPORTS_OUT_DIR },
  ];

  for (const target of targets) {
    const schema = getSchemaByCode(target.code);
    if (!schema) throw new Error(`Schema ${target.code} no encontrado en el registry`);
    await fs.ensureDir(target.outDir);

    const fixture = await fs.readJson(path.join(FIXTURES_DIR, target.fixture));
    const data = mergeDeepPlain(schema.defaultData || {}, fixture);
    const html = await target.render(data, BASE_URL, schema);

    const slug = target.code.toLowerCase();
    await fs.writeFile(path.join(target.outDir, `${slug}.legacy.html`), html, 'utf8');
    // El schema vigente viaja junto a la referencia: el exportador del canvas
    // (Portal, jest) lo consume sin poder importar TS de lila.
    await fs.writeJson(path.join(target.outDir, `${slug}.schema.json`), schema, { spaces: 2 });
    console.log(`✔ ${target.code} → ${slug}.legacy.html + ${slug}.schema.json`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
