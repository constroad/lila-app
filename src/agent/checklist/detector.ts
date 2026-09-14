import logger from '../../utils/logger.js';
import { getOrderModel } from '../../database/models.js';
import { AGENTE_ACTIVO, EMPRESAS_CON_PEDIDOS, destinoPermitido } from './alcance.js';
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
import { agenteApagado } from './interruptor.js';
import { VENTANA_MS } from './almacen.js';
import { detectarMenciones, firmaMencion, textoAvisoPrevio, textoRecordatorioPedido, type MencionDeProduccion } from './menciones.js';

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
  if (!AGENTE_ACTIVO || !destinoPermitido()) return 0;
  if (agenteApagado()) {
    logger.info('[agente] apagado por interruptor: no se propone nada');
    return 0;
  }

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

  nuevas += await proponerPorMenciones(alcance, ahoraMs);

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
    negadas: utiles.negadas,
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
 * El estado del checklist de un día, para la consulta «¿cómo va el checklist?».
 * Misma evaluación que usa el detector: mensajes del grupo desde que el día
 * existe, filtrados, contra los catorce ítems. `null` si no hay pedidos.
 */
export const revisionDelDia = async (fecha: string, ahoraMs = Date.now()) => {
  const alcance = await alcanceVigente(ahoraMs);
  if (!alcance.grupoEscuchado) return null;
  const dia = agruparPorDia(await pedidosConArranque(ahoraMs)).find((d) => d.fecha === fecha);
  if (!dia) return null;
  const utiles = filtrarMensajes(mensajesDesde(alcance.grupoEscuchado, dia.creadoMs));
  return evaluarRevisionSemantica(CHECKLIST_PRODUCCION, utiles.textos, { negadas: utiles.negadas });
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

/** Cuántos pedidos hay en Portal para un rango (y cuántos sin hora de inicio). */
export const pedidosEnRango = async (
  desde: string,
  hasta: string,
  companyId?: string
): Promise<{ conHora: number; sinHora: number }> => {
  const OrderModel = await getOrderModel();
  const inicio = instanteArranque(desde, '00:00') ?? Date.now();
  const fin = (instanteArranque(hasta, '00:00') ?? Date.now()) + 24 * 3_600_000;
  const docs = (await OrderModel.find({
    companyId: companyId ? companyId : { $in: [...EMPRESAS_CON_PEDIDOS] },
    fechaProgramacion: { $gte: new Date(inicio - 12 * 3_600_000), $lt: new Date(fin + 12 * 3_600_000) },
    status: { $nin: ['eliminado', 'rechazado'] },
  })
    .select('fechaProgramacion horaInicio')
    .lean()) as Array<Record<string, unknown>>;
  const enRango = docs.filter((d) => {
    const dia = diaPeruano(new Date(d.fechaProgramacion as Date).getTime());
    return dia >= desde && dia <= hasta;
  });
  const conHora = enRango.filter((d) => String(d.horaInicio || '').trim()).length;
  return { conHora, sinHora: enRango.length - conHora };
};

/** Por mención, una vez al día: lo que no se resolvió ayer se vuelve a decir hoy, no cada 20 min. */
const MENCION_REPETIR_MS = 24 * 3_600_000;
const propuestasDeMencion = new Map<string, number>();

/** Solo para tests. */
export const _resetMenciones = (): void => propuestasDeMencion.clear();

const recortar = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * LO QUE SE DIJO Y NO ES PEDIDO. José, 14/09: «muchas veces crean el pedido
 * hasta el último día o las últimas horas antes». Si en el grupo mencionaron
 * producciones por venir y en Portal no hay pedido para ese día —o lo hay pero
 * sin hora de inicio—, se proponen dos cosas en operaciones, UNA VEZ por día y
 * agrupando todo lo pendiente: un aviso PREVIO a planta («posible
 * producción…», marcado como no confirmado) y un recordatorio al grupo admin
 * para que carguen los pedidos con su hora. Cada una se aprueba por separado.
 * Con pedido y hora, no hay nada que decir: el flujo normal se ocupa.
 */
const proponerPorMenciones = async (
  alcance: Awaited<ReturnType<typeof alcanceVigente>>,
  ahoraMs: number
): Promise<number> => {
  const hoy = diaPeruano(ahoraMs);
  const menciones = detectarMenciones(mensajesDesde(alcance.grupoEscuchado, ahoraMs - VENTANA_MS)).filter((m) => m.hasta >= hoy);
  const sinPedido: MencionDeProduccion[] = [];
  const sinHora: MencionDeProduccion[] = [];
  for (const mencion of menciones) {
    const firma = firmaMencion(mencion);
    const ultima = propuestasDeMencion.get(firma);
    if (ultima && ahoraMs - ultima < MENCION_REPETIR_MS) continue;
    try {
      const pedidos = await pedidosEnRango(mencion.desde < hoy ? hoy : mencion.desde, mencion.hasta, mencion.companyId);
      if (pedidos.conHora > 0) continue;
      (pedidos.sinHora > 0 ? sinHora : sinPedido).push(mencion);
    } catch (error) {
      logger.warn(`[agente] no pude mirar los pedidos de una mención: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (sinPedido.length === 0 && sinHora.length === 0) return 0;
  const todas = [...sinPedido, ...sinHora];
  const firma = todas.map(firmaMencion).join(';');
  if (yaPropuesta('recordatorio-pedido', firma, ahoraMs)) return 0;
  for (const m of todas) propuestasDeMencion.set(firmaMencion(m), ahoraMs);

  // Lo que dijeron, textual, para que operaciones juzgue con el original a la vista.
  const citas = [...new Set(todas.map((m) => m.texto))].slice(0, 2).map((t) => `«${recortar(t.replace(/\s+/g, ' '), 180)}»`);
  const contexto = `En «${alcance.nombreGrupo || 'el grupo'}» dijeron: ${citas.join(' / ')}`;
  let nuevas = 0;
  if (sinPedido.length && alcance.grupoPlanta) {
    const texto = textoAvisoPrevio(sinPedido);
    const propuesta = proponer(
      { tipo: 'aviso-mencion', fecha: sinPedido[0].desde, firma, destino: alcance.grupoPlanta, nombreDestino: alcance.nombreGrupoPlanta || 'planta', texto },
      ahoraMs
    );
    await publicarPropuesta(propuesta, [contexto, 'No hay pedido en Portal: sin él no sale el aviso formal ni el checklist.', '', conPiePropuesta(texto, propuesta.nombreDestino)].join('\n'));
    logger.info(`[agente] propuesta ${propuesta.id}: aviso previo por ${sinPedido.length} mención(es) → «${propuesta.nombreDestino}»`);
    nuevas += 1;
  }
  const recordatorio = textoRecordatorioPedido(sinPedido, sinHora);
  const propuesta = proponer(
    { tipo: 'recordatorio-pedido', fecha: todas[0].desde, firma, destino: alcance.grupoEscuchado, nombreDestino: alcance.nombreGrupo || 'admin', texto: recordatorio },
    ahoraMs
  );
  await publicarPropuesta(propuesta, [sinPedido.length ? '' : contexto, conPiePropuesta(recordatorio, propuesta.nombreDestino)].filter(Boolean).join('\n'));
  logger.info(`[agente] propuesta ${propuesta.id}: recordatorio de pedido por ${todas.length} mención(es)${sinHora.length ? ` (${sinHora.length} sin hora)` : ''} → «${propuesta.nombreDestino}»`);
  return nuevas + 1;
};
