import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals';

const storeData = new Map<string, unknown>();

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
    whatsapp: { sessionDir: '/tmp/lila-test/sessions' },
  },
}));

jest.unstable_mockModule('../storage/json.store.js', () => {
  class FakeStore {
    constructor(_opts: unknown) {}
    async get<T>(key: string): Promise<T | null> {
      return (storeData.get(key) as T) ?? null;
    }
    async set<T>(key: string, value: T): Promise<void> {
      storeData.set(key, value);
    }
  }
  return {
    __esModule: true,
    default: FakeStore,
    JsonStore: FakeStore,
  };
});

let TelegramQueue: typeof import('./telegram-queue.js').TelegramQueue;
let TELEGRAM_QUEUE_LIMITS: typeof import('./telegram-queue.js').TELEGRAM_QUEUE_LIMITS;

beforeAll(async () => {
  const mod = await import('./telegram-queue.js');
  TelegramQueue = mod.TelegramQueue;
  TELEGRAM_QUEUE_LIMITS = mod.TELEGRAM_QUEUE_LIMITS;
});

describe('TelegramQueue', () => {
  let queue: InstanceType<typeof TelegramQueue>;

  beforeEach(() => {
    storeData.clear();
    queue = new TelegramQueue();
  });

  describe('enqueue', () => {
    it('persists an item with id, attempts=0 and createdAt', async () => {
      const item = await queue.enqueue({ message: 'hello' });
      expect(item).not.toBeNull();
      expect(item!.id).toEqual(expect.any(String));
      expect(item!.message).toBe('hello');
      expect(item!.attempts).toBe(0);
      expect(Date.parse(item!.createdAt)).not.toBeNaN();

      const list = await queue.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(item!.id);
    });

    it('stores dedupeKey when provided', async () => {
      const item = await queue.enqueue({ message: 'x', dedupeKey: 'k1' });
      expect(item!.dedupeKey).toBe('k1');
    });

    it('does not enqueue a duplicate when dedupeKey already pending', async () => {
      await queue.enqueue({ message: 'a', dedupeKey: 'same' });
      const second = await queue.enqueue({ message: 'b', dedupeKey: 'same' });

      expect(second).toBeNull();
      const list = await queue.list();
      expect(list).toHaveLength(1);
      expect(list[0].message).toBe('a');
    });

    it('drops the oldest item when MAX_QUEUE_SIZE is exceeded', async () => {
      const max = TELEGRAM_QUEUE_LIMITS.MAX_QUEUE_SIZE;
      for (let i = 0; i < max; i++) {
        await queue.enqueue({ message: `msg-${i}` });
      }
      await queue.enqueue({ message: 'newest' });

      const list = await queue.list();
      expect(list).toHaveLength(max);
      expect(list[0].message).toBe('msg-1');
      expect(list[list.length - 1].message).toBe('newest');
    });
  });

  describe('list', () => {
    it('returns [] when nothing stored', async () => {
      const list = await queue.list();
      expect(list).toEqual([]);
    });
  });

  describe('update', () => {
    it('replaces an existing item by id', async () => {
      const item = await queue.enqueue({ message: 'pending' });
      await queue.update({ ...item!, attempts: 3, lastError: 'boom' });

      const list = await queue.list();
      expect(list[0].attempts).toBe(3);
      expect(list[0].lastError).toBe('boom');
    });

    it('no-ops if item id is not found', async () => {
      await queue.enqueue({ message: 'real' });
      await queue.update({
        id: 'unknown',
        message: 'ghost',
        attempts: 0,
        createdAt: new Date().toISOString(),
      });
      const list = await queue.list();
      expect(list).toHaveLength(1);
      expect(list[0].message).toBe('real');
    });
  });

  describe('remove', () => {
    it('removes an item by id', async () => {
      const a = await queue.enqueue({ message: 'a' });
      const b = await queue.enqueue({ message: 'b' });
      await queue.remove(a!.id);

      const list = await queue.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(b!.id);
    });
  });

  describe('prune', () => {
    it('drops items exceeding MAX_ATTEMPTS', async () => {
      const stay = await queue.enqueue({ message: 'stay' });
      const die = await queue.enqueue({ message: 'die' });
      await queue.update({ ...die!, attempts: TELEGRAM_QUEUE_LIMITS.MAX_ATTEMPTS });

      const dropped = await queue.prune();
      expect(dropped).toBe(1);
      const list = await queue.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(stay!.id);
    });

    it('drops items older than MAX_AGE_MS', async () => {
      const fresh = await queue.enqueue({ message: 'fresh' });
      const old = await queue.enqueue({ message: 'old' });
      const oldCreatedAt = new Date(
        Date.now() - TELEGRAM_QUEUE_LIMITS.MAX_AGE_MS - 1000
      ).toISOString();
      await queue.update({ ...old!, createdAt: oldCreatedAt });

      const dropped = await queue.prune();
      expect(dropped).toBe(1);
      const list = await queue.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(fresh!.id);
    });

    it('returns 0 when nothing prunable', async () => {
      await queue.enqueue({ message: 'a' });
      const dropped = await queue.prune();
      expect(dropped).toBe(0);
    });
  });
});
