import {
  getClientModel,
  getCompanyModel,
  getDispatchModel,
  getKardexModel,
  getMaterialModel,
  getOrderModel,
  getProviderModel,
} from '../../database/models.js';
import { EMPRESAS_CON_PEDIDOS } from '../checklist/alcance.js';
import { diaPeruano, instanteArranque } from '../checklist/tiempo.js';

/**
 * LOS DATOS DE LAS HERRAMIENTAS NUEVAS: clientes, proveedores, historial de
 * pedidos y kardex. Solo lectura, solo las empresas del piloto, y cada tipo de
 * acá es una LISTA BLANCA: un cliente en la base tiene cuentas bancarias y
 * números de notificación; acá no existen. Un movimiento del kardex tiene
 * valor y costo unitario; acá no (lista negra §7.5: precios). Nada llega a una
 * respuesta si no está en estos tipos.
 */

type Doc = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const texto = (v: unknown): string => String(v ?? '').trim();
const EMPRESAS = [...EMPRESAS_CON_PEDIDOS] as string[];

/**
 * Regex «contiene todas las palabras», sin tildes ni mayúsculas. Solo letras y
 * números llegan al patrón (lo demás separa palabras), así que lo que escribió
 * la persona no puede ser una regex. La base tiene tildes y la pregunta puede
 * no tenerlas (o al revés), y «cobenas» tiene que encontrar a COBEÑAS.
 */
