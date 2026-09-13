import logger from '../../utils/logger.js';
import {
  LOCATIONS,
  WEATHER_ASPHALT_FORECAST,
  getCombinedRiskLevel,
} from '../../services/weather-asphalt-forecast.service.js';
import { normalizar } from './catalogo.js';
import { fechaLegible } from '../checklist/tiempo.js';

/**
 * EL CLIMA DE UN DISTRITO, POR HORA. José, 13/09/2026: «si le pregunto cómo
 * estará el clima en cierto distrito, que me diga de manera detallada si va a
 * llover, si estará soleado, y si hay riesgo de lluvia en qué franja horaria».
 *
 * Reusa los distritos y los umbrales del reporte diario de asfaltado
 * (`weather-asphalt-forecast`), pero pide el pronóstico HORARIO a Open-Meteo:
 * el reporte diario dice «hay riesgo»; esto dice «entre las 14 y las 17».
 * Mismo proveedor, mismo timeout, misma zona horaria.
 */

export interface Hora {
  hora: number;
  probLluvia: number;
  mm: number;
  temperatura: number;
  codigo: number;
}

export interface PronosticoDia {
  fecha: string;
  distrito: string;
  horas: Hora[];
}

/** WMO weather codes → palabras. */
const cielo = (codigo: number): string => {
  if (codigo === 0) return 'despejado';
  if (codigo <= 2) return 'parcialmente nublado';
  if (codigo === 3) return 'nublado';
  if (codigo === 45 || codigo === 48) return 'con neblina';
  if (codigo >= 51 && codigo <= 57) return 'con llovizna';
  if (codigo >= 61 && codigo <= 67) return 'con lluvia';
  if (codigo >= 80 && codigo <= 82) return 'con chubascos';
  if (codigo >= 95) return 'con tormenta';
  return 'variable';
};

/** El distrito nombrado en la pregunta; sin nombre, la planta (Constroad). */
export const distritoDe = (pregunta: string): { name: string; lat: number; lon: number } => {
  const t = normalizar(pregunta);
  // Los distritos primero; «Constroad» (la planta) es el default, no un nombre
  // que la gente escriba.
  const encontrado = LOCATIONS.slice(1).find((l) => t.includes(normalizar(l.name)));
  return encontrado ?? { ...LOCATIONS[0], name: 'la planta' };
};

const URL_BASE =
  'https://api.open-meteo.com/v1/forecast?hourly=precipitation_probability,precipitation,temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=America%2FLima';

/** Open-Meteo pronostica hasta 16 días. Más allá, no hay dato y no se inventa. */
export const MAX_DIAS = 16;

/** Cuántos días pedir para cubrir una fecha; `null` si está fuera del alcance. */
export const diasHasta = (fecha: string, hoy: string): number | null => {
  const ms = (f: string) => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));
  const delta = Math.round((ms(fecha) - ms(hoy)) / 86_400_000);
  if (delta < 0 || delta >= MAX_DIAS) return null;
  return delta + 1;
};

