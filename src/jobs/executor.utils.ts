import { ICronJob } from '../models/cronjob.model.js';

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
