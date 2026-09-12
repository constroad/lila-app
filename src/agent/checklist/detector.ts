import logger from '../../utils/logger.js';
import { getOrderModel } from '../../database/models.js';
import { WhatsAppDirectService } from '../../services/whatsapp-direct.service.js';
import { COMPANY_PILOTO, EMPRESAS_CON_PEDIDOS, destinoPermitido } from './alcance.js';
import { alcanceVigente } from './observador.js';
import { mensajesDesde, observados } from './almacen.js';
import { filtrarMensajes } from './mensajes.js';
import { CHECKLIST_PRODUCCION, evaluarChecklist } from './checklist.js';
import { construirAvisoChecklist, firmaAviso } from './aviso.js';
import { MAX_AVISOS_POR_DIA, diaPeruano, instanteArranque } from './tiempo.js';

export { MAX_AVISOS_POR_DIA, diaPeruano, instanteArranque };

/**
 * El detector: junta los pedidos con su hora de arranque, lo que se dijo en el
 * grupo, y decide si hay algo que avisar.
 *
 * PRESUPUESTO DE RUIDO (spec §8). El modo de falla que mata este tipo de
 * proyecto no es equivocarse: es hablar de más. Por eso hay tres frenos:
 *   · solo se avisa lo VENCIDO (lo que aún tiene tiempo, no se pregunta);
 *   · no se repite un aviso idéntico (hash del texto);
 *   · tope de avisos por día de producción.
 *
 * EN ESPEJO todo sale al grupo de operaciones y nada al grupo que escucha.
 */

interface EstadoAviso {
  /** Firma semántica del último aviso (ver `firmaAviso`), NO hash del texto. */
  firma: string;
  enviados: number;
}

const avisados = new Map<string, EstadoAviso>();

/** Solo para tests. */
export const _resetDetector = (): void => void avisados.clear();

export interface PedidoConArranque {
  id: string;
  /** De quién es el pedido. No es la empresa que escucha: ver `EMPRESAS_CON_PEDIDOS`. */
  companyId: string;
  cliente: string;
  cubos: number;
  fecha: string;
  hora: string;
  arranqueMs: number;
  creadoMs: number;
}

/**
 * Pedidos de las empresas que producen en la planta, con arranque por venir (o
 * recién pasado). NO solo los de la empresa piloto: el 12/09 el pedido del
 * domingo era de globofas y el detector, mirando inframaq, no vio nada.
 *
 * Solo los que tienen `horaInicio`: sin ella no se puede decir «faltan 4 h», y
 * un pedido viejo sin hora no debe generar avisos raros.
 */
export const pedidosConArranque = async (ahoraMs: number): Promise<PedidoConArranque[]> => {
  const OrderModel = await getOrderModel();
  const desde = new Date(ahoraMs - 24 * 60 * 60 * 1000);
  const hasta = new Date(ahoraMs + 48 * 60 * 60 * 1000);

  const docs = (await OrderModel.find({
    companyId: { $in: [...EMPRESAS_CON_PEDIDOS] },
    fechaProgramacion: { $gte: desde, $lte: hasta },
    horaInicio: { $exists: true, $ne: '' },
    status: { $nin: ['eliminado', 'rechazado'] },
  })
    .select('companyId cliente alias cantidadCubos fechaProgramacion horaInicio createdAt')
    .lean()) as Array<Record<string, unknown>>;

  const pedidos: PedidoConArranque[] = [];
  for (const doc of docs) {
    const fechaDoc = doc.fechaProgramacion as Date | undefined;
    if (!fechaDoc) continue;
    const fecha = diaPeruano(new Date(fechaDoc).getTime());
    const hora = String(doc.horaInicio || '');
    const arranqueMs = instanteArranque(fecha, hora);
    if (arranqueMs === null) continue;

    pedidos.push({
      id: String(doc._id),
      companyId: String(doc.companyId || ''),
      // El alias es como lo llaman en el grupo; el nombre legal es el respaldo.
      cliente: String(doc.alias || doc.cliente || '').trim(),
      cubos: Number(doc.cantidadCubos) || 0,
      fecha,
      hora,
      arranqueMs,
      creadoMs: doc.createdAt ? new Date(doc.createdAt as Date).getTime() : arranqueMs - 24 * 3600_000,
    });
  }
  return pedidos;
};

/**
 * Una pasada del detector. Devuelve cuántos avisos mandó — 0 es el resultado
 * normal y esperable.
 */
