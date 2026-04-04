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

    if (!shouldUpgradeToPortalProtocol) {
      return parsed.toString();
    }

    parsed.protocol = portalUrl.protocol;
    parsed.port = portalUrl.port;
    return parsed.toString();
  } catch {
    return trimmed;
  }
}
