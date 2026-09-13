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
  'https://api.open-meteo.com/v1/forecast?hourly=precipitation_probability,precipitation,temperature_2m,weather_code&timezone=America%2FLima&forecast_days=2';

export const pronosticoHorario = async (
  distrito: { name: string; lat: number; lon: number },
  fecha: string
): Promise<PronosticoDia | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_ASPHALT_FORECAST.fetchTimeoutMs);
  try {
    const res = await fetch(`${URL_BASE}&latitude=${distrito.lat}&longitude=${distrito.lon}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = (await res.json()) as {
      hourly?: { time: string[]; precipitation_probability: number[]; precipitation: number[]; temperature_2m: number[]; weather_code: number[] };
    };
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
  } finally {
    clearTimeout(timer);
  }
};

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
