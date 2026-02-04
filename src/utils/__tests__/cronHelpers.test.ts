import { calculateNextRun } from '../cronHelpers';

describe('cronHelpers', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('calcula el siguiente run en UTC', () => {
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const next = calculateNextRun('*/15 * * * *', 'UTC');
    expect(next.toISOString()).toBe('2026-01-01T00:15:00.000Z');
  });

  it('calcula el siguiente run diario', () => {
    jest.setSystemTime(new Date('2026-01-01T08:30:00.000Z'));
    const next = calculateNextRun('0 9 * * *', 'UTC');
    expect(next.toISOString()).toBe('2026-01-01T09:00:00.000Z');
  });
});
