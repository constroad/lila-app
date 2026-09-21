import { getCompanyModel, getDispatchModel, getOrderModel } from '../../database/models.js';
import { EMPRESAS_CON_PEDIDOS } from '../checklist/alcance.js';
import { diaPeruano, instanteArranque } from '../checklist/tiempo.js';

/**
 * EL READ MODEL DEL DÍA (spec §6.2): lo ÚNICO que el agente puede ver.
 *
 * Es una lista blanca antes que una optimización. Un despacho en la base trae
 * `driverPhoneNumber`, `driverLicense`, `driverCard`; acá no existen. Ningún
 * campo llega a una respuesta si no está en este tipo, y este tipo se revisa en
 * un solo lugar.
 *
 * Cache-aside (spec §6.3 opción a): se recalcula al pedirlo y se recuerda 60 s.
 * El volumen de preguntas es ínfimo comparado con el de escrituras, y el
 * documento es chico.
 */

export interface UnidadDelDia {
  dispatchId: string;
  unitNumber: number;
  plate: string;
  /** El volquete del Portal (`transports`), para su cubicación. */
  transportId?: string;
  driverName: string;
  state: 'pendiente' | 'progreso' | 'despachado';
  quantity: number;
  departedAt?: number;
  arrivalAt?: number;
  picturesCount: number;
}

export interface PedidoDelDiaVista {
  orderId: string;
  /** El día (Lima) del pedido: en una vista de varios días, cada pedido trae el suyo. */
  fecha?: string;
  companyId: string;
  /** Para armar la URL pública: `/public/<slug>/…`. */
  companySlug: string;
  cliente: string;
  obra: string;
  cantidadCubos: number;
  m3Dispatched: number;
  hora: string;
  units: UnidadDelDia[];
}

export interface VistaDelDia {
  fecha: string;
  /** Si la vista abarca varios días (un mes, un año): el último. */
  hasta?: string;
  orders: PedidoDelDiaVista[];
  computedAt: number;
}

const CACHE_MS = 60_000;
const cache = new Map<string, VistaDelDia>();

let slugsCache: Map<string, string> | null = null;
const slugsDeEmpresas = async (): Promise<Map<string, string>> => {
  if (slugsCache) return slugsCache;
  const CompanyModel = await getCompanyModel();
  const docs = (await CompanyModel.find({ companyId: { $in: [...EMPRESAS_CON_PEDIDOS] } })
    .select('companyId slug')
    .lean()) as Array<{ companyId?: string; slug?: string }>;
  slugsCache = new Map(docs.map((d) => [String(d.companyId), String(d.slug || d.companyId)]));
  return slugsCache;
};

