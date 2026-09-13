import type { VistaDelDia, UnidadDelDia } from './vista.js';
import { fechaLegible } from '../checklist/tiempo.js';

/**
 * EL RESUMEN DE DESPACHOS COMO IMAGEN. José, 13/09/2026: «el resumen de pedidos
 * me gustaría en imagen y no escrito».
 *
 * Mismo método y mismo lenguaje visual que las tarjetas de tanques y de
 * agregados del cron de Portal: SVG rasterizado con `sharp`, cabecera oscura,
 * misma paleta. Los números NO se calculan acá: llegan de la vista del día, la
 * misma fuente que arma el texto. Un mensaje y su imagen no pueden discrepar.
 */

const INK = '#17181c';
const INK_SOFT = '#6b7280';
const HEADER_BG = '#17181c';
const ROW_ALT = '#f7f8fb';
const LINE = '#e7e8ee';
const ESTADO = { despachado: '#10b981', progreso: '#f59e0b', pendiente: '#9ca3af' } as const;

const WIDTH = 1080;
const PAD = 32;
const HEADER = 96;
const ORDER_HEADER = 56;
const ROW = 44;
const FOOT = 28;

const escapeXml = (v: string): string =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const hora = (ms?: number): string =>
  ms ? new Date(ms).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

const recortar = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const filaUnidad = (u: UnidadDelDia, y: number, alterna: boolean): string => {
  const estado = u.state === 'despachado' ? (u.arrivalAt ? 'llegó' : 'en ruta') : u.state === 'progreso' ? 'cargando' : 'pendiente';
  return `
    ${alterna ? `<rect x="${PAD}" y="${y}" width="${WIDTH - PAD * 2}" height="${ROW}" fill="${ROW_ALT}" />` : ''}
    <text x="${PAD + 16}" y="${y + 28}" class="num">${u.unitNumber}</text>
    <text x="${PAD + 70}" y="${y + 28}" class="cell">${escapeXml(u.plate || 'sin placa')}</text>
    <text x="${PAD + 200}" y="${y + 28}" class="cell">${escapeXml(recortar(u.driverName || 'sin conductor', 30))}</text>
    <text x="${PAD + 560}" y="${y + 28}" class="cell" text-anchor="end">${u.quantity} m³</text>
    <text x="${PAD + 650}" y="${y + 28}" class="cell" text-anchor="middle">${hora(u.departedAt)}</text>
    <text x="${PAD + 760}" y="${y + 28}" class="cell" text-anchor="middle">${hora(u.arrivalAt)}</text>
    <circle cx="${PAD + 850}" cy="${y + 22}" r="6" fill="${ESTADO[u.state]}" />
    <text x="${PAD + 866}" y="${y + 28}" class="estado">${estado}</text>`;
};

export const svgResumenDespachos = (vista: VistaDelDia): string => {
  const alturaPedidos = vista.orders.reduce((h, o) => h + ORDER_HEADER + Math.max(o.units.length, 1) * ROW + 16, 0);
  const height = HEADER + alturaPedidos + FOOT;
  const total = vista.orders.reduce((s, o) => s + o.cantidadCubos, 0);
  const van = vista.orders.reduce((s, o) => s + o.m3Dispatched, 0);
  let y = HEADER + 12;
  const bloques: string[] = [];
  for (const o of vista.orders) {
    bloques.push(`
      <text x="${PAD}" y="${y + 24}" class="order">${escapeXml(recortar(o.cliente || o.companySlug, 40))}</text>
      <text x="${PAD}" y="${y + 44}" class="sub">${escapeXml(recortar(o.obra || 'sin obra', 60))} · ${o.m3Dispatched} de ${o.cantidadCubos} m³ · ${o.units.length} unidad(es)</text>
      <line x1="${PAD}" y1="${y + ORDER_HEADER - 4}" x2="${WIDTH - PAD}" y2="${y + ORDER_HEADER - 4}" stroke="${LINE}" />
      <text x="${PAD + 16}" y="${y + ORDER_HEADER + 14}" class="lbl">#</text>
      <text x="${PAD + 70}" y="${y + ORDER_HEADER + 14}" class="lbl">PLACA</text>
      <text x="${PAD + 200}" y="${y + ORDER_HEADER + 14}" class="lbl">CONDUCTOR</text>
      <text x="${PAD + 560}" y="${y + ORDER_HEADER + 14}" class="lbl" text-anchor="end">M³</text>
      <text x="${PAD + 650}" y="${y + ORDER_HEADER + 14}" class="lbl" text-anchor="middle">SALIDA</text>
      <text x="${PAD + 760}" y="${y + ORDER_HEADER + 14}" class="lbl" text-anchor="middle">LLEGADA</text>
      <text x="${PAD + 850}" y="${y + ORDER_HEADER + 14}" class="lbl">ESTADO</text>`);
    let yFila = y + ORDER_HEADER + 22;
    o.units.forEach((u, i) => {
      bloques.push(filaUnidad(u, yFila, i % 2 === 1));
      yFila += ROW;
    });
    if (o.units.length === 0) bloques.push(`<text x="${PAD + 16}" y="${yFila + 28}" class="cell">Sin unidades registradas</text>`);
    y = yFila + 16;
  }
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
      <style>
        text { font-family: Arial, Helvetica, sans-serif; }
        .title { font-size: 28px; font-weight: 800; fill: #ffffff; }
        .subtitle { font-size: 15px; font-weight: 500; fill: #b9bdc7; }
        .order { font-size: 19px; font-weight: 800; fill: ${INK}; }
        .sub { font-size: 14px; font-weight: 500; fill: ${INK_SOFT}; }
        .lbl { font-size: 11px; font-weight: 800; letter-spacing: 0.6px; fill: ${INK_SOFT}; }
        .num { font-size: 16px; font-weight: 800; fill: ${INK}; }
        .cell { font-size: 16px; font-weight: 600; fill: ${INK}; }
        .estado { font-size: 13px; font-weight: 700; fill: ${INK_SOFT}; }
      </style>
      <rect width="${WIDTH}" height="${height}" fill="#ffffff" />
      <rect width="${WIDTH}" height="${HEADER}" fill="${HEADER_BG}" />
      <text x="${PAD}" y="42" class="title">Despachos — ${escapeXml(fechaLegible(vista.fecha))}</text>
      <text x="${PAD}" y="68" class="subtitle">${van} de ${total} m³ despachados · ${vista.orders.length} pedido(s)</text>
      ${bloques.join('\n')}
    </svg>`;
};

/** Rasteriza a PNG. `sharp` es nativo y se carga solo cuando hace falta. */
export const pngResumenDespachos = async (vista: VistaDelDia): Promise<Buffer> => {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(svgResumenDespachos(vista))).png().toBuffer();
};
