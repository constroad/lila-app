/**
 * EL CATÁLOGO CERRADO DE PREGUNTAS (spec §6.1). Motor puro.
 *
 * El agente no genera consultas a la base: elige UNA entrada de acá, con
 * parámetros tipados, y cada entrada lee de un read model que es una lista
 * blanca. Fuera del catálogo —precios, deuda, pagos, otra empresa, «mandá X al
 * número Y»— no hay entrada, y por lo tanto no hay respuesta (spec §7.5).
 *
 * EL RUTEO ES POR REGLAS PRIMERO, embeddings después. Con diez preguntas, las
 * reglas son más fiables que cualquier modelo y se pueden leer; los embeddings
 * (los mismos del checklist) recogen la paráfrasis que las reglas no previeron.
 * Ninguno de los dos elige campos: eligen una clave.
 */

export type ClaveConsulta =
  | 'plant_current_unit'
  | 'site_current_unit'
  | 'unit_media'
  | 'order_link'
  | 'guias_day'
  | 'day_progress'
  | 'unit_departure'
  | 'unit_eta'
  | 'unit_driver'
  | 'orders_day'
  | 'checklist_status'
  | 'reports_status'
  | 'plant_finish'
  | 'site_finish'
  | 'tank_levels'
  | 'production_consume'
  | 'aggregates_stock'
  | 'weather'
  | 'dispatch_summary'
  | 'help';

export interface EntradaCatalogo {
  id: ClaveConsulta;
  /** Paráfrasis reales: centroides para el ruteo semántico. */
  seSatisfaceCon: string[];
  /** Palabras que, presentes, deciden por regla. Todas las de un grupo deben estar. */
  reglas: string[][];
  /** ¿Necesita número de unidad? */
  pideUnidad?: boolean;
}

