export const WEATHER_ASPHALT_FORECAST = {
  fetchTimeoutMs: 25_000,
  timezone: 'America/Lima',
  /**
   * Reintentos ante fallo TRANSITORIO de Open-Meteo (20/08/2026: un 503 a las
   * 08:00 se llevó puesto el reporte del día entero). Es una API pública y
   * gratuita: un 503/429 puntual es esperable, no una avería. Con un solo
   * intento, cada blip momentáneo = un día sin reporte + una alerta a las 8am.
   */
  maxAttempts: 3,
  retryBaseDelayMs: 1_500,
};

/**
 * ¿Vale la pena reintentar este fallo?
 *
 * 5xx y 429 son del lado del servidor y suelen durar segundos. Un 4xx (salvo
 * 429) es culpa NUESTRA —URL mal armada, parámetro inválido— y reintentar solo
 * gasta tiempo y esconde el error real detrás de tres intentos idénticos.
 */
export function isRetriableWeatherStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

const LOCATIONS = [
  { name: 'Constroad', lat: -11.9894172, lon: -76.8789932 },
  { name: 'Ancon', lat: -11.769, lon: -77.153 },
  { name: 'Ate', lat: -12.016, lon: -76.981 },
  { name: 'Barranco', lat: -12.147, lon: -77.021 },
  { name: 'Brena', lat: -12.062, lon: -77.041 },
  { name: 'Carabayllo', lat: -11.983, lon: -77.081 },
  { name: 'Chaclacayo', lat: -12.049, lon: -76.859 },
  { name: 'Chorrillos', lat: -12.168, lon: -77.026 },
  { name: 'Cieneguilla', lat: -12.116, lon: -76.822 },
  { name: 'Comas', lat: -11.999, lon: -77.06 },
  { name: 'El Agustino', lat: -12.053, lon: -77.033 },
  { name: 'Independencia', lat: -12.008, lon: -77.062 },
  { name: 'Jesus Maria', lat: -12.075, lon: -77.047 },
  { name: 'La Molina', lat: -12.083, lon: -76.926 },
  { name: 'La Victoria', lat: -12.06, lon: -77.017 },
  { name: 'Lima Cercado', lat: -12.046, lon: -77.03 },
  { name: 'Lince', lat: -12.082, lon: -77.021 },
  { name: 'Los Olivos', lat: -11.976, lon: -77.075 },
  { name: 'Lurigancho', lat: -12.016, lon: -76.916 },
  { name: 'Lurin', lat: -12.332, lon: -76.892 },
  { name: 'Magdalena del Mar', lat: -12.098, lon: -77.053 },
  { name: 'Miraflores', lat: -12.121, lon: -77.03 },
  { name: 'Pueblo Libre', lat: -12.1, lon: -77.061 },
  { name: 'Punta Hermosa', lat: -12.343, lon: -77.023 },
  { name: 'Punta Negra', lat: -12.398, lon: -76.946 },
  { name: 'Rimac', lat: -12.042, lon: -77.062 },
  { name: 'San Bartolo', lat: -12.467, lon: -76.78 },
  { name: 'San Borja', lat: -12.092, lon: -77.027 },
  { name: 'San Isidro', lat: -12.097, lon: -77.036 },
  { name: 'San Juan de Lurigancho', lat: -12.016, lon: -77.03 },
  { name: 'San Juan de Miraflores', lat: -12.092, lon: -76.979 },
  { name: 'San Luis', lat: -12.058, lon: -77.025 },
  { name: 'San Martin de Porres', lat: -12.034, lon: -77.055 },
  { name: 'San Miguel', lat: -12.071, lon: -77.093 },
  { name: 'Santa Anita', lat: -12.045, lon: -76.972 },
  { name: 'Santa Maria del Mar', lat: -12.371, lon: -77.019 },
  { name: 'Santa Rosa', lat: -12.119, lon: -77.011 },
  { name: 'Santiago de Surco', lat: -12.117, lon: -77.036 },
  { name: 'Surquillo', lat: -12.103, lon: -77.03 },
  { name: 'Villa El Salvador', lat: -12.174, lon: -76.977 },
  { name: 'Villa Maria del Triunfo', lat: -12.118, lon: -76.983 },
];

