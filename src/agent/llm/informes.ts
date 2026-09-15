import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { config } from '../../config/environment.js';
import logger from '../../utils/logger.js';
import { getClientModel, getServiceManagementModel, getServiceReportModel } from '../../database/models.js';
import { EMPRESAS_CON_PEDIDOS } from '../checklist/alcance.js';
import { ALIAS_EMPRESA, normalizar } from '../consultas/catalogo.js';
import { nombresDeEmpresas, patronDeBusqueda } from './datos.js';

/**
 * LOS INFORMES, EN PDF. José, 14/09 (19:30): «que le pueda preguntar por
 * informes de pedido o de servicio: "dame el informe de planta, que me envíe
 * el PDF", "dame el informe de control de pista"… y así con todos».
 *
 * Los informes viven en `servicemanagementreports` (Portal): uno por servicio
 * y tipo (IPP, CTL-PIS, CTL-IMP, IAA, VAL-SRV…), con fecha, y a veces con el
 * PDF ya generado (`generatedDocuments.pdfUrl`, en el storage de lila). Cuando
 * no está generado —la mayoría: 373 informes, 30 con PDF al 14/09— se genera
 * al momento con el MISMO circuito que Portal: lila firma el token de
 * impresión (`scope: report-print`, el secreto es compartido), Puppeteer
 * fotografía la hoja `/print/service-report/:id` de Portal y sale el PDF con
 * el diseño del canvas. Se usa `/api/documents/preview` (no `generate`) para
 * no tocar el informe: generar lo marcaría «completed».
 *
 * Solo empresas del piloto y solo lectura, como todas las herramientas.
 */

export interface TipoInforme {
  codigo: string;
  nombre: string;
  /** Con qué palabras lo piden (sin tildes). El alias más largo que aparezca en la pregunta gana. */
  alias: string[];
}

export const TIPOS_INFORME: readonly TipoInforme[] = [
  { codigo: 'IPP', nombre: 'Informe de producción de planta', alias: ['informe de produccion de planta', 'informe de planta', 'produccion de planta', 'informe de produccion', 'ipp'] },
  { codigo: 'CTL-PIS', nombre: 'Control de pista', alias: ['control de pista', 'informe de pista', 'pista'] },
  { codigo: 'CTL-IMP', nombre: 'Control de imprimación', alias: ['control de imprimacion', 'informe de imprimacion', 'imprimacion'] },
  { codigo: 'SOL-IMP', nombre: 'Solicitud de imprimación', alias: ['solicitud de imprimacion'] },
  { codigo: 'IAA', nombre: 'Informe de área adicional', alias: ['informe de area adicional', 'area adicional', 'adicional', 'iaa'] },
  { codigo: 'APR-ADI', nombre: 'Aprobación de adicional', alias: ['aprobacion de adicional', 'aprobacion adicional', 'aprobacion del adicional'] },
  { codigo: 'VAL-SRV', nombre: 'Valorización', alias: ['valorizacion'] },
  { codigo: 'LIQ-SRV', nombre: 'Liquidación de servicio', alias: ['liquidacion'] },
  { codigo: 'CONT-SRV', nombre: 'Contrato de servicio', alias: ['contrato de servicio', 'contrato'] },
  { codigo: 'PNL-FOT', nombre: 'Panel fotográfico', alias: ['panel fotografico', 'panel de fotos', 'panel'] },
  { codigo: 'ACT-CNF', nombre: 'Acta de conformidad', alias: ['acta de conformidad', 'conformidad', 'acta'] },
  { codigo: 'INF-ACT', nombre: 'Informe de actividades', alias: ['informe de actividades', 'actividades'] },
  { codigo: 'DOS-OBR', nombre: 'Dossier de obra', alias: ['dossier de obra', 'dossier'] },
  { codigo: 'FRE-PAV', nombre: 'Fresado de pavimento', alias: ['fresado de pavimento', 'fresado'] },
  { codigo: 'TOP-CMP', nombre: 'Protocolo topográfico completo', alias: ['protocolo topografico completo', 'topografico completo'] },
  { codigo: 'TOP-PROT', nombre: 'Protocolo topográfico', alias: ['protocolo topografico', 'topografico', 'topo'] },
  { codigo: 'CAL-PROT', nombre: 'Protocolo de calidad', alias: ['protocolo de calidad', 'calidad'] },
  { codigo: 'MET-RES', nombre: 'Metrado resumen', alias: ['metrado resumen', 'metrado'] },
  { codigo: 'CONS-TRA', nombre: 'Constancia de trabajo', alias: ['constancia de trabajo', 'constancia'] },
  { codigo: 'REC-EXC', nombre: 'Informe de reclamo', alias: ['informe de reclamo', 'reclamo'] },
  { codigo: 'LEV-OBS', nombre: 'Levantamiento de observaciones', alias: ['levantamiento de observaciones', 'levantamiento'] },
  { codigo: 'RCP-CAM', nombre: 'Recepción de campo', alias: ['recepcion de campo', 'recepcion'] },
];

