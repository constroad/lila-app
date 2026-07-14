/**
 * flushOutbox: política anti-envenenamiento del outbox (incidente 2026-07-13).
 * - Items con attempts >= OUTBOX_MAX_ATTEMPTS o más viejos que el TTL se descartan.
 * - Un item que falla NO bloquea a los siguientes (antes: break-on-first-error).
 * - Los media del flush van con queueOnFail:false (sin duplicados re-encolados).
 * Los métodos send* del servicio se stubbean sobre el objeto exportado; el resto de la
 * malla de imports se mockea para no tocar Baileys/Mongo.
 */
import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals';

const storeData = new Map<string, unknown>();

const isSessionReady = jest.fn(() => true);
const getSession = jest.fn(() => ({ fake: 'sock' }));

jest.unstable_mockModule('../whatsapp/baileys/sessions.simple.js', () => ({
  __esModule: true,
  startSession: jest.fn(),
  getSession,
  createPairingSession: jest.fn(),
  listSessions: jest.fn(() => []),
  getStore: jest.fn(),
  isWhatsAppSessionActive: jest.fn(() => true),
  disconnectSession: jest.fn(),
  getQRCode: jest.fn(),
  isSessionReady,
}));

jest.unstable_mockModule('../whatsapp/baileys/populate-store-simple.js', () => ({
  __esModule: true,
  populateStoreIfEmpty: jest.fn(),
}));

