import type { EvaluacionChecklist } from './checklist.js';

/**
 * El texto del aviso que va al grupo de operaciones.
 *
 * MODO ESPEJO (fase 1). Todo esto sale al grupo de error-tracking, NUNCA al
 * grupo que escucha. La razón no es técnica: un agente que se equivoca delante
 * de la gente que trabaja pierde la confianza y lo silencian, y con eso se pierde
 * el proyecto entero. Primero se mide cuántas veces habría acertado; después se
 * le da voz.
 *
 * POR ESO EL AVISO DICE QUÉ HABRÍA HECHO, no lo que hizo: se lee como una
 * propuesta a revisar, no como una notificación ya enviada.
 */

const horaLegible = (minutos: number): string => {
  if (minutos < 0) return `hace ${horaLegible(-minutos)}`;
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

export interface ContextoAviso {
  /** Empresa dueña del día de producción, como se la nombra en el grupo. */
  empresa: string;
  /** Día de producción `YYYY-MM-DD` (calendario peruano). */
  fecha: string;
  /** Hora de arranque `HH:mm`, tal como se declaró. */
  horaArranque: string;
  /** Nombre del grupo que se está escuchando, para que se entienda de dónde sale. */
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
  const cuando =
    faltan >= 0
      ? `arranca en ${horaLegible(faltan)}`
      : `arrancó ${horaLegible(faltan)}`;

  const lineas = [
    '🔎 [ESPEJO] Checklist de producción sin confirmar',
    `Empresa: ${contexto.empresa} · ${contexto.fecha} · inicio ${contexto.horaArranque} (${cuando})`,
    '',
    'Sin confirmar en el grupo:',
    ...evaluacion.pendientes.map((p) => `  ❔ ${p.item.pregunta}`),
  ];

  if (evaluacion.resueltos.length > 0) {
    lineas.push(
      '',
      `Ya confirmado: ${evaluacion.resueltos.map((r) => r.item.id).join(', ')}`
    );
  }

  lineas.push(
    '',
    `Escuchando: ${contexto.grupoEscuchado}`,
    'En modo espejo: esto se habría preguntado en el grupo. No se envió a nadie más.'
  );

  return lineas.join('\n');
};
