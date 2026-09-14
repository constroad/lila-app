/**
 * EL HILO DE LA CONVERSACIÓN. Motor puro.
 *
 * José, 13/09/2026: «la experiencia de usuario no quiero que la mejores solo
 * para este caso puntual sino en general». Lo general es esto: recordar qué
 * preguntó cada persona hace un momento, para que «¿y la 3?», «¿y mañana?» o
 * «¿y en Ate?» sean lo que son —la MISMA pregunta con un dato cambiado— y no
 * un «eso no lo puedo responder».
 *
 * Es memoria corta y por persona-en-grupo: tres minutos. Más largo y un número
 * suelto en una charla normal se toma por continuación de algo.
 */

export interface UltimaConsulta {
  quien: string;
  grupo: string;
  clave: string;
  pregunta: string;
  ms: number;
}

export const VIGENCIA_HILO_MS = 3 * 60_000;
const hilos = new Map<string, UltimaConsulta>();

/** Solo para tests. */
export const _resetContexto = (): void => hilos.clear();

const k = (quien: string, grupo: string) => `${grupo}|${quien}`;

export const recordarConsulta = (c: Omit<UltimaConsulta, 'ms'>, ms = Date.now()): void => {
  hilos.set(k(c.quien, c.grupo), { ...c, ms });
};

export const ultimaConsulta = (quien: string, grupo: string, ms = Date.now()): UltimaConsulta | null => {
  const u = hilos.get(k(quien, grupo));
  if (!u) return null;
  if (ms - u.ms > VIGENCIA_HILO_MS) {
    hilos.delete(k(quien, grupo));
    return null;
  }
  return u;
};

/**
 * ¿Este mensaje es una CONTINUACIÓN? Corto, y con la forma de un cambio de
 * dato: «¿y la 3?», «y mañana?», «en Ate», «la placa AML838», «el martes».
 * Un mensaje largo o sin dato nuevo no lo es: es otra cosa.
 */
export const pareceContinuacion = (texto: string): boolean => {
  const t = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.split(' ').length > 6) return false;
  const traeDato =
    /\b\d{1,2}\b/.test(t) ||
    /\b[a-z]{3}[\s-]?\d{3}\b/.test(t) ||
    /\b(manana|hoy|ayer|anteayer|pasado manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|semana|mes|enero|febrero|marzo|abril|mayo|junio|julio|agosto|se[pt]?tiembre|octubre|noviembre|diciembre|ultim[oa]|primer[oa]?)\b/.test(t) ||
    /\b(en|de|para|con) [a-z]/.test(t);
  const empiezaComoSeguimiento = /^(y |e |que tal |en |de |para |la |el |las |los |con )/.test(t) || /^\d/.test(t);
  return traeDato && empiezaComoSeguimiento;
};

/**
 * Al continuar una pregunta, lo que el mensaje NUEVO trae reemplaza lo que
 * decía la anterior: «¿y la última?» después de «quién maneja la 2» es la
 * última, no la 2. Se le quitan a la anterior los datos del mismo tipo que
 * trae la nueva —unidad, día o fecha, distrito, empresa— y se pegan.
 */
export const fusionar = (nueva: string, anterior: string, distritos: string[] = [], empresas: string[] = []): string => {
  const n = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nn = n(nueva);
  let ant = n(anterior);
  const UNIDAD = /\b((?:la|el|unidad|carro|camion|volquete|placa|numero|n)\s*#?\s*\d{1,2}|[a-z]{3}[\s-]?\d{3}|ultim[oa]|primer[oa]?|acaba de salir)\b/g;
  // Un día, un rango («este mes», «la semana pasada») o un mes con nombre: todos son «cuándo».
  const DIA = /\b(hoy|ayer|anteayer|manana|pasado manana|(?:el |este |proximo )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?: pasad[oa])?|(?:este |esta |el |la |del |de la )?(?:mes|semana)(?: pasad[oa])?|(?:en |de |del )?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|se[pt]?tiembre|octubre|noviembre|diciembre)|\d{1,2}\/\d{1,2}|\d{1,2} de [a-z]+)\b/g;
  if (UNIDAD.test(nn)) ant = ant.replace(UNIDAD, ' ');
  if (DIA.test(nn)) ant = ant.replace(DIA, ' ');
  const traeDistrito = distritos.some((d) => nn.includes(n(d)));
  if (traeDistrito) for (const d of distritos) ant = ant.split(n(d)).join(' ');
  const traeEmpresa = empresas.some((e) => nn.includes(n(e)));
  if (traeEmpresa) for (const e of empresas) ant = ant.split(n(e)).join(' ');
  return `${nn} ${ant}`.replace(/\s+/g, ' ').trim();
};

/**
 * ¿Este mensaje, de alguien que está conversando con el agente, le está
 * PREGUNTANDO algo? Una pregunta con signo, o que empieza como pregunta o
 * pedido («hay…», «cuánto…», «muéstrame…», «dame…»). José, 14/09, 11:41: «Hay
 * programación de despachos esta semana?» un minuto después de preguntar por
 * los tanques, sin respuesta: no era una continuación ni caía en una regla.
 * Dentro del hilo, una pregunta es para el agente aunque no lo etiquete.
 */
export const pareceParaElAgente = (texto: string): boolean => {
  const t = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¡!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.split(' ').length > 25) return false;
  if (/\?/.test(t)) return true;
  return /^(ok |ya |listo |y |e )?(hay|que|cual|cuales|cuanto|cuanta|cuantos|cuantas|como|donde|quien|quienes|a que hora|muestrame|muestra|dame|pasame|mandame|enviame|dime|necesito|quiero|puedes|podrias|me (muestras|pasas|mandas|das|dices))\b/.test(t);
};