const porCodigo = new Map(TIPOS_INFORME.map((t) => [t.codigo, t]));
export const nombreTipo = (codigo: string): string => porCodigo.get(codigo)?.nombre ?? codigo;

/** El tipo que nombra la pregunta: el alias más largo que aparezca («solicitud de imprimación» antes que «imprimación»). */
export const tipoDeInforme = (pregunta: string): TipoInforme | undefined => {
  const t = ` ${normalizar(pregunta)} `;
  let mejor: { tipo: TipoInforme; largo: number } | undefined;
  for (const tipo of TIPOS_INFORME) {
    for (const alias of tipo.alias) {
      if (t.includes(` ${alias} `) && (!mejor || alias.length > mejor.largo)) mejor = { tipo, largo: alias.length };
    }
  }
  return mejor?.tipo;
};

/** Verbos de PEDIR el archivo. «Quiero ver cómo va la pista» no es pedir un PDF: esos van por el catálogo de siempre. */
const VERBOS = ['dame', 'damelo', 'damela', 'manda', 'mandame', 'mandalo', 'mandala', 'envia', 'enviame', 'envialo', 'enviala', 'pasa', 'pasame', 'pasalo', 'pasala', 'comparte', 'compartelo', 'compartela', 'adjunta', 'adjuntame', 'descarga', 'descargame'];
const NOMBRES = ['informe', 'informes', 'ipp', 'pista', 'imprimacion', 'valorizacion', 'acta', 'panel', 'dossier', 'liquidacion', 'constancia', 'metrado', 'protocolo', 'contrato', 'pdf', 'reporte', 'solicitud', 'aprobacion', 'fresado', 'levantamiento', 'recepcion', 'reclamo', 'adicional'];

/** Reglas verbo + nombre («dame el informe», «pásame el control de pista», «manda el pdf»), y «pdf» a secas. */
export const REGLAS_INFORMES: string[][] = [...VERBOS.flatMap((v) => NOMBRES.map((n) => [v, n])), ['pdf'], ['ultimo', 'informe'], ['ultimos', 'informes']];

const RELLENO = new Set([
  ...VERBOS,
  ...NOMBRES,
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'por', 'para', 'con', 'que', 'me', 'lo', 'a', 'al', 'y', 'o', 'su', 'sus', 'este', 'esta', 'ese', 'esa', 'porfa', 'porfavor', 'favor', 'gracias', 'hola', 'lila',
  'hoy', 'ayer', 'anteayer', 'manana', 'semana', 'mes', 'pasado', 'pasada', 'ultimo', 'ultima', 'ultimos', 'ultimas', 'reciente', 'nuevo', 'nueva',
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre',
  'servicio', 'obra', 'pedido', 'cliente', 'proyecto', 'como', 'esta', 'estan', 'va', 'van', 'ya', 'tiene', 'tienen', 'hay', 'listo', 'generado', 'generar', 'genera', 'generame', 'produccion', 'planta', 'campo', 'control',
  'quiero', 'necesito', 'muestrame', 'ver', 'mostrar', 'ultimo',
]);

/**
 * Lo que queda de la pregunta cuando se le quita el verbo, el tipo, las fechas
 * y las palabras de relleno: el nombre del cliente, la obra o la persona. «dame
 * el control de pista de los pinos de ayer» → «pinos» (con «los» fuera).
 */
export const textoDeBusqueda = (pregunta: string, tipo?: TipoInforme): string => {
  let t = ` ${normalizar(pregunta)} `;
  for (const alias of tipo?.alias ?? []) t = t.split(` ${alias} `).join(' ');
  for (const e of ALIAS_EMPRESA) for (const a of e.alias) t = t.split(` ${a} `).join(' ');
  return t
    .replace(/\b\d{1,2}\s*(de\s+\w+|\/\d{1,2})\b/g, ' ')
    .split(' ')
    .filter((p) => p && !RELLENO.has(p) && !/^\d+$/.test(p) && p.length >= 3)
    .join(' ')
    .trim();
};