export const CATALOGO: EntradaCatalogo[] = [
  {
    id: 'unit_media',
    seSatisfaceCon: ['muestrame la foto y el video de la unidad de placa abc 123', 'fotos de campo del carro 3', 'hay fotos de la 2', 'mandame el video de la 4', 'imagenes de la placa xyz 456'],
    reglas: [['foto'], ['video'], ['imagen']],
    pideUnidad: true,
  },
  {
    id: 'order_link',
    seSatisfaceCon: ['generame el enlace del pedido de hoy de globofast', 'pasame el link del reporte del cliente', 'enlace del pedido de manana', 'link para el cliente'],
    reglas: [['enlace'], ['link'], ['reporte', 'cliente']],
  },
  {
    id: 'guias_day',
    seSatisfaceCon: ['muestrame las guias generadas para la produccion de hoy', 'pasame los vales de hoy', 'guias de remision del dia', 'mandame las guias de la produccion'],
    reglas: [['guia'], ['guía'], ['vale']],
  },
  {
    id: 'unit_departure',
    seSatisfaceCon: ['a que hora salio la 5', 'cuando salio el carro 3', 'ya salio la unidad 2', 'hora de salida de la 4'],
    reglas: [['salio'], ['salió'], ['hora', 'sal']],
    pideUnidad: true,
  },
  {
    id: 'unit_eta',
    seSatisfaceCon: ['cuanto falta para que llegue la 5', 'a que hora llega el carro 3', 'cuando llega la 2', 'eta de la unidad 4'],
    reglas: [['lleg'], ['eta']],
    pideUnidad: true,
  },
  {
    id: 'unit_driver',
    seSatisfaceCon: ['quien maneja la 5', 'quien es el chofer del carro 3', 'conductor de la unidad 2', 'que placa tiene la 4'],
    reglas: [['maneja'], ['chofer'], ['conductor'], ['placa']],
    pideUnidad: true,
  },
  {
    id: 'plant_current_unit',
    seSatisfaceCon: ['en que carro van los despachos en planta', 'que unidad esta cargando', 'cual esta en planta', 'cuantos carros han salido de planta'],
    reglas: [['planta'], ['cargando'], ['carguio'], ['carguío'], ['salieron'], ['cuantos', 'sal'], ['cuántos', 'sal']],
  },
  {
    id: 'site_current_unit',
    seSatisfaceCon: ['en que carro va la colocacion en campo', 'que unidad esta en obra', 'cual llego a campo', 'cuantos carros estan en ruta'],
    reglas: [['campo'], ['obra'], ['colocacion'], ['colocación'], ['ruta'], ['frente']],
  },
  {
    id: 'day_progress',
    seSatisfaceCon: ['cuantos metros van', 'cuantos m3 faltan', 'como va la produccion', 'cuanto se ha despachado hoy', 'cuantos cubos van'],
    reglas: [['m3'], ['m³'], ['cubos'], ['metros'], ['faltan'], ['despachado'], ['avance'], ['como va la produccion'], ['cómo va la producción'], ['como vamos', 'produccion'], ['como vamos', 'despacho'], ['como va', 'despacho'], ['como va', 'planta']],
  },
  {
    id: 'orders_day',
    seSatisfaceCon: ['que pedidos hay manana', 'hay produccion manana', 'que hay para hoy', 'cuales son los pedidos de hoy', 'que se produce manana'],
    reglas: [['pedido'], ['produccion', 'manana'], ['producción', 'mañana'], ['que hay', 'manana'], ['que hay', 'mañana'], ['que hay', 'hoy'], ['que hay para']],
  },
  {
    id: 'checklist_status',
    seSatisfaceCon: ['como va el checklist', 'que falta confirmar', 'que esta pendiente del checklist', 'estado del checklist'],
    reglas: [['checklist'], ['pendiente'], ['falta confirmar'], ['que falta']],
  },
  {
    id: 'tank_levels',
    seSatisfaceCon: ['cuantos galones tenemos en los tanques', 'como estan los tanques', 'cuanto pen queda', 'nivel de gasohol', 'cuanto petroleo hay en planta'],
    reglas: [['galones'], ['tanque'], ['nivel'], ['liquido'], ['líquido'], ['pen'], ['gasohol'], ['gashol'], ['petroleo', 'planta'], ['petróleo', 'planta'], ['queda', 'petroleo'], ['queda', 'petróleo'], ['resumen', 'liquido'], ['resumen', 'líquido'], ['reporte', 'liquido'], ['reporte', 'líquido']],
  },
  {
    id: 'production_consume',
    seSatisfaceCon: ['cuanto consumio la produccion de hoy', 'consumos de la produccion', 'cuanto pen gastamos', 'consumo de gasohol de hoy', 'cuantos galones se usaron'],
    reglas: [['consumo'], ['consumio'], ['consumió'], ['consumieron'], ['gastamos'], ['gasto', 'produccion'], ['se', 'uso'], ['se', 'usaron'], ['se', 'gasto'], ['cuanto', 'gasohol', 'hoy'], ['cuanto', 'pen', 'hoy']],
  },
  {
    id: 'aggregates_stock',
    seSatisfaceCon: ['cuanto agregado tengo en stock', 'cuanta arena hay', 'stock de piedra', 'tenemos agregados en cancha'],
    reglas: [['agregado'], ['stock'], ['arena'], ['piedra'], ['grava'], ['confitillo'], ['cancha'], ['material']],
  },
  {
    id: 'weather',
    seSatisfaceCon: ['como esta el clima', 'como estara el clima manana en ate', 'va a llover hoy', 'hay riesgo de lluvia', 'estara soleado', 'pronostico para lurigancho'],
    reglas: [['clima'], ['lluvia'], ['llover'], ['llueve'], ['lloviendo'], ['soleado'], ['nublado'], ['garua'], ['garúa'], ['pronostico'], ['pronóstico'], ['tiempo', 'hoy'], ['tiempo', 'manana'], ['tiempo', 'mañana'], ['riesgo', 'lluvia'], ['lluvia', 'hoy'], ['lluvia', 'manana'], ['lluvia', 'mañana'], ['clima', 'hoy'], ['clima', 'manana'], ['clima', 'mañana']],
  },
  {
    id: 'dispatch_summary',
    seSatisfaceCon: ['muestrame el resumen de despachos de hoy', 'resumen del pedido de hoy', 'listado de unidades de hoy', 'como fueron los despachos', 'detalle de los despachos'],
    reglas: [['resumen', 'despacho'], ['resumen', 'pedido'], ['resumen', 'unidad'], ['resumen', 'hoy'], ['resumen', 'produccion'], ['resumen', 'producción'], ['listado', 'unidad'], ['detalle', 'despacho'], ['como fueron', 'despacho']],
  },
  {
    id: 'help',
    seSatisfaceCon: ['ayuda', 'que puedes hacer', 'que sabes hacer', 'comandos', 'como te uso'],
    reglas: [['ayuda'], ['help'], ['que puedes hacer'], ['qué puedes hacer'], ['que sabes'], ['comandos']],
  },
  {
    id: 'plant_finish',
    seSatisfaceCon: ['cuanto falta para terminar la produccion en planta', 'a que hora termina planta', 'cuando acaba la produccion', 'falta mucho para terminar de despachar'],
    reglas: [['falta', 'terminar', 'planta'], ['falta', 'terminar', 'produccion'], ['falta', 'terminar', 'producción'], ['termina', 'planta'], ['acaba', 'produccion'], ['falta', 'despachar'], ['acabamos', 'planta'], ['terminamos', 'planta'], ['hora', 'acaba'], ['termina', 'despacho'], ['termina', 'produccion'], ['termina', 'producción']],
  },
  {
    id: 'site_finish',
    seSatisfaceCon: ['cuanto falta para terminar el control de pista', 'cuanto falta para terminar la colocacion', 'a que hora terminan en campo', 'falta mucho para acabar en obra'],
    reglas: [['falta', 'terminar', 'pista'], ['falta', 'terminar', 'colocacion'], ['falta', 'terminar', 'colocación'], ['falta', 'terminar', 'campo'], ['termina', 'campo'], ['falta', 'acabar', 'obra'], ['termine', 'obra'], ['termine', 'campo'], ['acabamos', 'obra'], ['terminamos', 'campo'], ['termina', 'obra'], ['termina', 'colocacion']],
  },
  {
    id: 'reports_status',
    seSatisfaceCon: ['ya se generaron los informes', 'tenemos hecho el informe de imprimacion', 'esta el informe de area adicional', 'falta algun informe', 'ya esta el ipp', 'hicieron el control de pista'],
    reglas: [['informe'], ['certificado'], ['ipp'], ['imprimacion'], ['imprimación'], ['area adicional'], ['área adicional'], ['acta']],
  },
];

