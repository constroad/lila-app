import logger from '../../utils/logger.js';
import { CATALOGO, esConsulta, especificidadDeRegla, extraerParametros, fueraDeCatalogo, preguntaLimpia, rutearPorReglas, type ClaveConsulta, type Parametros } from './catalogo.js';
import { construirVista, type VistaDelDia } from './vista.js';
import { PREGUNTA_UNIDAD, acotarArchivos, elegirPedido, etiquetaPedido, identificaUnidad, responder, unidadPor, type Respuesta } from './responder.js';
import { enlaceDelPedido, guiasDelPedido, informesDelDia, mediaDelDespacho, type Archivo } from './archivos.js';
import { preguntar, responderPendiente, textoPregunta } from './pendientes.js';
import { TEMAS, menuAyuda, temaPorPalabra, textoTema } from './ayuda.js';
import { fusionar, pareceContinuacion, pareceParaElAgente, recordarConsulta, ultimaConsulta } from './contexto.js';
import { ALIAS_EMPRESA } from './catalogo.js';
import { SIN_AGREGADOS, consumosDelDia, materiales, materialesPorEmpresa, tanques, textoConsumos, textoMateriales, textoMaterialesDe, textoTanques } from './planta.js';
import { NOMBRES_DE_DISTRITOS, diasHasta, distritosDe, lugarDesconocido, pronosticoHorario, pronosticoSemanal, riesgoPorDistrito, textoClima, textoClimaSemanal, textoFueraDeAlcance, textoLugarDesconocido, textoRiesgoDistritos } from './clima.js';
import { pngAgregados, pngResumenDespachos, pngTanques } from './imagen.js';
import { fechaDe, hoyLima, normalizar, sumarDias } from './catalogo.js';
import { cargarModelo, clasificar } from '../checklist/semantica.js';
import { dejarDeEscribir, empezarAEscribir, responderEnGrupo } from '../checklist/emisor.js';
import { argumentosDeRango, elegirHerramienta, esHerramientaDeDatos, herramientaDeDatosPorReglas, normalizarArgumentos, responderConDatos, type Argumentos, type HerramientaDeDatos } from '../llm/index.js';
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

/** Desde cuántas palabras una pregunta va primero al modelo y no a las reglas. */
const PALABRAS_PARA_MODELO = 12;

/** Las consultas que hablan de UN día: con un rango en la pregunta, es la programación o el historial del rango. */
const esDeUnDia = (clave: ClaveConsulta | null): boolean => clave === 'orders_day' || clave === 'dispatch_summary' || clave === 'day_progress';

