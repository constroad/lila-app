import { normalizarTexto } from './checklist.js';

/**
 * Qué mensajes del grupo pueden CERRAR un ítem del checklist, y cuáles no.
 *
 * José, 09/09/2026: «debes omitir mensajes tendenciosos y los mensajes del propio
 * agente 949376824».
 *
 * EL SESGO ES DELIBERADO: ante la duda, NO se da por confirmado. Un falso
 * negativo hace que el agente vuelva a preguntar —molesto y visible—; un falso
 * positivo hace que el agente calle sobre algo que nadie hizo, que es
 * exactamente el fallo que este proyecto existe para evitar.
 */

export interface MensajeGrupo {
  texto: string;
  /** JID de quien lo escribió (`key.participant` en grupos). */
  autor: string;
  /** Instante del mensaje. */
  ts: number;
  /** `true` si salió de una de NUESTRAS sesiones (`key.fromMe`). */
  esPropio: boolean;
}

export type MotivoDescarte = 'propio' | 'vacio' | 'pregunta' | 'negacion';

/**
 * Marcas de que el mensaje NIEGA en vez de confirmar. Si aparece cualquiera, el
 * mensaje no cierra nada — aunque además contenga la palabra clave.
 *
 * Se mira el mensaje ENTERO y no solo alrededor de la palabra: «la cuadrilla
 * lista? todavía no» y «no, cuadrilla lista recién mañana» tienen la negación
 * lejos de la clave, y las dos son un "no".
 */
/** Palabras enteras. La puntuación se limpia antes, si no «no, cuadrilla lista»
 *  se escapaba: la coma rompía el match contra `'no '`. */
const NEGACIONES_PALABRA = ['no', 'nada', 'nadie', 'tampoco', 'sin', 'aun', 'todavia', 'ni'];

/** Prefijos: cubren conjugaciones sin listarlas una por una. */
const NEGACIONES_PREFIJO = ['falta', 'cancel', 'postergam', 'suspend', 'se cayo'];

const esPregunta = (texto: string): boolean => texto.includes('?') || texto.includes('¿');

/** Normalizado y SIN puntuación, para poder comparar palabras enteras. */
const enPalabras = (textoNormalizado: string): string[] =>
  textoNormalizado
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .split(' ')
    .filter(Boolean);

const niegaFragmento = (fragmento: string): boolean => {
  const palabras = enPalabras(normalizarTexto(fragmento));
  if (palabras.some((palabra) => NEGACIONES_PALABRA.includes(palabra))) return true;
  const limpio = palabras.join(' ');
  return NEGACIONES_PREFIJO.some((prefijo) => limpio.includes(prefijo));
};

/**
 * Separadores de cláusula. La `y` solo corta cuando lo que sigue niega: «agua y
 * petróleo listos» es UNA cláusula, «cuadrilla lista y no vino el tren» son dos.
 *
 * Tolera tildes porque corta sobre el texto ORIGINAL: lo que se conserva tiene
 * que seguir siendo legible —se reporta al grupo de operaciones—, así que
 * normalizar es para DECIDIR, nunca para lo que se guarda.
 */
const SEPARADOR_CLAUSULA =
  /[,;.]|\bpero\b|\baunque\b|\by (?=no |a[uú]n |todav[ií]a |ni |falta)/i;

export const enClausulas = (texto: string): string[] =>
  String(texto || '')
    .split(SEPARADOR_CLAUSULA)
    .map((c) => c.trim())
    .filter(Boolean);

/**
 * ¿El mensaje niega? MANDA LA PRIMERA CLÁUSULA.
 *
 * Mirar la oración entera tiraba confirmaciones reales: «cuadrilla lista, no
 * falta nadie», «ya avisé a planta, no hay problema» y «petróleo listo, aún
 * falta el agua» son la forma normal de confirmar algo en un grupo, y las tres
 * se descartaban por un `no` que hablaba de otra cosa. Medido sobre 19 mensajes
 * escritos como los escribe la gente, el filtro pasó de acertar 6 a 9.
 *
 * Pero mirar «todas las cláusulas» era demasiado permisivo, y los tests que ya
 * existían lo cazaron: «no, cuadrilla lista recién mañana» y «se cayó la
 * producción, cuadrilla lista para el jueves» tienen una cláusula afirmativa y
 * niegan igual. La diferencia es DÓNDE está la negación: la que ABRE el mensaje
 * gobierna lo que sigue («no, …» / «se cayó, …»); la que viene después solo
 * niega su propia cláusula.
 */
