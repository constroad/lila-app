import { describe, it, expect, jest, beforeAll, beforeEach } from '@jest/globals';

// Cola en memoria (respaldo del JsonStore mockeado).
const storeState: { data: Record<string, unknown> } = { data: {} };

jest.unstable_mockModule('../utils/logger.js', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../config/environment.js', () => ({
  config: {
    whatsapp: { sessionDir: '/tmp/lila-test/sessions' },
    portal: { baseUrl: 'https://portal.test' },
    security: { jwtSecret: 'test-secret' },
  },
}));

jest.unstable_mockModule('../storage/json.store.js', () => {
  class FakeStore {
    constructor(_opts?: unknown) {}
    async get<T>(key: string): Promise<T | undefined> {
      return storeState.data[key] as T | undefined;
    }
    async set(key: string, value: unknown): Promise<void> {
      storeState.data[key] = value;
    }
  }
  return { __esModule: true, default: FakeStore };
});

jest.unstable_mockModule('../utils/portal-callback.js', () => ({
  __esModule: true,
  buildPortalCallbackHeaders: jest.fn(() => ({
    Authorization: 'Bearer x',
    'x-company-id': 'c1',
    'Content-Type': 'application/json',
  })),
}));

const postMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const isAxiosErrorMock = jest.fn((e: unknown) => Boolean((e as { isAxiosError?: boolean })?.isAxiosError));
jest.unstable_mockModule('axios', () => ({
  __esModule: true,
  default: { post: postMock, isAxiosError: isAxiosErrorMock },
}));

let scheduleDispatchAutoClose: typeof import('./dispatch-autoclose.service.js').scheduleDispatchAutoClose;
let flushDispatchAutoClose: typeof import('./dispatch-autoclose.service.js').flushDispatchAutoClose;

beforeAll(async () => {
  const mod = await import('./dispatch-autoclose.service.js');
  scheduleDispatchAutoClose = mod.scheduleDispatchAutoClose;
  flushDispatchAutoClose = mod.flushDispatchAutoClose;
});

beforeEach(() => {
  jest.clearAllMocks();
  storeState.data = {};
});

type QueueItem = {
  id: string;
  companyId: string;
  dispatchId: string;
  availableAt: string;
  createdAt: string;
  attempts: number;
};
const queue = () => (storeState.data.queue as QueueItem[]) ?? [];
const past = () => new Date(Date.now() - 1000).toISOString();
const axiosError = (status: number) => {
  const err = new Error(`http ${status}`) as Error & { isAxiosError: boolean; response: { status: number } };
  err.isAxiosError = true;
  err.response = { status };
  return err;
};

describe('scheduleDispatchAutoClose', () => {
  it('programa el cierre al ETA y deduplica por despacho', async () => {
    const first = await scheduleDispatchAutoClose({ companyId: 'c1', dispatchId: 'd1', etaSeconds: 1800 });
    const dup = await scheduleDispatchAutoClose({ companyId: 'c1', dispatchId: 'd1', etaSeconds: 1800 });

    expect(first).toBe(true);
    expect(dup).toBe(false);
    expect(queue()).toHaveLength(1);
    expect(queue()[0].dispatchId).toBe('d1');
    // availableAt ≈ ahora + 30 min (sin sumarle margen al ETA).
    const deltaMin = (new Date(queue()[0].availableAt).getTime() - Date.now()) / 60000;
    expect(deltaMin).toBeGreaterThan(25);
    expect(deltaMin).toBeLessThan(35);
  });

  it('sin datos mínimos no programa nada', async () => {
    const res = await scheduleDispatchAutoClose({ companyId: '', dispatchId: 'd1', etaSeconds: 1800 });
    expect(res).toBe(false);
    expect(queue()).toHaveLength(0);
  });
});

describe('flushDispatchAutoClose', () => {
  it('cierra la unidad vencida y descarta el job (autodestrucción)', async () => {
    storeState.data.queue = [
      { id: 'a', companyId: 'c1', dispatchId: 'd1', availableAt: past(), createdAt: past(), attempts: 0 },
    ];
    postMock.mockResolvedValueOnce({ status: 200 });

    const res = await flushDispatchAutoClose(new Date());

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][0]).toBe('https://portal.test/api/dispatch/d1/auto-close');
    expect(res.closed).toBe(1);
    expect(queue()).toHaveLength(0);
  });

  it('no dispara antes de vencer', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    storeState.data.queue = [
      { id: 'a', companyId: 'c1', dispatchId: 'd1', availableAt: future, createdAt: new Date().toISOString(), attempts: 0 },
    ];

    const res = await flushDispatchAutoClose(new Date());

    expect(postMock).not.toHaveBeenCalled();
    expect(res.remaining).toBe(1);
  });

  it('reintenta ante fallo transitorio (5xx): conserva el job y suma intento', async () => {
    storeState.data.queue = [
      { id: 'a', companyId: 'c1', dispatchId: 'd1', availableAt: past(), createdAt: past(), attempts: 0 },
    ];
    postMock.mockRejectedValueOnce(axiosError(503));

    const res = await flushDispatchAutoClose(new Date());

    expect(res.closed).toBe(0);
    expect(queue()).toHaveLength(1);
    expect(queue()[0].attempts).toBe(1);
  });

  it('reintenta ante error de red (sin response)', async () => {
    storeState.data.queue = [
      { id: 'a', companyId: 'c1', dispatchId: 'd1', availableAt: past(), createdAt: past(), attempts: 0 },
    ];
    const netErr = new Error('ECONNRESET') as Error & { isAxiosError: boolean };
    netErr.isAxiosError = true;
    postMock.mockRejectedValueOnce(netErr);

    const res = await flushDispatchAutoClose(new Date());

    expect(res.closed).toBe(0);
    expect(queue()[0].attempts).toBe(1);
  });

  it('descarta ante respuesta definitiva 4xx (no reintenta)', async () => {
    storeState.data.queue = [
      { id: 'a', companyId: 'c1', dispatchId: 'd1', availableAt: past(), createdAt: past(), attempts: 0 },
    ];
    postMock.mockRejectedValueOnce(axiosError(404));

    const res = await flushDispatchAutoClose(new Date());

    expect(queue()).toHaveLength(0);
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('descarta un job demasiado viejo sin llamar a Portal', async () => {
    const old = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    storeState.data.queue = [
      { id: 'a', companyId: 'c1', dispatchId: 'd1', availableAt: past(), createdAt: old, attempts: 0 },
    ];

    const res = await flushDispatchAutoClose(new Date());

    expect(postMock).not.toHaveBeenCalled();
    expect(res.dropped).toBe(1);
    expect(queue()).toHaveLength(0);
  });
});
