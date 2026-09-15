/**
 * La cubicación de un volquete: lo que el Portal guarda en `transports`
 * (Transportes → Cubicar): `m3` (capacidad de la tolva), `shape` (cuadrada o
 * cóncava, según las medidas que se tomaron) y `cubicator` (quién midió).
 *
 * Solo lectura y acotada a la empresa del pedido: una placa puede existir en
 * dos empresas (el mismo volquete alquilado a las dos) y el cubicaje de una no
 * es el de la otra.
 */
import { getTransportModel } from '../../database/models.js';
import { normalizarPlaca } from './catalogo.js';
import type { PedidoDelDiaVista, UnidadDelDia } from './vista.js';

/**
 * La empresa del pedido de la unidad. `unidadPor` devuelve una COPIA de la
 * unidad con su `pedido` adentro: buscarla por referencia en `vista.orders`
 * (`units.includes(u)`) nunca daba, el companyId salía vacío y la cubicación
 * «no existía» con la ficha cargada (15/09, 18:36, A1Y825 = 26,41 m³).
 */
export const empresaDeLaUnidad = (u: UnidadDelDia & { pedido?: PedidoDelDiaVista }): string => u.pedido?.companyId ?? '';

export interface Cubicacion {
  plate: string;
  m3: number | null;
  shape?: string;
  cubicator?: string;
}

type Doc = Record<string, unknown>;
const texto = (v: unknown): string => String(v ?? '').trim();
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** PURO: de un documento del Portal a lo que se contesta. */
export const cubicacionDeDoc = (d: Doc | null): Cubicacion | null =>
  d
    ? {
        plate: texto(d.plate),
        m3: num(d.m3),
        shape: texto(d.shape) || undefined,
        cubicator: texto(d.cubicator) || undefined,
      }
    : null;

export const buscarCubicacion = async (p: { companyId: string; transportId?: string; plate?: string }): Promise<Cubicacion | null> => {
  if (!p.companyId) return null;
  const Transport = await getTransportModel();
  const select = 'plate m3 shape cubicator';
  if (p.transportId && /^[a-f\d]{24}$/i.test(p.transportId)) {
    const doc = (await Transport.findOne({ _id: p.transportId, companyId: p.companyId }).select(select).lean()) as Doc | null;
    if (doc) return cubicacionDeDoc(doc);
  }
  const placa = normalizarPlaca(p.plate ?? '');
  if (!placa) return null;
  // La placa en el Portal puede llevar espacio o guion: se compara normalizada
  // sobre los pocos volquetes de la empresa, no con un regex sobre la colección.
  const docs = (await Transport.find({ companyId: p.companyId }).select(select).limit(500).lean()) as Doc[];
  return cubicacionDeDoc(docs.find((d) => normalizarPlaca(texto(d.plate)) === placa) ?? null);
};
