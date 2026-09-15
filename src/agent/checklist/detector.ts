import logger from '../../utils/logger.js';
import { getOrderModel } from '../../database/models.js';
import { AGENTE_ACTIVO, EMPRESAS_CON_PEDIDOS, destinoPermitido } from './alcance.js';
import { alcanceVigente } from './observador.js';
import { mensajesDesde, observados } from './almacen.js';
import { esConfirmacionEnBloque, filtrarMensajes, type MensajeGrupo } from './mensajes.js';
import { CHECKLIST_PRODUCCION, type ChecklistDomain, type ChecklistItem } from './checklist.js';
import { evaluarRevisionSemantica } from './semantica.js';
import {
  conPiePropuesta,
  construirAvisoChecklist,
  construirAvisoProduccion,
  describirCambio,
  firmaAviso,
} from './aviso.js';
import { enviarAOperaciones, preguntarEnGrupo, publicarPropuesta, responderEnGrupo } from './emisor.js';
import { guardarPropuesta } from './persistencia.js';
import {
  _resetPropuestas,
  anotarMensaje,
  pendientes,
  porMensaje,
  proponer,
  propuestasDe,
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

  // Lo que venció sin respuesta se dice UNA vez y en una línea (si no, una
  // propuesta ignorada se confunde con una aprobada), y se persiste vencido
  // para que un reinicio no lo vuelva a vencer.
  const vencidas = vencidasAhora(ahoraMs).filter((p) => p.destino);
  for (const vencida of vencidas) void guardarPropuesta(vencida);
  if (vencidas.length) {
    const NOMBRE: Record<string, string> = { 'aviso-planta': 'aviso a planta', 'checklist-planta': 'checklist de planta', 'checklist-admin': 'checklist', 'aviso-mencion': 'aviso previo a planta', 'recordatorio-pedido': 'recordatorio de pedido' };
    const lista = vencidas.map((p) => `${NOMBRE[p.tipo] ?? p.tipo} (${p.nombreDestino})`).join(', ');
    await enviarAOperaciones(`⌛ Sin respuesta en 6 h, no se mandó: ${lista}.`);
  }

  const pedidos = await pedidosConArranque(ahoraMs);
  const dias = agruparPorDia(pedidos);
  let nuevas = 0;
  // UN MENSAJE POR PASADA al grupo (José, 14/09, 20:40: «mira todo lo que
  // envió y a la misma hora, que era lo que te pedí que no quería»). Lo que
  // no entra hoy sale en la siguiente pasada, 20 min después, en este orden:
  // el aviso del día, el checklist de planta, el de campo, las menciones.
  const presupuesto = { restantes: 1 };

  // UNA línea por corrida, siempre: «¿está escuchando?» se contesta con un grep.
  logger.info(
    `[agente] detección: ${pedidos.length} pedido(s) en ${dias.length} día(s), ` +
      `${observados(alcance.grupoEscuchado)} mensaje(s) observados del grupo, ` +
      `${pendientes(ahoraMs).length} propuesta(s) esperando respuesta, ` +
      `días ${dias.map((d) => `${d.fecha} (${d.pedidos.map((p) => `${p.hora} ${p.empresa} ${p.cubos}m³`).join(', ')})`).join(' | ') || '—'}`
  );

  for (const dia of dias) {
    if (ahoraMs >= dia.arranqueMs + 60 * 60_000) continue; // arrancó hace más de 1 h: ya no se coordina, se produce
    nuevas += await proponerAvisoDelDia(dia, alcance, ahoraMs, presupuesto);
    nuevas += await proponerRevisionDelDia(dia, alcance, ahoraMs, presupuesto);
  }

  nuevas += await proponerPorMenciones(alcance, ahoraMs, presupuesto);

  return nuevas;
};

/** Cuántos mensajes quedan por mandar en esta pasada. */
type Presupuesto = { restantes: number };
const SIN_LIMITE: Presupuesto = { restantes: Number.POSITIVE_INFINITY };

