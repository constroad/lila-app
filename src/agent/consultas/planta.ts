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
  contenido: string;
  galones: number;
  capacidad: number;
  nivelCm: number;
}

const CONTENIDO: Record<string, string> = { pen: 'PEN (asfalto)', gasohol: 'Gasohol', petroleum: 'Petróleo', petroleo: 'Petróleo' };

export const tanques = async (): Promise<Tanque[]> => {
  const Tank = await getControlTankModel();
  const docs = (await Tank.find({ companyId: COMPANY_PILOTO, measurementEnabled: { $ne: false } })
    .select('name contentType volumeInStock volume levelCentimeter')
    .lean()) as Doc[];
  return docs
    .map((d) => ({
      nombre: String(d.name || ''),
      contenido: CONTENIDO[String(d.contentType || '').toLowerCase()] || String(d.contentType || 'otro'),
      galones: num(d.volumeInStock),
      capacidad: num(d.volume),
      nivelCm: num(d.levelCentimeter),
    }))
    .sort((a, b) => a.contenido.localeCompare(b.contenido) || a.nombre.localeCompare(b.nombre));
};

export const textoTanques = (lista: Tanque[]): string => {
  if (lista.length === 0) return 'No hay tanques con medición registrada.';
  const porContenido = new Map<string, Tanque[]>();
  for (const t of lista) porContenido.set(t.contenido, [...(porContenido.get(t.contenido) ?? []), t]);
  const lineas = ['⛽ *Tanques de planta* (galones disponibles)'];
  for (const [contenido, ts] of porContenido) {
    const total = ts.reduce((s, t) => s + t.galones, 0);
    lineas.push('', `*${contenido}* — ${r1(total)} gl`);
    lineas.push(...ts.map((t) => `• ${t.nombre}: ${r1(t.galones)} gl (${t.nivelCm} cm, de ${r1(t.capacidad)})`));
  }
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
  nombre: string;
  cantidad: number;
  unidad: string;
}

export const materiales = async (): Promise<Material[]> => {
  const Mat = await getMaterialModel();
  const docs = (await Mat.find({ companyId: COMPANY_PILOTO }).select('name quantity unit').sort({ name: 1 }).lean()) as Doc[];
  return docs.map((d) => ({ nombre: String(d.name || ''), cantidad: num(d.quantity), unidad: String(d.unit || '') }));
};

export const textoMateriales = (lista: Material[]): string => {
  if (lista.length === 0) return 'No hay materiales registrados para la planta.';
  const lineas = ['🪨 *Agregados en stock*', ...lista.map((m) => `• ${m.nombre}: ${r1(m.cantidad)} ${m.unidad}`)];
  // La verdad antes que un número bonito: si todo está en cero, el kardex no se
  // lleva, y decir «0 m³» como si fuera un dato sería peor que decir que no hay.
  if (lista.every((m) => m.cantidad === 0)) {
    lineas.push('', '⚠️ Todo figura en 0: el kardex de agregados no tiene movimientos registrados. Estos números no reflejan el stock real.');
  }
  return lineas.join('\n');
};
