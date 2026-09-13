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
    reglas: [['pedido'], ['produccion', 'manana'], ['producción', 'mañana'], ['hay', 'manana'], ['hay', 'mañana'], ['hay', 'hoy']],
  },
  {
    id: 'checklist_status',
    seSatisfaceCon: ['como va el checklist', 'que falta confirmar', 'que esta pendiente del checklist', 'estado del checklist'],
    reglas: [['checklist'], ['pendiente'], ['falta confirmar'], ['que falta']],
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
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** ¿Este mensaje le habla al agente? `@lila` en cualquier parte, o una mención al número del bot. */
export const esConsulta = (texto: string, numeroBot?: string): boolean => {
  const t = normalizar(texto);
  if (/(^|\s)@lila\b/.test(t)) return true;
  return Boolean(numeroBot && t.includes(`@${numeroBot}`));
};

/** La pregunta sin el `@lila` ni la mención. */
export const preguntaLimpia = (texto: string, numeroBot?: string): string =>
  normalizar(texto)
    .replace(/@lila\b/g, '')
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
}

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
export const extraerParametros = (pregunta: string): Parametros => {
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

  return {
    day,
    plate,
    companyId: empresa?.companyId,
    unitNumber: unitNumber && unitNumber > 0 ? unitNumber : undefined,
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
