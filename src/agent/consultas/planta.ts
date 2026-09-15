import { getConsumeModel, getControlTankModel, getMaterialModel } from '../../database/models.js';
import { COMPANY_PILOTO } from '../checklist/alcance.js';
import { fechaLegible } from '../checklist/tiempo.js';

/**
 * LO QUE HAY EN LA PLANTA: tanques, consumos de una producción, agregados.
 * Datos de la empresa piloto (inframaq, que opera la planta). Solo lectura, y
 * solo estos campos.
 */

type Doc = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const r1 = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('es-PE');

export interface Tanque {
  nombre: string;
  contenido: 'pen' | 'gasohol' | 'petroleo' | 'otro';
  /** Galones disponibles para producir: el stock menos el volumen muerto de la válvula. */
  galones: number;
  /** Lo que se puede PRODUCIR con eso, en m³ de mezcla. Solo PEN y gasohol. */
  m3Producibles: number;
  nivelCm: number;
  /** Para la tarjeta: el llenado y el semáforo, como en «Control de tanques». */
  capacidad: number;
  stock: number;
  reorden: number;
  /** Color configurado en Portal para el tanque, si lo hay. */
  color?: string;
  /** Cuándo se tocó el tanque por última vez en Portal (medición o ajuste). */
  medidoMs?: number;
}

const CONTENIDO: Record<string, Tanque['contenido']> = { pen: 'pen', gasohol: 'gasohol', petroleum: 'petroleo', petroleo: 'petroleo', thermal_oil: 'otro', other: 'otro' };

/**
 * Los tanques como los muestra el «Reporte de líquidos» del cron de Portal
 * (`fluids-report`): misma fórmula, mismos umbrales, para que el agente y el
 * reporte de las 10:00 no se contradigan. Verificado el 13/09/2026 contra el
 * reporte real: PEN #1 23 m³, #2 12, #3 10, gasohol 403.
 */
