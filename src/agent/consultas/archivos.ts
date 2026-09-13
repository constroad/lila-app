import { getMediaModel, getPublicLinkModel } from '../../database/models.js';

/**
 * Lo que hay ARCHIVADO de un día: fotos y videos de un despacho, guías y vales
 * de un pedido, y el enlace del cliente. Solo lectura, y solo estos tipos: el
 * resto de `media` (gastos, asistencia, tanques) no existe para el agente.
 */

export interface Archivo {
  tipo: 'image' | 'video' | 'document';
  url: string;
  nombre: string;
  fechaMs: number;
  mime: string;
}

type Doc = Record<string, unknown>;

const aArchivo = (d: Doc): Archivo | null => {
  const mime = String(d.mimeTye || d.mimeType || '');
  const url = String(d.url || (d.metadata as Doc | undefined)?.lilaAppUrl || '');
  if (!url) return null;
  const tipo: Archivo['tipo'] = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : 'document';
  return {
    tipo,
    url,
    nombre: String(d.name || ''),
    fechaMs: d.date ? new Date(d.date as string).getTime() : 0,
    mime,
  };
};

/** Fotos y videos de UN despacho (`DISPATCH_PICTURES` con `metadata.dispatchId`). */
export const mediaDelDespacho = async (companyId: string, orderId: string, dispatchId: string): Promise<Archivo[]> => {
  const Media = await getMediaModel();
  const docs = (await Media.find({
    companyId,
    resourceId: orderId,
    type: 'DISPATCH_PICTURES',
    'metadata.dispatchId': dispatchId,
  })
    .select('name mimeTye url metadata date')
    .sort({ date: 1 })
    .lean()) as Doc[];
  return docs.map(aArchivo).filter((a): a is Archivo => Boolean(a));
};

/** Guías de remisión y vales (PDF) de UN pedido. */
export const guiasDelPedido = async (companyId: string, orderId: string): Promise<Archivo[]> => {
  const Media = await getMediaModel();
  const docs = (await Media.find({ companyId, resourceId: orderId, type: { $in: ['GUIA', 'VALE'] } })
    .select('name mimeTye url metadata date type')
    .sort({ date: 1 })
    .lean()) as Doc[];
  return docs
    .map((d) => {
      const a = aArchivo(d);
      return a ? { ...a, nombre: `${d.type === 'GUIA' ? 'Guía' : 'Vale'} · ${a.nombre}` } : null;
    })
    .filter((a): a is Archivo => Boolean(a));
};

/**
 * El enlace del cliente para un pedido, SI YA EXISTE. Crearlo es una escritura
 * en Portal (`POST /api/public-link`, con sesión de admin): por ahora el agente
 * no crea enlaces, los encuentra.
 */
export const enlaceDelPedido = async (
  companyId: string,
  orderId: string,
  companySlug: string
): Promise<{ url: string; tabs: string[] } | null> => {
  const PublicLink = await getPublicLinkModel();
  const doc = (await PublicLink.findOne({
    companyId,
    scope: 'client-report',
    resourceType: 'order',
    resourceId: orderId,
    revokedAt: { $exists: false },
  })
    .select('token permissions expiresAt')
    .sort({ createdAt: -1 })
    .lean()) as Doc | null;
  if (!doc?.token) return null;
  const expira = doc.expiresAt ? new Date(doc.expiresAt as string).getTime() : 0;
  if (expira && expira < Date.now()) return null;
  const tabs = Object.entries(((doc.permissions as Doc | undefined)?.tabs as Record<string, boolean>) || {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  return {
    url: `https://www.constroad.com/public/${companySlug}/client-report/order?token=${String(doc.token)}`,
    tabs,
  };
};