const proponerAvisoDelDia = async (
  dia: DiaDePlanta,
  alcance: Awaited<ReturnType<typeof alcanceVigente>>,
  ahoraMs: number,
  presupuesto: Presupuesto = SIN_LIMITE
): Promise<number> => {
  if (!alcance.grupoPlanta || presupuesto.restantes <= 0) return 0;
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
  await publicarPropuesta(propuesta, conPiePropuesta(texto, propuesta.nombreDestino), alcance);
  presupuesto.restantes -= 1;
  ultimaVersionDelDia.set(dia.fecha, dia.pedidos);
  logger.info(`[agente] propuesta ${propuesta.id}: ${cambio ? 'actualización' : 'aviso'} de producción ${dia.fecha} → «${propuesta.nombreDestino}»`);
  return 1;
};

/**
 * «@lila manda el aviso a planta con la programación de mañana»: la propuesta
 * a pedido, en el grupo donde lo pidieron, aunque el detector ya la haya
 * propuesto (o aunque esté apagado por interruptor: pedirla es prenderla para
 * esto). José, 14/09 (19:30): «si en caso no me lo sugieres, yo debería poder
 * decirle que envíe el mensaje al grupo de planta».
 */
export const proponerAvisoManual = async (
  fecha: string,
  alcance: Awaited<ReturnType<typeof alcanceVigente>>,
  ahoraMs = Date.now()
): Promise<string> => {
  if (!alcance.grupoPlanta) return 'No tengo resuelto el grupo de planta: no puedo armar el aviso.';
  const pedidos = await pedidosConArranque(ahoraMs);
  const dia = agruparPorDia(pedidos).find((d) => d.fecha === fecha);
  if (!dia) return `No hay pedidos con hora de inicio para el ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}: sin pedido no hay aviso que mandar.`;
  const firmaBase = `${firmaDia(dia)}|aviso`;
  const enviada = propuestasDe('aviso-planta').find((p) => p.firma === firmaBase && p.estado === 'aprobada');
  if (enviada?.decididaMs) {
    const hora = new Date(enviada.decididaMs).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });
    return `Ese aviso ya se mandó a «${enviada.nombreDestino}» hoy a las ${hora}. Si cambió algo, dime qué y lo propongo de nuevo.`;
  }
  const texto = construirAvisoProduccion(dia);
  const propuesta = proponer(
    { tipo: 'aviso-planta', fecha: dia.fecha, firma: `${firmaBase}|manual|${ahoraMs}`, destino: alcance.grupoPlanta, nombreDestino: alcance.nombreGrupoPlanta || 'planta', texto },
    ahoraMs
  );
  await publicarPropuesta(propuesta, conPiePropuesta(texto, propuesta.nombreDestino), alcance);
  ultimaVersionDelDia.set(dia.fecha, dia.pedidos);
  logger.info(`[agente] propuesta ${propuesta.id}: aviso de producción ${dia.fecha} a pedido → «${propuesta.nombreDestino}»`);
  return '';
};

