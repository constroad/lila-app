import type { VistaDelDia, UnidadDelDia } from './vista.js';
import { fechaLegible } from '../checklist/tiempo.js';
import type { Tanque, Material } from './planta.js';

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

/*
 * TANQUES Y AGREGADOS EN IMAGEN. José, 14/09/2026: «¿no sería mejor imagen en
 * lugar de texto?». Son las MISMAS tarjetas que manda el cron de Portal
 * (`fluidsReportImage.ts`, `materialsStockImage.ts`): silueta de tanque con su
 * llenado, acopio de material con su nivel, grilla de 3, cabecera oscura, punto
 * de estado. Mismas fórmulas para el % y el semáforo: llenado = stock/capacidad;
 * estado por el punto de reposición (bajo = en o por debajo, medio = hasta 1,5×).
 * Un agregado se referencia al doble de su mínimo, así el mínimo cae al 50 %.
 */


const CARD_W = 280;
const CARD_GAP = 20;
const POR_FILA = 3;
const CARD_PAD = 24;
const CARD_IMG_W = CARD_PAD * 2 + CARD_W * POR_FILA + CARD_GAP * (POR_FILA - 1);
const CARD_HEADER = 88;
const CARD_BG = '#f7f8fb';
const TRACK_BG = '#e7e8ee';
const GROUND = '#d8dae2';
const PUNTO = { healthy: '#10b981', medium: '#f59e0b', low: '#ef4444', unknown: '#9ca3af' } as const;
const ETIQUETA_ESTADO = { healthy: 'Saludable', medium: 'Stock medio', low: 'Reponer', unknown: 'Sin umbral' } as const;
type Estado = keyof typeof PUNTO;

const FACTOR_MEDIO = 1.5;
const clamp = (v: number): number => Math.max(0, Math.min(100, v));

export const estadoPorReorden = (stock: number, reorden: number): Estado => {
  if (!(reorden > 0)) return 'unknown';
  if (stock <= reorden) return 'low';
  if (stock <= reorden * FACTOR_MEDIO) return 'medium';
  return 'healthy';
};

const fmt0 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

const estilosTarjetas = `
  <style>
    text { font-family: Arial, Helvetica, sans-serif; }
    .title { font-size: 24px; font-weight: 800; fill: #ffffff; }
    .subtitle { font-size: 14px; font-weight: 500; fill: #b9bdc7; }
    .name { font-size: 16px; font-weight: 800; fill: ${INK}; }
    .pct { font-size: 15px; font-weight: 900; fill: #ffffff; paint-order: stroke; stroke: rgba(0,0,0,0.4); stroke-width: 3px; }
    .lbl { font-size: 11px; font-weight: 800; letter-spacing: 0.5px; fill: ${INK_SOFT}; }
    .val { font-size: 17px; font-weight: 800; fill: ${INK}; }
    .status { font-size: 12.5px; font-weight: 700; fill: ${INK_SOFT}; }
  </style>`;

