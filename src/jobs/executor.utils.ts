import { ICronJob } from '../models/cronjob.model.js';

export function shouldInitializeBackgroundJobs(
  nodeEnv?: string,
  enabledOverride?: boolean
): boolean {
  if (typeof enabledOverride === 'boolean') {
    return enabledOverride;
  }
  return String(nodeEnv || '').trim().toLowerCase() === 'production';
}

export function materializeRetryJob(job: ICronJob): ICronJob {
  const candidate = job as ICronJob & {
    toObject?: (options?: Record<string, unknown>) => Record<string, unknown>;
  };

  if (typeof candidate.toObject === 'function') {
    return candidate.toObject({
      depopulate: true,
      flattenMaps: true,
      versionKey: false,
    }) as ICronJob;
  }

  return JSON.parse(JSON.stringify(job)) as ICronJob;
}

/** Quita un `www.` inicial: mismo sitio, dos hosts de string distinto. */
const stripWww = (host: string): string => host.replace(/^www\./i, '');

/**
 * ¿La URL apunta a un endpoint `/api/cron/*` de Portal? Se usa para inyectar el
 * header `x-cron-secret` SOLO hacia Portal (nunca a APIs de terceros: evita
 * filtrar el secreto compartido). Con `portalBaseUrl`, además exige el mismo host.
 *
 * `www.` se ignora al comparar (19/08/2026): el host del cron sale de qué
 * dominio usó el admin al guardar (`req.headers.host` en Portal), y
 * `PORTAL_BASE_URL` acá es un único valor fijo — antes de esto, cualquier cron
 * guardado desde `www.constroad.com` fallaba esta comparación y viajaba SIN
 * el secreto. El síntoma no era "no llega": el job de todos modos reportaba
 * éxito de scheduling, y recién Portal lo rechazaba con 401 más adelante — 8
 * de 11 alertas activas de 3 empresas estaban así, sin que nadie lo notara.
 */
export function isPortalCronUrl(targetUrl: string, portalBaseUrl?: string): boolean {
  try {
    const target = new URL(targetUrl);
    if (!target.pathname.includes('/api/cron/')) return false;
    const portalBase = portalBaseUrl?.trim();
    if (!portalBase) return true;
    return stripWww(target.host) === stripWww(new URL(portalBase).host);
  } catch {
    return false;
  }
}

export function normalizeExecutorApiUrl(rawUrl: string, portalBaseUrl?: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const portalBase = portalBaseUrl?.trim();
    if (!portalBase) {
      return parsed.toString();
    }

    const portalUrl = new URL(portalBase);
    const shouldUpgradeToPortalProtocol =
      parsed.protocol === 'http:' &&
      portalUrl.protocol === 'https:' &&
      parsed.hostname === portalUrl.hostname;

    if (shouldUpgradeToPortalProtocol) {
      parsed.protocol = portalUrl.protocol;
      parsed.port = portalUrl.port;
      return parsed.toString();
    }

    const hostname = parsed.hostname.toLowerCase();
    const isReservedLocalHost =
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.test');
    const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
    const isPrivateIpv4 =
      isIpv4 &&
      (/^10\./.test(hostname) ||
        /^127\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname));
    const looksPublicWebHost =
      parsed.protocol === 'http:' &&
      hostname.includes('.') &&
      !isReservedLocalHost &&
      !isPrivateIpv4;

    if (looksPublicWebHost) {
      parsed.protocol = 'https:';
      if (parsed.port === '80') {
        parsed.port = '';
      }
    }

    return parsed.toString();
  } catch {
    return trimmed;
  }
}
