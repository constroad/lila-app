import { getAsphaltDesignModel, getMaterialModel, getOrderModel } from '../../database/models.js';
import { tanques as tanquesDePlanta, type Tanque } from '../consultas/planta.js';
import { diaPeruano, fechaLegible } from './tiempo.js';
import type { ChecklistItem, Revision } from './checklist.js';

/**
 * ¿ALCANZA EL STOCK PARA LA PRODUCCIÓN? José, 15/09/2026, viendo el checklist
 * de planta preguntar por agregados, petróleo y gasohol: «tú tienes acceso a
 * los agregados, a los líquidos y a los consumos: deberíamos ser capaces de
 * analizar si tenemos o no el stock suficiente». Sí:
 *
 * - AGREGADOS: cada pedido referencia un diseño de mezcla (`orders.tipoMAC` →
 *   `asphaltdesigns.values[{materialId, percentage}]`), y Portal descuenta del
 *   kardex m³ × porcentaje por material cuando procesa el pedido (`Salida|order`
 *   en `kardexes`). La necesidad de mañana es esa misma cuenta; lo disponible es
 *   el stock del kardex MENOS lo que ya se produjo y Portal todavía no descontó
 *   (pedidos despachados con `kardexProcessingStatus: 'pending'`) — el 15/09 el
 *   kardex iba por el 12/09 con dos producciones sin descontar.
 * - LÍQUIDOS: los tanques de la planta traen galones útiles y `gallonsPerProductionM3`
 *   (25 para PEN, 2,5 para gasohol, 1 para petróleo), lo mismo que usa el
 *   reporte de líquidos: m³ producibles contra los m³ del día.
 *
 * Se dice de dónde sale y de cuándo es («kardex al 12/09 · tanques al 15/09»):
 * un stock viejo no es un hecho, y José mismo notó ese día «el kardex no está
 * actualizado». Un ítem se da por confirmado según Portal solo si alcanza y el
 * dato es reciente; si falta, queda pendiente con la cifra; si no hay dato, se
 * pregunta como siempre.
 */

export interface DisenoMezcla {
  id: string;
  nombre: string;
  valores: Array<{ materialId: string; porcentaje: number }>;
}

export interface MaterialStock {
  id: string;
  nombre: string;
  cantidad: number;
  reorden: number;
  actualizadoMs: number;
}

export interface ProduccionPlaneada {
  m3: number;
  disenoId: string;
  companyId: string;
}

export interface NecesidadAgregado {
  material: string;
  necesario: number;
  /** Lo del kardex menos lo producido sin descontar. */
  disponible: number;
  enKardex: number;
  porDescontar: number;
  reorden: number;
  ok: boolean;
}

export interface NecesidadLiquido {
  nombre: 'PEN' | 'gasohol' | 'petróleo';
  m3Producibles: number;
  necesarioM3: number;
  galones: number;
  /** Galones por m³ configurados en el tanque, para decir cuánto falta. */
  glPorM3: number;
  ok: boolean;
}

export interface AnalisisStock {
  fecha: string;
  m3: number;
  agregados: NecesidadAgregado[];
  /** Pedidos del día sin diseño de mezcla resuelto: sin eso no se calculan los agregados. */
  sinDiseno: number;
  kardexMs: number;
  liquidos: NecesidadLiquido[];
  tanquesMs: number;
}

const redondear = (n: number): number => Math.round(n * 10) / 10;

/** Necesidad por material de un conjunto de producciones, según su diseño. `null` en el mapa = sin diseño. */
const necesidadPorMaterial = (producciones: ProduccionPlaneada[], disenos: Map<string, DisenoMezcla>): { porMaterial: Map<string, number>; sinDiseno: number } => {
  const porMaterial = new Map<string, number>();
  let sinDiseno = 0;
  for (const p of producciones) {
    const diseno = disenos.get(p.disenoId);
    if (!diseno || !diseno.valores.length) {
      sinDiseno += 1;
      continue;
    }
    for (const v of diseno.valores) porMaterial.set(v.materialId, (porMaterial.get(v.materialId) ?? 0) + (p.m3 * v.porcentaje) / 100);
  }
  return { porMaterial, sinDiseno };
};