export interface InformeEncontrado {
  id: string;
  companyId: string;
  empresa: string;
  tipo: string;
  nombreTipo: string;
  /** YYYY-MM-DD */
  fecha: string;
  estado: string;
  /** Descripción corta del servicio (obra) y el cliente, si se resolvieron. */
  servicio: string;
  cliente?: string;
  responsable?: string;
  pdfUrl?: string;
}

type Doc = Record<string, unknown>;
const texto = (v: unknown): string => String(v ?? '').trim();
const fechaIso = (v: unknown): string => {
  const d = v instanceof Date ? v : new Date(String(v || ''));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};
/** «Mejoramiento del servicio de movilidad urbana en avenida los pinos…» → las primeras 8 palabras. */
export const resumenServicio = (descripcion: string, palabras = 8): string => {
  const p = texto(descripcion).replace(/\s+/g, ' ').split(' ');
  return p.length <= palabras ? p.join(' ') : `${p.slice(0, palabras).join(' ')}…`;
};

export const buscarInformes = async (
  filtro: { tipo?: string; texto?: string; desde?: string; hasta?: string; companyId?: string },
  limite = 6
): Promise<InformeEncontrado[]> => {
  const [Informe, Servicio, Cliente, nombres] = await Promise.all([getServiceReportModel(), getServiceManagementModel(), getClientModel(), nombresDeEmpresas()]);
  const empresas = filtro.companyId ? [filtro.companyId] : [...EMPRESAS_CON_PEDIDOS];
  const query: Record<string, unknown> = { companyId: { $in: empresas } };
  if (filtro.tipo) query.type = filtro.tipo;
  if (filtro.desde || filtro.hasta) {
    query.date = {
      ...(filtro.desde ? { $gte: new Date(`${filtro.desde}T00:00:00.000Z`) } : {}),
      ...(filtro.hasta ? { $lte: new Date(`${filtro.hasta}T23:59:59.999Z`) } : {}),
    };
  }
  // Se traen más de los que se muestran para poder filtrar por obra/cliente.
  //
  // `allowDiskUse`: la colección es del Portal y no tiene índice por
  // `{companyId, date}`, así que ordenar es un SORT en memoria de los informes
  // enteros (con `schemaData` y fotos adentro) de todas las empresas del
  // filtro. El 15/09 a las 12:26 pasó de los 32 MB que Mongo permite y la
  // consulta «cuántos carros se descargaron en el control de pista» murió sin
  // respuesta. El arreglo de fondo es el índice `{companyId: 1, date: -1}` en
  // el modelo del Portal; hasta que exista, esto deja de tirar el query.
  const docs = (await Informe.find(query)
    .select('companyId serviceManagementId type status date responsible generatedDocuments')
    .sort({ date: -1, updatedAt: -1 })
    .limit(filtro.texto ? 200 : limite * 4)
    .allowDiskUse(true)
    .lean()) as Doc[];
  if (!docs.length) return [];
  const idsServicio = [...new Set(docs.map((d) => texto(d.serviceManagementId)).filter(Boolean))];
  const servicios = (await Servicio.find({ _id: { $in: idsServicio } }).select('clientId projectName description').lean()) as Doc[];
  const porServicio = new Map(servicios.map((s) => [String(s._id), s]));
  const idsCliente = [...new Set(servicios.map((s) => texto(s.clientId)).filter(Boolean))];
  const clientes = idsCliente.length ? ((await Cliente.find({ _id: { $in: idsCliente } }).select('name').lean()) as Doc[]) : [];
  const nombreCliente = new Map(clientes.map((c) => [String(c._id), texto(c.name)]));
  const patron = filtro.texto ? patronDeBusqueda(filtro.texto) : null;
  const lista: InformeEncontrado[] = [];
  for (const d of docs) {
    const s = porServicio.get(texto(d.serviceManagementId));
    const descripcion = texto(s?.projectName) || texto(s?.description);
    const cliente = s ? nombreCliente.get(texto(s.clientId)) : undefined;
    const responsable = texto(d.responsible) || undefined;
    if (patron && ![descripcion, cliente ?? '', responsable ?? ''].some((v) => patron.test(v))) continue;
    const generado = d.generatedDocuments as { pdfUrl?: string } | undefined;
    lista.push({
      id: String(d._id),
      companyId: texto(d.companyId),
      empresa: nombres.get(texto(d.companyId)) || texto(d.companyId),
      tipo: texto(d.type),
      nombreTipo: nombreTipo(texto(d.type)),
      fecha: fechaIso(d.date) || fechaIso(d.createdAt),
      estado: texto(d.status),
      servicio: resumenServicio(descripcion),
      cliente: cliente || undefined,
      responsable,
      pdfUrl: texto(generado?.pdfUrl) || undefined,
    });
    if (lista.length >= limite) break;
  }
  return lista;
};

