/**
 * Fecha y hora del día de producción. Puro, y SIN IMPORTS a propósito.
 *
 * `detector.ts` arrastra `logger` → `config` → `import.meta`, que no parsea bajo
 * CommonJS: un test que lo importara reventaría al CARGARSE, aunque solo quisiera
 * probar estas tres funciones. Aislarlas es la cura estructural del pitfall §13;
 * mockear `config` en cada test es un parche que el siguiente test vuelve a pisar.
 *
 * Y son justo las funciones que más merecen test: acá es donde este proyecto se
 * quema una y otra vez (el bug #1 del catálogo).
 */

/** Máximo de avisos por día de producción. F1 arranca conservador. */
export const MAX_AVISOS_POR_DIA = 3;

/** Lima es UTC-5 todo el año, sin horario de verano. */
const OFFSET_LIMA_MS = 5 * 60 * 60 * 1000;

/** `YYYY-MM-DD` del día PERUANO de un instante, sin construir fechas locales. */
export const diaPeruano = (ms: number): string =>
  new Date(ms - OFFSET_LIMA_MS).toISOString().slice(0, 10);

/**
 * El instante del arranque, a partir de la fecha de calendario y `HH:mm`.
 *
 * Se arma con el offset EXPLÍCITO de Lima: sin él, el proceso lo interpretaría
 * en su propia zona y el arranque se correría 5 h. En la mini daría bien por
 * casualidad; en un runner UTC, no.
 */
export const instanteArranque = (fecha: string, hora: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;
  const ms = new Date(`${fecha}T${hora}:00.000-05:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
};
