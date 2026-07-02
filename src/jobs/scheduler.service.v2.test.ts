const mockGetSharedModels = jest.fn();
const mockCronSchedule = jest.fn();

jest.mock('node-cron', () => ({
  __esModule: true,
  default: {
    schedule: mockCronSchedule,
  },
}));

jest.mock('../database/models.js', () => ({
  getSharedModels: mockGetSharedModels,
}));

jest.mock('../config/environment.js', () => ({
  __esModule: true,
  default: {
    jobs: { enabled: false },
  },
}));

jest.mock('./executor.service.js', () => ({
  JobExecutor: jest.fn().mockImplementation(() => ({
    execute: jest.fn(),
  })),
}));

jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import JobSchedulerV2 from './scheduler.service.v2.js';

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
