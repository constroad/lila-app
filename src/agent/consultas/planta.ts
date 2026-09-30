import { getConsumeModel, getControlTankModel, getMaterialModel } from '../../database/models.js';
import { COMPANY_PILOTO } from '../checklist/alcance.js';
import { fechaLegible } from '../checklist/tiempo.js';
import { normalizar, sumarDias } from './catalogo.js';
import { puntajeDeSenas, senasDeLaPregunta } from './responder.js';

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
  /** Las obras de esos pedidos: la gente nombra la obra («las lomas») tanto como el cliente. */
  obras?: string[];
  m3: number;
  porTanque: Array<{ tanque: string; galones: number; glPorM3: number; contenido?: Tanque['contenido'] }>;
  totalGalones: number;
}

/**
 * LO QUE SE PIDE CUANDO SE PIDE UN CONSUMO. 30/09, 07:25, Globofast: «el
 * consumo del cemento asfáltico del 14, 15 y 16 de setiembre en la obra las
 * lomas» → salió el 16 solo, con los seis tanques. El consumo se pide por
 * DÍAS (uno o varios), por LÍQUIDO (cemento asfáltico = PEN; gasohol; petróleo
 * de los grupos y la planta) y por OBRA.
 */
export type Liquido = 'pen' | 'gasohol' | 'petroleo';

const NOMBRE_LIQUIDO: Record<Liquido, string> = { pen: 'cemento asfáltico (PEN)', gasohol: 'gasohol', petroleo: 'petróleo' };

/** El líquido que nombra la pregunta, si alguno. Sin líquido nombrado, van todos los tanques. */
export const liquidoDe = (pregunta: string): Liquido | undefined => {
  const t = normalizar(pregunta);
  if (/\b(cemento asfaltico|pen|asfalto liquido)\b/.test(t)) return 'pen';
  if (/\bgaso?h?ol\b/.test(t)) return 'gasohol';
  if (/\b(petroleo|diesel)\b/.test(t)) return 'petroleo';
  return undefined;
};

