import { randomBytes } from 'node:crypto';
import { getBotConfigModel } from '../../database/bot.models.js';
import logger from '../../utils/logger.js';

/**
 * EL CATÁLOGO (A12, spec DALI §3 `bot_configs.catalogo`): lo que vende la
 * empresa, para que Dali lo conozca y lo nombre bien. Los precios son
 * referenciales y SOLO se dicen si la empresa prende «Dali puede decir
 * precios» (`bot_configs.dicePrecios`); apagado, Dali contesta como siempre:
 * el precio lo confirma el asesor con la cotización.
 */
export interface ItemCatalogo {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  unidad: string;
  /** Precio unitario referencial en soles (con IGV); ausente = no se dice. */
  precio?: number;
  disponible: boolean;
  descripcion: string;
}

export interface Catalogo {
  items: ItemCatalogo[];
  /** «Dali puede decir precios». */
  dicePrecios: boolean;
}

const LARGOS = { sku: 30, nombre: 80, categoria: 40, unidad: 20, descripcion: 300, items: 300 } as const;
const texto = (v: unknown, max: number): string => (v == null ? '' : String(v)).trim().slice(0, max);

const precioDe = (v: unknown): number | undefined => {
  if (v === '' || v == null) return undefined;
  const limpio = typeof v === 'number' ? String(v) : String(v).replace(/[^\d.,]/g, '').replace(',', '.');
  if (!limpio) return undefined;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
};

export const itemsDe = (v: unknown): ItemCatalogo[] => {
  const items: ItemCatalogo[] = [];
  for (const cruda of Array.isArray(v) ? v : []) {
    if (!cruda || typeof cruda !== 'object') continue;
    const c = cruda as Partial<ItemCatalogo>;
    const nombre = texto(c.nombre, LARGOS.nombre);
    if (!nombre) continue;
    const precio = precioDe(c.precio);
    items.push({
      id: texto(c.id, 40) || `item-${randomBytes(4).toString('hex')}`,
      sku: texto(c.sku, LARGOS.sku),
      nombre,
      categoria: texto(c.categoria, LARGOS.categoria),
      unidad: texto(c.unidad, LARGOS.unidad),
      ...(precio !== undefined ? { precio } : {}),
      disponible: c.disponible !== false,
      descripcion: texto(c.descripcion, LARGOS.descripcion),
    });
  }
  return items.slice(0, LARGOS.items);
};

export const catalogoDe = (config: { catalogo?: unknown; dicePrecios?: unknown } | null | undefined): Catalogo => ({ items: itemsDe(config?.catalogo), dicePrecios: config?.dicePrecios === true });

const normalizar = (t: string): string =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ"\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const VACIAS = new Set(['de', 'del', 'la', 'el', 'en', 'con', 'y', 'o', 'a', 'por', 'para', 'un', 'una', 'los', 'las']);
const palabrasDe = (t: string): string[] => normalizar(t).split(' ').filter((p) => p.length > 2 && !VACIAS.has(p));

/** Las primeras letras con las que una palabra del nombre se reconoce en el mensaje («asfaltica» → «asfal» vale para «asfalto»). */
const raiz = (p: string): string => p.slice(0, 5);

/**
 * El ítem que nombra el mensaje: el que más palabras de su nombre tiene en el
 * texto. Una sola palabra alcanza si es propia de ese ítem («colocación»);
 * una compartida («mezcla») no distingue y necesita otra.
 */
export const itemEnTexto = (items: ItemCatalogo[], mensaje: string): ItemCatalogo | undefined => {
  const t = ` ${normalizar(mensaje)} `;
  const raicesDe = (item: ItemCatalogo) => [...new Set(palabrasDe(item.nombre).map(raiz))];
  const cuantosUsan = new Map<string, number>();
  for (const item of items) for (const r of raicesDe(item)) cuantosUsan.set(r, (cuantosUsan.get(r) ?? 0) + 1);
  let mejor: { item: ItemCatalogo; puntos: number } | undefined;
  for (const item of items) {
    const raices = raicesDe(item);
    const encontradas = raices.filter((r) => t.includes(` ${r}`));
    const propias = encontradas.filter((r) => cuantosUsan.get(r) === 1);
    if (!encontradas.length || (encontradas.length < 2 && !propias.length)) continue;
    const puntos = encontradas.length + propias.length;
    if (!mejor || puntos > mejor.puntos) mejor = { item, puntos };
  }
  return mejor?.item;
};

export const precioLegible = (precio: number): string => `S/ ${Number.isInteger(precio) ? precio : precio.toFixed(2)}`;

/** Lo que Dali dice del precio de un ítem, si la empresa lo permite. */
export const respuestaDePrecio = (item: ItemCatalogo, dicePrecios: boolean): string | undefined => {
  if (!dicePrecios) return undefined;
  if (item.precio === undefined) return `${item.nombre}: el precio te lo confirma el asesor con la cotización.`;
  const unidad = item.unidad ? ` por ${item.unidad}` : '';
  if (!item.disponible) return `${item.nombre}: ${precioLegible(item.precio)}${unidad} (referencial); por ahora está bajo pedido especial, el asesor te confirma disponibilidad.`;
  return `${item.nombre}: ${precioLegible(item.precio)}${unidad}, precio referencial que el asesor confirma con la cotización.`;
};

/** El catálogo como lo lee el prompt del modelo grande. */
export const catalogoParaPrompt = (c: Catalogo): string =>
  c.items
    .map((i) => `- ${i.nombre}${i.unidad ? ` (por ${i.unidad})` : ''}${c.dicePrecios && i.precio !== undefined ? `: ${precioLegible(i.precio)} referencial` : ''}${i.disponible ? '' : ' — bajo pedido especial / agotado'}${i.descripcion ? `. ${i.descripcion}` : ''}`)
    .join('\n');

export const leerCatalogo = async (companyId: string): Promise<Catalogo> => {
  const Config = await getBotConfigModel();
  const config = await Config.findOne({ companyId }).select('catalogo dicePrecios').lean();
  return catalogoDe(config as { catalogo?: unknown; dicePrecios?: unknown } | null);
};

export const guardarCatalogo = async (companyId: string, cambios: { items?: unknown; dicePrecios?: unknown }, quien: string): Promise<Catalogo> => {
  const Config = await getBotConfigModel();
  const set: Record<string, unknown> = {};
  if (cambios.items !== undefined) set.catalogo = itemsDe(cambios.items);
  if (typeof cambios.dicePrecios === 'boolean') set.dicePrecios = cambios.dicePrecios;
  if (Object.keys(set).length) {
    await Config.updateOne({ companyId }, { $set: set });
    logger.info(`[dali] ${quien} guardó el catálogo de ${companyId}: ${Object.keys(set).join(', ')}`);
  }
  return leerCatalogo(companyId);
};