const WEATHER_API_BASE =
  'https://api.open-meteo.com/v1/forecast?daily=temperature_2m_mean,precipitation_probability_max,precipitation_sum&timezone=America/Lima';
const ASPHALT_PLANT_LOCATION = 'Distrito de Lurigancho-Chosica';

type RiskLevel = 'high_risk' | 'moderate_risk' | 'ok';

type OpenMeteoDaily = {
  time: string[];
  temperature_2m_mean: number[];
  precipitation_probability_max: number[];
  precipitation_sum: number[];
};

type OpenMeteoResponse = {
  daily: OpenMeteoDaily;
};

type DistrictForecast = {
  name: string;
  prob: number;
  mm: number;
  level: Exclude<RiskLevel, 'ok'>;
};

type ConstroadDay = {
  date: Date;
  prob: number;
  mm: number;
  decision: string;
  level: RiskLevel;
};

export type WeatherForecastResult = {
  status: 'ok' | 'degraded';
  hasRainRisk: boolean;
  message: string | null;
  mensaje: string | null;
  telegramAlert?: boolean;
  error?: string;
};

type FetchLike = typeof fetch;
type NotifyError = (params: { dedupeKey?: string; message: string }) => Promise<boolean>;

const MM_VERY_LOW_MAX = 0.5;
const MM_LOW_MAX = 1.0;
const MM_MODERATE_MAX = 2.0;

function getProbBand(prob: number): 'none' | 'low' | 'moderate' | 'high' {
  if (prob <= 10) return 'none';
  if (prob <= 24) return 'low';
  if (prob <= 44) return 'moderate';
  return 'high';
}

function getMmBand(mm: number): 'very_low' | 'low' | 'moderate' | 'high' {
  if (mm < MM_VERY_LOW_MAX) return 'very_low';
  if (mm < MM_LOW_MAX) return 'low';
  if (mm < MM_MODERATE_MAX) return 'moderate';
  return 'high';
}

export function getCombinedRiskLevel(prob: number, mm: number): RiskLevel {
  const probBand = getProbBand(prob);
  const mmBand = getMmBand(mm);

  if (mmBand === 'very_low') return 'ok';
  if (probBand === 'none') return mmBand === 'high' ? 'moderate_risk' : 'ok';
  if (probBand === 'low') {
    if (mmBand === 'moderate') return 'moderate_risk';
    if (mmBand === 'high') return 'high_risk';
    return 'ok';
  }
  if (probBand === 'moderate') {
    if (mmBand === 'high') return 'high_risk';
    if (mmBand === 'low' || mmBand === 'moderate') return 'moderate_risk';
    return 'ok';
  }
  return 'high_risk';
}

function getConstroadDecision(level: RiskLevel): string {
  if (level === 'high_risk') return 'NO APTO PARA PRODUCIR EN PLANTA';
  if (level === 'moderate_risk') return 'RIESGO MODERADO PARA PRODUCIR EN PLANTA';
  return 'APTO PARA PRODUCIR EN PLANTA';
}

function formatDate(date: Date): string {
  const opts = { timeZone: WEATHER_ASPHALT_FORECAST.timezone };
  const dayName = date.toLocaleDateString('es-PE', { ...opts, weekday: 'long' });
  const dayNumber = date.toLocaleDateString('es-PE', { ...opts, day: 'numeric' });
  const month = date.toLocaleDateString('es-PE', { ...opts, month: 'long' });
  return `${dayName.charAt(0).toUpperCase()}${dayName.slice(1)} ${dayNumber} ${month}`;
}

function resolveReportDate(run?: string, now: Date = new Date()) {
  const is6amRun = String(run || '').toLowerCase() === '6am' || String(run || '').toLowerCase() === '6';
  const todayLima = now.toLocaleDateString('en-CA', {
    timeZone: WEATHER_ASPHALT_FORECAST.timezone,
  });
  const [year, month, day] = todayLima.split('-').map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day + (is6amRun ? 0 : 1), 12));
  return {
    is6amRun,
    date: targetDate,
    dateString: targetDate.toISOString().slice(0, 10),
  };
}