jest.unstable_mockModule('./whatsapp-media.utils.js', () => ({
  __esModule: true,
  detectMimeType: jest.fn(() => 'image/jpeg'),
  getSendOptions: jest.fn(() => ({})),
  resolveFileBuffer: jest.fn(),
  downloadFileFromUrl: jest.fn(),
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../config/environment.js', () => ({
  config: {
    whatsapp: { sessionDir: '/tmp/lila-test/sessions' },
    uploads: { directory: '/tmp/lila-test/uploads' },
    nodeEnv: 'test',
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
  return { __esModule: true, default: FakeStore, JsonStore: FakeStore };
});

jest.unstable_mockModule('../utils/whatsapp-recipient-routing.js', () => ({
  __esModule: true,
  resolveWhatsAppRecipient: jest.fn((to: string) => to),
}));

jest.unstable_mockModule('./whatsapp-media-source.util.js', () => ({
  __esModule: true,
  resolveCompanyIdFromMediaOptions: jest.fn(() => 'test'),
  resolveWhatsAppMediaSourceKind: jest.fn(() => 'buffer'),
}));

jest.unstable_mockModule('../utils/whatsapp-phone.js', () => ({
  __esModule: true,
  assertWhatsAppRecipient: jest.fn((to: string) => to),
}));

jest.unstable_mockModule('./quota-validator.service.js', () => ({
  __esModule: true,
  quotaValidatorService: {
    getCompanyByWhatsappSender: jest.fn(async () => ({ companyId: 'test' })),
    incrementWhatsAppUsage: jest.fn(),
  },
}));

class FakeOwnershipError extends Error {}
jest.unstable_mockModule('./whatsapp-sender-ownership.service.js', () => ({
  __esModule: true,
  assertCompanyOwnsWhatsAppSender: jest.fn(),
  WhatsAppSenderOwnershipError: FakeOwnershipError,
}));

jest.unstable_mockModule('./whatsapp-proxy.service.js', () => ({
  __esModule: true,
  isWhatsAppProxyMode: jest.fn(() => false),
  proxyTextMessage: jest.fn(),
  proxyMediaMessage: jest.fn(),
}));

// outbox-queue importa telegram-alert (cap con alerta); mock para no tocar red/bot.
jest.unstable_mockModule('./telegram-alert.service.js', () => ({
  __esModule: true,
  sendTelegramAlert: jest.fn(async () => undefined),
}));

type ServiceModule = typeof import('./whatsapp-direct.service.js');
type OutboxModule = typeof import('../whatsapp/queue/outbox-queue.js');
type OutboxItem = import('../whatsapp/queue/outbox-queue.js').OutboxMessage;

let WhatsAppDirectService: ServiceModule['WhatsAppDirectService'];
let outbox: OutboxModule;
// sendMessage REAL (los tests de flush lo pisan con un spy en beforeEach).
let realSendMessage: ServiceModule['WhatsAppDirectService']['sendMessage'];

const SESSION = '51902049935';

beforeAll(async () => {
  outbox = await import('../whatsapp/queue/outbox-queue.js');
  ({ WhatsAppDirectService } = await import('./whatsapp-direct.service.js'));
  realSendMessage = WhatsAppDirectService.sendMessage.bind(WhatsAppDirectService);
});

const seedQueue = async (items: Array<Partial<OutboxItem>>) => {
  const base: OutboxItem = {
    id: 'seed',
    sessionPhone: SESSION,
    recipient: '120363@g.us',
    messageType: 'text',
    text: 'hola',
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  storeData.set(
    SESSION,
    items.map((partial, index) => ({ ...base, id: `item-${index}`, ...partial }))
  );
};

const queuedIds = () => (storeData.get(SESSION) as OutboxItem[]).map((item) => item.id);

let sendMessageSpy: jest.Mock;
let sendImageSpy: jest.Mock;

beforeEach(() => {
  storeData.clear();
  isSessionReady.mockReturnValue(true);
  getSession.mockReturnValue({ fake: 'sock' });
  sendMessageSpy = jest.fn(async () => ({ ok: true }));
  sendImageSpy = jest.fn(async () => ({ ok: true }));
  (WhatsAppDirectService as any).sendMessage = sendMessageSpy;
  (WhatsAppDirectService as any).sendImageFile = sendImageSpy;
});

describe('flushOutbox — descarte de items envenenados/expirados', () => {
  it('drops items that exhausted OUTBOX_MAX_ATTEMPTS without sending them', async () => {
    await seedQueue([{ attempts: outbox.OUTBOX_MAX_ATTEMPTS }, { text: 'sano' }]);

    await WhatsAppDirectService.flushOutbox(SESSION);

    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    expect(sendMessageSpy).toHaveBeenCalledWith(
      SESSION,
      '120363@g.us',
      'sano',
      expect.objectContaining({ queueOnFail: false })
    );
    expect(queuedIds()).toEqual([]);
  });

  it('drops items older than OUTBOX_TTL_MS', async () => {
    await seedQueue([
      { createdAt: new Date(Date.now() - outbox.OUTBOX_TTL_MS - 1000).toISOString() },
    ]);

    await WhatsAppDirectService.flushOutbox(SESSION);

    expect(sendMessageSpy).not.toHaveBeenCalled();
    expect(queuedIds()).toEqual([]);
  });
});

describe('flushOutbox — un fallo no bloquea la cola', () => {
  it('skips the failing item (attempts+1, lastError) and still sends the rest', async () => {
    await seedQueue([{ text: 'falla' }, { text: 'pasa' }]);
    sendMessageSpy.mockImplementationOnce(async () => {
      throw new Error('media irrecuperable');
    });

    await WhatsAppDirectService.flushOutbox(SESSION);

    expect(sendMessageSpy).toHaveBeenCalledTimes(2);
    const remaining = storeData.get(SESSION) as OutboxItem[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].attempts).toBe(1);
    expect(remaining[0].lastError).toContain('media irrecuperable');
  });

  it('stops flushing only when the session drops mid-flush', async () => {
    await seedQueue([{ text: 'falla' }, { text: 'nunca-intentado' }]);
    sendMessageSpy.mockImplementationOnce(async () => {
      isSessionReady.mockReturnValue(false); // la sesión se cae durante el envío
      throw new Error('socket closed');
    });

    await WhatsAppDirectService.flushOutbox(SESSION);

    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    expect(queuedIds()).toEqual(['item-0', 'item-1']); // ambos quedan para el próximo open
  });

  it('discards items whose sender no longer belongs to its company', async () => {
    await seedQueue([{ text: 'ajeno' }, { text: 'propio' }]);
    sendMessageSpy.mockImplementationOnce(async () => {
      throw new FakeOwnershipError('cross-company');
    });

    await WhatsAppDirectService.flushOutbox(SESSION);

    expect(sendMessageSpy).toHaveBeenCalledTimes(2);
    expect(queuedIds()).toEqual([]);
  });
});

describe('flushOutbox — media', () => {
  it('sends media with queueOnFail:false and the buffer decoded from base64', async () => {
    await seedQueue([
      {
        messageType: 'image',
        text: undefined,
        mediaOptions: {
          buffer: Buffer.from('foto').toString('base64'),
          fileName: 'foto.jpg',
          caption: 'evidencia',
        },
      },
    ]);

    await WhatsAppDirectService.flushOutbox(SESSION);

    expect(sendImageSpy).toHaveBeenCalledTimes(1);
    const [, , options] = sendImageSpy.mock.calls[0] as [string, string, any];
    expect(options.queueOnFail).toBe(false);
    expect(Buffer.isBuffer(options.buffer)).toBe(true);
    expect(options.buffer.toString()).toBe('foto');
    expect(queuedIds()).toEqual([]);
  });

  it('drops malformed media items (sin mediaOptions) via attempts, not blocking', async () => {
    await seedQueue([
      { messageType: 'image', text: undefined, mediaOptions: undefined },
      { text: 'pasa' },
    ]);

    await WhatsAppDirectService.flushOutbox(SESSION);

    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    const remaining = storeData.get(SESSION) as OutboxItem[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].attempts).toBe(1);
    expect(remaining[0].lastError).toContain('without mediaOptions');
  });
});

describe('flushOutbox — lock anti-concurrencia', () => {
  it('two overlapping flushes send each queued message only once', async () => {
    await seedQueue([{ text: 'unico' }]);
    let sendStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      sendStarted = resolve;
    });
    let releaseSend: () => void = () => {};
    sendMessageSpy.mockImplementationOnce(() => {
      sendStarted();
      return new Promise((resolve) => {
        releaseSend = () => resolve({ ok: true });
      });
    });

    const firstFlush = WhatsAppDirectService.flushOutbox(SESSION);
    await started; // el primer flush tiene el lock y está a mitad del envío
    const secondFlush = WhatsAppDirectService.flushOutbox(SESSION); // debe saltarse
    releaseSend();
    await Promise.all([firstFlush, secondFlush]);

    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    expect(queuedIds()).toEqual([]);
  });
});

