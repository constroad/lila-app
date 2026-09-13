import logger from '../../utils/logger.js';
import { getOrderModel } from '../../database/models.js';
import { EMPRESAS_CON_PEDIDOS, destinoPermitido } from './alcance.js';
import { alcanceVigente } from './observador.js';
import { mensajesDesde, observados } from './almacen.js';
import { filtrarMensajes } from './mensajes.js';
import { CHECKLIST_PRODUCCION } from './checklist.js';
import { evaluarRevisionSemantica } from './semantica.js';
import {
  conPiePropuesta,
  construirAvisoChecklist,
  construirAvisoProduccion,
  describirCambio,
  firmaAviso,
} from './aviso.js';
import { enviarAOperaciones, publicarPropuesta } from './emisor.js';
import {
  _resetPropuestas,
  pendientes,
  proponer,
  vencidasAhora,
  yaPropuesta,
  type Propuesta,
} from './sugerencias.js';
import { agruparPorDia, firmaDia, momentoVigente, type DiaDePlanta, type PedidoDelDia } from './dia.js';
import { diaPeruano, instanteArranque } from './tiempo.js';

export { diaPeruano, instanteArranque };

/**
 * El detector: junta los pedidos en DÍAS DE PLANTA, mira lo que se dijo en el
 * grupo, y decide qué proponer y cuándo.
 *
 * POR DÍA, NO POR PEDIDO. Dos empresas el mismo día son un solo aviso a planta
 * con el total, y un solo checklist. Ver `dia.ts`.
 *
 * POR HORARIO, NO POR REGLA. El checklist sale a las 16:00 del día anterior;
 * a las 20:00 vuelve solo con lo que falta; 2 h antes solo lo crítico. Fuera de
 * eso, silencio. Ver `momentoVigente`.
 *
 * NADA SALE SOLO. Todo se propone en operaciones y sale con la aprobación de
 * un administrador de ese grupo, por cita. Ver `sugerencias` y `emisor`.
 */

const nombresEmpresa = new Map<string, string>();

/** Solo para tests. */
export const _resetDetector = (): void => {
  _resetPropuestas();
  nombresEmpresa.clear();
  ultimaVersionDelDia.clear();
};

/**
 * Pedidos de las empresas que producen en la planta, con arranque por venir (o
 * recién pasado). Solo los que tienen `horaInicio`: sin ella no hay día.
 */
export const pedidosConArranque = async (ahoraMs: number): Promise<PedidoDelDia[]> => {
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

  const pedidos: PedidoDelDia[] = [];
  for (const doc of docs) {
    const fechaDoc = doc.fechaProgramacion as Date | undefined;
    if (!fechaDoc) continue;
    const fecha = diaPeruano(new Date(fechaDoc).getTime());
    const hora = String(doc.horaInicio || '');
    const arranqueMs = instanteArranque(fecha, hora);
    if (arranqueMs === null) continue;
    const companyId = String(doc.companyId || '');

    pedidos.push({
      id: String(doc._id),
      companyId,
      empresa: await nombreEmpresa(companyId),
      // El alias es como lo llaman en el grupo; el nombre legal es el respaldo.
      cliente: String(doc.alias || doc.cliente || '').trim(),
      cubos: Number(doc.cantidadCubos) || 0,
      hora,
      arranqueMs,
      creadoMs: doc.createdAt ? new Date(doc.createdAt as Date).getTime() : arranqueMs - 24 * 3600_000,
    });
  }
  return pedidos;
};

/** La última versión del día que se le propuso a planta, para describir cambios. */
const ultimaVersionDelDia = new Map<string, PedidoDelDia[]>();

/**
 * Una pasada. Devuelve cuántas propuestas nuevas publicó — 0 es lo normal.
 */
export const correrDeteccion = async (ahoraMs = Date.now()): Promise<number> => {
  if (!destinoPermitido()) return 0;

  const alcance = await alcanceVigente(ahoraMs);
  if (!alcance.grupoEscuchado) return 0;

  // Lo que venció sin respuesta se dice: si no, una propuesta ignorada se
  // confunde con una aprobada.
  for (const vencida of vencidasAhora(ahoraMs)) {
    await enviarAOperaciones(`⌛ Venció sin respuesta la propuesta para «${vencida.nombreDestino}» (${vencida.tipo}). No se mandó.`);
  }

  const pedidos = await pedidosConArranque(ahoraMs);
  const dias = agruparPorDia(pedidos);
  let nuevas = 0;

  // UNA línea por corrida, siempre: «¿está escuchando?» se contesta con un grep.
  logger.info(
    `[agente] detección: ${pedidos.length} pedido(s) en ${dias.length} día(s), ` +
      `${observados(alcance.grupoEscuchado)} mensaje(s) observados del grupo, ` +
      `${pendientes(ahoraMs).length} propuesta(s) esperando respuesta, ` +
      `días ${dias.map((d) => `${d.fecha} (${d.pedidos.map((p) => `${p.hora} ${p.empresa} ${p.cubos}m³`).join(', ')})`).join(' | ') || '—'}`
  );

  for (const dia of dias) {
    if (ahoraMs >= dia.arranqueMs + 60 * 60_000) continue; // arrancó hace más de 1 h: ya no se coordina, se produce
    nuevas += await proponerAvisoDelDia(dia, alcance, ahoraMs);
    nuevas += await proponerRevisionDelDia(dia, alcance, ahoraMs);
  }

  return nuevas;
};

