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

const niega = (textoNormalizado: string): boolean => {
  const palabras = enPalabras(textoNormalizado);
  if (palabras.some((palabra) => NEGACIONES_PALABRA.includes(palabra))) return true;
  const limpio = palabras.join(' ');
  return NEGACIONES_PREFIJO.some((prefijo) => limpio.includes(prefijo));
};

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
    utiles.textos.push(mensaje.texto);
    utiles.autores.push(mensaje.autor);
  }

  return utiles;
};
