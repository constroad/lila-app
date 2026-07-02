import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGetSharedModels = jest.fn();
const mockCronSchedule = jest.fn();

jest.unstable_mockModule('node-cron', () => ({
  __esModule: true,
  default: { schedule: mockCronSchedule },
}));

jest.unstable_mockModule('../database/models.js', () => ({
  getSharedModels: mockGetSharedModels,
}));

jest.unstable_mockModule('../config/environment.js', () => ({
  __esModule: true,
  default: { jobs: { enabled: false } },
}));

jest.unstable_mockModule('./executor.service.js', () => ({
  JobExecutor: jest.fn().mockImplementation(() => ({ execute: jest.fn() })),
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const { default: JobSchedulerV2 } = await import('./scheduler.service.v2.js');

describe('JobSchedulerV2 automatic scheduling guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not read or schedule active jobs when automatic scheduling is disabled', async () => {
    const scheduler = new JobSchedulerV2(false);

    await scheduler.initialize();

    expect(mockGetSharedModels).not.toHaveBeenCalled();
    expect(mockCronSchedule).not.toHaveBeenCalled();
  });
});