const fechaCorta = (iso: string): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

/** Una línea por informe, para elegir. */
export const lineaInforme = (i: InformeEncontrado): string =>
  `*${i.nombreTipo}* · ${fechaCorta(i.fecha)} · ${i.empresa}${i.cliente ? ` · ${i.cliente}` : ''}${i.servicio ? `\n   ${i.servicio}` : ''}${i.pdfUrl ? '' : ' · _(se genera al pedirlo)_'}`;

export const nombreArchivo = (i: InformeEncontrado): string =>
  `${i.nombreTipo} - ${i.cliente || i.empresa} - ${i.fecha || 'sin fecha'}.pdf`.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ');

/** Del `/files/companies/<id>/…` (o su URL absoluta) al archivo en disco. */
const rutaLocalDe = (pdfUrl: string, companyId: string): string | null => {
  const m = pdfUrl.match(/\/files\/companies\/([^/]+)\/(.+)$/);
  if (!m || m[1] !== companyId) return null;
  const relativa = decodeURIComponent(m[2]).replace(/\.\./g, '');
  return path.join(config.storage.root, 'companies', companyId, relativa);
};

const existe = async (ruta: string): Promise<boolean> => access(ruta).then(() => true, () => false);

const TIMEOUT_GENERACION_MS = 120_000;

/**
 * El PDF del informe: el ya generado si está en disco; si no, se genera al
 * momento desde la hoja de impresión de Portal (token firmado por lila, mismo
 * secreto). Devuelve los bytes o `null` si no se pudo.
 */
export const pdfDeInforme = async (i: InformeEncontrado): Promise<{ buffer: Buffer; generado: boolean } | null> => {
  if (i.pdfUrl) {
    const ruta = rutaLocalDe(i.pdfUrl, i.companyId);
    if (ruta && (await existe(ruta))) return { buffer: await readFile(ruta), generado: false };
  }
  const secreto = config.security.jwtSecret;
  const tokenImpresion = jwt.sign({ scope: 'report-print', companyId: i.companyId, reportId: i.id }, secreto, { expiresIn: '15m' });
  const printUrl = `${config.portal.baseUrl.replace(/\/+$/, '')}/print/service-report/${encodeURIComponent(i.id)}?token=${encodeURIComponent(tokenImpresion)}`;
  const tokenTenant = jwt.sign({ companyId: i.companyId, userId: 'lila-agente', role: 'agent' }, secreto, { expiresIn: '5m' });
  const inicio = Date.now();
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/api/documents/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenTenant}` },
      body: JSON.stringify({ printUrl }),
      signal: AbortSignal.timeout(TIMEOUT_GENERACION_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { data?: { previewUrl?: string } };
    const previewUrl = texto(json.data?.previewUrl);
    if (!previewUrl.endsWith('.pdf')) throw new Error(`respuesta sin PDF: ${previewUrl || '(vacía)'}`);
    // Los bytes por HTTP (el temp dir es público por diseño): así no importa
    // desde qué directorio corre cada proceso.
    const pdf = await fetch(`http://127.0.0.1:${config.port}${previewUrl}`, { signal: AbortSignal.timeout(30_000) });
    if (!pdf.ok) throw new Error(`no pude leer el PDF generado: HTTP ${pdf.status}`);
    const buffer = Buffer.from(await pdf.arrayBuffer());
    logger.info(`[agente] informe ${i.tipo} ${i.id} generado (${Math.round(buffer.length / 1024)} KB) en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
    return { buffer, generado: true };
  } catch (error) {
    logger.warn(`[agente] no pude generar el PDF del informe ${i.tipo} ${i.id}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};
