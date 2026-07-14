import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const fetchLatestBaileysVersion = jest.fn(async () => ({
  version: [2, 3000, 99] as [number, number, number],
  isLatest: true,
}));

jest.unstable_mockModule('@whiskeysockets/baileys', () => ({
  __esModule: true,
  fetchLatestBaileysVersion,
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

type Subject = typeof import('./baileys-version.js');
let subject: Subject;

beforeEach(async () => {
  jest.resetModules();
  fetchLatestBaileysVersion.mockClear();
  fetchLatestBaileysVersion.mockResolvedValue({ version: [2, 3000, 99], isLatest: true });
  subject = await import('./baileys-version.js');
  subject.resetBaileysVersionCache();
});

describe('getBaileysVersion', () => {
  it('fetches once and serves subsequent calls from cache (TTL)', async () => {
    const first = await subject.getBaileysVersion();
    const second = await subject.getBaileysVersion();

    expect(first.version).toEqual([2, 3000, 99]);
    expect(second.version).toEqual([2, 3000, 99]);
    expect(fetchLatestBaileysVersion).toHaveBeenCalledTimes(1);
  });

  it('serves the STALE cached version when the TTL expired and the fetch fails', async () => {
    const baseNow = Date.now();
    await subject.getBaileysVersion(); // llena el cache
    // Avanzar más allá del TTL (6h) para forzar el re-fetch, que fallará:
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(baseNow + 7 * 60 * 60 * 1000);
    fetchLatestBaileysVersion.mockRejectedValue(new Error('ENOTFOUND'));

    const result = await subject.getBaileysVersion();

    expect(fetchLatestBaileysVersion).toHaveBeenCalledTimes(2);
    expect(result.version).toEqual([2, 3000, 99]); // versión stale, mejor que fallar
    nowSpy.mockRestore();
  });

  it('propagates the error when there is no cached version at all (cold start sin red)', async () => {
    fetchLatestBaileysVersion.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(subject.getBaileysVersion()).rejects.toThrow('ENOTFOUND');
  });
});