const niega = (textoNormalizado: string): boolean => {
  const [primera] = enClausulas(textoNormalizado);
  return primera !== undefined && niegaFragmento(primera);
};

/**
 * Las cláusulas que PUEDEN confirmar: se van las que niegan.
 *
 * Sin esto el arreglo de arriba abre un agujero peor que el que cierra. El
 * matcher busca sus frases en el texto ENTERO, así que «agua lista, no compramos
 * petróleo» —que ahora pasa el filtro, y debe pasarlo— contendría la frase
 * «compramos petroleo» y daría el combustible por comprado. Al item se le
 * entrega solo lo que afirma.
 */
export const clausulasUtiles = (texto: string): string[] =>
  enClausulas(texto).filter((c) => !niegaFragmento(c));

/**
 * `null` si el mensaje puede confirmar; el motivo si hay que descartarlo.
 *
 * Devuelve el MOTIVO y no un booleano porque en fase de espejo interesa saber
 * cuántos mensajes se están descartando y por qué: si el agente falla, el número
 * de descartes por `negacion` o `pregunta` es lo primero que hay que mirar.
 */
export const motivoDescarte = (mensaje: MensajeGrupo): MotivoDescarte | null => {
  // EL AGENTE NO SE CONFIRMA A SÍ MISMO. Sin esto, el propio aviso del bot
  // («¿Ya avisaron a planta?») o cualquier mensaje que lila mande al grupo
  // cerraría el ítem que el bot acaba de abrir: un lazo que se auto-satisface.
  if (mensaje.esPropio) return 'propio';

  const texto = normalizarTexto(mensaje.texto);
  if (!texto) return 'vacio';

  // PREGUNTAR NO ES CONFIRMAR. «¿ya está la cuadrilla?» contiene la clave y no
  // afirma nada; darlo por hecho sería cerrar el ítem justo cuando alguien está
  // pidiendo que lo cierren.
  if (esPregunta(mensaje.texto)) return 'pregunta';

  if (niega(texto)) return 'negacion';

  return null;
};

export interface MensajesUtiles {
  /** Textos que sí pueden cerrar un ítem. */
  textos: string[];
  /** Quién dijo cada uno, en el mismo orden. Sirve para el «lo confirmó X». */
  autores: string[];
  descartados: Record<MotivoDescarte, number>;
}

/**
 * Separa lo que puede confirmar de lo que no, contando los descartes.
 *
 * Los autores se conservan para F2: cuando exista el mapeo teléfono→rol (§7.3
 * del spec), un «ya está» de alguien sin permiso para cerrar ese ítem va a dejar
 * de contar. Hoy se registran para poder MEDIR quién confirma de verdad antes de
 * escribir esa regla.
 */
export const filtrarMensajes = (mensajes: MensajeGrupo[]): MensajesUtiles => {
  const utiles: MensajesUtiles = {
    textos: [],
    autores: [],
    descartados: { propio: 0, vacio: 0, pregunta: 0, negacion: 0 },
  };

  for (const mensaje of mensajes) {
    const motivo = motivoDescarte(mensaje);
    if (motivo) {
      utiles.descartados[motivo] += 1;
      continue;
    }
    // Se entregan las cláusulas que afirman, no el mensaje entero: ver
    // `clausulasUtiles`. Cada una lleva su autor para la seguridad por rol (F2).
    for (const clausula of clausulasUtiles(mensaje.texto)) {
      utiles.textos.push(clausula);
      utiles.autores.push(mensaje.autor);
    }
  }

  return utiles;
};
