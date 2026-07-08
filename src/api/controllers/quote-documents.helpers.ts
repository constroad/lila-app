/**
 * Helpers puros del passthrough "canvas = PDF" para cotizaciones.
 * Si Portal manda el HTML serializado del canvas, el PDF se rinde desde ese
 * HTML (imágenes resueltas server-side) y se salta el renderer Handlebars.
 */

/** Margen Puppeteer cuando la fuente es el canvas (su serializer usa `@page margin:0`). */
export const CANVAS_QUOTE_PDF_MARGIN = {
  top: '14mm',
  right: '14mm',
  bottom: '14mm',
  left: '14mm',
};

/** F5 · membrete: fondo a sangre completa; los márgenes los pone el HTML del canvas. */
export const CANVAS_QUOTE_LETTERHEAD_PDF_MARGIN = {
  top: '0',
  right: '0',
  bottom: '0',
  left: '0',
};

/** Extrae el HTML del canvas del body; '' cuando no viene (path Handlebars intacto). */
export function getCanvasQuoteHtml(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const html = (body as { html?: unknown }).html;
  return typeof html === 'string' ? html.trim() : '';
}