const proponerAvisoDelDia = async (
  dia: DiaDePlanta,
  alcance: Awaited<ReturnType<typeof alcanceVigente>>,
  ahoraMs: number
): Promise<number> => {
  if (!alcance.grupoPlanta) return 0;
  const firma = `${firmaDia(dia)}|aviso`;
  if (yaPropuesta('aviso-planta', firma, ahoraMs)) return 0;

  const anterior = ultimaVersionDelDia.get(dia.fecha);
  const cambio = anterior ? describirCambio(anterior, dia.pedidos) : '';
  const texto = construirAvisoProduccion(dia, { actualizacion: cambio || undefined });
  const propuesta = proponer(
    {
      tipo: 'aviso-planta',
      fecha: dia.fecha,
      firma,
      destino: alcance.grupoPlanta,
      nombreDestino: alcance.nombreGrupoPlanta || 'planta',
      texto,
    },
    ahoraMs
  );
  await publicarPropuesta(propuesta, conPiePropuesta(texto, propuesta.nombreDestino));
  ultimaVersionDelDia.set(dia.fecha, dia.pedidos);
  logger.info(`[agente] propuesta ${propuesta.id}: ${cambio ? 'actualización' : 'aviso'} de producción ${dia.fecha} → «${propuesta.nombreDestino}»`);
  return 1;
};

const proponerRevisionDelDia = async (
  dia: DiaDePlanta,
  alcance: Awaited<ReturnType<typeof alcanceVigente>>,
  ahoraMs: number
): Promise<number> => {
  const momento = momentoVigente(dia, ahoraMs);
  if (!momento) return 0;

  // Solo interesa lo que se dijo DESDE que el día existe: un «cuadrilla lista»
  // anterior a que se cargara el primer pedido hablaba de otro día.
  const delGrupo = mensajesDesde(alcance.grupoEscuchado, dia.creadoMs);
  const utiles = filtrarMensajes(delGrupo);
  const revision = await evaluarRevisionSemantica(CHECKLIST_PRODUCCION, utiles.textos, {
    soloCriticos: momento === 'ultima-llamada',
  });

  const contexto = {
    fecha: dia.fecha,
    minutosParaArranque: Math.round((dia.arranqueMs - ahoraMs) / 60_000),
    pedidos: dia.pedidos,
    totalCubos: dia.totalCubos,
    momento,
    grupoEscuchado: alcance.nombreGrupo || alcance.grupoEscuchado,
  };
  const texto = construirAvisoChecklist(revision, contexto);
  if (!texto) return 0;

  const firma = firmaAviso(dia.fecha, momento, revision);
  if (yaPropuesta('checklist-admin', firma, ahoraMs)) return 0;
  // Un horario se propone UNA vez, aunque lo pendiente cambie después: lo que
  // cambia lo recoge el siguiente horario. Es lo que evita el goteo.
  if (yaPropuesta('checklist-admin', `${dia.fecha}|${momento}|`, ahoraMs)) return 0;

  const propuesta: Propuesta = proponer(
    {
      tipo: 'checklist-admin',
      fecha: dia.fecha,
      firma,
      destino: alcance.grupoEscuchado,
      nombreDestino: alcance.nombreGrupo || 'admin',
      texto,
    },
    ahoraMs
  );
  // Marca del horario, independiente de lo pendiente: ver arriba.
  proponer(
    { ...propuesta, firma: `${dia.fecha}|${momento}|`, texto: '', destino: '', nombreDestino: '' },
    ahoraMs
  ).estado = 'descartada';

  await publicarPropuesta(propuesta, conPiePropuesta(texto, propuesta.nombreDestino));
  logger.info(
    `[agente] propuesta ${propuesta.id}: checklist ${momento} de ${dia.fecha} → «${propuesta.nombreDestino}» ` +
      `(${revision.pendientes.length} pendientes, ${revision.semanticas.length} confirmación(es) entendidas por semántica, ` +
      `descartados: ${JSON.stringify(utiles.descartados)})`
  );
  return 1;
};

/**
 * «Globofast», no «globofas-s8k». Se lee de la empresa una vez y se recuerda.
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
