import { Schema } from 'mongoose';

/**
 * Rastro GPS de una unidad de flota — MISMA colección que escribe y lee el Portal
 * (`gpspositions` en `constroad_db`). Acá vive porque el ingest del hardware entra
 * por lila: recibir un punto por minuto por unidad en una función serverless es
 * exactamente el gasto que la app evita.
 *
 * El dueño del ESQUEMA y de los ÍNDICES es el Portal (`src/models/gps-position.ts`
 * + `scripts/sync-indexes.ts`). Por eso este schema va con **`autoIndex: false`**:
 * si lila intentara crear los suyos, dos definiciones distintas del TTL o del
 * único pelearían por la misma colección. Acá se declara lo mínimo para escribir
 * con validación de tipos.
 */

export const GPS_POSITION_SOURCES = ['driver-app', 'provider', 'manual'] as const;
export type GpsPositionSource = (typeof GPS_POSITION_SOURCES)[number];

/** Retención del rastro: debe coincidir con el TTL que administra el Portal. */
export const GPS_POSITION_TTL_DAYS = 90;

export interface IGpsPosition {
  companyId: string;
  plate: string;
  tripId?: string;
  driverId?: string;
  lat: number;
  lng: number;
  speedKph?: number;
  headingDeg?: number;
  accuracyM?: number;
  source: GpsPositionSource;
  deviceId?: string;
  at: Date;
  createdAt?: Date;
}

export const GpsPositionSchema = new Schema<IGpsPosition>(
  {
    companyId: { type: String, required: true, immutable: true },
    plate: { type: String, required: true },
    tripId: { type: String, required: false },
    driverId: { type: String, required: false },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    speedKph: { type: Number, required: false },
    headingDeg: { type: Number, required: false },
    accuracyM: { type: Number, required: false },
    source: { type: String, enum: GPS_POSITION_SOURCES, required: true, default: 'provider' },
    deviceId: { type: String, required: false },
    at: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, autoIndex: false, collection: 'gpspositions' }
);