export const necesidadesDeAgregados = (
  producciones: ProduccionPlaneada[],
  pendientesDeDescontar: ProduccionPlaneada[],
  disenos: Map<string, DisenoMezcla>,
  materiales: MaterialStock[]
): { agregados: NecesidadAgregado[]; sinDiseno: number } => {
  const necesidad = necesidadPorMaterial(producciones, disenos);
  const descuento = necesidadPorMaterial(pendientesDeDescontar, disenos).porMaterial;
  const porId = new Map(materiales.map((m) => [m.id, m]));
  const agregados: NecesidadAgregado[] = [];
  for (const [materialId, necesario] of necesidad.porMaterial) {
    const m = porId.get(materialId);
    const enKardex = m?.cantidad ?? 0;
    const porDescontar = descuento.get(materialId) ?? 0;
    const disponible = Math.max(enKardex - porDescontar, 0);
    agregados.push({
      material: (m?.nombre ?? 'material sin nombre').trim().toLowerCase(),
      necesario: redondear(necesario),
      disponible: redondear(disponible),
      enKardex: redondear(enKardex),
      porDescontar: redondear(porDescontar),
      reorden: m?.reorden ?? 0,
      ok: disponible >= necesario,
    });
  }
  return { agregados, sinDiseno: necesidad.sinDiseno };
};

/** PEN y gasohol suman sus tanques; el petróleo de planta es el tanque HIGHWAY (como en el reporte de líquidos). */
export const necesidadesDeLiquidos = (m3: number, lista: Tanque[]): NecesidadLiquido[] => {
  const grupo = (nombre: NecesidadLiquido['nombre'], seleccion: Tanque[]): NecesidadLiquido | null => {
    if (!seleccion.length) return null;
    const galones = seleccion.reduce((s, t) => s + t.galones, 0);
    const m3Producibles = seleccion.reduce((s, t) => s + t.m3Producibles, 0);
    const glPorM3 = m3Producibles > 0 ? galones / m3Producibles : 0;
    return { nombre, m3Producibles: redondear(m3Producibles), necesarioM3: m3, galones: redondear(galones), glPorM3: redondear(glPorM3), ok: m3Producibles >= m3 };
  };
  const petroleo = lista.filter((t) => t.contenido === 'petroleo');
  const highway = petroleo.filter((t) => t.nombre.includes('HIGHWAY'));
  return [
    grupo('PEN', lista.filter((t) => t.contenido === 'pen')),
    grupo('gasohol', lista.filter((t) => t.contenido === 'gasohol')),
    grupo('petróleo', highway.length ? highway : petroleo),
  ].filter((x): x is NecesidadLiquido => x !== null);
};

/** Un dato más viejo que esto no confirma nada por sí solo: se pregunta como siempre. */
export const VIGENCIA_KARDEX_MS = 4 * 24 * 3_600_000;
export const VIGENCIA_TANQUES_MS = 2 * 24 * 3_600_000;

const n = (v: number): string => v.toLocaleString('es-PE', { maximumFractionDigits: v >= 100 ? 0 : 1 });
const corta = (ms: number): string => (ms ? fechaLegible(diaPeruano(ms)).replace(/^\S+ /, '') : '—');

/**
 * Lo que dice Portal, en dos o tres líneas para el checklist: agregados con
 * disponible/necesario por material, y los líquidos en m³ producibles contra
 * los del día, con cuánto falta en galones cuando falta.
 */
