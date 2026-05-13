import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

type FakeSocket = {
  ev: EventEmitter;
  logout: jest.Mock<() => Promise<void>>;
  end: jest.Mock<(err?: Error) => void>;
  sendPresenceUpdate: jest.Mock<() => Promise<void>>;
  requestPairingCode: jest.Mock<(phone: string) => Promise<string>>;
  authState: { creds: { registered: boolean } };
};

const makeFakeSocket = (): FakeSocket => {
  const ev = new EventEmitter();
  ev.setMaxListeners(50);
  return {
    ev,
    logout: jest.fn(async () => undefined),
    end: jest.fn(() => undefined),
    sendPresenceUpdate: jest.fn(async () => undefined),
    requestPairingCode: jest.fn(async () => 'PAIR1234'),
    authState: { creds: { registered: false } },
  };
};

let currentSocket: FakeSocket;
const sockets: FakeSocket[] = [];
const makeWASocket = jest.fn(() => {
  const s = makeFakeSocket();
  currentSocket = s;
  sockets.push(s);
  return s;
});
const saveCreds = jest.fn(async () => undefined);
const useMultiFileAuthState = jest.fn(async () => ({
  state: { creds: { registered: false } },
  saveCreds,
}));
const fetchLatestBaileysVersion = jest.fn(async () => ({
  version: [2, 3000, 1],
  isLatest: true,
}));

jest.unstable_mockModule('@whiskeysockets/baileys', () => ({
  __esModule: true,
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers: { ubuntu: () => 'ubuntu', macOS: () => 'mac' },
  DisconnectReason: { loggedOut: 401 },
}));

jest.unstable_mockModule('pino', () => ({
  __esModule: true,
  default: () => ({ child: () => ({}) }),
}));

const fsExtraMock = {
  pathExists: jest.fn(async (_p: string) => true),
  remove: jest.fn(async (_p: string) => undefined),
};
jest.unstable_mockModule('fs-extra', () => ({
  __esModule: true,
  default: fsExtraMock,
  ...fsExtraMock,
}));

const fakeStore = {
  readFromFile: jest.fn(),
  writeToFile: jest.fn(),
  bind: jest.fn(),
  chats: new Map(),
  contacts: new Map(),
  messages: new Map(),
};
jest.unstable_mockModule('./store.manager.js', () => ({
  __esModule: true,
  makeInMemoryStore: jest.fn(() => fakeStore),
}));

jest.unstable_mockModule('./populate-store-simple.js', () => ({
  __esModule: true,
  populateStoreIfEmpty: jest.fn(async () => undefined),
}));

const flushOutboxForSession = jest.fn(async () => undefined);
const outboxClear = jest.fn(async () => undefined);
jest.unstable_mockModule('../queue/outbox-queue.js', () => ({
  __esModule: true,
  flushOutboxForSession,
  default: { clear: outboxClear },
}));

jest.unstable_mockModule('../../config/environment.js', () => ({
  __esModule: true,
  config: { whatsapp: { sessionDir: '/tmp/lila-test-sessions' } },
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type Subject = typeof import('./sessions.simple.js');
let subject: Subject;

beforeEach(async () => {
  jest.useFakeTimers();
  jest.resetModules();
  sockets.length = 0;
  makeWASocket.mockClear();
  saveCreds.mockClear();
  fsExtraMock.pathExists.mockClear();
  fsExtraMock.remove.mockClear();
  flushOutboxForSession.mockClear();
  outboxClear.mockClear();
  subject = await import('./sessions.simple.js');
});

afterEach(() => {
  jest.useRealTimers();
});

const fireOpen = async () => {
  currentSocket.ev.emit('connection.update', { connection: 'open' });
  await Promise.resolve();
  await Promise.resolve();
};

const fireClose = async (statusCode = 500) => {
  currentSocket.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode } } },
  });
  await Promise.resolve();
};

describe('pure read helpers (cold state)', () => {
  it('getSession returns undefined for unknown id', () => {
    expect(subject.getSession('nope')).toBeUndefined();
  });

  it('listSessions returns empty', () => {
    expect(subject.listSessions()).toEqual([]);
  });

  it('isSessionReady returns false', () => {
    expect(subject.isSessionReady('nope')).toBe(false);
  });

  it('getQRCode returns undefined', () => {
    expect(subject.getQRCode('nope')).toBeUndefined();
  });

  it('getStore throws when missing', () => {
    expect(() => subject.getStore('nope')).toThrow(/No store/);
  });

  it('isWhatsAppSessionActive returns false and warns when no session', () => {
    expect(subject.isWhatsAppSessionActive('nope')).toBe(false);
  });
});