export const correrDeteccion = async (ahoraMs = Date.now()): Promise<number> => {
  const destino = destinoPermitido();
  if (!destino) return 0;

  const alcance = await alcanceVigente(ahoraMs);
  if (!alcance.grupoEscuchado) return 0;

  const pedidos = await pedidosConArranque(ahoraMs);
  let enviados = 0;
  // UNA línea por corrida, siempre. Sin esto «¿está escuchando?» no se puede
  // contestar: el 12/09 el agente llevaba 2 días sin loguear nada y no había
  // forma de distinguir «no hay nada que avisar» de «no ve nada».
  logger.info(
    `[agente] detección: ${pedidos.length} pedido(s) con arranque, ` +
      `${observados(alcance.grupoEscuchado)} mensaje(s) observados del grupo, ` +
      `ventana ${pedidos.map((p) => `${p.companyId} ${p.fecha} ${p.hora}`).join(' | ') || '—'}`
  );

  for (const pedido of pedidos) {
    // Solo interesa lo que se dijo DESDE que el pedido existe: un «cuadrilla
    // lista» anterior a que se cargara el pedido hablaba de otro día.
    const delGrupo = mensajesDesde(alcance.grupoEscuchado, pedido.creadoMs);
    const utiles = filtrarMensajes(delGrupo);

    const evaluacion = evaluarChecklist({
      items: CHECKLIST_PRODUCCION,
      arranqueMs: pedido.arranqueMs,
      ahoraMs,
      mensajes: utiles.textos,
    });

    const texto = construirAvisoChecklist(evaluacion, {
      empresa: await nombreEmpresa(pedido.companyId),
      fecha: pedido.fecha,
      horaArranque: pedido.hora,
      cliente: pedido.cliente,
      cubos: pedido.cubos,
      grupoEscuchado: alcance.nombreGrupo || alcance.grupoEscuchado,
    });
    if (!texto) continue;

    const clave = `${pedido.id}`;
    const estado = avisados.get(clave) ?? { firma: '', enviados: 0 };
    const firma = firmaAviso(pedido.id, evaluacion);

    // Nada nuevo que decir: callarse. Se compara QUÉ falta, no el texto — el
    // texto lleva la cuenta regresiva y cambia cada minuto.
    if (estado.firma === firma) continue;
    if (estado.enviados >= MAX_AVISOS_POR_DIA) {
      logger.info(`[agente] presupuesto agotado para el pedido ${pedido.id}, no se avisa más`);
      continue;
    }

    await WhatsAppDirectService.sendMessage(await senderDelDestino(), destino, texto, {
      companyId: COMPANY_PILOTO,
    });
    avisados.set(clave, { firma, enviados: estado.enviados + 1 });
    enviados += 1;
    logger.info(
      `[agente] aviso de checklist enviado (pedido ${pedido.id}, ${evaluacion.pendientes.length} pendientes, ` +
        `descartados: ${JSON.stringify(utiles.descartados)})`
    );
  }

  return enviados;
};

const nombresEmpresa = new Map<string, string>();

/**
 * «Globofast», no «globofas-s8k». Se lee de la empresa una vez y se recuerda: el
 * nombre no cambia y esto corre cada 20 minutos.
 */
const nombreEmpresa = async (companyId: string): Promise<string> => {
  const cacheado = nombresEmpresa.get(companyId);
  if (cacheado) return cacheado;
  try {
    const { getCompanyModel } = await import('../../database/models.js');
    const CompanyModel = await getCompanyModel();
    const company = (await CompanyModel.findOne({ companyId }).select('name').lean()) as
      | { name?: string }
      | null;
    const nombre = String(company?.name || '').trim() || companyId;
    nombresEmpresa.set(companyId, nombre);
    return nombre;
  } catch {
    return companyId;
  }
};

/**
 * La sesión que envía. El grupo de operaciones es alcanzable desde la sesión de
 * la empresa piloto —que es la que está en él—, y mandar desde otra devolvería
 * `GROUP_NOT_IN_SESSION` (409), el incidente del 03/09/2026.
 */
const senderDelDestino = async (): Promise<string> => {
  const { getCompanyModel } = await import('../../database/models.js');
  const CompanyModel = await getCompanyModel();
  const company = (await CompanyModel.findOne({ companyId: COMPANY_PILOTO }).lean()) as
    | { whatsappConfig?: { sender?: string } }
    | null;
  return String(company?.whatsappConfig?.sender || '');
};