export const patronDeBusqueda = (nombre: string): RegExp => {
  const CLASES: Record<string, string> = { a: '[aáÁ]', e: '[eéÉ]', i: '[iíÍ]', o: '[oóÓ]', u: '[uúÚ]', n: '[nñÑ]' };
  const palabras = String(nombre || '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 2)
    .map((p) => p.replace(/[aeioun]/g, (l) => CLASES[l] ?? l));
  return new RegExp(palabras.map((p) => `(?=.*${p})`).join('') || '.^', 'i');
};

let nombresCache: Map<string, string> | null = null;
/** companyId → nombre visible («Globofast Solkali»). */
export const nombresDeEmpresas = async (): Promise<Map<string, string>> => {
  if (nombresCache) return nombresCache;
  const CompanyModel = await getCompanyModel();
  const docs = (await CompanyModel.find({ companyId: { $in: EMPRESAS } }).select('companyId name').lean()) as Array<{ companyId?: string; name?: string }>;
  nombresCache = new Map(docs.map((d) => [String(d.companyId), String(d.name || d.companyId)]));
  return nombresCache;
};

// ---------- Clientes ----------

export interface PedidoBreve {
  fecha: string;
  obra: string;
  m3: number;
}

export interface ClienteFicha {
  empresa: string;
  nombre: string;
  alias: string;
  ruc: string;
  contacto: string;
  telefono: string;
  email: string;
  direccion: string;
  ultimosPedidos: PedidoBreve[];
}

const fechaDe = (v: unknown): string => {
  const ms = new Date(v as string).getTime();
  return Number.isFinite(ms) ? diaPeruano(ms) : '';
};

export const buscarClientes = async (nombre: string, limite = 4): Promise<ClienteFicha[]> => {
  const [Client, Order, nombres] = await Promise.all([getClientModel(), getOrderModel(), nombresDeEmpresas()]);
  const patron = patronDeBusqueda(nombre);
  const docs = (await Client.find({ companyId: { $in: EMPRESAS }, $or: [{ name: patron }, { alias: patron }] })
    .select('companyId name alias ruc contactPerson address phone email')
    .limit(limite)
    .lean()) as Doc[];
  return Promise.all(
    docs.map(async (d) => {
      const pedidos = (await Order.find({
        companyId: String(d.companyId),
        $or: [{ clienteId: String(d._id) }, { cliente: texto(d.name) }],
        status: { $nin: ['eliminado', 'rechazado'] },
      })
        .select('fechaProgramacion obra cantidadCubos')
        .sort({ fechaProgramacion: -1 })
        .limit(3)
        .lean()) as Doc[];
      return {
        empresa: nombres.get(String(d.companyId)) || String(d.companyId),
        nombre: texto(d.name),
        alias: texto(d.alias),
        ruc: texto(d.ruc),
        contacto: texto(d.contactPerson),
        telefono: texto(d.phone),
        email: texto(d.email),
        direccion: texto(d.address),
        ultimosPedidos: pedidos.map((p) => ({ fecha: fechaDe(p.fechaProgramacion), obra: texto(p.obra), m3: num(p.cantidadCubos) })),
      };
    })
  );
};

// ---------- Proveedores ----------

export interface ProveedorFicha {
  empresa: string;
  nombre: string;
  alias: string;
  ruc: string;
  contacto: string;
  telefono: string;
  email: string;
  direccion: string;
  rubros: string[];
  etiquetas: string[];
}

export const buscarProveedores = async (nombre: string, limite = 4): Promise<ProveedorFicha[]> => {
  const [Provider, nombres] = await Promise.all([getProviderModel(), nombresDeEmpresas()]);
  const patron = patronDeBusqueda(nombre);
  const docs = (await Provider.find({
    companyId: { $in: EMPRESAS },
    $or: [{ name: patron }, { alias: patron }, { tags: patron }, { description: patron }],
  })
    .select('companyId name alias ruc contactPerson address phone email sellsMaterials transportsMaterials tags')
    .limit(limite)
    .lean()) as Doc[];
  return docs.map((d) => ({
    empresa: nombres.get(String(d.companyId)) || String(d.companyId),
    nombre: texto(d.name),
    alias: texto(d.alias),
    ruc: texto(d.ruc),
    contacto: texto(d.contactPerson),
    telefono: texto(d.phone),
    email: texto(d.email),
    direccion: texto(d.address),
    rubros: [d.sellsMaterials ? 'vende materiales' : '', d.transportsMaterials ? 'transporta materiales' : ''].filter(Boolean),
    etiquetas: Array.isArray(d.tags) ? (d.tags as unknown[]).map(texto).filter(Boolean) : [],
  }));
};

// ---------- Historial de pedidos ----------

export interface PedidoHistorial {
  fecha: string;
  hora: string;
  empresa: string;
  cliente: string;
  obra: string;
  m3Pedidos: number;
  m3Despachados: number;
  estado: string;
}

export interface Historial {
  desde: string;
  hasta: string;
  pedidos: PedidoHistorial[];
  totalM3Pedidos: number;
  totalM3Despachados: number;
  /** Había más de los que se muestran. */
  truncado: boolean;
}

export const LIMITE_HISTORIAL = 30;

export const pedidosEntre = async (
  filtro: { desde: string; hasta: string; companyId?: string; cliente?: string }
): Promise<Historial> => {
  const [Order, Dispatch, nombres] = await Promise.all([getOrderModel(), getDispatchModel(), nombresDeEmpresas()]);
  const inicio = instanteArranque(filtro.desde, '00:00') ?? Date.now();
  const fin = (instanteArranque(filtro.hasta, '00:00') ?? Date.now()) + 24 * 3_600_000;
  const consulta: Doc = {
    companyId: filtro.companyId ? filtro.companyId : { $in: EMPRESAS },
    fechaProgramacion: { $gte: new Date(inicio - 12 * 3_600_000), $lt: new Date(fin) },
    status: { $nin: ['eliminado', 'rechazado'] },
  };
  if (filtro.cliente) {
    const patron = patronDeBusqueda(filtro.cliente);
    consulta.$or = [{ cliente: patron }, { alias: patron }];
  }
  const docs = (await Order.find(consulta)
    .select('companyId cliente alias obra cantidadCubos horaInicio fechaProgramacion status')
    .sort({ fechaProgramacion: 1 })
    .limit(LIMITE_HISTORIAL + 1)
    .lean()) as Doc[];
  const enRango = docs.filter((o) => {
    const dia = fechaDe(o.fechaProgramacion);
    return dia >= filtro.desde && dia <= filtro.hasta;
  });
  const truncado = enRango.length > LIMITE_HISTORIAL;
  const mostrados = enRango.slice(0, LIMITE_HISTORIAL);
  const ids = mostrados.map((o) => String(o._id));
  const despachos = ids.length
    ? ((await Dispatch.find({ orderId: { $in: ids }, state: 'despachado' }).select('orderId quantity').lean()) as Doc[])
    : [];
  const despachadoPor = new Map<string, number>();
  for (const d of despachos) despachadoPor.set(String(d.orderId), (despachadoPor.get(String(d.orderId)) ?? 0) + num(d.quantity));
  const pedidos = mostrados.map((o) => ({
    fecha: fechaDe(o.fechaProgramacion),
    hora: texto(o.horaInicio),
    empresa: nombres.get(String(o.companyId)) || String(o.companyId),
    cliente: texto(o.alias) || texto(o.cliente),
    obra: texto(o.obra),
    m3Pedidos: num(o.cantidadCubos),
    m3Despachados: despachadoPor.get(String(o._id)) ?? 0,
    estado: texto(o.status) || 'pendiente',
  }));
  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    pedidos,
    totalM3Pedidos: pedidos.reduce((s, p) => s + p.m3Pedidos, 0),
    totalM3Despachados: pedidos.reduce((s, p) => s + p.m3Despachados, 0),
    truncado,
  };
};

