/**
 * Screenshotea los HTML de referencia de diseño (legacy y canvas) a PNG con el
 * Puppeteer de lila, a ancho A4 (794px). No requiere intranet ni auth: los HTML
 * son autocontenidos. También emite el PDF real (media print) de cada uno.
 *
 * Uso: node scripts/design-refs/screenshot-refs.mjs [carpeta]
 *      (default: ../Portal/specs/design-references/quotes)
 */
import fs from 'fs-extra';
import path from 'path';
import puppeteer from 'puppeteer';

const REFS_DIR = path.resolve(
  process.cwd(),
  process.argv[2] || '../Portal/specs/design-references/quotes'
);
const A4_WIDTH_PX = 794;

async function main() {
  const entries = (await fs.readdir(REFS_DIR)).filter((name) => name.endsWith('.html'));
  if (entries.length === 0) {
    console.log(`Sin HTML en ${REFS_DIR}`);
    return;
  }

  // Chrome del sistema (mismo criterio que `resolveChromeExecutable` de lila):
  // el Chromium bundled de puppeteer 21 falla en esta Mac (ECONNRESET al lanzar).
  const browser = await puppeteer.launch({ headless: 'new', channel: 'chrome' });
  try {
    for (const entry of entries) {
      const htmlPath = path.join(REFS_DIR, entry);
      const baseName = entry.replace(/\.html$/, '');
      const page = await browser.newPage();
      await page.setViewport({ width: A4_WIDTH_PX, height: 1123, deviceScaleFactor: 2 });
      await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

      await page.screenshot({
        path: path.join(REFS_DIR, `${baseName}.png`),
        fullPage: true,
      });
      await page.pdf({
        path: path.join(REFS_DIR, `${baseName}.pdf`),
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });
      await page.close();
      console.log(`✔ ${baseName}.png + ${baseName}.pdf`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