describe('sendMessage — timeout defensivo de envíos', () => {
  it('a hung socket send times out (120s) and falls into queueOnFail instead of hanging forever', async () => {
    jest.useFakeTimers();
    try {
      getSession.mockReturnValue({
        // socket medio muerto: la promesa nunca resuelve
        sendMessage: () => new Promise(() => {}),
      } as never);

      const pending = realSendMessage(SESSION, '120363@g.us', 'hola colgado', {});
      await jest.advanceTimersByTimeAsync(120_000);
      const result = await pending;

      expect(result).toEqual({ queued: true });
      const queued = storeData.get(SESSION) as OutboxItem[];
      expect(queued).toHaveLength(1);
      expect(queued[0].text).toBe('hola colgado');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a fast send resolves normally without the timeout interfering', async () => {
    getSession.mockReturnValue({
      sendMessage: async () => ({ key: { id: 'MSG1' } }),
    } as never);

    const result = await realSendMessage(SESSION, '120363@g.us', 'rápido', {});

    expect(result).toEqual({ key: { id: 'MSG1' } });
    expect(storeData.get(SESSION) ?? []).toHaveLength(0);
  });
});

describe('flushOutbox — guardas de sesión', () => {
  it('does nothing when the session is not ready', async () => {
    await seedQueue([{ text: 'pendiente' }]);
    isSessionReady.mockReturnValue(false);

    await WhatsAppDirectService.flushOutbox(SESSION);

    expect(sendMessageSpy).not.toHaveBeenCalled();
    expect(queuedIds()).toEqual(['item-0']);
  });
});
