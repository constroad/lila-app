import axios from 'axios';
import { JobExecutor } from './executor.service.js';
import { materializeRetryJob, normalizeExecutorApiUrl } from './executor.utils.js';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    request: jest.fn(),
  },
}));

jest.mock('../config/environment.js', () => ({
  __esModule: true,
  config: {
    logging: {
      dir: './logs',
    },
    portal: {
      baseUrl: 'https://constroad.com',
    },
  },
  default: {
    logging: {
      dir: './logs',
    },
    portal: {
      baseUrl: 'https://constroad.com',
    },
  },
}));

jest.mock('../database/models.js', () => ({
  __esModule: true,
  getSharedModels: jest.fn(),
}));

jest.mock('../services/whatsapp-direct.service.js', () => ({
  __esModule: true,
  WhatsAppDirectService: {
    sendMessage: jest.fn(),
  },
}));

jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('JobExecutor helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('materializes retry jobs from mongoose-like documents', () => {
    const toObject = jest.fn(() => ({
      _id: '69a8a1f9f8e7b323ddb54e79',
      name: 'Clima 6am',
      companyId: 'constroad',
      retryPolicy: {
        currentRetries: 1,
      },
    }));

    const job = {
      toObject,
    } as any;

    expect(materializeRetryJob(job)).toEqual({
      _id: '69a8a1f9f8e7b323ddb54e79',
      name: 'Clima 6am',
      companyId: 'constroad',
      retryPolicy: {
        currentRetries: 1,
      },
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

  it('injects company and chat headers from the persisted cron job', async () => {
    const requestMock = jest.mocked(axios.request);
    requestMock.mockResolvedValue({
      status: 200,
      data: {
        ok: true,
      },
    } as never);

    const executor = new JobExecutor() as any;

    await executor.executeApi({
      companyId: 'globofast',
      timeout: 15000,
      apiConfig: {
        url: 'https://constroad.com/api/cron/kardex-check',
        method: 'POST',
        headers: {},
        body: {
          custom: true,
        },
      },
      message: {
        chatId: '120363402457346500@g.us',
      },
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://constroad.com/api/cron/kardex-check',
        method: 'POST',
        timeout: 15000,
        headers: expect.objectContaining({
          'x-company-id': 'globofast',
          'x-cronjob-chat-id': '120363402457346500@g.us',
          'x-cronjob-return-message': '1',
        }),
        data: {
          custom: true,
        },
      })
    );
  });
});
