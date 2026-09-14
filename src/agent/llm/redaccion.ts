import { generar } from './modelo.js';

/**
 * LA FRASE. El modelo lee la pregunta y la FICHA (ya armada, con todos los
 * datos) y contesta en una o dos líneas lo que se preguntó: «El teléfono de
 * *COBEÑAS* es 987654321». La ficha va debajo, completa. Si el modelo tarda,
 * falla o dice un número que no está en la ficha, va la ficha sola.
 *
 * Por qué la ficha y no el JSON: medido el 14/09/2026 con Qwen2.5-1.5B — con
 * JSON crudo contestó «no encontré nada» teniendo los datos delante (2 de 4
 * mal); con la ficha en texto y un ejemplo, 4 de 4 bien en ~1 s. Un modelo
 * chico lee texto, no estructuras.
 *
 * «Redacta pero nunca inventa datos» es una regla que se VERIFICA, no que se
 * pide: `respetaLosDatos` exige que cada número de la frase esté en la ficha o
 * en la pregunta.
 */

export const PROMPT_REDACCION = [
  'Eres Lila, asistente de operaciones de una planta de asfalto en Lima. Respondes por WhatsApp, en español peruano, de tú, breve.',
  'Te dan una pregunta y una FICHA con datos. Contesta la pregunta en una o dos líneas usando SOLO la ficha. Copia los números y nombres tal cual, con su etiqueta correcta (un RUC es RUC, un teléfono es teléfono). Si el dato que preguntan NO está en la ficha, di que no está registrado y no pongas ningún número. No saludes ni te despidas. Usa *negritas* para el dato principal.',
  '',
  'Ejemplo 1:',
  'Pregunta: cuál es el ruc de andes sac',
  'Ficha:',
  '👤 *ANDES SAC* · Globofast',
  'RUC 20512345678',
  'Contacto: Luis Paz · 999888777',
  'Dirección: Av. Perú 100, Comas',
  'Respuesta: El RUC de *ANDES SAC* es *20512345678*.',
  '',
  'Ejemplo 2:',
  'Pregunta: cuál es el correo de andes sac',
  'Ficha:',
  '👤 *ANDES SAC* · Globofast',
  'RUC 20512345678',
  'Contacto: Luis Paz · 999888777',
  'Respuesta: *ANDES SAC* no tiene correo registrado. Su contacto es Luis Paz, teléfono 999888777.',
].join('\n');

/** Los valores numéricos de un texto: «1,563.75» → 1563.75, «13/09» → 13 y 9, «987654321» → 987654321. */
export const numerosDe = (texto: string): number[] => {
  const encontrados: number[] = [];
  for (const m of String(texto).matchAll(/\d[\d.,]*/g)) {
    const crudo = m[0].replace(/[.,]$/, '');
    // Separador de miles «1,563.75» o «1.563,75»: el último signo es el decimal.
    const ultimo = Math.max(crudo.lastIndexOf('.'), crudo.lastIndexOf(','));
    const entero = ultimo < 0 ? crudo : crudo.slice(0, ultimo).replace(/[.,]/g, '');
    const decimal = ultimo < 0 ? '' : crudo.slice(ultimo + 1);
    const conDecimal = Number(`${entero}${decimal ? `.${decimal}` : ''}`);
    const pegado = Number(crudo.replace(/[.,]/g, ''));
    for (const v of [conDecimal, pegado]) if (Number.isFinite(v)) encontrados.push(v);
  }
  return encontrados;
};

/**
 * ¿Cada número de la frase está en la ficha (o en la pregunta)? Un porcentaje
 * calculado, un total sumado por el modelo o un teléfono cambiado no pasan.
 */
export const respetaLosDatos = (frase: string, ficha: string, pregunta = ''): boolean => {
  const permitidos = new Set(numerosDe(`${ficha}\n${pregunta}`));
  // Las fechas de la ficha también valen por partes: «13/09» habilita 13 y 9.
  for (const m of `${ficha}\n${pregunta}`.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    permitidos.add(Number(m[1]));
    permitidos.add(Number(m[2]));
    if (m[3]) permitidos.add(Number(m[3]));
  }
  for (const m of `${ficha}\n${pregunta}`.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    permitidos.add(Number(m[1]));
    permitidos.add(Number(m[2]));
    permitidos.add(Number(m[3]));
  }
  // Cada número de la frase se acepta si ALGUNA de sus lecturas está permitida.
  for (const m of String(frase).matchAll(/\d[\d.,]*/g)) {
    if (!numerosDe(m[0]).some((v) => permitidos.has(v))) return false;
  }
  return true;
};

const TIMEOUT_REDACCION_MS = 25_000;
const MAX_FRASE = 320;

/** La frase, o `null` si no hay modelo, no llegó a tiempo o no respetó los datos. */
export const redactar = async (pregunta: string, ficha: string): Promise<string | null> => {
  const texto = await generar({
    tarea: 'redaccion',
    sistema: PROMPT_REDACCION,
    usuario: `Pregunta: ${pregunta}\nFicha:\n${ficha}\nRespuesta:`,
    maxTokens: 120,
    timeoutMs: TIMEOUT_REDACCION_MS,
  });
  if (!texto) return null;
  const frase = texto.replace(/^respuesta:\s*/i, '').replace(/\s+/g, ' ').trim();
  if (!frase || frase.length > MAX_FRASE) return null;
  // «No lo encontré» con la ficha delante es el modelo sin leer, no una respuesta.
  if (/\bno (lo |la |los |las )?encontr/i.test(frase)) return null;
  return respetaLosDatos(frase, ficha, pregunta) ? frase : null;
};