// ---------- Kardex ----------

export interface MovimientoKardex {
  fecha: string;
  tipo: 'Ingreso' | 'Salida';
  cantidad: number;
  saldo: number;
  /** Proveedor, pedido o descripción: de dónde vino o a dónde fue. */
  detalle: string;
}

export interface KardexDeMaterial {
  empresa: string;
  material: string;
  unidad: string;
  desde: string;
  hasta: string;
  movimientos: MovimientoKardex[];
  totalIngresos: number;
  totalSalidas: number;
  cantidadIngresos: number;
  cantidadSalidas: number;
  saldoActual: number;
  truncado: boolean;
}

export const LIMITE_KARDEX = 25;

export const movimientosDeMaterial = async (
  filtro: { material: string; desde: string; hasta: string; companyId?: string }
): Promise<KardexDeMaterial[]> => {
  const [Material, Kardex, nombres] = await Promise.all([getMaterialModel(), getKardexModel(), nombresDeEmpresas()]);
  const materiales = (await Material.find({
    companyId: filtro.companyId ? filtro.companyId : { $in: EMPRESAS },
    name: patronDeBusqueda(filtro.material),
  })
    .select('companyId name unit quantity')
    .limit(6)
    .lean()) as Doc[];
  if (materiales.length === 0) return [];
  const inicio = new Date((instanteArranque(filtro.desde, '00:00') ?? Date.now()) - 12 * 3_600_000);
  const fin = new Date((instanteArranque(filtro.hasta, '00:00') ?? Date.now()) + 36 * 3_600_000);
  return Promise.all(
    materiales.map(async (m) => {
      // `date` vive como Date o como texto ISO según quién lo escribió: se
      // piden las dos formas y se filtra por día peruano después.
      const docs = (await Kardex.find({
        companyId: String(m.companyId),
        materialId: String(m._id),
        status: { $ne: 'deleted' },
        $or: [{ date: { $gte: inicio, $lt: fin } }, { date: { $gte: inicio.toISOString(), $lt: fin.toISOString() } }],
      })
        .select('type quantity balanceQuantity date description providerName vendorProviderName orderId purchaseOrderNumber')
        .sort({ date: 1, createdAt: 1 })
        .limit(LIMITE_KARDEX + 1)
        .lean()) as Doc[];
      const enRango = docs.filter((d) => {
        const dia = fechaDe(d.date);
        return dia >= filtro.desde && dia <= filtro.hasta;
      });
      const mostrados = enRango.slice(0, LIMITE_KARDEX);
      const movimientos: MovimientoKardex[] = mostrados.map((d) => ({
        fecha: fechaDe(d.date),
        tipo: texto(d.type) === 'Salida' ? 'Salida' : 'Ingreso',
        cantidad: num(d.quantity),
        saldo: num(d.balanceQuantity),
        detalle:
          texto(d.providerName) || texto(d.vendorProviderName) || texto(d.description) || (d.orderId ? 'pedido' : '') || (d.purchaseOrderNumber ? `OC ${texto(d.purchaseOrderNumber)}` : ''),
      }));
      const ingresos = movimientos.filter((x) => x.tipo === 'Ingreso');
      const salidas = movimientos.filter((x) => x.tipo === 'Salida');
      return {
        empresa: nombres.get(String(m.companyId)) || String(m.companyId),
        material: texto(m.name).toUpperCase(),
        unidad: texto(m.unit).replace(/^m3$/i, 'm³') || 'm³',
        desde: filtro.desde,
        hasta: filtro.hasta,
        movimientos,
        totalIngresos: ingresos.reduce((s, x) => s + x.cantidad, 0),
        totalSalidas: salidas.reduce((s, x) => s + x.cantidad, 0),
        cantidadIngresos: ingresos.length,
        cantidadSalidas: salidas.length,
        saldoActual: num(m.quantity),
        truncado: enRango.length > LIMITE_KARDEX,
      };
    })
  );
};