describe('startSession', () => {
  it('registers the session in the dictionary and emits in listSessions', async () => {
    await subject.startSession('51111111111');
    expect(subject.listSessions()).toEqual(['51111111111']);
    expect(subject.getSession('51111111111')).toBe(currentSocket);
  });

  it('marks ready only after connection.update open', async () => {
    await subject.startSession('51111111111');
    expect(subject.isSessionReady('51111111111')).toBe(false);
    await fireOpen();
    expect(subject.isSessionReady('51111111111')).toBe(true);
  });

  it('captures QR codes from connection.update', async () => {
    await subject.startSession('51111111111');
    currentSocket.ev.emit('connection.update', { qr: 'QR-DATA-XYZ' });
    await Promise.resolve();
    expect(subject.getQRCode('51111111111')).toBe('QR-DATA-XYZ');
  });

  it('invokes the qr callback when supplied', async () => {
    const cb = jest.fn();
    await subject.startSession('51111111111', cb);
    currentSocket.ev.emit('connection.update', { qr: 'QR-XYZ' });
    await Promise.resolve();
    expect(cb).toHaveBeenCalledWith('QR-XYZ');
  });

  it('binds messaging-history.set ONCE even after multiple opens (listener leak fix)', async () => {
    await subject.startSession('51111111111');
    const before = currentSocket.ev.listenerCount('messaging-history.set');
    await fireOpen();
    await fireOpen();
    await fireOpen();
    const after = currentSocket.ev.listenerCount('messaging-history.set');
    expect(after).toBe(before);
    expect(after).toBeLessThanOrEqual(1);
  });

  it('flushes outbox on every open (recovery after reconnects)', async () => {
    await subject.startSession('51111111111');
    await fireOpen();
    await fireOpen();
    expect(flushOutboxForSession).toHaveBeenCalledTimes(2);
  });
});