const proponerRevisionDelDia = async (
  dia: DiaDePlanta,
  alcance: Awaited<ReturnType<typeof alcanceVigente>>,
  ahoraMs: number,
  presupuesto: Presupuesto = SIN_LIMITE
): Promise<number> => {
  const momento = momentoVigente(dia, ahoraMs);
  if (!momento || presupuesto.restantes <= 0) return 0;

  // Solo interesa lo que se dijo DESDE que el día existe: un «cuadrilla lista»
  // anterior a que se cargara el primer pedido hablaba de otro día.
  const delGrupo = mensajesDesde(alcance.grupoEscuchado, dia.creadoMs);
  const utiles = filtrarMensajes(delGrupo);
  const revision = conConfirmacionesEnBloque(
    await evaluarRevisionSemantica(CHECKLIST_PRODUCCION, utiles.textos, {
      soloCriticos: momento === 'ultima-llamada',
      negadas: utiles.negadas,
    }),
    dominiosConfirmadosEnBloque(delGrupo, dia.fecha)
  );

  const contexto = {
    fecha: dia.fecha,
    minutosParaArranque: Math.round((dia.arranqueMs - ahoraMs) / 60_000),
    pedidos: dia.pedidos,
    totalCubos: dia.totalCubos,
    momento,
    grupoEscuchado: alcance.nombreGrupo || alcance.grupoEscuchado,
  };

  // UNA PARTE POR QUIEN LA RESPONDE (José, 14/09: «lo mezclas con campo y
  // planta y pierde el foco»). Lo de PLANTA (agregados, combustible, operadores,
  // clima) se propone para el grupo de planta, con aprobación; lo de CAMPO
  // (cuadrilla, tren, herramientas, comidas) se pregunta directo en INFRAMAQ
  // admin, que es donde está la gente que lo responde — ahí no hay a quién
  // proponérselo: se les está hablando a ellos.
  let nuevas = 0;
  for (const dominio of ['planta', 'obra'] as const) {
    if (presupuesto.restantes <= 0) break;
    const texto = construirAvisoChecklist(revision, contexto, dominio);
    if (!texto) continue;
    const tipo = dominio === 'planta' ? 'checklist-planta' : 'checklist-admin';
    const firma = `${firmaAviso(dia.fecha, momento, revision)}|${dominio}`;
    if (yaPropuesta(tipo, firma, ahoraMs)) continue;
    // Un horario se propone UNA vez, aunque lo pendiente cambie después: lo que
    // cambia lo recoge el siguiente horario. Es lo que evita el goteo.
    const marca = `${dia.fecha}|${momento}|${dominio}|`;
    if (yaPropuesta(tipo, marca, ahoraMs)) continue;
    const aPlanta = dominio === 'planta' && Boolean(alcance.grupoPlanta);
    const propuesta: Propuesta = proponer(
      {
        tipo,
        fecha: dia.fecha,
        firma,
        destino: aPlanta ? alcance.grupoPlanta : alcance.grupoEscuchado,
        nombreDestino: aPlanta ? alcance.nombreGrupoPlanta || 'planta' : alcance.nombreGrupo || 'admin',
        texto,
      },
      ahoraMs
    );
    // Marca del horario, independiente de lo pendiente: ver arriba. SE
    // PERSISTE, como la pregunta directa: el 14/09 a las 21:00 el checklist de
    // campo salió dos veces en 20 min porque un deploy en el medio reinició la
    // memoria y la marca solo vivía ahí.
    const marcador = proponer({ ...propuesta, firma: marca, texto: '', destino: '', nombreDestino: '' }, ahoraMs);
    marcador.estado = 'descartada';
    void guardarPropuesta(marcador);

    if (aPlanta) {
      await publicarPropuesta(propuesta, conPiePropuesta(texto, propuesta.nombreDestino), alcance);
    } else {
      const msgId = await preguntarEnGrupo(alcance.grupoEscuchado, texto, alcance);
      propuesta.estado = msgId !== null ? 'aprobada' : 'descartada';
      propuesta.decididaPor = 'agente';
      propuesta.decididaMs = ahoraMs;
      if (msgId) anotarMensaje(propuesta.id, msgId);
      void guardarPropuesta(propuesta);
    }
    presupuesto.restantes -= 1;
    nuevas += 1;
    logger.info(
      `[agente] ${aPlanta ? 'propuesta' : 'pregunta'} ${propuesta.id}: checklist de ${dominio === 'planta' ? 'planta' : 'campo'} (${momento}) de ${dia.fecha} → «${propuesta.nombreDestino}» ` +
        `(${revision.pendientes.filter((i) => i.domain === dominio).length} pendientes, ${revision.semanticas.length} confirmación(es) entendidas por semántica, ` +
        `descartados: ${JSON.stringify(utiles.descartados)})`
    );
  }
  return nuevas;
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
  const delGrupo = mensajesDesde(alcance.grupoEscuchado, dia.creadoMs);
  const utiles = filtrarMensajes(delGrupo);
  return conConfirmacionesEnBloque(await evaluarRevisionSemantica(CHECKLIST_PRODUCCION, utiles.textos, { negadas: utiles.negadas }), dominiosConfirmadosEnBloque(delGrupo, fecha));
};

/**
 * «Sí, está confirmado» RESPONDIENDO al checklist de campo (o de planta):
 * cierra todos los ítems de esa parte para ese día. Se sabe a qué checklist
 * responde por el id del mensaje citado, que quedó anotado en la propuesta
 * (Globofast, 14/09, 21:01, y José: «ya lo marca solo y deja de mandar los
 * recordatorios» — tenía que ser verdad).
 */