export const tanques = async (): Promise<Tanque[]> => {
  const Tank = await getControlTankModel();
  const docs = (await Tank.find({ companyId: COMPANY_PILOTO, includeInFluidsReport: { $ne: false } })
    .select('name contentType volumeInStock valveDeadVolumeGallons gallonsPerProductionM3 levelCentimeter volume reorderPoint bgColor updatedAt')
    .lean()) as Doc[];
  return docs.map((d) => {
    const disponibles = Math.max(num(d.volumeInStock) - num(d.valveDeadVolumeGallons), 0);
    const glPorM3 = num(d.gallonsPerProductionM3);
    return {
      nombre: String(d.name || '').toUpperCase().replace(/#/g, ''),
      contenido: CONTENIDO[String(d.contentType || '').toLowerCase()] || 'otro',
      galones: disponibles,
      m3Producibles: glPorM3 > 0 ? disponibles / glPorM3 : 0,
      nivelCm: num(d.levelCentimeter),
      capacidad: num(d.volume),
      stock: num(d.volumeInStock),
      reorden: num(d.reorderPoint),
      color: String(d.bgColor || '').trim() || undefined,
      medidoMs: d.updatedAt ? new Date(d.updatedAt as string).getTime() : 0,
    };
  });
};

/** El mismo texto que el reporte de las 10:00, más los galones para quien los pide. */
export const textoTanques = (lista: Tanque[]): string => {
  if (lista.length === 0) return 'No hay tanques en el reporte de líquidos.';
  const lineas = ['📋 *Tanques de planta — Inframaq*'];
  const pen = lista.filter((t) => t.contenido === 'pen' && t.m3Producibles > 0);
  for (const t of pen) lineas.push(`*- ${t.nombre}:* ${t.m3Producibles.toFixed(0)} m³ prod. (${r1(t.galones)} gl, ${t.nivelCm} cm)`);
  if (pen.length === 0) lineas.push('*- PEN:* 0 m³ ⚠️ SIN STOCK');
  for (const t of lista.filter((t) => t.contenido === 'petroleo' || t.contenido === 'otro')) {
    const etiqueta = t.nombre.includes('HIGHWAY') ? 'HIGHWAY' : t.nombre;
    lineas.push(`*- ${etiqueta}:* ${t.nivelCm} cm (${r1(t.galones)} gl)${t.nombre.includes('HIGHWAY') && t.nivelCm < 40 ? ' (⚠️ PEDIR PETRÓLEO)' : ''}`);
  }
  const gasohol = lista.filter((t) => t.contenido === 'gasohol').reduce((s, t) => s + t.m3Producibles, 0);
  const gasoholGl = lista.filter((t) => t.contenido === 'gasohol').reduce((s, t) => s + t.galones, 0);
  lineas.push(
    gasohol > 0
      ? `*- GASOHOL:* ${gasohol.toFixed(0)} m³ (${r1(gasoholGl)} gl)${gasohol < 50 ? ' (⚠️ PEDIR GASOHOL)' : ''}`
      : '*- GASOHOL:* 0 m³ (⚠️ SIN STOCK)'
  );
  return lineas.join('\n');
};

export interface ConsumoProduccion {
  fecha: string;
  pedidos: string[];
  m3: number;
  porTanque: Array<{ tanque: string; galones: number; glPorM3: number }>;
  totalGalones: number;
}

/** Los consumos registrados para un día (calendario peruano). Puede haber más de uno. */
export const consumosDelDia = async (fecha: string): Promise<ConsumoProduccion[]> => {
  const Consume = await getConsumeModel();
  const inicio = new Date(`${fecha}T00:00:00.000-05:00`);
  const fin = new Date(inicio.getTime() + 24 * 3_600_000);
  const docs = (await Consume.find({
    companyId: COMPANY_PILOTO,
    $or: [{ date: { $gte: inicio, $lt: fin } }, { periodStart: { $gte: inicio, $lt: fin } }],
  })
    .select('date orders computedM3 totalCubes measures')
    .sort({ date: 1 })
    .lean()) as Doc[];
  return docs.map((d) => {
    const m3 = num(d.computedM3) || num(d.totalCubes);
    const medidas = (Array.isArray(d.measures) ? d.measures : []) as Doc[];
    const porTanque = medidas.map((m) => {
      const galones = num(m.quantityConsumed);
      return { tanque: String(m.tank || ''), galones, glPorM3: m3 > 0 ? galones / m3 : 0 };
    });
    return {
      fecha,
      pedidos: ((d.orders as Doc[] | undefined) ?? []).map((o) => String(o.orderClient || o.orderName || '')).filter(Boolean),
      m3,
      porTanque,
      totalGalones: porTanque.reduce((s, t) => s + t.galones, 0),
    };
  });
};

export const textoConsumos = (lista: ConsumoProduccion[], fecha: string): string => {
  if (lista.length === 0) return `No hay consumo registrado para ${fechaLegible(fecha)}. Se registra en Portal → Consumos.`;
  const bloques = lista.map((c, i) => {
    const titulo = lista.length > 1 ? `*Consumo ${i + 1}* (${c.pedidos.join(', ') || 'sin pedido'})` : `*${c.pedidos.join(', ') || 'Producción'}*`;
    const lineas = [`${titulo} — ${r1(c.m3)} m³, ${r1(c.totalGalones)} gl en total`];
    lineas.push(...c.porTanque.map((t) => `• ${t.tanque}: ${r1(t.galones)} gl · ${(Math.round(t.glPorM3 * 1000) / 1000).toLocaleString('es-PE')} gl/m³`));
    return lineas.join('\n');
  });
  return [`🛢 *Consumos de ${fechaLegible(fecha)}*`, '', ...bloques].join('\n\n');
};

export interface Material {
  empresa: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  /** `quantity <= reorderPoint`, igual que `needsRestock` del reporte de Portal. Sin punto, no se inventa. */
  reponer: boolean;
  /** Punto de reposición; 0 si la empresa no lo configuró. */
  reorden: number;
}

// Lo que vive en un tanque no es un agregado: por nombre (con las faltas de
// ortografía reales: «GASHOL») y por unidad (galones). Mismo criterio que el
// reporte del cron (`excludedAsLiquid`).
export const ES_LIQUIDO = /\b(pen|gasoh?ol|gashol|petroleo|petróleo|diesel|asfalto|aceite|emulsion|emulsión|combustible)\b/i;
export const UNIDAD_LIQUIDA = /^(gl|gls|gal|galon|galones|l|lt|lts|litros)$/i;
/** ¿Es un agregado (arena, piedra, confitillo…) y no algo que vive en un tanque? */
export const esAgregado = (nombre: string, unidad: string): boolean => !ES_LIQUIDO.test(nombre) && !UNIDAD_LIQUIDA.test(String(unidad || '').trim());

/**
 * El stock de agregados de las empresas del piloto que lo llevan. Inframaq no
 * lo lleva (todo en 0, sin movimientos); Globofast sí, con puntos de reorden.
 * Misma regla que el «Stock de agregados» del cron: REPONER si la cantidad
 * está en o bajo el punto de reorden, y sin punto no se inventa un estado.
 */
export const materiales = async (empresas: Array<{ companyId: string; nombre: string }>): Promise<Material[]> => {
  const Mat = await getMaterialModel();
  const docs = (await Mat.find({ companyId: { $in: empresas.map((e) => e.companyId) } })
    .select('companyId name quantity unit reorderPoint')
    .sort({ name: 1 })
    .lean()) as Doc[];
  return docs
    .filter((d) => esAgregado(String(d.name || ''), String(d.unit || '')))
    .map((d) => {
      const reorden = num(d.reorderPoint);
      return {
        empresa: empresas.find((e) => e.companyId === String(d.companyId))?.nombre || String(d.companyId),
        nombre: String(d.name || '').trim().toUpperCase(),
        cantidad: num(d.quantity),
        unidad: String(d.unit || 'm³').replace(/^m3$/i, 'm³'),
        reponer: reorden > 0 && num(d.quantity) <= reorden,
        reorden,
      };
    });
};

/**
 * Los agregados por empresa, SOLO de las que llevan el kardex. Una empresa con
 * todo en cero no se muestra (José, 14/09: «si no hay agregados no los
 * muestres»): antes salía un bloque «Todo figura en 0» que no informa nada.
 */
export const materialesPorEmpresa = (lista: Material[]): Array<{ empresa: string; materiales: Material[] }> => {
  const porEmpresa = new Map<string, Material[]>();
  for (const m of lista) porEmpresa.set(m.empresa, [...(porEmpresa.get(m.empresa) ?? []), m]);
  return [...porEmpresa]
    .filter(([, ms]) => ms.some((m) => m.cantidad > 0))
    .map(([empresa, materiales]) => ({ empresa, materiales }));
};

export const SIN_AGREGADOS = 'No hay stock de agregados registrado.';

export const textoMaterialesDe = (empresa: string, ms: Material[]): string => {
  const total = ms.reduce((s, m) => s + m.cantidad, 0);
  const lineas = [`📦 *Stock de agregados — ${empresa}*`];
  lineas.push(...ms.map((m) => `*- ${m.nombre}:* ${m.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 2 })} ${m.unidad}${m.reponer ? ' (⚠️ REPONER)' : ''}`));
  lineas.push(`*- Total:* ${total.toLocaleString('es-PE', { maximumFractionDigits: 2 })} m³`);
  return lineas.join('\n');
};

export const textoMateriales = (lista: Material[]): string => {
  const bloques = materialesPorEmpresa(lista).map(({ empresa, materiales: ms }) => textoMaterialesDe(empresa, ms));
  return bloques.length ? bloques.join('\n\n') : SIN_AGREGADOS;
};
