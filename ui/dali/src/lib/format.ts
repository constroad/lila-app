const LIMA = 'America/Lima';

export const numero = (n: number, decimales = 0): string => n.toLocaleString('es-PE', { maximumFractionDigits: decimales });

export const horaDe = (ms: number): string => new Date(ms).toLocaleTimeString('es-PE', { timeZone: LIMA, hour: '2-digit', minute: '2-digit', hour12: false });

const diaLima = (ms: number): string => new Date(ms).toLocaleDateString('en-CA', { timeZone: LIMA });

/** «hoy 10:42», «ayer 18:03», «lun 12:10», «12 feb»: como en los diseños. */
export const cuando = (ms: number, ahoraMs = Date.now()): string => {
  const dia = diaLima(ms);
  if (dia === diaLima(ahoraMs)) return `hoy ${horaDe(ms)}`;
  if (dia === diaLima(ahoraMs - 86_400_000)) return `ayer ${horaDe(ms)}`;
  const hace = ahoraMs - ms;
  if (hace < 6 * 86_400_000) return new Date(ms).toLocaleDateString('es-PE', { timeZone: LIMA, weekday: 'short' }).replace('.', '');
  return new Date(ms).toLocaleDateString('es-PE', { timeZone: LIMA, day: 'numeric', month: 'short' }).replace('.', '');
};

/** «hace 3 min», «hace 2 h», «ayer». */
export const haceCuanto = (ms: number, ahoraMs = Date.now()): string => {
  const min = Math.max(0, Math.round((ahoraMs - ms) / 60_000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return cuando(ms, ahoraMs);
};

/** «+51 949 376 824» a partir de «51949376824». */
export const telefonoLegible = (t: string): string => {
  const d = String(t || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('51')) return `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return d ? `+${d}` : '';
};

/** «Lunes, 14 de septiembre». */
export const fechaLarga = (ms = Date.now()): string => {
  const s = new Date(ms).toLocaleDateString('es-PE', { timeZone: LIMA, weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** «1 oct» a partir de `YYYY-MM-DD`. */
export const diaCorto = (fecha: string): string => {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-PE', { timeZone: 'UTC', day: 'numeric', month: 'short' }).replace('.', '');
};

export const iniciales = (nombre: string): string =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

/** «venta de mezcla asfáltica» → «Venta de mezcla asfáltica» (los nombres del guion vienen en minúscula). */
export const oracion = (texto: string): string => (texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto);
