import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  isPortalCronUrl,
  materializeRetryJob,
  normalizeExecutorApiUrl,
  shouldInitializeBackgroundJobs,
} from './executor.utils.js';

const axiosRequestMock = jest.fn();

jest.unstable_mockModule('axios', () => ({
  __esModule: true,
  default: { request: axiosRequestMock },
}));

jest.unstable_mockModule('../config/environment.js', () => ({
  __esModule: true,
  config: {
    logging: { dir: './logs' },
    portal: { baseUrl: 'https://constroad.com' },
  },
  default: {
    logging: { dir: './logs' },
    portal: { baseUrl: 'https://constroad.com' },
  },
}));

jest.unstable_mockModule('../database/models.js', () => ({
  __esModule: true,
  getSharedModels: jest.fn(),
  getUsageMetricModel: jest.fn(),
}));

jest.unstable_mockModule('../services/whatsapp-direct.service.js', () => ({
  __esModule: true,
  WhatsAppDirectService: { sendMessage: jest.fn() },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { JobExecutor } = await import('./executor.service.js');

describe('JobExecutor helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('materializes retry jobs from mongoose-like documents', () => {
    const toObject = jest.fn(() => ({
      _id: '69a8a1f9f8e7b323ddb54e79',
      name: 'Clima 6am',
      companyId: 'constroad',
      retryPolicy: { currentRetries: 1 },
    }));

    const job = { toObject } as any;

    expect(materializeRetryJob(job)).toEqual({
      _id: '69a8a1f9f8e7b323ddb54e79',
      name: 'Clima 6am',
      companyId: 'constroad',
      retryPolicy: { currentRetries: 1 },
    });
    expect(toObject).toHaveBeenCalledWith({
      depopulate: true,
      flattenMaps: true,
      versionKey: false,
    });
  });

  it('upgrades portal URLs to the configured https origin', () => {
    expect(
      normalizeExecutorApiUrl(
        'http://constroad.com/api/cron/weather-asphalt-forecast?run=6am',
        'https://constroad.com'
      )
    ).toBe('https://constroad.com/api/cron/weather-asphalt-forecast?run=6am');
  });

  it('does not rewrite unrelated hosts', () => {
    expect(
      normalizeExecutorApiUrl(
        'http://internal-service.local/api/jobs/weather',
        'https://constroad.com'
      )
    ).toBe('http://internal-service.local/api/jobs/weather');
  });

  it('upgrades public http hosts to https even when portal base url is local', () => {
    expect(
      normalizeExecutorApiUrl(
        'http://constroad.com/api/cron/weather-asphalt-forecast',
        'http://localhost:3000'
      )
    ).toBe('https://constroad.com/api/cron/weather-asphalt-forecast');
  });

  it('keeps automatic background jobs disabled in development', () => {
    expect(shouldInitializeBackgroundJobs('development')).toBe(false);
  });

  it('keeps background jobs enabled in production', () => {
    expect(shouldInitializeBackgroundJobs('production')).toBe(true);
  });

  it('skips background jobs in tests', () => {
    expect(shouldInitializeBackgroundJobs('test')).toBe(false);
  });

  it('allows an explicit local override for deliberate cron testing', () => {
    expect(shouldInitializeBackgroundJobs('development', true)).toBe(true);
  });

  it('allows production cronjobs to be disabled explicitly', () => {
    expect(shouldInitializeBackgroundJobs('production', false)).toBe(false);
  });

  it('injects company and chat headers from the persisted cron job', async () => {
    axiosRequestMock.mockResolvedValue({ status: 200, data: { ok: true } } as never);

    const executor = new JobExecutor() as any;

    await executor.executeApi({
      companyId: 'globofast',
      timeout: 15000,
      apiConfig: {
        url: 'https://constroad.com/api/cron/kardex-check',
        method: 'POST',
        headers: {},
        body: { custom: true },
      },
      message: { chatId: '120363402457346500@g.us' },
    });

    expect(axiosRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://constroad.com/api/cron/kardex-check',
        method: 'POST',
        timeout: 15000,
        headers: expect.objectContaining({
          'x-company-id': 'globofast',
          'x-cronjob-chat-id': '120363402457346500@g.us',
          'x-cronjob-return-message': '1',
        }),
        data: { custom: true },
      })
    );
  });
});

describe('isPortalCronUrl', () => {
  const PORTAL = 'https://constroad.com';

  it('acepta rutas /api/cron del host de Portal', () => {
    expect(isPortalCronUrl('https://constroad.com/api/cron/kardex-check', PORTAL)).toBe(true);
    expect(
      isPortalCronUrl('https://constroad.com/api/cron/weather-asphalt-forecast?run=6am', PORTAL)
    ).toBe(true);
  });

  it('rechaza rutas que no son /api/cron (no filtra el secreto)', () => {
    expect(isPortalCronUrl('https://constroad.com/api/order', PORTAL)).toBe(false);
    expect(isPortalCronUrl('https://api.weather.com/api/cron/x', PORTAL)).toBe(false);
    expect(isPortalCronUrl('not-a-url', PORTAL)).toBe(false);
  });

  it('sin portalBaseUrl confía solo en el path /api/cron', () => {
    expect(isPortalCronUrl('https://constroad.com/api/cron/x')).toBe(true);
    expect(isPortalCronUrl('https://third-party.com/api/jobs/x')).toBe(false);
  });

  /**
   * Bug real (19/08/2026): un cron guardado desde `www.constroad.com` fallaba
   * esta comparación (host !== host exacto) y viajaba SIN `x-cron-secret` —
   * Portal lo rechazaba 401 más adelante, en silencio (el scheduling en sí
   * "salía bien"). 8 de 11 alertas activas de 3 empresas estaban así.
   */
  it('ignora un www. de cualquiera de los dos lados — mismo sitio', () => {
    expect(isPortalCronUrl('https://www.constroad.com/api/cron/kardex-check', PORTAL)).toBe(true);
    expect(
      isPortalCronUrl('https://constroad.com/api/cron/fluids-report', 'https://www.constroad.com')
    ).toBe(true);
  });
});
