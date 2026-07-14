import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals';

const storeData = new Map<string, unknown>();

jest.unstable_mockModule('../../utils/logger.js', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule('../../config/environment.js', () => ({
  config: {
    whatsapp: { sessionDir: '/tmp/lila-test/sessions' },
  },
}));

const sendTelegramAlert = jest.fn(async () => undefined);
jest.unstable_mockModule('../../services/telegram-alert.service.js', () => ({
  __esModule: true,
  sendTelegramAlert,
}));

jest.unstable_mockModule('../../storage/json.store.js', () => {
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

type Subject = typeof import('./outbox-queue.js');
let subject: Subject;

beforeAll(async () => {
  subject = await import('./outbox-queue.js');
});

beforeEach(() => {
  storeData.clear();
});

const NOW = Date.parse('2026-07-13T18:00:00.000Z');

const makeItem = (
  overrides: Partial<import('./outbox-queue.js').OutboxMessage> = {}
): import('./outbox-queue.js').OutboxMessage => ({
  id: 'item-1',
  sessionPhone: '51902049935',
  recipient: '120363@g.us',
  messageType: 'text',
  text: 'hola',
  createdAt: new Date(NOW - 60_000).toISOString(),
  attempts: 0,
  ...overrides,
});

describe('isOutboxItemDroppable', () => {
  it('keeps a fresh item with attempts below the limit', () => {
    const item = makeItem({ attempts: subject.OUTBOX_MAX_ATTEMPTS - 1 });
    expect(subject.isOutboxItemDroppable(item, NOW)).toBe(false);
  });

  it('drops an item that exhausted its attempts', () => {
    const item = makeItem({ attempts: subject.OUTBOX_MAX_ATTEMPTS });
    expect(subject.isOutboxItemDroppable(item, NOW)).toBe(true);
  });

  it('drops an item older than the TTL', () => {
    const item = makeItem({
      createdAt: new Date(NOW - subject.OUTBOX_TTL_MS - 1).toISOString(),
    });
    expect(subject.isOutboxItemDroppable(item, NOW)).toBe(true);
  });

  it('keeps an item exactly at the TTL boundary', () => {
    const item = makeItem({
      createdAt: new Date(NOW - subject.OUTBOX_TTL_MS).toISOString(),
    });
    expect(subject.isOutboxItemDroppable(item, NOW)).toBe(false);
  });

  it('drops an item with unreadable createdAt (corrupt entry)', () => {
    const item = makeItem({ createdAt: 'no-es-una-fecha' });
    expect(subject.isOutboxItemDroppable(item, NOW)).toBe(true);
  });
});

describe('OutboxQueue persistence', () => {
  it('enqueue persists a text item with attempts=0 and parseable createdAt', async () => {
    const queue = new subject.OutboxQueue();
    const item = await queue.enqueue('51902049935', '120363@g.us', 'hola');

    expect(item.attempts).toBe(0);
    expect(Date.parse(item.createdAt)).not.toBeNaN();
    const listed = await queue.list('51902049935');
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(item.id);
  });

  it('enqueueMedia serializes buffers to base64 for JSON storage', async () => {
    const queue = new subject.OutboxQueue();
    const item = await queue.enqueueMedia('51902049935', '120363@g.us', 'image', {
      buffer: Buffer.from('foto'),
      fileName: 'foto.jpg',
    });

    expect(item.mediaOptions?.buffer).toBe(Buffer.from('foto').toString('base64'));
  });

  it('update persists attempts/lastError of an existing item', async () => {
    const queue = new subject.OutboxQueue();
    const item = await queue.enqueue('51902049935', '120363@g.us', 'hola');

    await queue.update('51902049935', { ...item, attempts: 3, lastError: 'boom' });

    const [updated] = await queue.list('51902049935');
    expect(updated.attempts).toBe(3);
    expect(updated.lastError).toBe('boom');
  });

  it('caps the queue at OUTBOX_MAX_ITEMS dropping the OLDEST and alerting once', async () => {
    const queue = new subject.OutboxQueue();
    const seeded = Array.from({ length: subject.OUTBOX_MAX_ITEMS }, (_, index) => ({
      ...makeItem({ id: `viejo-${index}` }),
    }));
    storeData.set('51902049935', seeded);

    const nuevo = await queue.enqueue('51902049935', '120363@g.us', 'el más nuevo');

    const remaining = await queue.list('51902049935');
    expect(remaining).toHaveLength(subject.OUTBOX_MAX_ITEMS);
    expect(remaining.some((item) => item.id === 'viejo-0')).toBe(false); // dropped
    expect(remaining[remaining.length - 1].id).toBe(nuevo.id);
    expect(sendTelegramAlert).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: 'outbox-overflow-51902049935' })
    );
  });

  it('does not alert below the cap', async () => {
    sendTelegramAlert.mockClear();
    const queue = new subject.OutboxQueue();

    await queue.enqueue('51902049935', '120363@g.us', 'normal');

    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });

  it('remove deletes only the targeted item', async () => {
    const queue = new subject.OutboxQueue();
    const first = await queue.enqueue('51902049935', '120363@g.us', 'uno');
    const second = await queue.enqueue('51902049935', '120363@g.us', 'dos');

    await queue.remove('51902049935', first.id);

    const remaining = await queue.list('51902049935');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.id);
  });
});
