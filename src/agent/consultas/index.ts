import logger from '../../utils/logger.js';
import { CATALOGO, esConsulta, extraerParametros, fueraDeCatalogo, preguntaLimpia, rutearPorReglas, type ClaveConsulta, type Parametros } from './catalogo.js';
import { construirVista, type VistaDelDia } from './vista.js';
import { PREGUNTA_UNIDAD, acotarArchivos, elegirPedido, etiquetaPedido, identificaUnidad, responder, unidadPor, type Respuesta } from './responder.js';
import { enlaceDelPedido, guiasDelPedido, informesDelDia, mediaDelDespacho, type Archivo } from './archivos.js';
import { preguntar, responderPendiente, textoPregunta } from './pendientes.js';
import { fusionar, pareceContinuacion, recordarConsulta, ultimaConsulta } from './contexto.js';
import { LOCATIONS } from '../../services/weather-asphalt-forecast.service.js';
import { ALIAS_EMPRESA } from './catalogo.js';
import { SIN_AGREGADOS, consumosDelDia, materiales, materialesPorEmpresa, tanques, textoConsumos, textoMateriales, textoMaterialesDe, textoTanques } from './planta.js';
import { distritoDe, diasHasta, pronosticoHorario, pronosticoSemanal, textoClima, textoClimaSemanal, textoFueraDeAlcance } from './clima.js';
import { pngAgregados, pngResumenDespachos, pngTanques } from './imagen.js';
import { hoyLima, sumarDias } from './catalogo.js';
import { cargarModelo, clasificar } from '../checklist/semantica.js';
import { responderEnGrupo } from '../checklist/emisor.js';
import { fechaLegible } from '../checklist/tiempo.js';
import { revisionDelDia } from '../checklist/detector.js';
import type { AlcanceAgente } from '../checklist/alcance.js';

export { esConsulta };

/**
 * Una pregunta `@lila …` del grupo que se escucha, respondida EN ESE GRUPO.
 *
 * Es de solo lectura sobre un read model whitelisted, así que no pasa por
 * aprobación (ver `emisor.responderEnGrupo`). Cuando hay que elegir entre
 * varios pedidos, el agente pregunta con opciones numeradas y espera la
 * respuesta de esa persona en ese grupo (`pendientes.ts`).
 *
 * Nunca lanza: cuelga del listener.
 */
// Más alto que el del checklist: rutear mal una pregunta es peor que decir «no entendí».
const UMBRAL_RUTEO = 0.88;

export const rutear = async (pregunta: string): Promise<ClaveConsulta | null> => {
  // La lista negra gana también sobre el modelo: un embedding no sabe qué es un precio.
  if (fueraDeCatalogo(pregunta)) return null;
  const porRegla = rutearPorReglas(pregunta);
  if (porRegla) return porRegla;
  const embed = await cargarModelo();
  if (!embed) return null;
  const [mejor] = await clasificar(CATALOGO, [pregunta], embed);
  return mejor && mejor.similitud >= UMBRAL_RUTEO ? (mejor.itemId as ClaveConsulta) : null;
};

/** Con un pedido elegido: el enlace del cliente, si existe. */
const respuestaEnlace = async (vista: VistaDelDia, indice: number): Promise<Respuesta> => {
  const o = vista.orders[indice];
  const enlace = await enlaceDelPedido(o.companyId, o.orderId, o.companySlug);
  if (!enlace) {
    return {
      texto: `El pedido de *${o.cliente || o.companySlug}* (${fechaLegible(vista.fecha)}) no tiene enlace generado. Se genera en Portal → Pedidos → «Enlace para el cliente».`,
    };
  }
  const tabs = enlace.tabs.map((t) => ({ summary: 'resumen', production: 'producción', placement: 'colocación', reports: 'informes' })[t] ?? t);
  return {
    texto: [
      `🔗 *Enlace del cliente — ${o.cliente || o.companySlug}* · ${fechaLegible(vista.fecha)}`,
      `Muestra: ${tabs.join(', ') || 'sin pestañas'}`,
      enlace.url,
    ].join('\n'),
  };
};

/** Con un pedido elegido: sus guías y vales. */
const respuestaGuias = async (vista: VistaDelDia, indice: number): Promise<Respuesta> => {
  const o = vista.orders[indice];
  const archivos = await guiasDelPedido(o.companyId, o.orderId);
  if (archivos.length === 0) return { texto: `No hay guías ni vales generados para *${o.cliente || o.companySlug}* (${fechaLegible(vista.fecha)}).` };
  const { enviar, omitidos } = acotarArchivos(archivos);
  return {
    texto: `📄 *Guías y vales — ${o.cliente || o.companySlug}* · ${fechaLegible(vista.fecha)}: ${archivos.length} documento(s)${omitidos ? `, te mando ${enviar.length}; el resto está en Portal` : ''}.`,
    archivos: enviar.map((a) => ({ ...a, caption: a.nombre })),
  };
};

