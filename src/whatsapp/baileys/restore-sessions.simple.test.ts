import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Las sesiones a restaurar salen de Mongo (whatsapp_auth), NO del filesystem: en prod
// las creds viven en la DB compartida. Por eso mockeamos `listMongoAuthSessions`.
const startSessionMock = jest.fn(async (..._args: unknown[]) => undefined);
const listMongoAuthSessions = jest.fn(async () => [] as string[]);
const findCompanies = jest.fn();

// Config controlado por el test (NO heredar el .env real: si el dev tiene
// WHATSAPP_PROXY_TARGET_URL seteado, el filtro dev+proxy vaciaría el restore).
const mockConfig = {
  nodeEnv: 'test',
  whatsapp: {
    proxyTargetUrl: '',
    localSessions: [] as string[],
  },
};

jest.unstable_mockModule('./sessions.simple.js', () => ({
  __esModule: true,
  startSession: startSessionMock,
}));

jest.unstable_mockModule('./mongo-auth-state.js', () => ({
  __esModule: true,
  listMongoAuthSessions,
}));

jest.unstable_mockModule('../../database/models.js', () => ({
  __esModule: true,
  getCompanyModel: jest.fn(async () => ({
    find: findCompanies,
  })),
}));

jest.unstable_mockModule('../../config/environment.js', () => ({
  __esModule: true,
  config: mockConfig,
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
    findCompanies.mockReset();
    findCompanies.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });
    mockConfig.nodeEnv = 'test';
    mockConfig.whatsapp.proxyTargetUrl = '';
    mockConfig.whatsapp.localSessions = [];
  });

  it('sender COMPARTIDO por 2 companies → UNA sola sesión, un solo login', async () => {
    // Caso real: constroad y test comparten el mismo número. Las creds en Mongo
    // son únicas por número; el Set de senders configurados colapsa el duplicado.
    listMongoAuthSessions.mockResolvedValue(['51949376824']);
    findCompanies.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { whatsappConfig: { sender: '51949376824' } },
        { whatsappConfig: { sender: '51949376824' } },
      ]),
    });
    const restoreAllSessions = await loadSubject();

    await restoreAllSessions();

    expect(startSessionMock).toHaveBeenCalledTimes(1);
    expect(startSessionMock).toHaveBeenCalledWith('51949376824', expect.any(Function));
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
    findCompanies.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { whatsappConfig: { sender: '51949376824' } },
      ]),
    });

    const restoreAllSessions = await loadSubject();
    await restoreAllSessions();

    const calls = startSessionMock.mock.calls.map((c) => c[0] as string).sort();
    expect(calls).toEqual(['51949376824']);
  });

  it('continues restoring siblings even if one throws', async () => {
    listMongoAuthSessions.mockResolvedValue(['51111111111', '52222222222']);
    findCompanies.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { whatsappConfig: { sender: '51111111111' } },
        { whatsappConfig: { sender: '52222222222' } },
      ]),
    });
    startSessionMock.mockImplementationOnce(async () => {
      throw new Error('boom');
    });

    const restoreAllSessions = await loadSubject();
    await expect(restoreAllSessions()).resolves.toBeUndefined();
    expect(startSessionMock).toHaveBeenCalledTimes(2);
  });

  it('does not restore credentials without an active company owner', async () => {
    listMongoAuthSessions.mockResolvedValue(['51902049935']);

    const restoreAllSessions = await loadSubject();
    await restoreAllSessions();

    expect(startSessionMock).not.toHaveBeenCalled();
  });

  // Reparto WHATSAPP_LOCAL_SESSIONS (ver local-sessions.ts): prod excluye las
  // local-only (su socket vive en dev); dev con send-proxy restaura SOLO las
  // local-only; `localOnly: true` fuerza ese subconjunto (boot dev sin lease).
  describe('reparto local-only (WHATSAPP_LOCAL_SESSIONS)', () => {
    beforeEach(() => {
      listMongoAuthSessions.mockResolvedValue(['51949376824', '51902049935']);
      findCompanies.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { whatsappConfig: { sender: '51949376824' } },
          { whatsappConfig: { sender: '51902049935' } },
        ]),
      });
      mockConfig.whatsapp.localSessions = ['51902049935'];
    });

    it('prod NO restaura sesiones local-only', async () => {
      mockConfig.nodeEnv = 'production';

      const restoreAllSessions = await loadSubject();
      await restoreAllSessions();

      const calls = startSessionMock.mock.calls.map((c) => c[0] as string);
      expect(calls).toEqual(['51949376824']);
    });

    it('dev con send-proxy restaura SOLO las local-only', async () => {
      mockConfig.whatsapp.proxyTargetUrl = 'https://prod.example/api';

      const restoreAllSessions = await loadSubject();
      await restoreAllSessions();

      const calls = startSessionMock.mock.calls.map((c) => c[0] as string);
      expect(calls).toEqual(['51902049935']);
    });

    it('localOnly:true restaura solo las local-only aunque no haya proxy', async () => {
      const restoreAllSessions = await loadSubject();
      await restoreAllSessions({ localOnly: true });

      const calls = startSessionMock.mock.calls.map((c) => c[0] as string);
      expect(calls).toEqual(['51902049935']);
    });

    it('dev sin proxy ni localOnly restaura todas', async () => {
      const restoreAllSessions = await loadSubject();
      await restoreAllSessions();

      const calls = startSessionMock.mock.calls.map((c) => c[0] as string).sort();
      expect(calls).toEqual(['51902049935', '51949376824']);
    });
  });
});
