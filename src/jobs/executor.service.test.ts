import { materializeRetryJob, normalizeExecutorApiUrl } from './executor.utils.js';

describe('JobExecutor helpers', () => {
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
});