/** Fotos y videos de la unidad pedida. */
const respuestaMedia = async (vista: VistaDelDia, params: Parametros, encabezado: string): Promise<Respuesta> => {
  const u = unidadPor(vista, params);
  if (!u) return { texto: encabezado };
  const archivos = await mediaDelDespacho(u.pedido.companyId, u.pedido.orderId, u.dispatchId);
  if (archivos.length === 0) return { texto: `${encabezado}\nNo tiene fotos ni videos registrados.` };
  const { enviar, omitidos } = acotarArchivos(archivos);
  const fotos = archivos.filter((a) => a.tipo === 'image').length;
  const videos = archivos.filter((a) => a.tipo === 'video').length;
  return {
    texto: `${encabezado}\n${fotos} foto(s) y ${videos} video(s)${omitidos ? `; te mando ${enviar.length}, el resto está en Portal` : ''}.`,
    archivos: enviar,
  };
};

/**
 * Para las consultas que necesitan UN pedido: si hay uno, sigue; si hay varios,
 * pregunta y guarda la continuación; si no hay ninguno, lo dice.
 */
const conPedidoElegido = async (
  vista: VistaDelDia,
  params: Parametros,
  quien: string,
  grupo: string,
  continuar: (vista: VistaDelDia, indice: number) => Promise<Respuesta>
): Promise<Respuesta> => {
  const { pedido, candidatos } = elegirPedido(vista, params);
  if (candidatos.length === 0) return { texto: `No hay pedidos ${params.companyId ? 'de esa empresa ' : ''}para ${fechaLegible(vista.fecha)}.` };
  if (pedido) return continuar(vista, vista.orders.indexOf(pedido));
  const opciones = candidatos.map(etiquetaPedido);
  preguntar({
    quien,
    grupo,
    opciones,
    continuar: (i) => continuar(vista, vista.orders.indexOf(candidatos[i])),
  });
  return { texto: textoPregunta(`Hay ${candidatos.length} producciones ${fechaLegible(vista.fecha)}. ¿Cuál?`, opciones) };
};

/** Una imagen con su caption; si no se puede rasterizar, el texto solo. */
const conImagen = async (caption: string, nombre: string, armar: () => Promise<Buffer>): Promise<Respuesta> => {
  try {
    const buffer = await armar();
    return { texto: '', archivos: [{ tipo: 'image', url: '', nombre, fechaMs: Date.now(), mime: 'image/png', companyId: '', buffer, caption }] };
  } catch (error) {
    logger.warn(`[agente] no pude armar la imagen ${nombre}: ${error instanceof Error ? error.message : String(error)}`);
    return { texto: caption };
  }
};

