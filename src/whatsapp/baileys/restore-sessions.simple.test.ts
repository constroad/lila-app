import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Las sesiones a restaurar salen de Mongo (whatsapp_auth), NO del filesystem: en prod
// las creds viven en la DB compartida. Por eso mockeamos `listMongoAuthSessions`.
const startSessionMock = jest.fn(async (..._args: unknown[]) => undefined);
const listMongoAuthSessions = jest.fn(async () => [] as string[]);

jest.unstable_mockModule('./sessions.simple.js', () => ({
  __esModule: true,
  startSession: startSessionMock,
}));

jest.unstable_mockModule('./mongo-auth-state.js', () => ({
  __esModule: true,
  listMongoAuthSessions,
}));

const loadSubject = async () => {
  const mod = await import('./restore-sessions.simple.js');
  return mod.restoreAllSessions;
};

describe('restoreAllSessions', () => {
  beforeEach(() => {
    jest.resetModules();
    startSessionMock.mockClear();
    startSessionMock.mockImplementation(async () => undefined);
    listMongoAuthSessions.mockReset();
    listMongoAuthSessions.mockResolvedValue([]);
  });

  it('does nothing when Mongo has no sessions', async () => {
    listMongoAuthSessions.mockResolvedValue([]);
    const restoreAllSessions = await loadSubject();
    await restoreAllSessions();
    expect(startSessionMock).not.toHaveBeenCalled();
  });

  it('calls startSession only for phone-shaped session ids', async () => {
    listMongoAuthSessions.mockResolvedValue([
      '51949376824',
      '51902049935',
      'backups',
      'README',
      '12345678', // muy corto (<9) → ignorado
      '12345678901234567', // muy largo (>15) → ignorado
    ]);

    const restoreAllSessions = await loadSubject();
    await restoreAllSessions();

    const calls = startSessionMock.mock.calls.map((c) => c[0] as string).sort();
    expect(calls).toEqual(['51902049935', '51949376824']);
  });

  it('continues restoring siblings even if one throws', async () => {
    listMongoAuthSessions.mockResolvedValue(['51111111111', '52222222222']);
    startSessionMock.mockImplementationOnce(async () => {
      throw new Error('boom');
    });

    const restoreAllSessions = await loadSubject();
    await expect(restoreAllSessions()).resolves.toBeUndefined();
    expect(startSessionMock).toHaveBeenCalledTimes(2);
  });
});