export const lineasDeStock = (a: AnalisisStock): string[] => {
  const lineas: string[] = [];
  const fuente = `Según Portal (kardex al ${corta(a.kardexMs)} · tanques al ${corta(a.tanquesMs)}):`;
  if (a.agregados.length) {
    const detalle = a.agregados.map((g) => `${g.material} ${n(g.disponible)}/${n(g.necesario)}${g.ok ? '' : ' ⚠️'}`).join(' · ');
    const todos = a.agregados.every((g) => g.ok);
    lineas.push(`• Agregados ${todos ? '✅' : '⚠️ faltan'} — ${detalle} (m³ disponibles/necesarios)${a.sinDiseno ? ` · ${a.sinDiseno} pedido(s) sin diseño de mezcla` : ''}`);
  } else if (a.sinDiseno) {
    lineas.push(`• Agregados: sin diseño de mezcla en el pedido, no puedo calcular la necesidad.`);
  }
  for (const l of a.liquidos) {
    const faltanGl = l.ok ? 0 : Math.ceil((l.necesarioM3 - l.m3Producibles) * l.glPorM3);
    lineas.push(`• ${l.nombre} ${l.ok ? '✅' : '⚠️'} ${n(l.m3Producibles)} m³ producibles de ${n(l.necesarioM3)} (${n(l.galones)} gl${l.ok ? '' : `, faltan ~${n(faltanGl)} gl`})`);
  }
  return lineas.length ? [fuente, ...lineas] : [];
};

/** Qué ítems del checklist de planta cubre el análisis: `true` alcanza, `false` falta, `undefined` sin dato o dato viejo. */
export const veredictoPorItem = (a: AnalisisStock, ahoraMs: number): Partial<Record<'agregados' | 'pen' | 'gasohol' | 'petroleo-planta', boolean>> => {
  const v: Partial<Record<'agregados' | 'pen' | 'gasohol' | 'petroleo-planta', boolean>> = {};
  const kardexVigente = a.kardexMs > 0 && ahoraMs - a.kardexMs <= VIGENCIA_KARDEX_MS;
  if (a.agregados.length && a.sinDiseno === 0 && (kardexVigente || a.agregados.some((g) => !g.ok))) v.agregados = a.agregados.every((g) => g.ok);
  const tanquesVigentes = a.tanquesMs > 0 && ahoraMs - a.tanquesMs <= VIGENCIA_TANQUES_MS;
  const liquido = (nombre: NecesidadLiquido['nombre']) => a.liquidos.find((l) => l.nombre === nombre);
  for (const [item, nombre] of [['pen', 'PEN'], ['gasohol', 'gasohol'], ['petroleo-planta', 'petróleo']] as const) {
    const l = liquido(nombre);
    // Que FALTE se dice aunque la medición sea vieja: un tanque no se llena solo.
    if (l && (tanquesVigentes || !l.ok)) v[item] = l.ok;
  }
  return v;
};

export interface StockEnRevision {
  lineas: string[];
  /** Ítems que Portal da por cubiertos. */
  cubiertos: ChecklistItem[];
  /** Ítems que Portal dice que faltan (siguen pendientes, con aviso). */
  faltantes: ChecklistItem[];
}

/**
 * La revisión con lo que Portal sabe: los ítems con stock suficiente y dato
 * reciente pasan a resueltos; los que faltan quedan pendientes y se marcan.
 * Lo que la gente ya confirmó no se toca.
 */
export const conStockDePortal = <R extends Revision>(revision: R, analisis: AnalisisStock | null, ahoraMs: number): R & { stock?: StockEnRevision } => {
  if (!analisis) return revision;
  const veredicto = veredictoPorItem(analisis, ahoraMs);
  const cubiertos: ChecklistItem[] = [];
  const faltantes: ChecklistItem[] = [];
  const pendientes: ChecklistItem[] = [];
  for (const item of revision.pendientes) {
    const v = veredicto[item.id as keyof typeof veredicto];
    if (v === true) cubiertos.push(item);
    else {
      if (v === false) faltantes.push(item);
      pendientes.push(item);
    }
  }
  return { ...revision, pendientes, resueltos: [...revision.resueltos, ...cubiertos], stock: { lineas: lineasDeStock(analisis), cubiertos, faltantes } };
};

type Doc = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const texto = (v: unknown): string => (v == null ? '' : String(v)).trim();

