import { instanteArranque } from './tiempo.js';

/**
 * EL DÍA DE PLANTA. Motor puro.
 *
 * La unidad no es el pedido: es (planta, fecha). José, 13/09/2026: «a las 9
 * Globofast programa una producción para mañana; en la tarde Constroad programa
 * otro despacho también para mañana. ¿Cómo vas a hacer para informarle a la
 * planta?». Con un aviso por pedido, la planta recibe dos mensajes sueltos y
 * nadie le dice el total. Con el día, recibe UNO —«mañana 04:00 Globofast 91 m³
 * + 07:00 Constroad 45 m³ = 136 m³»— y una actualización cuando cambia.
 *
 * El spec ya lo decía (§2.1: «un día con tres pedidos tiene un almuerzo»); la
 * primera implementación lo simplificó a pedido para llegar al sábado.
 */

export interface PedidoDelDia {
  id: string;
  companyId: string;
  /** Nombre de la empresa como lo dice la gente. */
  empresa: string;
  cliente: string;
  cubos: number;
  /** `HH:mm` declarado en el pedido. */
  hora: string;
  arranqueMs: number;
  creadoMs: number;
}

export interface DiaDePlanta {
  /** `YYYY-MM-DD`, calendario peruano. */
  fecha: string;
  /** Ordenados por hora de arranque. */
  pedidos: PedidoDelDia[];
  /** El primer arranque del día: contra eso se miden los horarios. */
  arranqueMs: number;
  totalCubos: number;
  /** Desde cuándo existe el día: la creación del pedido más antiguo. */
  creadoMs: number;
}

export const agruparPorDia = (pedidos: PedidoDelDia[]): DiaDePlanta[] => {
  const porFecha = new Map<string, PedidoDelDia[]>();
  for (const p of pedidos) {
    const fecha = new Date(p.arranqueMs + 5 * 3_600_000).toISOString().slice(0, 10);
    porFecha.set(fecha, [...(porFecha.get(fecha) ?? []), p]);
  }
  return Array.from(porFecha.entries())
    .map(([fecha, lista]) => {
      const ordenados = [...lista].sort((a, b) => a.arranqueMs - b.arranqueMs);
      return {
        fecha,
        pedidos: ordenados,
        arranqueMs: ordenados[0].arranqueMs,
        totalCubos: ordenados.reduce((s, p) => s + (p.cubos || 0), 0),
        creadoMs: Math.min(...ordenados.map((p) => p.creadoMs)),
      };
    })
    .sort((a, b) => a.arranqueMs - b.arranqueMs);
};

/**
 * Qué define «el mismo día»: los pedidos, sus horas y sus cubos. Si cambia
 * cualquiera —se suma uno, se cae uno, se mueve la hora— hay algo nuevo que
 * decirle a planta.
 */
export const firmaDia = (dia: DiaDePlanta): string =>
  `${dia.fecha}|${dia.pedidos
    .map((p) => `${p.id}:${p.hora}:${p.cubos}`)
    .sort()
    .join(',')}`;

/**
 * LOS HORARIOS DE REVISIÓN, que son horarios y no reglas de máquina. José,
 * 13/09: «¿cada qué tiempo lo vas a enviar?» — la respuesta anterior era «cuando
 * cambia lo que falta, máximo 3, y re-propone a las 6 h», que es por lo que un
 * checklist llegó a las 00:40 para una producción de las 04:00.
 *
 *   inicial        → 16:00 del día anterior: la revisión completa.
 *   recordatorio   → 20:00 del día anterior: solo lo que sigue sin confirmar.
 *   ultima-llamada → 2 h antes del arranque: solo lo crítico.
 *
 * Un pedido creado después de un horario dispara ese horario en el acto (es
 * el caso del 07/09: pedido a medianoche para las 04:00 → última llamada).
 */
export type Momento = 'inicial' | 'recordatorio' | 'ultima-llamada';

const diaAnterior = (fecha: string): string => {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

export const momentosDelDia = (dia: DiaDePlanta): Array<{ momento: Momento; ms: number }> => {
  const anterior = diaAnterior(dia.fecha);
  const momentos: Array<{ momento: Momento; ms: number }> = [
    { momento: 'inicial', ms: instanteArranque(anterior, '16:00') ?? dia.arranqueMs - 12 * 3_600_000 },
    { momento: 'recordatorio', ms: instanteArranque(anterior, '20:00') ?? dia.arranqueMs - 8 * 3_600_000 },
    { momento: 'ultima-llamada', ms: dia.arranqueMs - 2 * 3_600_000 },
  ];
  return momentos
    .filter((m) => m.ms < dia.arranqueMs)
    .sort((a, b) => a.ms - b.ms);
};

/**
 * El horario que corresponde AHORA: el último que ya pasó y que sea posterior a
 * que el día exista. `null` si todavía no toca ninguno o si la producción ya
 * arrancó (después del arranque no se pregunta nada: se pregunta antes).
 */
export const momentoVigente = (dia: DiaDePlanta, ahoraMs: number): Momento | null => {
  if (ahoraMs >= dia.arranqueMs) return null;
  const pasados = momentosDelDia(dia).filter((m) => m.ms <= ahoraMs);
  return pasados.length ? pasados[pasados.length - 1].momento : null;
};
