import { GPS_POSITION_TTL_DAYS, type GpsPositionSource } from '../models/gps-position.model.js';

/**
 * Normalizador de puntos GPS de proveedores — PURO.
 *
 * ⚠️ **Espejo deliberado de `Portal/src/server/fleet/gpsNormalizer.ts`** (Flota F4
 * §3.4). El Portal es la fuente canónica de las reglas; acá existe una copia
 * porque el ingest HTTP vive en lila (proceso vivo) y los dos repos no comparten
 * paquete. Si una regla cambia, cambia en LOS DOS — los tests de este archivo
 * fijan las mismas invariantes para que la divergencia salte en rojo.
 *
 * Cada proveedor peruano manda su propio JSON (`lat`/`latitude`, `ts` en epoch,
 * `placa`…). Lo inservible se descarta EN LA FRONTERA con el motivo contado: un
 * punto en (0,0) o con fecha del año que viene ensucia el rastro y el cruce de km
 * para siempre.
 */

/** Tope por request: un proveedor con backlog no puede pedir un lote infinito. */
export const MAX_INGEST_BATCH = 500;
/** Margen de reloj adelantado tolerado en el equipo. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type NormalizedGpsPoint = {
  plate: string;
  lat: number;
  lng: number;
  at: Date;
  speedKph?: number;
  headingDeg?: number;
  accuracyM?: number;
  deviceId?: string;
  source: GpsPositionSource;
};

export const GPS_REJECT_REASONS = [
  'sin-placa',
  'coordenada-invalida',
  'fecha-invalida',
  'fecha-futura',
  'fecha-expirada',
  'duplicado',
  'sobre-el-tope',
] as const;
export type GpsRejectReason = (typeof GPS_REJECT_REASONS)[number];

export type GpsNormalizeResult = {
  points: NormalizedGpsPoint[];
  /** Motivo → cuántos se cayeron por él (para responder y para logs). */
  rejected: Record<string, number>;
};

type RawPoint = Record<string, unknown>;

const ALIASES = {
  lat: ['lat', 'latitude', 'latitud', 'y'],
  lng: ['lng', 'lon', 'long', 'longitude', 'longitud', 'x'],
  at: ['at', 'timestamp', 'ts', 'time', 'datetime', 'fecha', 'gpsTime'],
  plate: ['plate', 'placa', 'unit', 'unidad', 'vehicle', 'vehiculo', 'license'],
  speed: ['speedKph', 'speed', 'velocidad', 'kph'],
  heading: ['headingDeg', 'heading', 'course', 'rumbo', 'direccion'],
  accuracy: ['accuracyM', 'accuracy', 'hdop', 'precision'],
  device: ['deviceId', 'imei', 'device', 'equipo', 'serial'],
};

const pick = (raw: RawPoint, keys: string[]): unknown => {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') return raw[key];
  }
  return undefined;
};

const toNumber = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Instante de la medición. Acepta ISO y epoch: los equipos mandan segundos o
 * milisegundos según el firmware, y confundirlos pone el punto en 1970 o en el
 * año 55000 (por eso el corte por magnitud, no por adivinanza).
 */
const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const numeric = toNumber(value);
  if (numeric !== undefined && String(value).trim().match(/^-?\d+(\.\d+)?$/)) {
    const millis = numeric > 1e12 ? numeric : numeric * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isValidCoordinate = (lat?: number, lng?: number): boolean => {
  if (lat === undefined || lng === undefined) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  // (0,0) es el "null island": lo manda un equipo sin fix, no una unidad.
  return !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001);
};

/** Extrae el arreglo de puntos del envoltorio que use el proveedor. */
const extractRawPoints = (payload: unknown): RawPoint[] => {
  if (Array.isArray(payload)) return payload as RawPoint[];
  if (!payload || typeof payload !== 'object') return [];
  const container = payload as Record<string, unknown>;
  for (const key of ['positions', 'points', 'data', 'records', 'items', 'gps']) {
    if (Array.isArray(container[key])) return container[key] as RawPoint[];
  }
  // Un solo punto suelto también es un lote válido de uno.
  return [container as RawPoint];
};

/**
 * Normaliza el lote. `defaultPlate` cubre a los proveedores que mandan la placa
 * en la URL o en el header en vez de en cada punto.
 */
export function normalizeGpsBatch(
  payload: unknown,
  options: {
    defaultPlate?: string;
    source?: GpsPositionSource;
    now?: Date;
  } = {}
): GpsNormalizeResult {
  const now = options.now ?? new Date();
  const source = options.source ?? 'provider';
  const rejected: Record<string, number> = {};
  const reject = (reason: GpsRejectReason) => {
    rejected[reason] = (rejected[reason] ?? 0) + 1;
  };

  const raw = extractRawPoints(payload);
  const overflow = Math.max(0, raw.length - MAX_INGEST_BATCH);
  if (overflow > 0) rejected['sobre-el-tope'] = overflow;

  const seen: Record<string, true> = {};
  const points: NormalizedGpsPoint[] = [];
  const minAt = now.getTime() - GPS_POSITION_TTL_DAYS * 24 * 60 * 60 * 1000;

  for (const item of raw.slice(0, MAX_INGEST_BATCH)) {
    if (!item || typeof item !== 'object') {
      reject('coordenada-invalida');
      continue;
    }
    const plate = String(pick(item, ALIASES.plate) ?? options.defaultPlate ?? '')
      .trim()
      .toUpperCase();
    if (!plate) {
      reject('sin-placa');
      continue;
    }
    const lat = toNumber(pick(item, ALIASES.lat));
    const lng = toNumber(pick(item, ALIASES.lng));
    if (!isValidCoordinate(lat, lng)) {
      reject('coordenada-invalida');
      continue;
    }
    const at = toDate(pick(item, ALIASES.at));
    if (!at) {
      reject('fecha-invalida');
      continue;
    }
    if (at.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
      reject('fecha-futura');
      continue;
    }
    // Más viejo que el TTL: el TTL lo borraría igual, no vale escribirlo.
    if (at.getTime() < minAt) {
      reject('fecha-expirada');
      continue;
    }
    const key = `${plate}|${at.toISOString()}`;
    if (seen[key]) {
      reject('duplicado');
      continue;
    }
    seen[key] = true;

    points.push({
      plate,
      lat: lat as number,
      lng: lng as number,
      at,
      speedKph: toNumber(pick(item, ALIASES.speed)),
      headingDeg: toNumber(pick(item, ALIASES.heading)),
      accuracyM: toNumber(pick(item, ALIASES.accuracy)),
      deviceId: pick(item, ALIASES.device) ? String(pick(item, ALIASES.device)) : undefined,
      source,
    });
  }

  return { points: points.sort((a, b) => a.at.getTime() - b.at.getTime()), rejected };
}