/** Lo que el modelo generativo sacó de la pregunta, en el molde de siempre. */
const comoParametros = (a: Argumentos): Partial<Parametros> => ({
  ...(a.fecha ? { fecha: a.fecha } : {}),
  ...(a.unitNumber ? { unitNumber: a.unitNumber } : {}),
  ...(a.plate ? { plate: a.plate } : {}),
  ...(a.companyId ? { companyId: a.companyId } : {}),
});

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
  grupo: string,
  extra: Partial<Parametros> = {}
): Promise<Respuesta> => {
  // Lo que se lee de la pregunta con reglas, y encima lo que entendió el modelo
  // generativo («la semana pasada», «el martes pasado») cuando lo hubo.
  const params = { ...extraerParametros(pregunta), ...extra };
  // Una fecha nombrada («el martes», «15/09») manda; si no, hoy o mañana.
  const fecha = params.fecha ?? (params.day === 'tomorrow' ? sumarDias(hoyLima(), 1) : hoyLima());
  const vista = await construirVista(fecha);

  // LA AYUDA POR NIVELES: «ayuda» muestra los temas y deja la elección
  // pendiente (10 min); «ayuda clima» va directo al tema. Al mostrar un tema
  // se vuelve a dejar pendiente, para saltar a otro con su número.
  if (clave === 'help') {
    const menuPendiente = () =>
      preguntar({
        quien,
        grupo,
        opciones: TEMAS.map((t) => t.titulo),
        continuar: async (i) => {
          menuPendiente();
          return { texto: textoTema(i) };
        },
      });
    const tema = temaPorPalabra(pregunta);
    menuPendiente();
    return { texto: tema === null ? menuAyuda({ hayPedidosHoy: vista.orders.length > 0 }) : textoTema(tema) };
  }

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
  if (clave === 'weather_districts') {
    // Un día concreto, o la semana (también cuando la pregunta trae varios días: «martes, miércoles y jueves»).
    const unDia = params.rango !== 'semana' && (params.fecha || /\bhoy\b/.test(pregunta) || params.day === 'tomorrow') && !/\b(y|,)\s*(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/i.test(pregunta);
    if (unDia && diasHasta(fecha, hoyLima()) === null) return { texto: textoFueraDeAlcance(fecha) };
    return { texto: textoRiesgoDistritos(await riesgoPorDistrito(unDia ? (diasHasta(fecha, hoyLima()) ?? 1) : 7), unDia ? fecha : undefined) };
  }
  if (clave === 'weather') {
    // Un lugar que no conozco se dice; varios distritos se contestan todos
    // («clima en la molina y cajamarquilla», 14/09: solo salió La Molina).
    const desconocido = lugarDesconocido(pregunta);
    if (desconocido) return { texto: textoLugarDesconocido(desconocido) };
    const distritos = distritosDe(pregunta);
    if (params.rango === 'semana') {
      const textos = await Promise.all(distritos.map(async (d) => textoClimaSemanal(await pronosticoSemanal(d))));
      return { texto: textos.join('\n\n') };
    }
    if (diasHasta(fecha, hoyLima()) === null) return { texto: textoFueraDeAlcance(fecha) };
    const horaLima = Number(new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', hour12: false }).slice(0, 2));
    const textos = await Promise.all(distritos.map(async (d) => textoClima(await pronosticoHorario(d, fecha), fecha === hoyLima() ? horaLima : -1)));
    return { texto: textos.join('\n\n') };
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
  weather_districts: 'qué distritos tienen riesgo de lluvia',
  dispatch_summary: 'el resumen de despachos',
  help: 'la ayuda',
};

interface Ruta {
  clave: ClaveConsulta | null;
  pregunta: string;
  respuesta?: Respuesta;
  extra?: Partial<Parametros>;
}

/**
 * Cuando las reglas no reconocen la pregunta, en este orden:
 *
 * 1. ¿Es una CONTINUACIÓN de lo último que preguntó esta persona? («¿y la 3?»)
 * 2. EL MODELO GENERATIVO elige una herramienta y sus argumentos (`llm/`): es
 *    lo que entiende «qué le despachamos a cobeñas la semana pasada» o «el
 *    teléfono del cliente zapata». Sin modelo (no bajó, no cargó, se pasó de
 *    tiempo) se sigue con lo de antes.
 * 3. Los embeddings: rutean si se parecen mucho, proponen si se parecen algo.
 *
 * Lo general de la experiencia está acá, no en cada consulta.
 */
const sinRuta = async (pregunta: string, quien: string, grupo: string, reglaDeRespaldo: ClaveConsulta | null = null, implicita = false): Promise<Ruta> => {
  const ultima = ultimaConsulta(quien, grupo);
  if (ultima && pareceContinuacion(pregunta)) {
    // La misma pregunta con el dato nuevo, y sin el dato viejo del mismo tipo.
    const fusionada = fusionar(pregunta, ultima.pregunta, NOMBRES_DE_DISTRITOS, ALIAS_EMPRESA.flatMap((e) => e.alias));
    // Un hilo de datos (clientes, kardex…) lo sigue el modelo, que es quien lo abrió.
    if (!esHerramientaDeDatos(ultima.clave)) return { clave: ultima.clave as ClaveConsulta, pregunta: fusionada };
    pregunta = fusionada;
  }
  // Un mensaje IMPLÍCITO (sin @lila) no pasa por el modelo ni pide confirmación:
  // solo las reglas y los embeddings con certeza. El modelo, ante «como ven esos
  // son ejemplos…», eligió `help` y Lila contestó con el menú (14/09, 18:11).
  if (implicita) {
    if (reglaDeRespaldo) return { clave: reglaDeRespaldo, pregunta };
    const embed = await cargarModelo();
    if (embed) {
      const [mejor] = await clasificar(CATALOGO, [pregunta], embed);
      if (mejor && mejor.similitud >= UMBRAL_RUTEO && mejor.itemId !== 'help') return { clave: mejor.itemId as ClaveConsulta, pregunta };
    }
    return { clave: null, pregunta };
  }
  // La pregunta anterior del hilo solo ayuda con una pregunta CORTA («¿y en
  // Ate?»); a una larga la confunde: «y el clima en la molina…» tras «stock de
  // líquidos» fue a los agregados (14/09).
  const eleccion = await elegirHerramienta(pregunta, pregunta.split(/\s+/).length <= 8 ? ultima?.pregunta : undefined);
  if (eleccion) {
    // «Hay programación de despachos esta semana?» → el modelo dice «resumen
    // de despachos» (de un día); el rango de la pregunta manda.
    const rango = esDeUnDia(eleccion.herramienta as ClaveConsulta) ? argumentosDeRango(pregunta) : null;
    if (esHerramientaDeDatos(eleccion.herramienta) || rango) {
      const herramienta = rango ? 'pedidos' : (eleccion.herramienta as HerramientaDeDatos);
      const argumentos = rango ?? eleccion.argumentos;
      recordarConsulta({ quien, grupo, clave: herramienta, pregunta });
      return { clave: null, pregunta, respuesta: await responderConDatos(herramienta, argumentos, pregunta, quien, grupo) };
    }
    return { clave: eleccion.herramienta, pregunta, extra: comoParametros(eleccion.argumentos) };
  }
  // Sin modelo (o sin respuesta suya), la regla que se dejó en espera.
  if (reglaDeRespaldo) return { clave: reglaDeRespaldo, pregunta };
  const embed = await cargarModelo();
  if (embed) {
    const [mejor] = await clasificar(CATALOGO, [pregunta], embed);
    if (mejor && mejor.similitud >= UMBRAL_RUTEO) return { clave: mejor.itemId as ClaveConsulta, pregunta };
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

/**
 * «Manda/envía/avisa/pon el aviso (mensaje, programación, producción, pedidos)
 * a planta» — un verbo de mandar, «planta» y algo que mandar. «¿Qué unidad está
 * en planta?» o «clima para planta» no lo son.
 */
export const esOrdenDeAvisoAPlanta = (pregunta: string): boolean => {
  const t = normalizar(pregunta);
  if (!/\bplanta\b/.test(t)) return false;
  const verbo = /\b(manda|mandale|mandar|mandalo|envia|enviale|enviar|envialo|avisa|avisale|avisar|pon|publica|comparte|propon|proponme|prepara|arma|comunica|comunicale|pasa|pasale)\w*\b/.test(t);
  const que = /\b(aviso|mensaje|programacion|produccion|producciones|pedido|pedidos|recordatorio|avisar|comunicado)\b/.test(t);
  return verbo && que;
};

export const atenderConsulta = async (
  texto: string,
  quien: string,
  grupo: string,
  alcance: AlcanceAgente,
  numeroBot?: string,
  opciones: { implicita?: boolean } = {}
): Promise<void> => {
  try {
    // «Escribiendo…» desde ya: rutear, armar una imagen o leer un video toma
    // segundos, y la persona tiene que ver que algo pasa (José, 14/09).
    await empezarAEscribir(grupo, alcance);
    let pregunta = preguntaLimpia(texto, numeroBot);
    // «Manda el aviso a planta con la programación de mañana»: una ORDEN, no
    // una consulta. Se propone en este grupo y se manda con la aprobación de
    // siempre (José, 14/09: «si no me lo sugieres, yo debería poder pedirlo»).
    if (!opciones.implicita && esOrdenDeAvisoAPlanta(pregunta)) {
      const { proponerAvisoManual } = await import('../checklist/detector.js');
      const fecha = fechaDe(pregunta) ?? sumarDias(hoyLima(), /\bhoy\b/.test(normalizar(pregunta)) ? 0 : 1);
      const respuestaTexto = await proponerAvisoManual(fecha, alcance);
      logger.info(`[agente] orden de ${quien}: aviso a planta del ${fecha} → ${respuestaTexto ? 'no se propuso' : 'propuesto'}`);
      if (respuestaTexto) await responderEnGrupo(grupo, { texto: respuestaTexto }, alcance);
      return;
    }
    // La lista negra gana sobre todo: ni reglas, ni modelo, ni embeddings ven un precio.
    const vetada = fueraDeCatalogo(pregunta);
    const porRegla = vetada ? null : rutearPorReglas(pregunta);
    // Una pregunta LARGA la entiende mejor el modelo que la primera regla que
    // pisa: «habrá producciones esta semana… ¿cómo estará el clima para planta
    // y qué distritos están propensos a lluvia?» caía en «planta» → unidad en
    // planta (14/09). Las reglas quedan de respaldo si el modelo no está.
    // …salvo que la regla sea de dos o más palabras («clima» + «planta»): esa
    // es precisa aunque la pregunta sea larga (14/09, 13:49: el modelo mandó
    // «y el clima en la molina… para asfaltar mañana» a los agregados).
    const larga = pregunta.split(/\s+/).length > PALABRAS_PARA_MODELO && especificidadDeRegla(pregunta) < 2;
    let clave: ClaveConsulta | null = larga ? null : porRegla;
    let respuesta: Respuesta | undefined;
    let extra: Partial<Parametros> | undefined;
    // Las herramientas de datos que se reconocen por palabra y no necesitan un
    // nombre («cuántos agregados llegaron hoy», «qué pedidos no tienen
    // certificado») se contestan sin modelo, con las fechas que el código lee.
    const porDatos = vetada || larga ? null : herramientaDeDatosPorReglas(pregunta);
    if (porDatos) {
      respuesta = await responderConDatos(porDatos, normalizarArgumentos(porDatos, [], pregunta), pregunta, quien, grupo);
      recordarConsulta({ quien, grupo, clave: porDatos, pregunta });
      clave = null;
    }
    // «Qué pedidos hay esta semana»: la regla dice «pedidos de hoy», pero el
    // rango de la pregunta manda — es lo programado (o lo despachado) en ese rango.
    const rango = esDeUnDia(clave) ? argumentosDeRango(pregunta) : null;
    if (rango) {
      respuesta = await responderConDatos('pedidos', rango, pregunta, quien, grupo);
      recordarConsulta({ quien, grupo, clave: 'pedidos', pregunta });
      clave = null;
    }
    if (!clave && !vetada && !respuesta) ({ clave, pregunta, respuesta, extra } = await sinRuta(pregunta, quien, grupo, larga ? porRegla : null, opciones.implicita));
    // Una consulta IMPLÍCITA (sin @lila, dentro del hilo) se contesta solo si
    // se entendió con certeza; lo demás pasa en silencio, porque puede no ser
    // para el agente. Y nunca con el menú de ayuda: el 14/09 a las 18:11 dos
    // mensajes de José a otras personas terminaron en «Lila — pregúntame…».
    if (opciones.implicita && (!clave || clave === 'help') && !respuesta) {
      logger.info(`[agente] consulta implícita de ${quien} sin ruta cierta, se deja pasar: «${pregunta}»`);
      return;
    }
    // Etiquetada pero hablando DE ella, no CON ella («…la vayamos entrenando a
    // @lila», «eso no puede responder @lila 😅», 14/09 18:27): no es pregunta
    // ni pedido, ninguna regla la entendió y el modelo cayó en `help`. Silencio;
    // el menú sale solo con «ayuda» o ante una pregunta que no se entendió.
    if (!respuesta && (!clave || clave === 'help') && porRegla !== 'help' && !pareceParaElAgente(pregunta)) {
      logger.info(`[agente] mención de ${quien} que no es pregunta ni pedido, se deja pasar: «${pregunta}»`);
      return;
    }
    respuesta = respuesta ?? (await armarRespuesta(clave, pregunta, quien, grupo, extra));
    if (clave) recordarConsulta({ quien, grupo, clave, pregunta });
    logger.info(`[agente] consulta de ${quien}: «${preguntaLimpia(texto, numeroBot)}» → ${clave ?? (respuesta ? 'datos' : 'none')}${respuesta.archivos?.length ? ` (+${respuesta.archivos.length} archivo(s))` : ''}`);
    await responderEnGrupo(grupo, respuesta, alcance);
  } catch (error) {
    logger.warn(`[agente] no pude atender la consulta «${texto}»: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await dejarDeEscribir(grupo);
  }
};

/**
 * Un mensaje SIN @lila que RESPONDE (cita) a un mensaje del agente: se atiende
 * como si lo etiquetara —«¿y la 3?» citando su tabla funciona—, en silencio si
 * no se entiende. Sin cita no hay continuación: el 14/09 (18:11 y 18:27) los
 * mensajes de José a otras personas, un minuto después de preguntarle algo,
 * caían como «pregunta dentro del hilo» y Lila contestaba con el menú. José:
 * «mejor la gente debe responder cuando se le taguea @lila o el número».
 */
export const atenderContinuacion = async (
  texto: string,
  quien: string,
  grupo: string,
  alcance: AlcanceAgente,
  citaAlAgente = false
): Promise<boolean> => {
  if (!citaAlAgente) return false;
  const ultima = ultimaConsulta(quien, grupo);
  const regla = rutearPorReglas(preguntaLimpia(texto));
  if ((ultima && pareceContinuacion(texto)) || (regla && regla !== 'help')) {
    await atenderConsulta(`@lila ${texto}`, quien, grupo, alcance);
    return true;
  }
  await atenderConsulta(`@lila ${texto}`, quien, grupo, alcance, undefined, { implicita: true });
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
    await empezarAEscribir(grupo, alcance);
    const respuesta = (await eleccion.pregunta.continuar(eleccion.indice, eleccion.texto)) as Respuesta;
    logger.info(`[agente] ${quien} contestó «${eleccion.texto}» a la pregunta pendiente`);
    await responderEnGrupo(grupo, respuesta, alcance);
  } catch (error) {
    logger.warn(`[agente] no pude continuar la consulta de ${quien}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await dejarDeEscribir(grupo);
  }
  return true;
};
