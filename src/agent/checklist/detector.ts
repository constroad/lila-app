import { createHash } from 'crypto';
import logger from '../../utils/logger.js';
import { getOrderModel } from '../../database/models.js';
import { WhatsAppDirectService } from '../../services/whatsapp-direct.service.js';
import { COMPANY_PILOTO, destinoPermitido } from './alcance.js';
import { alcanceVigente } from './observador.js';
import { mensajesDesde } from './almacen.js';
import { filtrarMensajes } from './mensajes.js';
import { CHECKLIST_PRODUCCION, evaluarChecklist } from './checklist.js';
import { construirAvisoChecklist } from './aviso.js';
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
  hash: string;
  enviados: number;
}

const avisados = new Map<string, EstadoAviso>();

/** Solo para tests. */
export const _resetDetector = (): void => void avisados.clear();

const hash = (texto: string) => createHash('sha1').update(texto).digest('hex');

export interface PedidoConArranque {
  id: string;
  fecha: string;
  hora: string;
  arranqueMs: number;
  creadoMs: number;
}

/**
 * Pedidos de la empresa piloto cuyo arranque está por venir (o acaba de pasar).
 *
 * Solo los que tienen `horaInicio`: sin ella no se puede decir «faltan 4 h», y
 * un pedido viejo sin hora no debe generar avisos raros.
 */
export const pedidosConArranque = async (ahoraMs: number): Promise<PedidoConArranque[]> => {
  const OrderModel = await getOrderModel();
  const desde = new Date(ahoraMs - 24 * 60 * 60 * 1000);
  const hasta = new Date(ahoraMs + 48 * 60 * 60 * 1000);

  const docs = (await OrderModel.find({
    companyId: COMPANY_PILOTO,
    fechaProgramacion: { $gte: desde, $lte: hasta },
    horaInicio: { $exists: true, $ne: '' },
    status: { $nin: ['eliminado', 'rechazado'] },
  })
    .select('fechaProgramacion horaInicio createdAt')
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

  for (const pedido of pedidos) {
    // Solo interesa lo que se dijo DESDE que el pedido existe: un «cuadrilla
    // lista» anterior a que se cargara el pedido hablaba de otro día.
    const observados = mensajesDesde(alcance.grupoEscuchado, pedido.creadoMs);
    const utiles = filtrarMensajes(observados);

    const evaluacion = evaluarChecklist({
      items: CHECKLIST_PRODUCCION,
      arranqueMs: pedido.arranqueMs,
      ahoraMs,
      mensajes: utiles.textos,
    });

    const texto = construirAvisoChecklist(evaluacion, {
      empresa: COMPANY_PILOTO,
      fecha: pedido.fecha,
      horaArranque: pedido.hora,
      grupoEscuchado: alcance.grupoEscuchado,
    });
    if (!texto) continue;

    const clave = `${pedido.id}`;
    const estado = avisados.get(clave) ?? { hash: '', enviados: 0 };
    const digest = hash(texto);

    // Nada nuevo que decir: callarse.
    if (estado.hash === digest) continue;
    if (estado.enviados >= MAX_AVISOS_POR_DIA) {
      logger.info(`[agente] presupuesto agotado para el pedido ${pedido.id}, no se avisa más`);
      continue;
    }

    await WhatsAppDirectService.sendMessage(await senderDelDestino(), destino, texto, {
      companyId: COMPANY_PILOTO,
    });
    avisados.set(clave, { hash: digest, enviados: estado.enviados + 1 });
    enviados += 1;
    logger.info(
      `[agente] aviso de checklist enviado (pedido ${pedido.id}, ${evaluacion.pendientes.length} pendientes, ` +
        `descartados: ${JSON.stringify(utiles.descartados)})`
    );
  }

  return enviados;
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
