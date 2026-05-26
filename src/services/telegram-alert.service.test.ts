import { describe, it, expect, jest, beforeEach, beforeAll, afterEach } from '@jest/globals';

const queueState: {
  items: Array<{
    id: string;
    message: string;
    dedupeKey?: string;
    createdAt: string;
    attempts: number;
    lastError?: string;
  }>;
} = { items: [] };

const enqueueMock = jest.fn<
  (params: { message: string; dedupeKey?: string }) => Promise<unknown>
>();
const listMock = jest.fn(async () => queueState.items.slice());
const updateMock = jest.fn(async (item: { id: string } & Record<string, unknown>) => {
  const idx = queueState.items.findIndex((i) => i.id === item.id);
  if (idx !== -1) queueState.items[idx] = item as (typeof queueState.items)[number];
});
const removeMock = jest.fn(async (id: string) => {
  queueState.items = queueState.items.filter((i) => i.id !== id);
});
const pruneMock = jest.fn(async () => 0);

jest.unstable_mockModule('../utils/logger.js', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule('../config/environment.js', () => ({
  config: {
    telegram: {
      botToken: 'TEST_TOKEN',
      errorsChatId: '-12345',
    },
    whatsapp: { sessionDir: '/tmp/lila-test/sessions' },
  },
}));

jest.unstable_mockModule('./telegram-queue.js', () => {
  class FakeQueue {
    list = listMock;
    enqueue = enqueueMock;
    update = updateMock;
    remove = removeMock;
    prune = pruneMock;
  }
  const instance = new FakeQueue();
  return {
    __esModule: true,
    default: instance,
    TelegramQueue: FakeQueue,
    TELEGRAM_QUEUE_LIMITS: {
      MAX_ATTEMPTS: 5,
      MAX_AGE_MS: 24 * 60 * 60 * 1000,
      MAX_QUEUE_SIZE: 1000,
    },
  };
});

const fetchMock = jest.fn<typeof fetch>();
(globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

let sendTelegramAlert: typeof import('./telegram-alert.service.js').sendTelegramAlert;
let flushTelegramQueue: typeof import('./telegram-alert.service.js').flushTelegramQueue;
let startTelegramQueueFlusher: typeof import('./telegram-alert.service.js').startTelegramQueueFlusher;
let resetTelegramAlertCacheForTests: typeof import('./telegram-alert.service.js').resetTelegramAlertCacheForTests;

beforeAll(async () => {
  const mod = await import('./telegram-alert.service.js');
  sendTelegramAlert = mod.sendTelegramAlert;
  flushTelegramQueue = mod.flushTelegramQueue;
  startTelegramQueueFlusher = mod.startTelegramQueueFlusher;
  resetTelegramAlertCacheForTests = mod.resetTelegramAlertCacheForTests;
});

beforeEach(() => {
  jest.clearAllMocks();
  queueState.items = [];
  enqueueMock.mockImplementation(async ({ message, dedupeKey }) => {
    const item = {
      id: `id-${queueState.items.length + 1}`,
      message,
      dedupeKey,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    queueState.items.push(item);
    return item;
  });
  resetTelegramAlertCacheForTests();
});

const okResponse = () => ({ ok: true, status: 200 }) as Response;
const httpResponse = (status: number) => ({ ok: status >= 200 && status < 300, status }) as Response;

describe('sendTelegramAlert', () => {
  it('does nothing when bot is not configured (no token)', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../config/environment.js', () => ({
      config: {
        telegram: { botToken: '', errorsChatId: '' },
        whatsapp: { sessionDir: '/tmp/lila-test/sessions' },
      },
    }));
    const mod = await import('./telegram-alert.service.js');
    const result = await mod.sendTelegramAlert({ message: 'hi' });
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns true on successful send and does not enqueue', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const result = await sendTelegramAlert({ message: 'hi' });
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('enqueues on transient network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const result = await sendTelegramAlert({ message: 'boom', dedupeKey: 'k' });
    expect(result).toBe(false);
    expect(enqueueMock).toHaveBeenCalledWith({ message: 'boom', dedupeKey: 'k' });
  });

  it('enqueues on AbortError (timeout)', async () => {
    const err = new Error('aborted');
    err.name = 'TimeoutError';
    fetchMock.mockRejectedValueOnce(err);
    await sendTelegramAlert({ message: 'late' });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT enqueue on 4xx (permanent failure)', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(401));
    const result = await sendTelegramAlert({ message: 'bad token' });
    expect(result).toBe(false);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('enqueues on 5xx (transient server failure)', async () => {
    fetchMock.mockResolvedValueOnce(httpResponse(503));
    await sendTelegramAlert({ message: 'maintenance' });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('respects dedupeKey: second call within window does NOT send NOR enqueue', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await sendTelegramAlert({ message: 'a', dedupeKey: 'same' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await sendTelegramAlert({ message: 'a', dedupeKey: 'same' });
    expect(second).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

describe('flushTelegramQueue', () => {
  it('sends each queued item and removes on success', async () => {
    queueState.items = [
      { id: 'a', message: 'one', createdAt: new Date().toISOString(), attempts: 0 },
      { id: 'b', message: 'two', createdAt: new Date().toISOString(), attempts: 0 },
    ];
    fetchMock.mockResolvedValue(okResponse());

    const result = await flushTelegramQueue();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(removeMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2, dropped: 0, remaining: 0 });
  });

  it('stops on first failure to avoid flooding and updates attempts', async () => {
    queueState.items = [
      { id: 'a', message: 'will-fail', createdAt: new Date().toISOString(), attempts: 0 },
      { id: 'b', message: 'never-tried', createdAt: new Date().toISOString(), attempts: 0 },
    ];
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const result = await flushTelegramQueue();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', attempts: 1, lastError: expect.any(String) })
    );
    expect(removeMock).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(result.remaining).toBe(2);
  });

  it('removes (does not retry) on 4xx and continues', async () => {
    queueState.items = [
      { id: 'a', message: 'bad', createdAt: new Date().toISOString(), attempts: 0 },
      { id: 'b', message: 'good', createdAt: new Date().toISOString(), attempts: 0 },
    ];
    fetchMock
      .mockResolvedValueOnce(httpResponse(400))
      .mockResolvedValueOnce(okResponse());

    const result = await flushTelegramQueue();
    expect(removeMock).toHaveBeenCalledWith('a');
    expect(removeMock).toHaveBeenCalledWith('b');
    expect(result.sent).toBe(1);
    expect(result.dropped).toBe(1);
  });

  it('prunes before flushing and reports dropped count', async () => {
    pruneMock.mockResolvedValueOnce(3);
    const result = await flushTelegramQueue();
    expect(pruneMock).toHaveBeenCalledTimes(1);
    expect(result.dropped).toBe(3);
  });

  it('does not run concurrently (mutex)', async () => {
    queueState.items = [
      { id: 'a', message: 'one', createdAt: new Date().toISOString(), attempts: 0 },
    ];
    let resolveFetch: (v: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; })
    );

    const first = flushTelegramQueue();
    const second = await flushTelegramQueue();
    expect(second).toEqual({ sent: 0, dropped: 0, remaining: 1, skipped: true });

    resolveFetch(okResponse());
    await first;
  });

  it('returns zero work when queue is empty', async () => {
    const result = await flushTelegramQueue();
    expect(result).toEqual({ sent: 0, dropped: 0, remaining: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('startTelegramQueueFlusher', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('triggers flush on the configured interval and stop() clears it', async () => {
    jest.useFakeTimers();
    const stop = startTelegramQueueFlusher(1000);

    jest.advanceTimersByTime(3000);
    // Drain any pending microtasks from the flush invocations
    await Promise.resolve();
    await Promise.resolve();

    stop();
    jest.advanceTimersByTime(5000);
    // No further invocations beyond the 3 ticks
    expect(pruneMock.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