const grilla = (titulo: string, subtitulo: string, altoTarjeta: number, tarjetas: Array<(x: number, y: number, i: number) => string>): string => {
  const filas = Math.max(1, Math.ceil(tarjetas.length / POR_FILA));
  const height = CARD_HEADER + filas * altoTarjeta + (filas - 1) * CARD_GAP + 28;
  const cuerpo = tarjetas
    .map((t, i) => t(CARD_PAD + (i % POR_FILA) * (CARD_W + CARD_GAP), CARD_HEADER + Math.floor(i / POR_FILA) * (altoTarjeta + CARD_GAP), i))
    .join('');
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_IMG_W}" height="${height}" viewBox="0 0 ${CARD_IMG_W} ${height}">
      ${estilosTarjetas}
      <rect width="${CARD_IMG_W}" height="${height}" fill="#ffffff" />
      <rect width="${CARD_IMG_W}" height="${CARD_HEADER}" fill="${HEADER_BG}" />
      <text x="${CARD_PAD}" y="36" class="title">${escapeXml(titulo)}</text>
      <text x="${CARD_PAD}" y="58" class="subtitle">${escapeXml(subtitulo)}</text>
      ${cuerpo}
    </svg>`;
};

// ---- Tanques ----

const TANK_CARD_H = 300;
const TANK_BAR_H = 168;
const TANK_BAR_W = 74;
/** Color del líquido, como en Portal: el configurado o uno por contenido. */
const COLOR_CONTENIDO: Record<Tanque['contenido'], string> = { pen: '#1f2937', gasohol: '#16a34a', petroleo: '#e24b4a', otro: '#2563eb' };

const tarjetaTanque = (t: Tanque) => (x: number, y: number): string => {
  const llenado = clamp(t.capacidad > 0 ? (Math.max(t.stock, 0) * 100) / t.capacidad : 0);
  const estado = estadoPorReorden(Math.max(t.stock, 0), t.reorden);
  const barX = x + 24;
  const barY = y + 60;
  const altoLleno = (TANK_BAR_H * llenado) / 100;
  const infoX = barX + TANK_BAR_W + 20;
  const disponible = t.contenido === 'pen' || t.contenido === 'gasohol' ? `${t.m3Producibles.toFixed(0)} m³ prod.` : `${fmt0.format(t.galones)} gl`;
  return `
    <g>
      <rect x="${x}" y="${y}" width="${CARD_W}" height="${TANK_CARD_H}" rx="18" fill="${CARD_BG}" />
      <text x="${x + 22}" y="${y + 34}" class="name">${escapeXml(recortar(t.nombre, 22))}</text>
      <rect x="${barX}" y="${barY}" width="${TANK_BAR_W}" height="${TANK_BAR_H}" rx="14" fill="${TRACK_BG}" />
      ${altoLleno > 0 ? `<rect x="${barX}" y="${barY + TANK_BAR_H - altoLleno}" width="${TANK_BAR_W}" height="${altoLleno}" rx="14" fill="${escapeXml(t.color || COLOR_CONTENIDO[t.contenido])}" />` : ''}
      <rect x="${barX}" y="${barY}" width="${TANK_BAR_W}" height="${TANK_BAR_H}" rx="14" fill="none" stroke="#ffffff" stroke-width="2" />
      <text x="${barX + TANK_BAR_W / 2}" y="${barY + TANK_BAR_H / 2 + 6}" class="pct" text-anchor="middle">${Math.round(llenado)}%</text>
      <text x="${infoX}" y="${barY + 30}" class="lbl">NIVEL</text>
      <text x="${infoX}" y="${barY + 54}" class="val">${t.nivelCm} cm</text>
      <text x="${infoX}" y="${barY + 92}" class="lbl">DISPONIBLE</text>
      <text x="${infoX}" y="${barY + 116}" class="val">${escapeXml(disponible)}</text>
      <circle cx="${x + 22}" cy="${y + TANK_CARD_H - 26}" r="5" fill="${PUNTO[estado]}" />
      <text x="${x + 34}" y="${y + TANK_CARD_H - 21}" class="status">${ETIQUETA_ESTADO[estado]}</text>
    </g>`;
};

export const svgTanques = (lista: Tanque[], subtitulo: string): string =>
  grilla('Control de tanques', subtitulo, TANK_CARD_H, lista.map((t) => tarjetaTanque(t)));

export const pngTanques = async (lista: Tanque[], subtitulo: string): Promise<Buffer> => {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(svgTanques(lista, subtitulo))).png().toBuffer();
};

// ---- Agregados ----

const PILE_CARD_H = 216;
/** Acopio ancho y bajo (el material reposa cerca de 35°), con cresta redondeada. */
const PILA = { w: 126, h: 68, crestaIni: 0.34, crestaFin: 0.66 } as const;
/** El mínimo cae al 50 % de la pila: la referencia es el doble del mínimo. */
const FACTOR_REFERENCIA = 2;

const siluetaPila = (x: number, baseY: number): string => {
  const top = baseY - PILA.h;
  const izq = x + PILA.w * PILA.crestaIni;
  const der = x + PILA.w * PILA.crestaFin;
  const centro = x + PILA.w / 2;
  return `M ${x} ${baseY} L ${izq} ${top + 6} Q ${(izq + centro) / 2} ${top} ${centro} ${top} Q ${(centro + der) / 2} ${top} ${der} ${top + 6} L ${x + PILA.w} ${baseY} Z`;
};

const tarjetaMaterial = (m: Material) => (x: number, y: number, i: number): string => {
  const px = x + 16;
  const baseY = y + 146;
  const llenado = m.reorden > 0 ? clamp(Math.round((m.cantidad / (m.reorden * FACTOR_REFERENCIA)) * 100)) : null;
  const estado = estadoPorReorden(m.cantidad, m.reorden);
  const altoLleno = (PILA.h * (llenado ?? 0)) / 100;
  const ruta = siluetaPila(px, baseY);
  const clipId = `pila-${i}`;
  const infoX = x + 156;
  const medioIn = (PILA.w * PILA.crestaIni) / 2;
  return `
    <g>
      <defs><clipPath id="${clipId}"><path d="${ruta}" /></clipPath></defs>
      <rect x="${x}" y="${y}" width="${CARD_W}" height="${PILE_CARD_H}" rx="18" fill="${CARD_BG}" />
      <text x="${x + 22}" y="${y + 32}" class="name">${escapeXml(recortar(m.nombre, 22))}</text>
      <ellipse cx="${px + PILA.w / 2}" cy="${baseY + 3}" rx="${PILA.w / 2 + 10}" ry="7" fill="${GROUND}" />
      <g clip-path="url(#${clipId})">
        <rect x="${px}" y="${baseY - PILA.h}" width="${PILA.w}" height="${PILA.h}" fill="${TRACK_BG}" />
        ${altoLleno > 0 ? `<rect x="${px}" y="${baseY - altoLleno}" width="${PILA.w}" height="${altoLleno}" fill="${PUNTO[estado]}" />` : ''}
        <rect x="${px + PILA.w / 2}" y="${baseY - PILA.h}" width="${PILA.w / 2}" height="${PILA.h}" fill="#000000" opacity="0.07" />
      </g>
      ${m.reorden > 0 ? `<line x1="${px + medioIn - 5}" y1="${baseY - PILA.h / 2}" x2="${px + PILA.w - medioIn + 5}" y2="${baseY - PILA.h / 2}" stroke="${INK}" stroke-width="2" stroke-dasharray="4 3" opacity="0.5" />` : ''}
      <path d="${ruta}" fill="none" stroke="#ffffff" stroke-width="2" stroke-linejoin="round" />
      <line x1="${px - 8}" y1="${baseY}" x2="${px + PILA.w + 8}" y2="${baseY}" stroke="${INK_SOFT}" stroke-width="1.5" opacity="0.35" />
      ${llenado === null ? '' : `<text x="${px + PILA.w / 2}" y="${baseY - 14}" class="pct" text-anchor="middle">${llenado}%</text>`}
      <text x="${infoX}" y="${y + 86}" class="lbl">STOCK</text>
      <text x="${infoX}" y="${y + 110}" class="val">${escapeXml(`${fmt2.format(m.cantidad)} ${m.unidad}`)}</text>
      <text x="${infoX}" y="${y + 140}" class="lbl">MÍNIMO</text>
      <text x="${infoX}" y="${y + 164}" class="val">${escapeXml(m.reorden > 0 ? `${fmt2.format(m.reorden)} ${m.unidad}` : '—')}</text>
      <circle cx="${x + 22}" cy="${y + PILE_CARD_H - 26}" r="5" fill="${PUNTO[estado]}" />
      <text x="${x + 34}" y="${y + PILE_CARD_H - 21}" class="status">${ETIQUETA_ESTADO[estado]}</text>
    </g>`;
};

export const svgAgregados = (lista: Material[], empresa: string): string =>
  grilla('Stock de agregados', empresa, PILE_CARD_H, lista.map((m) => tarjetaMaterial(m)));

export const pngAgregados = async (lista: Material[], empresa: string): Promise<Buffer> => {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(svgAgregados(lista, empresa))).png().toBuffer();
};

/*
 * UNA TABLA GENÉRICA EN IMAGEN, para las listas largas (certificados
 * pendientes, historial de pedidos, kardex, ingresos). José, 14/09: 24 pedidos
 * en texto en un celular «no es legible, está todo desordenado»; la imagen sí.
 * Secciones con encabezado (un cliente, un proveedor), filas de celdas, misma
 * cabecera oscura y paleta que las otras tarjetas.
 */

export interface ColumnaTabla {
  titulo: string;
  /** Ancho en px dentro de los 1080 − márgenes. */
  ancho: number;
  alinear?: 'inicio' | 'fin';
  /** Caracteres antes de recortar con «…». */
  max?: number;
}

export interface SeccionTabla {
  encabezado: string;
  detalle?: string;
  filas: string[][];
}

export interface TablaSpec {
  titulo: string;
  subtitulo: string;
  columnas: ColumnaTabla[];
  secciones: SeccionTabla[];
  pie?: string;
}

const T_ROW = 40;
const T_SECCION = 48;
const T_ENCABEZADO_COLS = 30;
const T_MAX_FILAS = 60;

export const svgTabla = (t: TablaSpec): string => {
  const secciones = t.secciones.map((s) => ({ ...s, filas: s.filas.slice(0, T_MAX_FILAS) }));
  const filasTotales = secciones.reduce((n, s) => n + s.filas.length, 0);
  const height = HEADER + T_ENCABEZADO_COLS + secciones.length * (T_SECCION + 12) + filasTotales * T_ROW + (t.pie ? 34 : 0) + FOOT;
  const xs: number[] = [];
  let acumulado = PAD + 16;
  for (const c of t.columnas) {
    xs.push(acumulado);
    acumulado += c.ancho;
  }
  const celda = (c: ColumnaTabla, i: number, valor: string, y: number, clase: string) => {
    const texto = escapeXml(recortar(String(valor ?? ''), c.max ?? 40));
    const x = c.alinear === 'fin' ? xs[i] + c.ancho - 12 : xs[i];
    return `<text x="${x}" y="${y}" class="${clase}"${c.alinear === 'fin' ? ' text-anchor="end"' : ''}>${texto}</text>`;
  };
  const partes: string[] = [];
  let y = HEADER + 8;
  partes.push(...t.columnas.map((c, i) => celda(c, i, c.titulo.toUpperCase(), y + 14, 'lbl')));
  y += T_ENCABEZADO_COLS;
  for (const s of secciones) {
    partes.push(`<line x1="${PAD}" y1="${y + 6}" x2="${WIDTH - PAD}" y2="${y + 6}" stroke="${LINE}" />`);
    partes.push(`<text x="${PAD}" y="${y + 32}" class="order">${escapeXml(recortar(s.encabezado, 60))}</text>`);
    if (s.detalle) partes.push(`<text x="${WIDTH - PAD}" y="${y + 32}" class="sub" text-anchor="end">${escapeXml(recortar(s.detalle, 40))}</text>`);
    y += T_SECCION;
    s.filas.forEach((fila, i) => {
      if (i % 2 === 1) partes.push(`<rect x="${PAD}" y="${y}" width="${WIDTH - PAD * 2}" height="${T_ROW}" fill="${ROW_ALT}" />`);
      partes.push(...t.columnas.map((c, j) => celda(c, j, fila[j] ?? '', y + 26, j === 0 ? 'num' : 'cell')));
      y += T_ROW;
    });
    y += 12;
  }
  if (t.pie) partes.push(`<text x="${PAD}" y="${y + 20}" class="sub">${escapeXml(t.pie)}</text>`);
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
      </style>
      <rect width="${WIDTH}" height="${height}" fill="#ffffff" />
      <rect width="${WIDTH}" height="${HEADER}" fill="${HEADER_BG}" />
      <text x="${PAD}" y="42" class="title">${escapeXml(t.titulo)}</text>
      <text x="${PAD}" y="68" class="subtitle">${escapeXml(t.subtitulo)}</text>
      ${partes.join('\n')}
    </svg>`;
};

export const pngTabla = async (t: TablaSpec): Promise<Buffer> => {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(svgTabla(t))).png().toBuffer();
};
