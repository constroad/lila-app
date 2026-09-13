import { getMediaModel, getPublicLinkModel, getServiceReportModel } from '../../database/models.js';

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
  /** La empresa DUEÑA del archivo: el storage está aislado por empresa y hay que leerlo con la suya. */
  companyId: string;
  /** Un archivo generado en memoria (una imagen renderizada): no se lee de ningún storage. */
  buffer?: Buffer;
  /** Texto que acompaña al archivo en WhatsApp. */
  caption?: string;
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
    companyId: String(d.companyId || ''),
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
    .select('name mimeTye url metadata date companyId')
    .sort({ date: 1 })
    .lean()) as Doc[];
  return docs.map(aArchivo).filter((a): a is Archivo => Boolean(a));
};

/** Guías de remisión y vales (PDF) de UN pedido. */
export const guiasDelPedido = async (companyId: string, orderId: string): Promise<Archivo[]> => {
  const Media = await getMediaModel();
  const docs = (await Media.find({ companyId, resourceId: orderId, type: { $in: ['GUIA', 'VALE'] } })
    .select('name mimeTye url metadata date type companyId')
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

/** Los informes que la gente pregunta, con su nombre. El orden es el de la lista. */
export const TIPOS_INFORME: Array<{ type: string; label: string; alias: string[] }> = [
  { type: 'IPP', label: 'Producción de planta', alias: ['ipp', 'produccion de planta'] },
  { type: 'CTL-PIS', label: 'Control de pista', alias: ['control de pista', 'pista'] },
  { type: 'CTL-IMP', label: 'Control de imprimación', alias: ['imprimacion'] },
  { type: 'SOL-IMP', label: 'Solicitud de imprimación', alias: ['solicitud de imprimacion'] },
  { type: 'IAA', label: 'Área adicional', alias: ['area adicional', 'adicional'] },
  { type: 'APR-ADI', label: 'Aprobación de adicional', alias: ['aprobacion de adicional', 'aprobacion'] },
  { type: 'ACT-CNF', label: 'Acta de conformidad', alias: ['acta', 'conformidad'] },
  { type: 'RCP-CAM', label: 'Recepción de campo', alias: ['recepcion'] },
];

export interface EstadoInforme {
  type: string;
  label: string;
  /** `null` si no existe ninguno para el día. */
  status: 'draft' | 'completed' | null;
  cantidad: number;
}

/**
 * Qué informes existen para los pedidos de un día. Un informe se ata al día por
 * sus `orderIds` o por su `date`; se consideran las dos porque no todos los
 * tipos llevan pedidos.
 */
export const informesDelDia = async (
  companyId: string,
  orderIds: string[],
  fecha: string
): Promise<EstadoInforme[]> => {
  const Reports = await getServiceReportModel();
  const inicio = new Date(`${fecha}T00:00:00.000-05:00`);
  const fin = new Date(inicio.getTime() + 24 * 3_600_000);
  const docs = (await Reports.find({
    companyId,
    $or: [{ orderIds: { $in: orderIds } }, { date: { $gte: inicio, $lt: fin } }],
  })
    .select('type status')
    .lean()) as Doc[];

  return TIPOS_INFORME.map((t) => {
    const delTipo = docs.filter((d) => String(d.type) === t.type);
    const completado = delTipo.some((d) => String(d.status) === 'completed');
    return {
      type: t.type,
      label: t.label,
      status: delTipo.length === 0 ? null : completado ? 'completed' : 'draft',
      cantidad: delTipo.length,
    };
  });
};
