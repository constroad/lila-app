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
  /** Ids de los mensajes con que Lila le contestó A ESTA PERSONA en este hilo (los últimos). */
  respuestas?: string[];
}

/**
 * El hilo dura el DÍA de trabajo, no tres minutos: «@lila ¿y en Ate?» dos
 * horas después de «clima en La Molina» sigue siendo la misma conversación.
 * Antes eran 3 min porque el hilo también disparaba respuestas sin etiqueta;
 * desde el 14/09 solo se contesta etiquetada o citada, y el hilo solo aporta
 * CONTEXTO (José: «sí debería guardar el histórico, al menos del día»).
 */
export const VIGENCIA_HILO_MS = 12 * 60 * 60_000;
const hilos = new Map<string, UltimaConsulta>();

/** Solo para tests. */
export const _resetContexto = (): void => hilos.clear();

const k = (quien: string, grupo: string) => `${grupo}|${quien}`;

/**
 * EL HILO SOBREVIVE AL DEPLOY. Vivía solo en memoria: el 15/09 a las 18:49 un
 * deploy borró el hilo de José y «¿sabes cuánto cubica ese volquete?» volvió a
 * preguntar «¿De cuál unidad?» cuatro minutos después de haber hablado de la
 * 9. Con 8–10 deploys por día, un hilo en memoria es un hilo que no existe.
 * Se persiste como config del agente (Mongo), igual que el interruptor; quien
 * arranca llama `hidratarHilos(await cargarConfig('hilos'))`. El guardado es
 * fire-and-forget: una consulta nunca espera a la base.
 */
let persistir: ((hilos: UltimaConsulta[]) => void) | null = null;
export const alCambiarHilos = (fn: ((hilos: UltimaConsulta[]) => void) | null): void => {
  persistir = fn;
};
export const exportarHilos = (ms = Date.now()): UltimaConsulta[] => [...hilos.values()].filter((u) => ms - u.ms <= VIGENCIA_HILO_MS);
export const hidratarHilos = (lista: UltimaConsulta[] | null | undefined, ms = Date.now()): number => {
  let n = 0;
  for (const u of lista ?? []) {
    if (!u?.quien || !u.grupo || typeof u.ms !== 'number' || ms - u.ms > VIGENCIA_HILO_MS) continue;
    if (!u.pregunta && !(u.respuestas ?? []).length) continue;
    hilos.set(k(u.quien, u.grupo), u);
    n += 1;
  }
  return n;
};

export const recordarConsulta = (c: Omit<UltimaConsulta, 'ms'>, ms = Date.now()): void => {
  // Las respuestas del hilo se conservan al cambiar de consulta: seguir
  // citando la respuesta anterior sigue siendo el mismo hilo.
  const previo = hilos.get(k(c.quien, c.grupo));
  hilos.set(k(c.quien, c.grupo), { ...c, ms, respuestas: previo?.respuestas ?? [] });
  persistir?.(exportarHilos(ms));
};

const MAX_RESPUESTAS_RECORDADAS = 5;

/**
 * RESPONDER (deslizar) A UNA RESPUESTA QUE LILA TE DIO es seguir hablando
 * con ella, sin etiqueta. Es lo que hace WhatsApp con cualquier persona y lo
 * que hace Meta AI en un grupo: @ o cita. Y es seguro en un grupo, a
 * diferencia de «los siguientes 2 minutos sin etiqueta»: la cita es
 * explícita, es a UN mensaje concreto, y solo vale si ese mensaje fue una
 * respuesta a la MISMA persona. Citar un checklist, una propuesta o un aviso
 * (mensajes para todos) no es hablarle — eso sigue siendo un voto o nada
 * (15/09, 10:30: «enlaza al grupo de certificados» citando el checklist).
 */
export const recordarRespuestaA = (quien: string, grupo: string, msgId: string, ms = Date.now()): void => {
  if (!msgId) return;
  const key = k(quien, grupo);
  const previo = hilos.get(key);
  const respuestas = [...(previo?.respuestas ?? []), msgId].slice(-MAX_RESPUESTAS_RECORDADAS);
  hilos.set(key, previo ? { ...previo, respuestas } : { quien, grupo, clave: '', pregunta: '', ms, respuestas });
  persistir?.(exportarHilos(ms));
};

/** ¿Este mensaje cita una respuesta que Lila le dio a esta persona (en la vigencia del hilo)? */
export const citaRespuestaPropia = (quien: string, grupo: string, citaMsgId: string, ms = Date.now()): boolean => {
  if (!citaMsgId) return false;
  const u = hilos.get(k(quien, grupo));
  if (!u || ms - u.ms > VIGENCIA_HILO_MS) return false;
  return (u.respuestas ?? []).includes(citaMsgId);
};

/**
 * «Ese volquete», «y quién la maneja», «cuánto cubica»: una consulta de unidad
 * SIN unidad, dentro del hilo, hereda la unidad de la pregunta anterior de esa
 * persona. 15/09 18:35: tras «dame el vídeo del volquete 9», «¿sabes cuánto
 * cubica ese volquete?» volvió a preguntar «¿De cuál unidad?». PURO.
 */
export const unidadHeredada = (
  anterior: { unitNumber?: number; plate?: string; ordinal?: 'ultima' | 'primera' } | null
): { unitNumber?: number; plate?: string; ordinal?: 'ultima' | 'primera' } | null => {
  if (!anterior) return null;
  if (anterior.plate) return { plate: anterior.plate };
  if (anterior.unitNumber) return { unitNumber: anterior.unitNumber };
  if (anterior.ordinal) return { ordinal: anterior.ordinal };
  return null;
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
  // «¿Y Cajamarquilla?»: un «y» seguido de una o dos palabras es un cambio de
  // dato aunque la palabra no sea de una lista (14/09: se fue al modelo y
  // volvió con la planta de hoy).
  const yAlgo = /^(y|e) [a-z0-9ñ]+( [a-z0-9ñ]+)?$/.test(t);
  return (traeDato && empiezaComoSeguimiento) || yAlgo;
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
