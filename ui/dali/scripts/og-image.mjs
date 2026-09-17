// La imagen de la tarjeta al compartir (Open Graph, 1200×630) y los iconos PNG de
// Dali, renderizados con Chrome y las MISMAS fuentes de la app (fontsource):
//   node scripts/og-image.mjs   → public/og.png, public/apple-touch-icon.png, public/favicon-32.png
// Se corre a mano cuando cambie la marca o el texto; los PNG van commiteados.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fuente = (paquete, archivo) => `file://${path.join(raiz, 'node_modules', '@fontsource-variable', paquete, 'files', archivo)}`;

/** El mismo trazo que `src/components/BrandMark.tsx` (hoja de marca de Stitch, arco al ras de la columna). */
const marca = (px, color) =>
  `<svg viewBox="0 0 64 64" width="${px}" height="${px}" fill="${color}" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="7" height="44" rx="2"/><path d="M17 10H34C46.15 10 56 19.85 56 32C56 44.15 46.15 54 34 54H17V47H34C42.28 47 49 40.28 49 32C49 23.72 42.28 17 34 17H17V10Z"/><circle cx="32" cy="32" r="4.5"/></svg>`;

const estilos = `
  @font-face { font-family: 'Public Sans'; font-weight: 100 900; src: url('${fuente('public-sans', 'public-sans-latin-wght-normal.woff2')}') format('woff2'); }
  @font-face { font-family: 'DM Sans'; font-weight: 100 900; src: url('${fuente('dm-sans', 'dm-sans-latin-standard-normal.woff2')}') format('woff2'); }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #fafaf9; font-family: 'DM Sans', system-ui, sans-serif; color: #1c1917; }
  .fondo { position: absolute; inset: 0; background: linear-gradient(135deg, #f0fdfa 0%, #fafaf9 55%, #fafaf9 100%); }
  .banda { position: absolute; right: -140px; top: -140px; width: 520px; height: 520px; border-radius: 50%; background: radial-gradient(circle at 40% 40%, #ccfbf1 0%, rgba(204,251,241,0) 70%); }
  .marco { position: relative; padding: 72px 88px; height: 100%; display: flex; flex-direction: column; justify-content: space-between; }
  .marca { display: flex; align-items: center; gap: 22px; }
  .d { width: 96px; height: 96px; display: grid; place-items: center; }
  .nombre { font-family: 'Public Sans', sans-serif; font-weight: 800; font-size: 54px; letter-spacing: -0.03em; }
  .nombre span { color: #0f766e; }
  .pe { margin-left: 16px; padding: 6px 14px; border: 2px solid #99f6e4; border-radius: 10px; background: #f0fdfa; color: #115e59; font-family: 'DM Sans', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: 0.12em; vertical-align: middle; }
  h1 { font-family: 'Public Sans', sans-serif; font-weight: 800; font-size: 78px; line-height: 1.02; letter-spacing: -0.035em; max-width: 1000px; }
  h1 em { font-style: normal; color: #115e59; text-decoration: underline; text-decoration-color: #5eead4; text-decoration-thickness: 6px; text-underline-offset: 12px; }
  .pie { display: flex; align-items: center; gap: 22px; font-size: 24px; color: #57534e; font-weight: 500; white-space: nowrap; }
  .pie b { color: #115e59; font-weight: 700; }
  .punto { width: 8px; height: 8px; border-radius: 50%; background: #a8a29e; }
`;

const pagina = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${estilos}</style></head><body>
  <div class="fondo"></div><div class="banda"></div>
  <div class="marco">
    <div class="marca"><div class="d">${marca(96, '#115e59')}</div><div class="nombre">dali<span>.pe</span><span class="pe">PERÚ</span></div></div>
    <h1>Tu negocio responde por WhatsApp <em>aunque tú estés en obra</em></h1>
    <div class="pie"><b>Asistente con IA para WhatsApp</b><span class="punto"></span><span>Junta los datos de cada pedido y te avisa</span><span class="punto"></span><span>Sin tarjeta</span></div>
  </div>
</body></html>`;

/**
 * El icono de app es EL MISMO isotipo que el header, en teal, sin cuadro (igual que
 * public/favicon.svg): un solo logo en todos lados. El apple-touch-icon lleva el
 * papel de fondo porque iOS no admite transparencia; el favicon PNG, ninguno.
 */
const icono = (px, fondo) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; } body { width: ${px}px; height: ${px}px; background: ${fondo}; display: grid; place-items: center; }
</style></head><body>${marca(px, '#115e59')}</body></html>`;

// El Chromium que trae puppeteer no arranca en esta Mac (crash al lanzar); el Chrome del sistema sí, y es el mismo que usa lila para los PDF.
const browser = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox'] });
const capturar = async (html, ancho, alto, salida, omitBackground = false) => {
  const page = await browser.newPage();
  await page.setViewport({ width: ancho, height: alto, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(raiz, 'public', salida), clip: { x: 0, y: 0, width: ancho, height: alto }, omitBackground });
  await page.close();
  console.log('public/' + salida, `${ancho}x${alto}`);
};
await capturar(pagina, 1200, 630, 'og.png');
await capturar(icono(180, '#fafaf9'), 180, 180, 'apple-touch-icon.png');
await capturar(icono(32, 'transparent'), 32, 32, 'favicon-32.png', true);
await browser.close();