const armarRespuesta = async (
  clave: ClaveConsulta | null,
  pregunta: string,
  quien: string,
  grupo: string
): Promise<Respuesta> => {
  const params = extraerParametros(pregunta);
  // Una fecha nombrada («el martes», «15/09») manda; si no, hoy o mañana.
  const fecha = params.fecha ?? (params.day === 'tomorrow' ? sumarDias(hoyLima(), 1) : hoyLima());
  const vista = await construirVista(fecha);

  // Lo de planta no depende de los pedidos del día: se contesta aunque no haya.
  // Tanques y agregados van en IMAGEN con el texto de caption (José, 14/09), las
  // mismas tarjetas del cron; si la imagen no se puede armar, queda el texto.
  if (clave === 'tank_levels') {
    const lista = await tanques();
    const texto = textoTanques(lista);
    if (lista.length === 0) return { texto };
    return conImagen(texto, `tanques-${fecha}.png`, () => pngTanques(lista, 'Inframaq · planta'));
  }
  if (clave === 'production_consume') return { texto: textoConsumos(await consumosDelDia(fecha), fecha) };
  if (clave === 'aggregates_stock') {
    const porEmpresa = materialesPorEmpresa(await materiales(await empresasDelPiloto()));
    if (porEmpresa.length === 0) return { texto: SIN_AGREGADOS };
    const archivos: Archivo[] = [];
    for (const { empresa, materiales: ms } of porEmpresa) {
      const r = await conImagen(textoMaterialesDe(empresa, ms), `agregados-${empresa}-${fecha}.png`, () => pngAgregados(ms, empresa));
      if (r.archivos) archivos.push(...r.archivos);
      else return { texto: textoMateriales(porEmpresa.flatMap((e) => e.materiales)) };
    }
    return { texto: '', archivos };
  }
  if (clave === 'weather') {
    const distrito = distritoDe(pregunta);
    if (params.rango === 'semana') return { texto: textoClimaSemanal(await pronosticoSemanal(distrito)) };
    if (diasHasta(fecha, hoyLima()) === null) return { texto: textoFueraDeAlcance(fecha) };
    const horaLima = Number(new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', hour12: false }).slice(0, 2));
    return { texto: textoClima(await pronosticoHorario(distrito, fecha), fecha === hoyLima() ? horaLima : -1) };
  }

  if (clave === 'dispatch_summary') {
    if (vista.orders.length === 0) return { texto: responder(clave, { vista, params }) };
    // En imagen (José, 13/09), y el texto de respaldo si la imagen no se pudiera armar.
    const r = await conImagen(`📋 Despachos de ${fechaLegible(fecha)}`, `despachos-${fecha}.png`, () => pngResumenDespachos(vista));
    return r.archivos ? r : { texto: responder(clave, { vista, params }) };
  }

  if (clave === 'order_link') return conPedidoElegido(vista, params, quien, grupo, respuestaEnlace);
  if (clave === 'guias_day') return conPedidoElegido(vista, params, quien, grupo, respuestaGuias);
  // Las consultas de una unidad sin unidad: se PREGUNTA, y la respuesta de la
  // persona («la 4», «AML838», «la última») completa esta misma consulta.
  const deUnidad = clave === 'unit_media' || clave === 'unit_departure' || clave === 'unit_driver' || clave === 'unit_eta';
  if (deUnidad && !identificaUnidad(params)) {
    preguntar({
      quien,
      grupo,
      opciones: [],
      tipo: 'unidad',
      continuar: (_i, texto) => armarRespuesta(clave, `${pregunta} ${texto ?? ''}`, quien, grupo),
    });
    return { texto: PREGUNTA_UNIDAD };
  }
  if (clave === 'unit_media') {
    const encabezado = responder(clave, { vista, params });
    return unidadPor(vista, params) ? respuestaMedia(vista, params, encabezado) : { texto: encabezado };
  }
  const revision = clave === 'checklist_status' ? await revisionDelDia(fecha) : null;
  const informes =
    clave === 'reports_status' || clave === 'site_finish'
      ? await informesDeLaVista(vista, params, fecha)
      : null;
  return { texto: responder(clave, { vista, params: { ...params, pregunta } as Parametros, revision, informes }) };
};

/** Las empresas del piloto con su nombre, para etiquetar el stock. */
const empresasDelPiloto = async (): Promise<Array<{ companyId: string; nombre: string }>> => {
  const { getCompanyModel } = await import('../../database/models.js');
  const { EMPRESAS_CON_PEDIDOS } = await import('../checklist/alcance.js');
  const CompanyModel = await getCompanyModel();
  const docs = (await CompanyModel.find({ companyId: { $in: [...EMPRESAS_CON_PEDIDOS] } }).select('companyId name').lean()) as Array<{ companyId?: string; name?: string }>;
  return docs.map((d) => ({ companyId: String(d.companyId), nombre: String(d.name || d.companyId) }));
};

/** Informes del día de la empresa preguntada (o de todas las del día). */
const informesDeLaVista = async (vista: VistaDelDia, params: Parametros, fecha: string) => {
  const pedidos = params.companyId ? vista.orders.filter((o) => o.companyId === params.companyId) : vista.orders;
  const empresas = Array.from(new Set(pedidos.map((o) => o.companyId)));
  if (empresas.length === 0) return [];
  const porEmpresa = await Promise.all(
    empresas.map((companyId) =>
      informesDelDia(companyId, pedidos.filter((o) => o.companyId === companyId).map((o) => o.orderId), fecha)
    )
  );
  // Con varias empresas se funde por tipo: «completado» le gana a «borrador» y a «no hay».
  const orden = { completed: 2, draft: 1 } as const;
  return porEmpresa[0].map((base, i) => {
    const mismos = porEmpresa.map((lista) => lista[i]);
    const mejor = mismos.reduce((a, b) => ((orden[b.status as 'completed' | 'draft'] ?? 0) > (orden[a.status as 'completed' | 'draft'] ?? 0) ? b : a));
    return { ...base, status: mejor.status, cantidad: mismos.reduce((n, x) => n + x.cantidad, 0) };
  });
};

/** Umbral para PROPONER («¿te referís a…?») cuando no alcanza para rutear. */
const UMBRAL_SUGERENCIA = 0.72;

const EJEMPLO: Partial<Record<ClaveConsulta, string>> = {
  plant_current_unit: 'en qué carro van los despachos en planta',
  site_current_unit: 'qué unidad está en campo',
  unit_media: 'las fotos y videos de una unidad',
  order_link: 'el enlace del pedido para el cliente',
  guias_day: 'las guías y vales de hoy',
  day_progress: 'cuántos m³ van',
  unit_departure: 'a qué hora salió una unidad',
  unit_eta: 'cuánto falta para que llegue una unidad',
  unit_driver: 'quién maneja una unidad',
  orders_day: 'qué pedidos hay',
  checklist_status: 'cómo va el checklist',
  reports_status: 'qué informes están hechos',
  plant_finish: 'cuánto falta para terminar en planta',
  site_finish: 'cuánto falta para terminar en campo',
  tank_levels: 'cuántos galones hay en los tanques',
  production_consume: 'los consumos de la producción',
  aggregates_stock: 'el stock de agregados',
  weather: 'el clima',
  dispatch_summary: 'el resumen de despachos',
  help: 'la ayuda',
};

/**
 * Cuando no se entiende: ¿es una CONTINUACIÓN de lo último que preguntó esta
 * persona? ¿O se parece bastante a algo del catálogo como para proponerlo?
 * Lo general de la experiencia está acá, no en cada consulta.
 */
const sinRuta = async (pregunta: string, quien: string, grupo: string): Promise<{ clave: ClaveConsulta | null; pregunta: string; respuesta?: Respuesta }> => {
  const ultima = ultimaConsulta(quien, grupo);
  if (ultima && pareceContinuacion(pregunta)) {
    // La misma pregunta con el dato nuevo, y sin el dato viejo del mismo tipo.
    return {
      clave: ultima.clave as ClaveConsulta,
      pregunta: fusionar(pregunta, ultima.pregunta, LOCATIONS.map((l) => l.name), ALIAS_EMPRESA.flatMap((e) => e.alias)),
    };
  }
  const embed = await cargarModelo();
  if (embed) {
    const [mejor] = await clasificar(CATALOGO, [pregunta], embed);
    if (mejor && mejor.similitud >= UMBRAL_SUGERENCIA) {
      const clave = mejor.itemId as ClaveConsulta;
      preguntar({
        quien,
        grupo,
        opciones: [],
        tipo: 'confirmar',
        continuar: async () => armarRespuesta(clave, pregunta, quien, grupo),
      });
      return { clave: null, pregunta, respuesta: { texto: `¿Quieres que te pase ${EJEMPLO[clave] ?? clave}? Responde *sí*.` } };
    }
  }
  return { clave: null, pregunta };
};

export const atenderConsulta = async (
  texto: string,
  quien: string,
  grupo: string,
  alcance: AlcanceAgente,
  numeroBot?: string
): Promise<void> => {
  try {
    let pregunta = preguntaLimpia(texto, numeroBot);
    let clave = await rutear(pregunta);
    let respuesta: Respuesta | undefined;
    if (!clave) ({ clave, pregunta, respuesta } = await sinRuta(pregunta, quien, grupo));
    respuesta = respuesta ?? (await armarRespuesta(clave, pregunta, quien, grupo));
    if (clave) recordarConsulta({ quien, grupo, clave, pregunta });
    logger.info(`[agente] consulta de ${quien}: «${preguntaLimpia(texto, numeroBot)}» → ${clave ?? 'none'}${respuesta.archivos?.length ? ` (+${respuesta.archivos.length} archivo(s))` : ''}`);
    await responderEnGrupo(grupo, respuesta, alcance);
  } catch (error) {
    logger.warn(`[agente] no pude atender la consulta «${texto}»: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Un mensaje SIN @lila de alguien que preguntó hace un momento: si parece una
 * continuación, se atiende como tal. Es lo que hace que «¿y la 3?» funcione.
 */
export const atenderContinuacion = async (
  texto: string,
  quien: string,
  grupo: string,
  alcance: AlcanceAgente
): Promise<boolean> => {
  const ultima = ultimaConsulta(quien, grupo);
  if (!ultima) return false;
  // Dos formas de seguir hablando sin volver a etiquetar al agente: un cambio
  // de dato («¿y la 3?»), o una consulta nueva que las REGLAS reconocen con
  // certeza («ahora el resumen de líquidos»). Solo reglas, no el modelo: en
  // una charla entre personas un parecido no alcanza para meterse.
  if (!pareceContinuacion(texto) && !rutearPorReglas(preguntaLimpia(texto))) return false;
  await atenderConsulta(`@lila ${texto}`, quien, grupo, alcance);
  return true;
};

/** Un número suelto de alguien con una pregunta pendiente: es su respuesta. */
export const atenderEleccion = async (
  texto: string,
  quien: string,
  grupo: string,
  alcance: AlcanceAgente
): Promise<boolean> => {
  const eleccion = responderPendiente(quien, grupo, texto);
  if (!eleccion) return false;
  try {
    const respuesta = (await eleccion.pregunta.continuar(eleccion.indice, eleccion.texto)) as Respuesta;
    logger.info(`[agente] ${quien} contestó «${eleccion.texto}» a la pregunta pendiente`);
    await responderEnGrupo(grupo, respuesta, alcance);
  } catch (error) {
    logger.warn(`[agente] no pude continuar la consulta de ${quien}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return true;
};