const claveDeTanque = (nombre: string): string => String(nombre || '').toUpperCase().replace(/#/g, '').replace(/\s+/g, ' ').trim();

/**
 * Qué hay en el tanque de un consumo: lo que dice su ficha en Portal («Control
 * de tanques», `contentType`) y, si no la hay, su nombre («INFRA PEN #2»).
 */
export const contenidoDeTanque = (nombre: string, porNombre: ReadonlyMap<string, Tanque['contenido']> = new Map()): Tanque['contenido'] => {
  const t = claveDeTanque(nombre);
  const conocido = porNombre.get(t);
  if (conocido) return conocido;
  if (/\bPEN\b/.test(t)) return 'pen';
  if (/\bGASO?H?OL\b/.test(t)) return 'gasohol';
  if (/\b(PETROLEO|DIESEL)\b/.test(t)) return 'petroleo';
  return 'otro';
};

/** Más de dos meses de consumos no entran en un mensaje de WhatsApp. */
export const MAX_DIAS_CONSUMO = 62;
export const diasDelRango = (desde: string, hasta: string): number => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1;

const diaLima = (ms: number): string => new Date(ms - 5 * 3_600_000).toISOString().slice(0, 10);

/** Los consumos registrados entre dos días (calendario peruano), ambos incluidos. Puede haber más de uno por día. */
export const consumosDelRango = async (desde: string, hasta: string): Promise<ConsumoProduccion[]> => {
  const [Consume, Tank] = await Promise.all([getConsumeModel(), getControlTankModel()]);
  const inicio = new Date(`${desde}T00:00:00.000-05:00`);
  const fin = new Date(new Date(`${hasta}T00:00:00.000-05:00`).getTime() + 24 * 3_600_000);
  const [consumos, fichas] = await Promise.all([
    Consume.find({
      companyId: COMPANY_PILOTO,
      $or: [{ date: { $gte: inicio, $lt: fin } }, { periodStart: { $gte: inicio, $lt: fin } }],
    })
      .select('date periodStart orders computedM3 totalCubes measures')
      .sort({ date: 1 })
      .lean(),
    Tank.find({ companyId: COMPANY_PILOTO }).select('name contentType').lean(),
  ]);
  const docs = consumos as Doc[];
  const porNombre = new Map<string, Tanque['contenido']>();
  for (const f of fichas as Doc[]) {
    const contenido = CONTENIDO[String(f.contentType || '').toLowerCase()];
    if (contenido) porNombre.set(claveDeTanque(String(f.name || '')), contenido);
  }
  const enRango = (v: unknown): boolean => {
    const ms = v ? new Date(v as string).getTime() : NaN;
    return Number.isFinite(ms) && ms >= inicio.getTime() && ms < fin.getTime();
  };
  return docs
    .map((d) => {
      const cuando = enRango(d.date) ? d.date : enRango(d.periodStart) ? d.periodStart : null;
      const m3 = num(d.computedM3) || num(d.totalCubes);
      const medidas = (Array.isArray(d.measures) ? d.measures : []) as Doc[];
      const porTanque = medidas.map((m) => {
        const galones = num(m.quantityConsumed);
        const tanque = String(m.tank || '');
        return { tanque, galones, glPorM3: m3 > 0 ? galones / m3 : 0, contenido: contenidoDeTanque(tanque, porNombre) };
      });
      const pedidos = ((d.orders as Doc[] | undefined) ?? []) as Doc[];
      return {
        fecha: cuando ? diaLima(new Date(cuando as string).getTime()) : desde,
        pedidos: pedidos.map((o) => String(o.orderClient || o.orderName || '')).filter(Boolean),
        obras: pedidos.map((o) => String(o.orderName || '')).filter(Boolean),
        m3,
        porTanque,
        totalGalones: porTanque.reduce((s, t) => s + t.galones, 0),
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
};

/** Los consumos registrados para un día (calendario peruano). */
export const consumosDelDia = (fecha: string): Promise<ConsumoProduccion[]> => consumosDelRango(fecha, fecha);

/** En una pregunta de consumos, estas palabras no nombran una obra. */
const NO_NOMBRAN_OBRA = ['consumo', 'consumos', 'consumio', 'consumieron', 'cemento', 'asfaltico', 'asfalto', 'liquido', 'galones', 'gasohol', 'gashol', 'petroleo', 'diesel', 'gastamos', 'gasto', 'usaron', 'dias', 'planta', 'cuanto', 'cuanta'];

/**
 * LA OBRA O EL CLIENTE NOMBRADOS ELIGEN LOS CONSUMOS, con las mismas señas que
 * eligen un pedido (`porSenasDeLaPregunta`). Si la pregunta dice «obra»,
 * «cliente» o «consorcio» y ninguna coincide, quedan todos y se avisa: mandar
 * los de otra obra como si fueran los pedidos sería peor que decir que no está.
 */
export const consumosDeLaObra = (lista: ConsumoProduccion[], pregunta: string): { lista: ConsumoProduccion[]; obra?: string; noEncontrada: boolean } => {
  const senas = senasDeLaPregunta(pregunta, NO_NOMBRAN_OBRA);
  if (!senas.length || !lista.length) return { lista, obra: undefined, noEncontrada: false };
  const puntaje = (c: ConsumoProduccion): number => puntajeDeSenas([...c.pedidos, ...(c.obras ?? [])].join(' '), senas);
  const mejor = Math.max(...lista.map(puntaje));
  if (mejor > 0) {
    const elegidos = lista.filter((c) => puntaje(c) === mejor);
    return { lista: elegidos, obra: [...new Set(elegidos.flatMap((c) => c.pedidos))].join(', ') || undefined, noEncontrada: false };
  }
  return { lista, obra: undefined, noEncontrada: /\b(obra|cliente|consorcio|proyecto)\b/.test(normalizar(pregunta)) };
};

export interface OpcionesConsumo {
  /** Último día del rango; sin él, un día. */
  hasta?: string;
  liquido?: Liquido;
  /** La obra o el cliente que eligió los consumos (va arriba y no en cada línea). */
  obra?: string;
  obraNoEncontrada?: boolean;
  /** Hoy (Lima): un día que todavía no llega no es «sin consumo registrado». */
  hoy?: string;
}

const glPorM3 = (n: number): string => (Math.round(n * 1000) / 1000).toLocaleString('es-PE');

/** Hasta una semana se dice qué día no tuvo consumo; en un mes, solo los días que sí. */
const DIAS_CON_VACIOS = 7;

export const textoConsumos = (lista: ConsumoProduccion[], desde: string, o: OpcionesConsumo = {}): string => {
  const hasta = o.hasta && o.hasta > desde ? o.hasta : desde;
  const unDia = hasta === desde;
  const tramo = unDia ? fechaLegible(desde) : `${fechaLegible(desde)} al ${fechaLegible(hasta)}`;
  const cuando = unDia ? `para ${tramo}` : `del ${tramo}`;
  if (lista.length === 0) return `No hay consumo registrado ${cuando}. Se registra en Portal → Consumos.`;

  // Solo los tanques del líquido pedido; una producción sin ese líquido no cuenta.
  const usar = o.liquido
    ? lista
        .map((c) => {
          const porTanque = c.porTanque.filter((t) => (t.contenido ?? contenidoDeTanque(t.tanque)) === o.liquido);
          return { ...c, porTanque, totalGalones: porTanque.reduce((s, t) => s + t.galones, 0) };
        })
        .filter((c) => c.porTanque.length > 0)
    : lista;
  const que = o.liquido ? NOMBRE_LIQUIDO[o.liquido] : null;
  if (usar.length === 0) return `No hay consumo de ${que} registrado ${cuando}. Se registra en Portal → Consumos.`;

  const titulo = que ? `🛢 *Consumo de ${que} — ${tramo}*` : `🛢 *Consumos ${unDia ? 'de' : 'del'} ${tramo}*`;
  const partes = [`${titulo}${o.obra && !unDia ? `\n${o.obra}` : ''}`];
  if (o.obraNoEncontrada) partes.push('_No encuentro consumos de esa obra en esas fechas; estos son todos los registrados._');

  if (unDia) {
    partes.push(
      ...usar.map((c, i) => {
        const nombre = usar.length > 1 ? `*Consumo ${i + 1}* (${c.pedidos.join(', ') || 'sin pedido'})` : `*${c.pedidos.join(', ') || 'Producción'}*`;
        return [`${nombre} — ${r1(c.m3)} m³, ${r1(c.totalGalones)} gl en total`, ...c.porTanque.map((t) => `• ${t.tanque}: ${r1(t.galones)} gl · ${glPorM3(t.glPorM3)} gl/m³`)].join('\n');
      })
    );
    return partes.join('\n\n');
  }

  // Varios días: una línea por consumo, en orden, y el total del tramo por tanque.
  const porDia = new Map<string, ConsumoProduccion[]>();
  for (const c of usar) porDia.set(c.fecha, [...(porDia.get(c.fecha) ?? []), c]);
  const conVacios = diasDelRango(desde, hasta) <= DIAS_CON_VACIOS;
  const lineas: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const delDia = porDia.get(f) ?? [];
    if (!delDia.length) {
      if (conVacios && (!o.hoy || f <= o.hoy)) lineas.push(`• ${fechaLegible(f)} — sin consumo registrado`);
      continue;
    }
    for (const c of delDia) {
      const quien = o.obra ? '' : ` · ${c.pedidos.join(', ') || 'sin pedido'}`;
      lineas.push(`• ${fechaLegible(f)}${quien} — ${r1(c.m3)} m³ · ${r1(c.totalGalones)} gl · ${glPorM3(c.m3 > 0 ? c.totalGalones / c.m3 : 0)} gl/m³`);
    }
  }
  partes.push(lineas.join('\n'));

  const m3 = usar.reduce((s, c) => s + c.m3, 0);
  const galones = usar.reduce((s, c) => s + c.totalGalones, 0);
  const porTanque = new Map<string, number>();
  for (const c of usar) for (const t of c.porTanque) porTanque.set(t.tanque, (porTanque.get(t.tanque) ?? 0) + t.galones);
  partes.push([`*Total:* ${r1(m3)} m³ · ${r1(galones)} gl · ${glPorM3(m3 > 0 ? galones / m3 : 0)} gl/m³`, ...[...porTanque].map(([t, g]) => `• ${t}: ${r1(g)} gl`)].join('\n'));
  return partes.join('\n\n');
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
