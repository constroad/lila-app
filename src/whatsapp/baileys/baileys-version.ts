/**
 * Versión de protocolo WA cacheada por proceso.
 *
 * `fetchLatestBaileysVersion` sale a internet en CADA reconexión: durante un corte
 * (justo cuando más se reconecta) ese fetch puede fallar o tardar, quemando intentos
 * del backoff por una dependencia que cambia cada varias semanas. Cache con TTL +
 * stale-on-error: si el fetch falla y hay una versión conocida, se reusa.
 */
import { fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import logger from '../../utils/logger.js';

export type BaileysVersionInfo = {
  version: [number, number, number];
  isLatest: boolean;
};

const VERSION_TTL_MS = 6 * 60 * 60 * 1000;

let cached: (BaileysVersionInfo & { fetchedAt: number }) | null = null;

export async function getBaileysVersion(): Promise<BaileysVersionInfo> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < VERSION_TTL_MS) {
    return { version: cached.version, isLatest: cached.isLatest };
  }

  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    cached = { version: version as [number, number, number], isLatest, fetchedAt: now };
    return { version: cached.version, isLatest };
  } catch (error) {
    if (cached) {
      logger.warn(
        `fetchLatestBaileysVersion falló; usando versión cacheada ${cached.version.join('.')}: ${String(error)}`
      );
      return { version: cached.version, isLatest: cached.isLatest };
    }
    throw error;
  }
}

/** Solo para tests: limpia el cache del proceso. */
export function resetBaileysVersionCache(): void {
  cached = null;
}