/** Solo para tests. */
export const _resetVista = (): void => {
  cache.clear();
  slugsCache = null;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const ms = (v: unknown): number | undefined => {
  if (!v) return undefined;
  const t = new Date(v as string).getTime();
  return Number.isFinite(t) ? t : undefined;
};

type Doc = Record<string, unknown>;

/** Los pedidos vivos de las empresas del agente entre dos instantes, con sus despachos. */
const leerPedidos = async (desdeMs: number, hastaMs: number): Promise<{ orders: Doc[]; dispatches: Doc[] }> => {
  const OrderModel = await getOrderModel();
  const DispatchModel = await getDispatchModel();
  const orders = (await OrderModel.find({
    companyId: { $in: [...EMPRESAS_CON_PEDIDOS] },
    fechaProgramacion: { $gte: new Date(desdeMs), $lt: new Date(hastaMs) },
    status: { $nin: ['eliminado', 'rechazado'] },
  })
    .select('companyId cliente alias obra cantidadCubos horaInicio fechaProgramacion')
    .lean()) as Doc[];
  const ids = orders.map((o) => String(o._id));
  const dispatches = ids.length
    ? ((await DispatchModel.find({ orderId: { $in: ids }, state: { $ne: 'eliminado' } })
        .select('orderId unitNumber plate driverName state quantity departedAt arrival pictures transportId')
        .lean()) as Doc[])
    : [];
  return { orders, dispatches };
};

const aVista = (o: Doc, dispatches: Doc[], slugs: Map<string, string>): PedidoDelDiaVista => {
  const units: UnidadDelDia[] = dispatches
    .filter((d) => String(d.orderId) === String(o._id))
    .map((d) => ({
      dispatchId: String(d._id),
      unitNumber: num(d.unitNumber),
      plate: String(d.plate || '').trim(),
      transportId: d.transportId ? String(d.transportId) : undefined,
      driverName: String(d.driverName || '').trim(),
      state: (['pendiente', 'progreso', 'despachado'].includes(String(d.state)) ? d.state : 'pendiente') as UnidadDelDia['state'],
      quantity: num(d.quantity),
      departedAt: ms(d.departedAt),
      arrivalAt: ms((d.arrival as { at?: unknown } | undefined)?.at),
      picturesCount: Array.isArray(d.pictures) ? d.pictures.length : 0,
    }))
    .sort((a, b) => a.unitNumber - b.unitNumber);
  return {
    orderId: String(o._id),
    fecha: diaPeruano(new Date(o.fechaProgramacion as Date).getTime()),
    companyId: String(o.companyId || ''),
    companySlug: slugs.get(String(o.companyId || '')) || String(o.companyId || ''),
    cliente: String(o.alias || o.cliente || '').trim(),
    obra: String(o.obra || '').trim(),
    cantidadCubos: num(o.cantidadCubos),
    m3Dispatched: units.filter((u) => u.state === 'despachado').reduce((s, u) => s + u.quantity, 0),
    hora: String(o.horaInicio || ''),
    units,
  };
};

export const construirVista = async (fecha: string, ahoraMs = Date.now()): Promise<VistaDelDia> => {
  const cacheada = cache.get(fecha);
  if (cacheada && ahoraMs - cacheada.computedAt < CACHE_MS) return cacheada;

  const slugs = await slugsDeEmpresas();
  const inicio = instanteArranque(fecha, '00:00') ?? ahoraMs;
  const fin = inicio + 24 * 3_600_000;
  // La ventana es generosa a propósito para no perder un pedido por la zona
  // horaria; después quedan solo los que caen en ESTE día peruano.
  const { orders, dispatches } = await leerPedidos(inicio - 12 * 3_600_000, fin);
  const vista: VistaDelDia = {
    fecha,
    computedAt: ahoraMs,
    orders: orders.map((o) => aVista(o, dispatches, slugs)).filter((o) => o.fecha === fecha),
  };
  cache.set(fecha, vista);
  return vista;
};

/**
 * LA VISTA DE UN TRAMO («enero», «este año»): los pedidos de esos días, en
 * orden, cada uno con su fecha. Para ubicar un pedido pasado por su obra o su
 * cliente (el enlace del pedido de enero de Pueblo Libre, 21/09).
 */
export const construirVistaPeriodo = async (desde: string, hasta: string, ahoraMs = Date.now()): Promise<VistaDelDia> => {
  const clave = `${desde}..${hasta}`;
  const cacheada = cache.get(clave);
  if (cacheada && ahoraMs - cacheada.computedAt < CACHE_MS) return cacheada;

  const slugs = await slugsDeEmpresas();
  const inicio = instanteArranque(desde, '00:00') ?? ahoraMs;
  const fin = (instanteArranque(hasta, '00:00') ?? ahoraMs) + 24 * 3_600_000;
  const { orders, dispatches } = await leerPedidos(inicio - 12 * 3_600_000, fin + 12 * 3_600_000);
  const vista: VistaDelDia = {
    fecha: desde,
    hasta,
    computedAt: ahoraMs,
    orders: orders
      .map((o) => aVista(o, dispatches, slugs))
      .filter((o) => o.fecha! >= desde && o.fecha! <= hasta)
      .sort((a, b) => a.fecha!.localeCompare(b.fecha!) || a.hora.localeCompare(b.hora)),
  };
  cache.set(clave, vista);
  return vista;
};
