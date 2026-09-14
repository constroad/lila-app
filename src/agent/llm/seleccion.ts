import logger from '../../utils/logger.js';
import { hoyLima, sumarDias, type ClaveConsulta } from '../consultas/catalogo.js';
import {
  CAMPOS_ARGUMENTO,
  HERRAMIENTAS,
  esHerramientaDeDatos,
  herramienta,
  normalizarArgumentos,
  type Argumentos,
  type ArgumentoCrudo,
  type IdHerramienta,
} from './herramientas.js';
import { generar } from './modelo.js';

/**
 * ELEGIR LA HERRAMIENTA. El modelo recibe la lista de herramientas, unos
 * ejemplos con las fechas de HOY y la pregunta, y devuelve un JSON con forma
 * forzada por gramática: no puede inventar una herramienta ni un campo.
 *
 * Medido el 14/09/2026 con Qwen2.5-1.5B en el M1: 15 de 17 preguntas bien
 * ruteadas con estos ejemplos (sin ejemplos, 5 de 8 y argumentos inventados),
 * ~1 s por pregunta. Los argumentos se pasan después por
 * `normalizarArgumentos`, que solo acepta lo que la pregunta respalda.
 */

export const ESQUEMA_SELECCION = {
  type: 'object',
  properties: {
    herramienta: { enum: [...HERRAMIENTAS.map((h) => h.id), 'ninguna'] },
    argumentos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          campo: { enum: [...CAMPOS_ARGUMENTO] },
          valor: { type: 'string' },
        },
      },
    },
  },
} as const;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const diaSemana = (fecha: string): number => {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** Los ejemplos llevan fechas reales relativas a hoy: el modelo copia el patrón. */
export const promptSeleccion = (hoy: string): string => {
  const ayer = sumarDias(hoy, -1);
  const dow = diaSemana(hoy);
  const lunesPasado = sumarDias(hoy, -(((dow + 6) % 7) + 7));
  const domingoPasado = sumarDias(lunesPasado, 6);
  const jueves = sumarDias(hoy, ((4 - dow + 7) % 7) || 7);
  const [y, m] = hoy.split('-').map(Number);
  const mesAnterior = new Date(Date.UTC(y, m - 2, 1));
  const ma = `${mesAnterior.getUTCFullYear()}-${String(mesAnterior.getUTCMonth() + 1).padStart(2, '0')}`;
  const finMesAnterior = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const nombreMesAnterior = mesAnterior.toLocaleDateString('es-PE', { month: 'long', timeZone: 'UTC' }).toLowerCase();
  const lineas = HERRAMIENTAS.map((h) => `- ${h.id}: ${h.descripcion}${h.argumentos.length ? ` (${h.argumentos.join(', ')})` : ''}`);
  const ej = (p: string, id: string, args: Array<[string, string]>) =>
    `P: ${p} → ${JSON.stringify({ herramienta: id, argumentos: args.map(([campo, valor]) => ({ campo, valor })) })}`;
  return [
    `Eres Lila, asistente de operaciones de una planta de asfalto en Lima. Hoy es ${DIAS[dow]} ${hoy}.`,
    'Tu única tarea: elegir la herramienta que responde la pregunta y sacar de la pregunta sus argumentos. Respondes solo JSON.',
    '',
    'Herramientas (argumentos que aceptan):',
    ...lineas,
    '- ninguna: saludos, charla, o algo que ninguna herramienta responde',
    '',
    'Reglas:',
    '- Solo argumentos que estén en la pregunta. Si un argumento no está, no lo pongas.',
    `- fecha, desde y hasta en formato YYYY-MM-DD. "la semana pasada" = desde ${lunesPasado} hasta ${domingoPasado}; "en ${nombreMesAnterior}" = desde ${ma}-01 hasta ${ma}-${finMesAnterior}.`,
    '- empresa solo puede ser: globofast, constroad o inframaq. nombre es el nombre de un cliente, proveedor o material.',
    '',
    'Ejemplos:',
    ej('quién maneja la 4', 'unit_driver', [['unidad', '4']]),
    ej('fotos de la placa AML838 de ayer', 'unit_media', [['placa', 'AML838'], ['fecha', ayer]]),
    ej('cuál es el ruc de consorcio los pinos', 'clientes', [['nombre', 'consorcio los pinos']]),
    ej(`qué le despachamos a cobeñas en ${nombreMesAnterior}`, 'pedidos', [['nombre', 'cobeñas'], ['desde', `${ma}-01`], ['hasta', `${ma}-${finMesAnterior}`]]),
    ej('cuántas salidas de piedra hubo la semana pasada en globofast', 'kardex', [['nombre', 'piedra'], ['desde', lunesPasado], ['hasta', domingoPasado], ['empresa', 'globofast']]),
    ej('cuántos pedidos tuvo constroad la semana pasada', 'pedidos', [['empresa', 'constroad'], ['desde', lunesPasado], ['hasta', domingoPasado]]),
    ej('quién nos vende el petróleo', 'proveedores', [['nombre', 'petróleo']]),
    ej('cómo estará el clima en ate el jueves', 'weather', [['distrito', 'ate'], ['fecha', jueves]]),
    ej('gracias lila', 'ninguna', []),
  ].join('\n');
};

export interface Eleccion {
  herramienta: IdHerramienta;
  argumentos: Argumentos;
}

/** Lo que devolvió el modelo, pasado por la lista y por la pregunta. `null` = nada útil. */
export const interpretarSeleccion = (json: string, pregunta: string, ahoraMs = Date.now()): Eleccion | null => {
  let crudo: { herramienta?: unknown; argumentos?: unknown };
  try {
    crudo = JSON.parse(json);
  } catch {
    return null;
  }
  const id = String(crudo?.herramienta || '');
  if (!id || id === 'ninguna' || !herramienta(id)) return null;
  const lista = Array.isArray(crudo.argumentos) ? (crudo.argumentos as ArgumentoCrudo[]) : [];
  return {
    herramienta: id as IdHerramienta,
    argumentos: normalizarArgumentos(id as IdHerramienta, lista.filter((a) => a && typeof a === 'object'), pregunta, ahoraMs),
  };
};

const TIMEOUT_SELECCION_MS = 20_000;

/**
 * Pregunta al modelo. `anterior` es la última pregunta de la misma persona en
 * el hilo, para que «¿y en Ate?» tenga con qué completarse. `null` si no hay
 * modelo o no supo: el camino de reglas y embeddings sigue intacto.
 */
export const elegirHerramienta = async (pregunta: string, anterior?: string, ahoraMs = Date.now()): Promise<Eleccion | null> => {
  const hoy = hoyLima(ahoraMs);
  const usuario = anterior ? `(La misma persona acaba de preguntar: «${anterior}»)\n${pregunta}` : pregunta;
  const json = await generar({
    tarea: 'seleccion',
    sistema: promptSeleccion(hoy),
    usuario,
    esquema: ESQUEMA_SELECCION as unknown as Record<string, unknown>,
    maxTokens: 160,
    timeoutMs: TIMEOUT_SELECCION_MS,
  });
  if (!json) return null;
  const eleccion = interpretarSeleccion(json, pregunta, ahoraMs);
  logger.info(`[agente] llm eligió ${eleccion?.herramienta ?? 'ninguna'} para «${pregunta}»${eleccion ? ` ${JSON.stringify(eleccion.argumentos)}` : ''}`);
  return eleccion;
};

export const esClaveDeCatalogo = (id: IdHerramienta): id is ClaveConsulta => !esHerramientaDeDatos(id);