export const normalizar = (t: string): string =>
  String(t || '')
    // WhatsApp envuelve las menciones en marcas bidi invisibles (U+2068/U+2069)
    // y a veces mete U+200E/U+200F: «@⁨lila⁩ …». Sin sacarlas, «@lila» no
    // coincide con nada (13/09/2026, 12:30: una pregunta sin respuesta).
    .replace(/[\u2066-\u2069\u200e\u200f\u202a-\u202e]/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * ¿Este mensaje le habla al agente? Tres formas (José, 13/09/2026: «necesito
 * escribirle solo lila o @nrocontacto»):
 *   · «@lila …» en cualquier parte;
 *   · «lila …» al PRINCIPIO del mensaje (a mitad de frase «lila» puede ser otra cosa);
 *   · una mención al contacto del bot — el número o el LID, según cómo la
 *     mande el teléfono; `mencionados` son los JIDs de `contextInfo.mentionedJid`.
 */
export const esConsulta = (texto: string, numeroBot?: string, mencionados: string[] = [], jidsBot: string[] = []): boolean => {
  const t = normalizar(texto);
  if (/(^|\s)@lila\b/.test(t)) return true;
  if (/^lila\b/.test(t)) return true;
  if (numeroBot && t.includes(`@${numeroBot}`)) return true;
  const propios = new Set([...jidsBot, numeroBot ? `${numeroBot}@s.whatsapp.net` : ''].filter(Boolean).map((j) => j.replace(/:\d+@/, '@')));
  return mencionados.some((m) => propios.has(String(m).replace(/:\d+@/, '@')));
};

/** La pregunta sin el «@lila», el «lila» inicial ni la mención. */
export const preguntaLimpia = (texto: string, numeroBot?: string): string =>
  normalizar(texto)
    .replace(/@lila\b/g, '')
    .replace(/^lila\b[,:]?/, '')
    .replace(/@\d{6,}\b/g, '')
    .replace(numeroBot ? new RegExp(`@${numeroBot}\\b`, 'g') : /$^/, '')
    .replace(/\s+/g, ' ')
    .trim();

export interface Parametros {
  unitNumber?: number;
  /** Placa normalizada: sin espacios ni guiones, en mayúsculas («AZJ910»). */
  plate?: string;
  /** Empresa nombrada en la pregunta, si alguna (por `companyId`). */
  companyId?: string;
  day: 'today' | 'tomorrow';
  /** Una fecha concreta («el martes», «pasado mañana», «15 de septiembre», «15/09»), `YYYY-MM-DD` Lima. */
  fecha?: string;
  /** «la semana», «esta semana», «los próximos días». */
  rango?: 'semana';
  /** «la última (unidad)», «la primera», «la que acaba de salir». */
  ordinal?: 'ultima' | 'primera';
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

/** El día de hoy en Lima, `YYYY-MM-DD`, y a partir de él sumar días. */
export const hoyLima = (ahoraMs = Date.now()): string => new Date(ahoraMs - 5 * 3_600_000).toISOString().slice(0, 10);
export const sumarDias = (fecha: string, dias: number): string => {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};

/**
 * La fecha que nombra la pregunta, si alguna. «el martes» es el PRÓXIMO martes
 * (si hoy es martes, el de la semana que viene: nadie dice «el martes» por
 * hoy). «15 de septiembre» y «15/09» son de este año, salvo que ya hayan pasado.
 */
export const fechaDe = (pregunta: string, ahoraMs = Date.now()): string | undefined => {
  const t = normalizar(pregunta);
  const hoy = hoyLima(ahoraMs);
  // «ayer» no existía y se tomaba por hoy (14/09: «resumen de despachos de
  // ayer» → «no tengo pedidos para el lunes 14»). Y «anteayer».
  if (/\b(anteayer|antes de ayer)\b/.test(t)) return sumarDias(hoy, -2);
  if (/\bayer\b/.test(t)) return sumarDias(hoy, -1);
  if (/\bpasado manana\b/.test(t)) return sumarDias(hoy, 2);
  const dm = t.match(/\b(\d{1,2})\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/) ?? t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (dm) {
    const dia = Number(dm[1]);
    const mes = /^\d+$/.test(dm[2]) ? Number(dm[2]) : MESES.indexOf(dm[2]) + 1 - (MESES.indexOf(dm[2]) >= 9 ? 1 : 0);
    const anio = Number(hoy.slice(0, 4));
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      const candidata = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      return candidata < hoy ? `${anio + 1}${candidata.slice(4)}` : candidata;
    }
  }
  const dia = DIAS_SEMANA.findIndex((d) => new RegExp(`\\b(el |este |proximo |próximo )?${d}\\b`).test(t));
  if (dia >= 0) {
    const [y, m, d] = hoy.split('-').map(Number);
    const hoyDia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    // «el martes pasado» mira hacia atrás: el último martes que ya fue.
    const pasado = new RegExp(`\\b${DIAS_SEMANA[dia]}\\s+pasad[oa]\\b`).test(t);
    const delta = pasado ? -(((hoyDia - dia + 7) % 7) || 7) : ((dia - hoyDia + 7) % 7) || 7;
    return sumarDias(hoy, delta);
  }
  return undefined;
};

/** Nombres con los que la gente llama a cada empresa. */
export const ALIAS_EMPRESA: Array<{ companyId: string; alias: string[] }> = [
  { companyId: 'globofas-s8k', alias: ['globofast', 'globofas', 'globo'] },
  { companyId: 'constroad', alias: ['constroad', 'constroad sac'] },
  { companyId: 'inframaq-iax', alias: ['inframaq', 'infra'] },
];

export const normalizarPlaca = (placa: string): string =>
  String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * «la 5», «unidad 5», «carro 5», «volquete #5», «el 12». Un número de dos
 * cifras como máximo: una placa o un vale tienen más y no son unidades.
 */
export const extraerParametros = (pregunta: string, ahoraMs = Date.now()): Parametros => {
  const t = normalizar(pregunta);
  const day: Parametros['day'] = /\bmanana\b/.test(t) ? 'tomorrow' : 'today';

  // Placa peruana: tres letras y tres números («AZJ 910», «AML838», «BBE-942»),
  // con o sin la palabra «placa» adelante. Se extrae ANTES que la unidad para
  // que «910» no se lea como unidad.
  const placa = t.match(/\b([a-z]{3})[\s-]?(\d{3})\b/);
  const plate = placa ? normalizarPlaca(`${placa[1]}${placa[2]}`) : undefined;
  const sinPlaca = placa ? t.replace(placa[0], ' ') : t;

  const m =
    sinPlaca.match(/\b(?:la|el|unidad|carro|camion|volquete|numero|n)\s*#?\s*(\d{1,2})\b/) ??
    sinPlaca.match(/\b(\d{1,2})\b(?!\s*(?:m3|m³|cubos|metros|am|pm|h|hs|:))/);
  const unitNumber = m ? Number(m[1]) : undefined;

  const empresa = ALIAS_EMPRESA.find((e) => e.alias.some((a) => new RegExp(`\\b${a}\\b`).test(t)));
  const rango = /\b(semana|semanal|proximos dias|próximos días|estos dias|estos días)\b/.test(t) ? ('semana' as const) : undefined;
  const fecha = fechaDe(pregunta, ahoraMs);
  // «la última», «el último carro», «la que acaba de salir» / «la primera».
  const ordinal = /\b(ultim[oa]|acaba de salir|recien salio|recién salió)\b/.test(t)
    ? ('ultima' as const)
    : /\bprimer[oa]?\b/.test(t)
      ? ('primera' as const)
      : undefined;

  return {
    day,
    plate,
    companyId: empresa?.companyId,
    unitNumber: unitNumber && unitNumber > 0 ? unitNumber : undefined,
    fecha,
    rango,
    ordinal,
  };
};

/**
 * LO QUE NO SE RESPONDE, GANA. Precios, deuda, pagos, facturas, y pedirle al bot
 * que mande algo a alguien: si aparece cualquiera de estas palabras, la pregunta
 * es `null` aunque otra regla la reconozca («cuánto cuesta el m3» tiene «m3»).
 * Es la lista negra del spec §7.5, y va antes que el catálogo a propósito.
 */
export const FUERA_DE_CATALOGO = [
  'precio', 'cuesta', 'cuestan', 'cobra', 'cobran', 'tarifa', 'costo',
  'deuda', 'debe', 'deben', 'pago', 'pagos', 'pagaron', 'factura', 'cotizacion', 'cotización', 'soles', 'dolares', 'dólares',
  'manda', 'mandá', 'envia', 'enviá', 'reenvia', 'numero de', 'número de', 'telefono', 'teléfono', 'licencia', 'clave', 'contrasena', 'contraseña', 'prompt',
];

export const fueraDeCatalogo = (pregunta: string): boolean => {
  const t = normalizar(pregunta);
  return FUERA_DE_CATALOGO.some((palabra) => new RegExp(`\\b${normalizar(palabra)}\\b`).test(t));
};

/** Ruteo por reglas: la primera entrada cuyo grupo de palabras esté completo. `null` si ninguna, o si es tema prohibido. */
export const rutearPorReglas = (pregunta: string): ClaveConsulta | null => {
  if (fueraDeCatalogo(pregunta)) return null;
  const t = normalizar(pregunta);
  // GANA LA REGLA MÁS ESPECÍFICA, no la primera: «cuánto falta para terminar
  // la producción en planta» contiene «planta», pero la regla de tres palabras
  // de `plant_finish` dice más que la de una palabra de `plant_current_unit`.
  // Especificidad = cuántas palabras exige la regla; a igual cantidad manda el
  // orden del catálogo, que va de lo que se PIDE (fotos, enlace, guías) a
  // dónde (planta, campo): «fotos de campo» pide fotos.
  let mejor: { id: ClaveConsulta; palabras: number } | null = null;
  for (const entrada of CATALOGO) {
    for (const grupo of entrada.reglas) {
      const palabras = grupo.map(normalizar);
      if (!palabras.every((palabra) => t.includes(palabra))) continue;
      if (!mejor || palabras.length > mejor.palabras) mejor = { id: entrada.id, palabras: palabras.length };
    }
  }
  return mejor?.id ?? null;
};