function buildWeatherUrl(forecastDays: number): string {
  const latitudeParam = LOCATIONS.map((location) => location.lat).join(',');
  const longitudeParam = LOCATIONS.map((location) => location.lon).join(',');
  return `${WEATHER_API_BASE}&forecast_days=${forecastDays}&latitude=${latitudeParam}&longitude=${longitudeParam}`;
}

async function fetchWithTimeout(url: string, fetcher: FetchLike): Promise<Response> {
  return fetcher(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'lila-app-cron/1.0' },
    signal: AbortSignal.timeout(WEATHER_ASPHALT_FORECAST.fetchTimeoutMs),
  });
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Trae el pronóstico reintentando los fallos transitorios (5xx/429 y errores de
 * red/timeout). Devuelve el cuerpo ya leído; lanza si se agotan los intentos.
 *
 * El backoff es lineal y corto (1.5s, 3s): el cron corre a las 08:00 y nadie
 * espera la respuesta, pero tampoco tiene sentido pelearse diez minutos con una
 * API caída — si a los ~5 s no contesta, es una caída de verdad y ahí sí toca
 * avisar.
 */
async function fetchForecastConReintentos(
  url: string,
  fetcher: FetchLike
): Promise<string> {
  const { maxAttempts, retryBaseDelayMs } = WEATHER_ASPHALT_FORECAST;
  let ultimoError = new Error('Open-Meteo: sin intentos');

  for (let intento = 1; intento <= maxAttempts; intento += 1) {
    let esTransitorio = true;
    try {
      const response = await fetchWithTimeout(url, fetcher);
      const responseText = await response.text();
      if (response.ok) return responseText;

      ultimoError = new Error(`Open-Meteo API error: ${response.status}`);
      // Un 4xx que no sea 429 es culpa nuestra: no mejora reintentando.
      esTransitorio = isRetriableWeatherStatus(response.status);
    } catch (error) {
      // Error de red, timeout o abort: siempre transitorio.
      ultimoError = error instanceof Error ? error : new Error(String(error));
    }

    if (!esTransitorio) break;
    if (intento < maxAttempts) await esperar(retryBaseDelayMs * intento);
  }

  throw ultimoError;
}

function parseOpenMeteoResults(payload: string): OpenMeteoResponse[] {
  const results = JSON.parse(payload) as OpenMeteoResponse[];
  if (!Array.isArray(results) || results.length !== LOCATIONS.length) {
    throw new Error(`Open-Meteo response length mismatch: ${results?.length ?? 'none'}`);
  }
  return results;
}

function buildWeatherMessage(
  constroadRiskyDays: ConstroadDay[],
  forecastsWithRisk: DistrictForecast[],
  reportDate: Date,
): string | null {
  if (constroadRiskyDays.length === 0 && forecastsWithRisk.length === 0) return null;

  let message = 'REPORTE DE CLIMA\n\n';
  if (constroadRiskyDays.length > 0) {
    message += `Constroad (Planta de asfalto - ${ASPHALT_PLANT_LOCATION}):\n\n`;
    for (const day of constroadRiskyDays) {
      message += `  ${formatDate(day.date)}:\n`;
      message += `    Prob. lluvia: ${day.prob}% - (${day.mm} mm)\n`;
      message += `    ${day.decision}\n\n`;
    }
  }

  if (forecastsWithRisk.length > 0) {
    message += `Distritos no aptos o con precaución para asfaltar (${formatDate(reportDate)}):\n\n`;
    const highRisk = forecastsWithRisk.filter((forecast) => forecast.level === 'high_risk');
    const moderateRisk = forecastsWithRisk.filter((forecast) => forecast.level === 'moderate_risk');
    if (highRisk.length > 0) {
      message += 'NO ASFALTAR - RIESGO ALTO:\n';
      for (const forecast of highRisk) {
        message += `  - ${forecast.name.toUpperCase()}:\n`;
        message += `    Prob. lluvia: ${forecast.prob}% - (${forecast.mm} mm)\n\n`;
      }
    }
    if (moderateRisk.length > 0) {
      message += 'RIESGO MODERADO:\n';
      for (const forecast of moderateRisk) {
        message += `  - ${forecast.name.toUpperCase()}:\n`;
        message += `    Prob. lluvia: ${forecast.prob}% - (${forecast.mm} mm)\n\n`;
      }
    }
  } else if (constroadRiskyDays.length > 0) {
    message += `Distritos no aptos para asfaltar (${formatDate(reportDate)}):\n`;
    message += '  Ninguno detectado con los umbrales configurados.\n\n';
  }

  return message;
}