export const dominiosConfirmadosEnBloque = (mensajes: MensajeGrupo[], fecha: string): Set<ChecklistDomain> => {
  const dominios = new Set<ChecklistDomain>();
  for (const m of mensajes) {
    if (m.esPropio || !m.citaId || !esConfirmacionEnBloque(m.texto)) continue;
    const citada = porMensaje(m.citaId);
    if (!citada || citada.fecha !== fecha) continue;
    if (citada.tipo === 'checklist-planta') dominios.add('planta');
    if (citada.tipo === 'checklist-admin') dominios.add('obra');
  }
  return dominios;
};

const conConfirmacionesEnBloque = <R extends { pendientes: ChecklistItem[]; resueltos: ChecklistItem[] }>(revision: R, dominios: Set<ChecklistDomain>): R => {
  if (!dominios.size) return revision;
  const cerrados = revision.pendientes.filter((i) => dominios.has(i.domain));
  return { ...revision, pendientes: revision.pendientes.filter((i) => !dominios.has(i.domain)), resueltos: [...revision.resueltos, ...cerrados] };
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
  ahoraMs: number,
  presupuesto: Presupuesto = SIN_LIMITE
): Promise<number> => {
  if (presupuesto.restantes <= 0) return 0;
  // No es urgente: se dice en horario de oficina, no a las 20:40 junto con el
  // checklist ni a las 3 de la mañana.
  if (!enHorarioDeOficina(ahoraMs)) return 0;
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
  if (yaPropuesta('recordatorio-pedido', firma, ahoraMs) || yaPropuesta('aviso-mencion', firma, ahoraMs)) return 0;
  for (const m of todas) propuestasDeMencion.set(firmaMencion(m), ahoraMs);

  // UN SOLO MENSAJE en el grupo (14/09: eran dos, y además citaban lo que el
  // mismo grupo acababa de decir): el recordatorio de cargar los pedidos, y
  // —si hay producciones sin pedido y un grupo de planta— la pregunta de si
  // se avisa a planta lo posible, que se aprueba con el «1» de siempre.
  const recordatorio = textoRecordatorioPedido(sinPedido, sinHora);
  if (sinPedido.length && alcance.grupoPlanta) {
    const texto = textoAvisoPrevio(sinPedido);
    const propuesta = proponer(
      { tipo: 'aviso-mencion', fecha: sinPedido[0].desde, firma, destino: alcance.grupoPlanta, nombreDestino: alcance.nombreGrupoPlanta || 'planta', texto },
      ahoraMs
    );
    await publicarPropuesta(propuesta, `${recordatorio}\n\n📨 ¿Aviso a «${propuesta.nombreDestino}» de lo posible? Responde a este mensaje (deslízalo) con *1* para avisar, o *3* para no.`, alcance);
    presupuesto.restantes -= 1;
    logger.info(`[agente] propuesta ${propuesta.id}: recordatorio + aviso previo por ${todas.length} mención(es) → «${propuesta.nombreDestino}»`);
    return 1;
  }
  const propuesta = proponer(
    { tipo: 'recordatorio-pedido', fecha: todas[0].desde, firma, destino: alcance.grupoEscuchado, nombreDestino: alcance.nombreGrupo || 'admin', texto: recordatorio },
    ahoraMs
  );
  const enviado = await responderEnGrupo(alcance.grupoEscuchado, { texto: recordatorio }, alcance);
  propuesta.estado = enviado ? 'aprobada' : 'descartada';
  propuesta.decididaPor = 'agente';
  propuesta.decididaMs = ahoraMs;
  void guardarPropuesta(propuesta);
  presupuesto.restantes -= 1;
  logger.info(`[agente] recordatorio ${propuesta.id}: pedidos sin hora por ${todas.length} mención(es) → «${propuesta.nombreDestino}»`);
  return 1;
};

/** De 08:00 a 19:00 en Lima: cuando la gente carga pedidos. */
export const enHorarioDeOficina = (ahoraMs: number): boolean => {
  const hora = Number(new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', hour12: false }).format(new Date(ahoraMs)));
  return hora >= 8 && hora < 19;
};
