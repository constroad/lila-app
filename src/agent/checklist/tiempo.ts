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

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * «domingo 13/09» a partir de `YYYY-MM-DD`. Es lo que la gente lee: nadie en un
 * grupo de obra piensa en «2026-09-13». Sin `Intl` a propósito: el día de la
 * semana de una fecha de calendario no depende de la zona, y así no hay nada que
 * pueda variar entre la máquina de desarrollo y la mini.
 *
 * El AÑO solo cuando no es el de hoy: «sábado 04/09» escondía que se había
 * leído el 04/09 de 2027 (15/09); «sábado 04/09/2027» lo habría delatado.
 */
export const fechaLegible = (fecha: string, ahoraMs = Date.now()): string => {
  const [y, m, d] = String(fecha || '').split('-').map(Number);
  if (!y || !m || !d) return fecha;
  const dia = DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const anio = y === Number(diaPeruano(ahoraMs).slice(0, 4)) ? '' : `/${y}`;
  return `${dia} ${dd}/${mm}${anio}`;
};