describe('reconnect / close handler', () => {
  it('schedules a reconnect on non-loggedOut close', async () => {
    await subject.startSession('51111111111');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    await fireClose(500);
    expect(setTimeoutSpy).toHaveBeenCalled();
  });

  it('cleans up and does NOT reconnect on loggedOut close', async () => {
    await subject.startSession('51111111111');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    await fireClose(401);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('skips reconnect when shuttingDown is set (graceful shutdown path)', async () => {
    await subject.startSession('51111111111');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    await subject.endSession('51111111111');
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});

describe('endSession', () => {
  it('closes socket without logging out and clears state', async () => {
    await subject.startSession('51111111111');
    await subject.endSession('51111111111');
    expect(currentSocket.end).toHaveBeenCalled();
    expect(currentSocket.logout).not.toHaveBeenCalled();
    expect(subject.getSession('51111111111')).toBeUndefined();
    expect(subject.listSessions()).toEqual([]);
  });

  it('is a noop for unknown ids', async () => {
    await expect(subject.endSession('does-not-exist')).resolves.toBeUndefined();
  });

  it('clearInterval cancels the store-write timer (memory leak fix)', async () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    await subject.startSession('51111111111');
    await subject.endSession('51111111111');
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});

describe('disconnectSession', () => {
  it('calls logout and clears state', async () => {
    await subject.startSession('51111111111');
    await subject.disconnectSession('51111111111');
    expect(currentSocket.logout).toHaveBeenCalled();
    expect(subject.getSession('51111111111')).toBeUndefined();
  });

  it('is a noop for unknown ids', async () => {
    await expect(subject.disconnectSession('does-not-exist')).resolves.toBeUndefined();
  });

  it('clearInterval cancels the store-write timer (memory leak fix)', async () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    await subject.startSession('51111111111');
    await subject.disconnectSession('51111111111');
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});

describe('clearSession', () => {
  it('logs out, removes session dir, removes backup dir, clears queue', async () => {
    await subject.startSession('51111111111');
    await subject.clearSession('51111111111');
    expect(currentSocket.logout).toHaveBeenCalled();
    expect(fsExtraMock.remove).toHaveBeenCalledWith(
      expect.stringContaining('51111111111')
    );
    expect(fsExtraMock.remove).toHaveBeenCalledWith(
      expect.stringContaining('backups')
    );
    expect(outboxClear).toHaveBeenCalledWith('51111111111');
    expect(subject.getSession('51111111111')).toBeUndefined();
  });

  it('still clears memory and queue when session was not active', async () => {
    await subject.clearSession('not-active');
    expect(outboxClear).toHaveBeenCalledWith('not-active');
  });

  it('does not throw if remove fails — continues cleanup', async () => {
    fsExtraMock.remove.mockRejectedValueOnce(new Error('fs blew up') as never);
    await expect(subject.clearSession('51111111111')).resolves.toBeUndefined();
    expect(outboxClear).toHaveBeenCalled();
  });
});

describe('shutdown re-entry safety', () => {
  it('startSession after endSession allows reconnect again (shuttingDown is cleared)', async () => {
    await subject.startSession('51111111111');
    await subject.endSession('51111111111');

    await subject.startSession('51111111111');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    await fireClose(500);
    expect(setTimeoutSpy).toHaveBeenCalled();
  });
});

describe('store-write timer single-instance per session (memory leak fix)', () => {
  it('does not stack timers when startSession is called twice for the same id', async () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    await subject.startSession('51111111111');
    const firstCount = setIntervalSpy.mock.calls.length;
    await subject.startSession('51111111111');
    const afterCount = setIntervalSpy.mock.calls.length;
    expect(afterCount - firstCount).toBe(1);
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});

describe('createPairingSession', () => {
  const fireConnecting = async (sock: FakeSocket) => {
    sock.ev.emit('connection.update', { connection: 'connecting' });
    await Promise.resolve();
    await Promise.resolve();
  };

  it('registers the session and wires events', async () => {
    const sendCode = jest.fn();
    await subject.createPairingSession('+51111111111', sendCode);
    expect(subject.listSessions()).toEqual(['51111111111']);
  });

  it('requests pairing code on connecting when creds are not registered', async () => {
    const sendCode = jest.fn();
    await subject.createPairingSession('+51111111111', sendCode);
    await fireConnecting(currentSocket);
    expect(currentSocket.requestPairingCode).toHaveBeenCalledWith('+51111111111');
    expect(sendCode).toHaveBeenCalledWith('PAIR1234');
  });

  it('does not re-request pairing code if already requested once', async () => {
    const sendCode = jest.fn();
    await subject.createPairingSession('+51111111111', sendCode);
    await fireConnecting(currentSocket);
    await fireConnecting(currentSocket);
    await fireConnecting(currentSocket);
    expect(currentSocket.requestPairingCode).toHaveBeenCalledTimes(1);
  });

  it('marks ready on connection.open and flushes outbox', async () => {
    await subject.createPairingSession('+51111111111', jest.fn());
    currentSocket.ev.emit('connection.update', { connection: 'open' });
    await Promise.resolve();
    await Promise.resolve();
    expect(subject.isSessionReady('51111111111')).toBe(true);
    expect(flushOutboxForSession).toHaveBeenCalledWith('51111111111');
  });

  it('schedules reconnection on a non-loggedOut close', async () => {
    await subject.createPairingSession('+51111111111', jest.fn());
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    currentSocket.ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 500 } } },
    });
    await Promise.resolve();
    expect(setTimeoutSpy).toHaveBeenCalled();
  });

  it('cleans up on loggedOut close (does not reconnect)', async () => {
    await subject.createPairingSession('+51111111111', jest.fn());
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    currentSocket.ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });
    await Promise.resolve();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});

describe('messaging-history.set handler (sync history into store)', () => {
  it('writes chats / contacts / messages into the store', async () => {
    await subject.startSession('51111111111');
    currentSocket.ev.emit('messaging-history.set', {
      chats: [{ id: 'chat-a' }, { id: 'chat-b' }],
      contacts: [{ id: 'contact-a' }],
      messages: [
        { key: { remoteJid: 'jid-1' }, id: 'msg-1' },
        { key: { remoteJid: 'jid-1' }, id: 'msg-2' },
      ],
    });
    expect(fakeStore.chats.get('chat-a')).toEqual({ id: 'chat-a' });
    expect(fakeStore.contacts.get('contact-a')).toEqual({ id: 'contact-a' });
    expect(fakeStore.messages.get('jid-1')).toHaveLength(2);
  });
});

describe('connection.update open — error paths during bring-up', () => {
  it('logs but does not throw when populateStoreIfEmpty rejects', async () => {
    const populateMod = await import('./populate-store-simple.js');
    (populateMod.populateStoreIfEmpty as jest.Mock).mockRejectedValueOnce(
      new Error('populate boom') as never
    );
    await subject.startSession('51111111111');
    await expect(fireOpen()).resolves.toBeUndefined();
  });

  it('logs but does not throw when sendPresenceUpdate rejects', async () => {
    await subject.startSession('51111111111');
    currentSocket.sendPresenceUpdate.mockRejectedValueOnce(new Error('presence boom') as never);
    await expect(fireOpen()).resolves.toBeUndefined();
  });

  it('logs but does not throw when flushOutboxForSession rejects', async () => {
    flushOutboxForSession.mockRejectedValueOnce(new Error('flush boom') as never);
    await subject.startSession('51111111111');
    await expect(fireOpen()).resolves.toBeUndefined();
  });
});

describe('close handler — explicit shutdown path', () => {
  it('after endSession, an incoming close event takes the shuttingDown branch', async () => {
    await subject.startSession('51111111111');
    await subject.endSession('51111111111');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    currentSocket.ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 500 } } },
    });
    await Promise.resolve();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});

describe('isWhatsAppSessionActive', () => {
  it('returns false when session exists but is not ready yet', async () => {
    await subject.startSession('51111111111');
    expect(subject.isWhatsAppSessionActive('51111111111')).toBe(false);
  });

  it('returns true once the session has emitted open', async () => {
    await subject.startSession('51111111111');
    await fireOpen();
    expect(subject.isWhatsAppSessionActive('51111111111')).toBe(true);
  });
});