const pedir = async (distrito: { lat: number; lon: number }, dias: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_ASPHALT_FORECAST.fetchTimeoutMs);
  try {
    const res = await fetch(`${URL_BASE}&forecast_days=${dias}&latitude=${distrito.lat}&longitude=${distrito.lon}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    return (await res.json()) as {
      hourly?: { time: string[]; precipitation_probability: number[]; precipitation: number[]; temperature_2m: number[]; weather_code: number[] };
      daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; precipitation_sum: number[] };
    };
  } finally {
    clearTimeout(timer);
  }
};

export const pronosticoHorario = async (
  distrito: { name: string; lat: number; lon: number },
  fecha: string,
  hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)
): Promise<PronosticoDia | null> => {
  const dias = diasHasta(fecha, hoy);
  if (dias === null) return null;
  try {
    const data = await pedir(distrito, dias);
    const h = data.hourly;
    if (!h?.time) return null;
    const horas: Hora[] = [];
    h.time.forEach((t, i) => {
      if (!t.startsWith(fecha)) return;
      horas.push({
        hora: Number(t.slice(11, 13)),
        probLluvia: Number(h.precipitation_probability?.[i] ?? 0) || 0,
        mm: Number(h.precipitation?.[i] ?? 0) || 0,
        temperatura: Number(h.temperature_2m?.[i] ?? 0) || 0,
        codigo: Number(h.weather_code?.[i] ?? 0) || 0,
      });
    });
    return horas.length ? { fecha, distrito: distrito.name, horas } : null;
  } catch (error) {
    logger.warn(`[agente] clima: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

export interface DiaResumen {
  fecha: string;
  codigo: number;
  tMin: number;
  tMax: number;
  probMax: number;
  mm: number;
}

/** Los próximos 7 días, un renglón por día. */
export const pronosticoSemanal = async (
  distrito: { name: string; lat: number; lon: number }
): Promise<{ distrito: string; dias: DiaResumen[] } | null> => {
  try {
    const data = await pedir(distrito, 7);
    const d = data.daily;
    if (!d?.time) return null;
    return {
      distrito: distrito.name,
      dias: d.time.map((fecha, i) => ({
        fecha,
        codigo: Number(d.weather_code?.[i] ?? 0) || 0,
        tMin: Number(d.temperature_2m_min?.[i] ?? 0) || 0,
        tMax: Number(d.temperature_2m_max?.[i] ?? 0) || 0,
        probMax: Number(d.precipitation_probability_max?.[i] ?? 0) || 0,
        mm: Number(d.precipitation_sum?.[i] ?? 0) || 0,
      })),
    };
  } catch (error) {
    logger.warn(`[agente] clima semanal: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const ICONO: Record<string, string> = { ok: '✅', moderate_risk: '⚠️', high_risk: '⛔' };

export const textoClimaSemanal = (p: { distrito: string; dias: DiaResumen[] } | null): string => {
  if (!p) return 'No pude consultar el pronóstico ahora. Probá de nuevo en un rato.';
  const lineas = [`🗓 *Clima en ${p.distrito} — próximos ${p.dias.length} días*`];
  for (const d of p.dias) {
    const nivel = getCombinedRiskLevel(d.probMax, d.mm);
    const lluvia = d.probMax >= 30 || d.mm >= 0.5 ? `lluvia ${d.probMax.toFixed(0)} %, ${d.mm.toFixed(1)} mm` : 'sin lluvia';
    lineas.push(`${ICONO[nivel] ?? '•'} ${fechaLegible(d.fecha)}: ${cielo(d.codigo)}, ${d.tMin.toFixed(0)}–${d.tMax.toFixed(0)} °C, ${lluvia}`);
  }
  lineas.push('', '✅ apto · ⚠️ con precaución · ⛔ no apto para asfaltar. Preguntame por un día para ver las franjas horarias.');
  return lineas.join('\n');
};

export const textoFueraDeAlcance = (fecha: string): string =>
  `Para ${fechaLegible(fecha)} todavía no hay pronóstico: llego hasta ${MAX_DIAS} días adelante.`;

/** Franjas contiguas de horas con riesgo: probabilidad ≥ 30 % o ≥ 0,5 mm. */
export const franjasDeRiesgo = (horas: Hora[]): Array<{ desde: number; hasta: number; probMax: number; mm: number }> => {
  const franjas: Array<{ desde: number; hasta: number; probMax: number; mm: number }> = [];
  let actual: { desde: number; hasta: number; probMax: number; mm: number } | null = null;
  for (const h of horas) {
    const riesgo = h.probLluvia >= 30 || h.mm >= 0.5;
    if (riesgo) {
      if (actual && actual.hasta === h.hora - 1) {
        actual.hasta = h.hora;
        actual.probMax = Math.max(actual.probMax, h.probLluvia);
        actual.mm += h.mm;
      } else {
        actual = { desde: h.hora, hasta: h.hora, probMax: h.probLluvia, mm: h.mm };
        franjas.push(actual);
      }
    } else {
      actual = null;
    }
  }
  return franjas;
};

const hh = (h: number): string => `${String(h).padStart(2, '0')}:00`;

export const textoClima = (p: PronosticoDia | null, ahoraHora: number): string => {
  if (!p) return 'No pude consultar el pronóstico ahora. Probá de nuevo en un rato.';
  const { horas } = p;
  const probMax = Math.max(...horas.map((h) => h.probLluvia));
  const mmTotal = horas.reduce((s, h) => s + h.mm, 0);
  const temps = horas.map((h) => h.temperatura);
  const tMin = Math.min(...temps);
  const tMax = Math.max(...temps);
  // El cielo «de día» (7–18): es cuando se asfalta y lo que la gente ve.
  const deDia = horas.filter((h) => h.hora >= 7 && h.hora <= 18);
  const codigos = (deDia.length ? deDia : horas).map((h) => h.codigo);
  const codigoTipico = codigos.sort((a, b) => codigos.filter((v) => v === a).length - codigos.filter((v) => v === b).length).pop() ?? 0;
  const franjas = franjasDeRiesgo(horas);
  const nivel = getCombinedRiskLevel(probMax, mmTotal);

  const lineas = [
    `🌤 *Clima en ${p.distrito} — ${fechaLegible(p.fecha)}*`,
    `Cielo ${cielo(codigoTipico)} · ${tMin.toFixed(0)} a ${tMax.toFixed(0)} °C`,
  ];
  if (franjas.length === 0) {
    lineas.push(`Lluvia: sin riesgo en todo el día (máx. ${probMax.toFixed(0)} %, ${mmTotal.toFixed(1)} mm).`);
  } else {
    lineas.push(`Lluvia: riesgo en ${franjas.length === 1 ? 'esta franja' : 'estas franjas'} —`);
    for (const f of franjas) {
      const pasada = f.hasta < ahoraHora ? ' (ya pasó)' : '';
      lineas.push(`• ${hh(f.desde)}–${hh(f.hasta + 1)}: hasta ${f.probMax.toFixed(0)} %, ${f.mm.toFixed(1)} mm${pasada}`);
    }
  }
  const veredicto: Record<string, string> = {
    ok: '✅ Apto para asfaltar.',
    moderate_risk: '⚠️ Asfaltar con precaución: hay riesgo de lluvia.',
    high_risk: '⛔ No apto para asfaltar: riesgo alto de lluvia.',
  };
  lineas.push(veredicto[nivel] ?? `Riesgo: ${nivel}.`);
  return lineas.join('\n');
};