function collectConstroadRisk(results: OpenMeteoResponse[], reportDateString: string): ConstroadDay[] {
  const constroadIndex = LOCATIONS.findIndex((location) => location.name === 'Constroad');
  const daily = results[constroadIndex]?.daily;
  const startIdx = daily?.time?.indexOf(reportDateString) ?? -1;
  if (!daily || startIdx < 0 || daily.time.length < startIdx + 3) return [];

  const days: ConstroadDay[] = [];
  for (let offset = 0; offset < 3; offset++) {
    const idx = startIdx + offset;
    const prob = daily.precipitation_probability_max[idx];
    const mm = daily.precipitation_sum[idx];
    const level = getCombinedRiskLevel(prob, mm);
    if (level === 'ok') continue;
    days.push({
      date: new Date(`${daily.time[idx]}T12:00:00Z`),
      prob,
      mm,
      decision: getConstroadDecision(level),
      level,
    });
  }
  return days;
}

function collectDistrictRisk(results: OpenMeteoResponse[], reportDateString: string): DistrictForecast[] {
  const constroadIndex = LOCATIONS.findIndex((location) => location.name === 'Constroad');
  const forecasts: DistrictForecast[] = [];

  for (let index = 0; index < LOCATIONS.length; index++) {
    if (index === constroadIndex) continue;
    const daily = results[index]?.daily;
    const dayIndex = daily?.time?.indexOf(reportDateString) ?? -1;
    if (!daily || dayIndex < 0) continue;

    const prob = daily.precipitation_probability_max[dayIndex];
    const mm = daily.precipitation_sum[dayIndex];
    const level = getCombinedRiskLevel(prob, mm);
    if (level === 'ok') continue;
    forecasts.push({ name: LOCATIONS[index].name, prob, mm, level });
  }

  return forecasts;
}

function buildFailureAlert(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return [
    'ALERTA: weather-asphalt-forecast fallo',
    'Servicio: lila-app',
    `Detalle: ${message}`,
    `Fecha: ${new Date().toISOString()}`,
  ].join('\n');
}

export async function generateWeatherAsphaltForecast(params: {
  run?: string;
  fetcher?: FetchLike;
  notifyError?: NotifyError;
} = {}): Promise<WeatherForecastResult> {
  const fetcher = params.fetcher || fetch;
  const notifyError =
    params.notifyError ||
    (async (alertParams) => {
      const { sendTelegramAlert } = await import('./telegram-alert.service.js');
      return sendTelegramAlert(alertParams);
    });
  const reportDate = resolveReportDate(params.run);
  const forecastDays = reportDate.is6amRun ? 3 : 4;

  try {
    const responseText = await fetchForecastConReintentos(
      buildWeatherUrl(forecastDays),
      fetcher
    );

    const results = parseOpenMeteoResults(responseText);
    const constroadRiskyDays = collectConstroadRisk(results, reportDate.dateString);
    const forecastsWithRisk = collectDistrictRisk(results, reportDate.dateString);
    const message = buildWeatherMessage(constroadRiskyDays, forecastsWithRisk, reportDate.date);

    return {
      status: 'ok',
      hasRainRisk: Boolean(message),
      message,
      mensaje: message,
    };
  } catch (error) {
    const telegramAlert = await notifyError({
      dedupeKey: 'weather-asphalt-forecast',
      message: buildFailureAlert(error),
    });
    return {
      status: 'degraded',
      hasRainRisk: false,
      message: null,
      mensaje: null,
      telegramAlert,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