/** Los pedidos de un día de planta con su diseño, y los ya producidos que Portal no descontó del kardex todavía. */
const pedidosParaStock = async (fecha: string): Promise<{ delDia: ProduccionPlaneada[]; pendientes: ProduccionPlaneada[] }> => {
  const Order = await getOrderModel();
  const inicio = new Date(`${fecha}T00:00:00.000-05:00`);
  const fin = new Date(inicio.getTime() + 24 * 3_600_000);
  const haceUnMes = new Date(inicio.getTime() - 30 * 24 * 3_600_000);
  const docs = (await Order.find({
    fechaProgramacion: { $gte: haceUnMes, $lt: fin },
    status: { $nin: ['eliminado', 'rechazado'] },
  })
    .select('companyId cantidadCubos fechaProgramacion tipoMAC status kardexProcessingStatus stockUpdated')
    .lean()) as Doc[];
  const delDia: ProduccionPlaneada[] = [];
  const pendientes: ProduccionPlaneada[] = [];
  for (const d of docs) {
    const p: ProduccionPlaneada = { m3: num(d.cantidadCubos), disenoId: texto(d.tipoMAC), companyId: texto(d.companyId) };
    const esDelDia = new Date(d.fechaProgramacion as Date).getTime() >= inicio.getTime();
    if (esDelDia) delDia.push(p);
    else if (texto(d.status) === 'despachado' && !d.stockUpdated && texto(d.kardexProcessingStatus) !== 'processed') pendientes.push(p);
  }
  return { delDia, pendientes };
};

const disenosDe = async (ids: string[]): Promise<Map<string, DisenoMezcla>> => {
  const validos = [...new Set(ids.filter((id) => /^[0-9a-f]{24}$/i.test(id)))];
  if (!validos.length) return new Map();
  const Diseno = await getAsphaltDesignModel();
  const docs = (await Diseno.find({ _id: { $in: validos } }).select('name values').lean()) as Doc[];
  return new Map(
    docs.map((d) => [
      String(d._id),
      {
        id: String(d._id),
        nombre: texto(d.name),
        valores: (Array.isArray(d.values) ? (d.values as Doc[]) : []).map((v) => ({ materialId: texto(v.materialId), porcentaje: num(v.percentage) })).filter((v) => v.materialId && v.porcentaje > 0),
      },
    ])
  );
};

const materialesDe = async (companyIds: string[]): Promise<MaterialStock[]> => {
  if (!companyIds.length) return [];
  const Mat = await getMaterialModel();
  const docs = (await Mat.find({ companyId: { $in: companyIds } }).select('name quantity reorderPoint updatedAt').lean()) as Doc[];
  return docs.map((d) => ({ id: String(d._id), nombre: texto(d.name), cantidad: num(d.quantity), reorden: num(d.reorderPoint), actualizadoMs: d.updatedAt ? new Date(d.updatedAt as string).getTime() : 0 }));
};

/** El análisis de un día de planta. `null` si ese día no tiene pedidos. Nunca lanza: si algo no está, se dice en el texto. */
export const analizarStockDelDia = async (fecha: string): Promise<AnalisisStock | null> => {
  const { delDia, pendientes } = await pedidosParaStock(fecha);
  if (!delDia.length) return null;
  const empresas = [...new Set(delDia.map((p) => p.companyId))];
  const [disenos, materiales, lista] = await Promise.all([
    disenosDe([...delDia, ...pendientes].map((p) => p.disenoId)),
    materialesDe(empresas),
    tanquesDePlanta(),
  ]);
  const m3 = delDia.reduce((s, p) => s + p.m3, 0);
  // Solo lo pendiente de las mismas empresas: el kardex de Constroad no le debe nada a Globofast.
  const { agregados, sinDiseno } = necesidadesDeAgregados(delDia, pendientes.filter((p) => empresas.includes(p.companyId)), disenos, materiales);
  return {
    fecha,
    m3,
    agregados,
    sinDiseno,
    kardexMs: Math.max(0, ...materiales.map((m) => m.actualizadoMs)),
    liquidos: necesidadesDeLiquidos(m3, lista),
    tanquesMs: Math.max(0, ...lista.map((t) => t.medidoMs ?? 0)),
  };
};
