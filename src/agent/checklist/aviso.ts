import type { EvaluacionChecklist, EstadoItem, ChecklistDomain } from './checklist.js';
import { fechaLegible } from './tiempo.js';

/**
 * El texto del aviso que va al grupo de operaciones.
 *
 * LO LEE UNA PERSONA EN EL CELULAR, y eso decide todo lo de abajo. La primera
 * versión (12/09/2026) decía «[ESPEJO]», «globofas-s8k», un JID de veinte
 * dígitos convertido en link, y un pie de dos renglones explicando qué era el
 * modo espejo. José: «no me dice mucho, no está formateado, todo desordenado».
 * Tenía razón: era un volcado de estado, no un mensaje.
 *
 * Qué tiene que responder, en este orden y de un vistazo:
 *   1. de quién y cuándo es la producción («Globofast, domingo 04:00, 91 m³»);
 *   2. qué falta, en palabras de obra, y desde cuándo está vencido;
 *   3. qué haría el agente con eso.
 *
 * Formato de WhatsApp: `*negrita*` y `_cursiva_`. Sin identificadores del
 * sistema — ni slugs, ni JIDs, ni nombres de fase. El nombre de la empresa y el
 * del grupo llegan resueltos; acá no se traduce nada.
 *
 * MODO ESPEJO (fase 1): todo esto sale al grupo de error-tracking, NUNCA al grupo
 * que escucha. Un agente que se equivoca delante de la gente que trabaja pierde
 * la confianza y lo silencian. Primero se mide cuántas veces habría acertado;
 * después se le da voz. Por eso el aviso cierra diciendo qué HABRÍA hecho.
 */

const duracion = (minutos: number): string => {
  const abs = Math.abs(minutos);
  if (abs < 60) return `${abs} min`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

export interface ContextoAviso {
  /** Nombre de la empresa como lo dice la gente («Globofast»), no el slug. */
  empresa: string;
  /** Día de producción `YYYY-MM-DD` (calendario peruano). */
  fecha: string;
  /** Hora de arranque `HH:mm`, tal como se declaró. */
  horaArranque: string;
  /** Cliente del pedido, si se sabe. */
  cliente?: string;
  /** Metros cúbicos del pedido, si se sabe. */
  cubos?: number;
  /** Nombre del grupo que se está escuchando («INFRAMAQ admin»), no su JID. */
  grupoEscuchado: string;
}


/**
 * `null` cuando no hay nada vencido: **el silencio es la respuesta correcta**.
 * Un agente que avisa «todo en orden» tres veces al día enseña a ignorarlo.
 */
export const construirAvisoChecklist = (
  evaluacion: EvaluacionChecklist,
  contexto: ContextoAviso
): string | null => {
  if (evaluacion.pendientes.length === 0) return null;

  const faltan = evaluacion.minutosParaArranque;
  const cuando = faltan >= 0 ? `Arranca en ${duracion(faltan)}` : `Arrancó hace ${duracion(faltan)}`;

  const lineas = [
    `📋 *Checklist de producción — ${contexto.empresa}*`,
    detalleProduccion(contexto),
    cuando,
  ];

  // Por dominio, porque lo lee gente distinta: planta primero, campo después.
  const TITULO: Record<ChecklistDomain, string> = { planta: 'Planta', obra: 'Campo' };
  for (const dominio of ['planta', 'obra'] as ChecklistDomain[]) {
    const pendientes = evaluacion.pendientes.filter((p) => p.item.domain === dominio);
    if (pendientes.length === 0) continue;
    lineas.push('', `*${TITULO[dominio]}* — sin confirmar:`);
    lineas.push(...pendientes.map((p) => `• ${p.item.pregunta}`));
  }

  if (evaluacion.resueltos.length > 0) {
    lineas.push('', `Ya confirmado: ${evaluacion.resueltos.map((r) => r.item.titulo).join(', ')} ✔`);
  }

  return lineas.join('\n');
};

const detalleProduccion = (contexto: ContextoAviso): string =>
  [
    `${fechaLegible(contexto.fecha)} a las ${contexto.horaArranque}`,
    contexto.cliente?.trim(),
    contexto.cubos ? `${contexto.cubos} m³` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * EL AVISO A PLANTA: que hay producción, de quién, cuándo y cuánto. Es el hecho
 * que faltó el 07/09 —«nadie avisó a planta que había producción a las 4 am»—
 * y va al grupo de planta, no al de administración (José, 12/09/2026).
 */
export const construirAvisoProduccion = (contexto: ContextoAviso): string =>
  [
    `📢 *Producción programada — ${contexto.empresa}*`,
    detalleProduccion(contexto),
    '',
    'Por favor confirmar que planta está enterada y coordinada.',
  ].join('\n');

/**
 * Cómo se ve una propuesta en el grupo de operaciones: el mensaje tal cual
 * saldría, y arriba a dónde iría y cómo se aprueba. La persona ve EXACTAMENTE
 * lo que se va a mandar; nada se reescribe entre el «1» y el envío.
 */
export const conPiePropuesta = (texto: string, nombreDestino: string): string =>
  [
    `📨 *Propuesta para «${nombreDestino}»* — respondé *1* para mandarlo, *3* para descartar`,
    '',
    texto,
  ].join('\n');

/**
 * LA FIRMA DEL AVISO, para no repetirlo.
 *
 * NO es el hash del texto. El texto lleva «arranca en 11 h 20 min», que cambia
 * cada minuto, así que dos avisos iguales nunca eran «iguales»: el 12/09 salió
 * el mismo aviso a las 16:20 y a las 16:40, y habría seguido cada 20 minutos
 * hasta agotar el tope diario. Lo que define un aviso es QUÉ falta para QUÉ
 * pedido; solo cuando eso cambia —vence otro ítem, o se confirma uno— hay algo
 * nuevo que decir.
 */
export const firmaAviso = (pedidoId: string, evaluacion: EvaluacionChecklist): string =>
  `${pedidoId}|${evaluacion.pendientes
    .map((p) => p.item.id)
    .sort()
    .join(',')}`;
