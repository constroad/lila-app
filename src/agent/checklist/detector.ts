import logger from '../../utils/logger.js';
import { getOrderModel } from '../../database/models.js';
import { EMPRESAS_CON_PEDIDOS, destinoPermitido } from './alcance.js';
import { alcanceVigente } from './observador.js';
import { mensajesDesde, observados } from './almacen.js';
import { filtrarMensajes } from './mensajes.js';
import { CHECKLIST_PRODUCCION, evaluarChecklist } from './checklist.js';
import {
  conPiePropuesta,
  construirAvisoChecklist,
  construirAvisoProduccion,
  firmaAviso,
} from './aviso.js';
import { enviarAOperaciones } from './emisor.js';
import {
  _resetPropuestas,
  pendientes,
  proponer,
  propuestasDelPedido,
  yaPropuesta,
} from './sugerencias.js';
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

/** Solo para tests. */
export const _resetDetector = (): void => {
  _resetPropuestas();
  nombresEmpresa.clear();
};

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
 * Una pasada del detector. Devuelve cuántas PROPUESTAS nuevas publicó en el grupo
 * de operaciones — 0 es el resultado normal y esperable.
 *
 * Por cada pedido con arranque hace dos cosas, cada una con su destino real:
 *   1. el AVISO DE PRODUCCIÓN, para el grupo de PLANTA: una vez por pedido, en
 *      cuanto el pedido aparece. Es el hecho que faltó el 07/09.
 *   2. la REVISIÓN DEL CHECKLIST, para el grupo de ADMIN: cuando hay ítems
 *      vencidos sin confirmar, y solo si cambió lo que falta.
 *
 * Ninguna sale sola: las dos se PROPONEN en el grupo de operaciones y salen al
 * grupo real con el «1» de una persona (ver `sugerencias` y `emisor`).
 */
export const correrDeteccion = async (ahoraMs = Date.now()): Promise<number> => {
  if (!destinoPermitido()) return 0;

  const alcance = await alcanceVigente(ahoraMs);
  if (!alcance.grupoEscuchado) return 0;

  const pedidos = await pedidosConArranque(ahoraMs);
  let propuestasNuevas = 0;
  // UNA línea por corrida, siempre. Sin esto «¿está escuchando?» no se puede
  // contestar: el 12/09 el agente llevaba 2 días sin loguear nada y no había
  // forma de distinguir «no hay nada que avisar» de «no ve nada».
  logger.info(
    `[agente] detección: ${pedidos.length} pedido(s) con arranque, ` +
      `${observados(alcance.grupoEscuchado)} mensaje(s) observados del grupo, ` +
      `${pendientes(ahoraMs).length} propuesta(s) esperando respuesta, ` +
      `ventana ${pedidos.map((p) => `${p.companyId} ${p.fecha} ${p.hora}`).join(' | ') || '—'}`
  );

  for (const pedido of pedidos) {
    const contexto = {
      empresa: await nombreEmpresa(pedido.companyId),
      fecha: pedido.fecha,
      horaArranque: pedido.hora,
      cliente: pedido.cliente,
      cubos: pedido.cubos,
      grupoEscuchado: alcance.nombreGrupo || alcance.grupoEscuchado,
    };

    // 1) Aviso de producción → planta. Una sola vez por pedido.
    if (alcance.grupoPlanta) {
      const firma = `${pedido.id}|aviso-produccion`;
      if (!yaPropuesta('aviso-planta', firma, ahoraMs)) {
        const texto = construirAvisoProduccion(contexto);
        const propuesta = proponer(
          {
            tipo: 'aviso-planta',
            pedidoId: pedido.id,
            firma,
            destino: alcance.grupoPlanta,
            nombreDestino: alcance.nombreGrupoPlanta || 'planta',
            texto,
          },
          ahoraMs
        );
        await enviarAOperaciones(conPiePropuesta(texto, propuesta.nombreDestino));
        propuestasNuevas += 1;
        logger.info(`[agente] propuesta ${propuesta.id}: aviso de producción del pedido ${pedido.id} → «${propuesta.nombreDestino}»`);
      }
    }

    // 2) Checklist → admin. Solo lo vencido, solo si cambió, con tope diario.
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
    const texto = construirAvisoChecklist(evaluacion, contexto);
    if (!texto) continue;

    const firma = firmaAviso(pedido.id, evaluacion);
    if (yaPropuesta('checklist-admin', firma, ahoraMs)) continue;
    if (propuestasDelPedido('checklist-admin', pedido.id) >= MAX_AVISOS_POR_DIA) {
      logger.info(`[agente] presupuesto agotado para el pedido ${pedido.id}, no se propone más`);
      continue;
    }

    const propuesta = proponer(
      {
        tipo: 'checklist-admin',
        pedidoId: pedido.id,
        firma,
        destino: alcance.grupoEscuchado,
        nombreDestino: alcance.nombreGrupo || 'admin',
        texto,
      },
      ahoraMs
    );
    await enviarAOperaciones(conPiePropuesta(texto, propuesta.nombreDestino));
    propuestasNuevas += 1;
    logger.info(
      `[agente] propuesta ${propuesta.id}: checklist del pedido ${pedido.id} → «${propuesta.nombreDestino}» ` +
        `(${evaluacion.pendientes.length} pendientes, descartados: ${JSON.stringify(utiles.descartados)})`
    );
  }

  return propuestasNuevas;
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
