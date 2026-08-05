import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

type FakeSocket = {
  ev: EventEmitter;
  logout: jest.Mock<() => Promise<void>>;
  end: jest.Mock<(err?: Error) => void>;
  sendPresenceUpdate: jest.Mock<() => Promise<void>>;
  requestPairingCode: jest.Mock<(phone: string) => Promise<string>>;
  authState: { creds: { registered: boolean } };
  // Espeja `sock.ws.isOpen` de Baileys: lila lo consulta para no marcar lista una
  // sesión cuyo websocket ya murió. Los tests lo mutan para simular ese caso.
  ws: { isOpen: boolean };
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
    ws: { isOpen: true },
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
  // Passthrough: el cache de signal keys es transparente para estos tests.
  makeCacheableSignalKeyStore: (keys: unknown) => keys,
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
  load: jest.fn(async () => undefined),
  save: jest.fn(async () => undefined),
  bind: jest.fn(),
  markDirty: jest.fn(),
  chats: new Map(),
  contacts: new Map(),
  messages: new Map(),
};
jest.unstable_mockModule('./store.manager.js', () => ({
  __esModule: true,
  makeInMemoryStore: jest.fn(() => fakeStore),
}));

const clearStoreSnapshot = jest.fn(async () => undefined);
jest.unstable_mockModule('./mongo-store.js', () => ({
  __esModule: true,
  clearStoreSnapshot,
  loadStoreSnapshot: jest.fn(async () => null),
  saveStoreSnapshot: jest.fn(async () => undefined),
}));

jest.unstable_mockModule('./populate-store-simple.js', () => ({
  __esModule: true,
  populateStoreIfEmpty: jest.fn(async () => undefined),
  clearPopulateCooldown: jest.fn(),
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

// Creds viven en Mongo (mongo-auth-state). Se mockea para no tocar la DB compartida ni
// resolver `BufferJSON`/`getSharedConnection`. `clearMongoAuthState` es observable: el fix
// del loop 401 debe llamarlo cuando el logout es definitivo (creds muertas).
const saveCredsMongo = jest.fn(async () => undefined);
const clearMongoAuthState = jest.fn(async () => undefined);
// Creds del socket ACTUAL, mutables desde los tests (simular pair-success = setear
// `me`, como hace Baileys al escanear el QR). Cada startSession crea creds frescas.
let currentCreds: { registered: boolean; me?: { id: string } };
jest.unstable_mockModule('./mongo-auth-state.js', () => ({
  __esModule: true,
  useMongoAuthState: jest.fn(async () => {
    currentCreds = { registered: false };
    return {
      state: { creds: currentCreds, keys: { get: jest.fn(), set: jest.fn() } },
      saveCreds: saveCredsMongo,
      clearAuth: jest.fn(async () => undefined),
    };
  }),
  clearMongoAuthState,
  listMongoAuthSessions: jest.fn(async () => []),
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// La alerta de aparcado es OBSERVABLE: su contenido es el producto del diagnóstico
// (¿re-emparejar o no?), así que los tests de abajo asertan sobre el mensaje.
const sendTelegramAlert = jest.fn(async (_p: { dedupeKey?: string; message: string }) => true);
jest.unstable_mockModule('../../services/telegram-alert.service.js', () => ({
  __esModule: true,
  sendTelegramAlert,
}));

// Lease process-level: estos tests asumen que el proceso es el holder.
jest.unstable_mockModule('./instance-lease.js', () => ({
  __esModule: true,
  hasSocketLease: () => true,
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
  saveCredsMongo.mockClear();
  clearMongoAuthState.mockClear();
  clearStoreSnapshot.mockClear();
  sendTelegramAlert.mockClear();
  subject = await import('./sessions.simple.js');
});

afterEach(() => {
  jest.useRealTimers();
});

const fireOpen = async () => {
  currentSocket.ev.emit('connection.update', { connection: 'open' });
  // El open handler tiene un await extra (storeLoaded) antes del flush: drenar
  // suficientes microtasks para que complete.
  await Promise.resolve();
  await Promise.resolve();
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

  it('wipes dead Mongo creds on loggedOut close (breaks the 401 restore loop)', async () => {
    await subject.startSession('51111111111');
    await fireClose(401);
    expect(clearMongoAuthState).toHaveBeenCalledWith('51111111111');
  });

  it('does NOT wipe creds on transient (non-loggedOut) close', async () => {
    await subject.startSession('51111111111');
    await fireClose(500);
    expect(clearMongoAuthState).not.toHaveBeenCalled();
  });

  it('skips reconnect when shuttingDown is set (graceful shutdown path)', async () => {
    await subject.startSession('51111111111');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    await subject.endSession('51111111111');
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});

describe('parking tras stalls repetidos (corta el loop infinito de reconexión)', () => {
  const PARKED_ID = '51902049935';

  // Simula el fallo real (incidente jul-2026): el socket conecta pero NUNCA emite 'open';
  // el watchdog (90s) lo mata, cuenta un stall y el backoff programa otro intento. Avanzar
  // el tiempo hace cascada de intentos; el guard `!isSessionParked` corta al aparcar.
  const advanceUntilParked = async (id: string) => {
    for (let i = 0; i < 40 && !subject.isSessionParked(id); i += 1) {
      await jest.advanceTimersByTimeAsync(95_000); // watchdog del socket actual
      await jest.advanceTimersByTimeAsync(900_000); // reconexión (incl. techo de 10min)
    }
  };

  it('aparca la sesión que nunca completa el handshake y deja de reintentar', async () => {
    await subject.startSession(PARKED_ID);
    await advanceUntilParked(PARKED_ID);

    expect(subject.isSessionParked(PARKED_ID)).toBe(true);
    expect(subject.isSessionReady(PARKED_ID)).toBe(false);

    // Loop cortado: no se crean más sockets aunque pase mucho tiempo.
    const socketsAtPark = makeWASocket.mock.calls.length;
    await jest.advanceTimersByTimeAsync(3_000_000);
    expect(makeWASocket.mock.calls.length).toBe(socketsAtPark);
  });

  it('un restart manual desaparca la sesión (recuperación tras re-emparejar)', async () => {
    await subject.startSession(PARKED_ID);
    await advanceUntilParked(PARKED_ID);
    expect(subject.isSessionParked(PARKED_ID)).toBe(true);

    await subject.restartSession(PARKED_ID);
    expect(subject.isSessionParked(PARKED_ID)).toBe(false);
  });

  it('un open exitoso resetea el contador: fallos intermitentes NO aparcan', async () => {
    await subject.startSession(PARKED_ID);
    // Un par de stalls (por debajo del tope) y luego conecta bien.
    await jest.advanceTimersByTimeAsync(95_000);
    await jest.advanceTimersByTimeAsync(900_000);
    await fireOpen();

    expect(subject.isSessionParked(PARKED_ID)).toBe(false);
    expect(subject.isSessionReady(PARKED_ID)).toBe(true);
  });
});

// Incidente 2026-07-28: las 3 sesiones aparcaron a la vez con 405/408 tras un corte de
// red y la alerta dijo "credenciales desincronizadas → re-emparejar". Re-emparejar de más
// quema un device slot y sube el device ID, así que el diagnóstico tiene que salir de la
// CAUSA de los stalls, no del conteo.
describe('diagnóstico de la alerta de aparcado (causa, no conteo)', () => {
  const ID_A = '51903124919';
  const ID_B = '51949376824';

  const parkedAlert = () =>
    sendTelegramAlert.mock.calls.map(([p]) => p).filter((p) => p.message.includes('APARCADA'));

  // Aparca acumulando cierres CON código (no timeouts del watchdog). Se cierra el socket
  // apenas nace, antes de que su watchdog corra: si no, el stall se contaría como
  // 'connection-watchdog-timeout' (causa ambigua) y contaminaría el diagnóstico.
  const parkWithCode = async (id: string, code: number) => {
    for (let i = 0; i < 40 && !subject.isSessionParked(id); i += 1) {
      await fireClose(code);
      const before = makeWASocket.mock.calls.length;
      for (let t = 0; t < 100 && makeWASocket.mock.calls.length === before; t += 1) {
        await jest.advanceTimersByTimeAsync(10_000);
      }
    }
  };

  it('405 repetido (throttle de login) ⇒ alerta de causa externa, NO pide re-emparejar', async () => {
    await subject.startSession(ID_A);
    await parkWithCode(ID_A, 405);

    expect(subject.isSessionParked(ID_A)).toBe(true);
    const alerts = parkedAlert();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain('NO re-emparejes');
    expect(alerts[0].message).toContain('405');
    // La regresión concreta: nunca debe mandar a escanear el QR por un throttle.
    expect(alerts[0].message).not.toContain('escanear QR');
    expect(alerts[0].message).not.toContain('credenciales estén desincronizadas');
  });

  it('timeouts sin código (handshake colgado) ⇒ conserva el diagnóstico de credenciales', async () => {
    await subject.startSession(ID_A);
    // Camino del watchdog: el socket nunca responde y no hay código de cierre.
    for (let i = 0; i < 40 && !subject.isSessionParked(ID_A); i += 1) {
      await jest.advanceTimersByTimeAsync(95_000);
      await jest.advanceTimersByTimeAsync(900_000);
    }

    expect(subject.isSessionParked(ID_A)).toBe(true);
    const alerts = parkedAlert();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain('escanear QR');
    expect(alerts[0].message).toContain('desincronizadas');
  });

  it('≥2 sesiones aparcadas en la ventana ⇒ UNA alerta de causa común, no una por sesión', async () => {
    await subject.startSession(ID_A);
    await subject.startSession(ID_B);
    // Ambas stallean en paralelo (mismo corte), igual que en el incidente real.
    for (
      let i = 0;
      i < 40 && !(subject.isSessionParked(ID_A) && subject.isSessionParked(ID_B));
      i += 1
    ) {
      await jest.advanceTimersByTimeAsync(95_000);
      await jest.advanceTimersByTimeAsync(900_000);
    }

    expect(subject.isSessionParked(ID_A)).toBe(true);
    expect(subject.isSessionParked(ID_B)).toBe(true);

    const multi = sendTelegramAlert.mock.calls
      .map(([p]) => p)
      .filter((p) => p.dedupeKey === 'session-parked-multi');
    expect(multi).toHaveLength(1);
    expect(multi[0].message).toContain(ID_A);
    expect(multi[0].message).toContain(ID_B);
    expect(multi[0].message).toContain('NO re-emparejes');
    expect(multi[0].message).toContain('causa es COMÚN');
  });
});

// Incidente 2026-08-04 (51902049935): un socket viejo emitió 'open' 5s después del cierre,
// marcó la sesión lista y CANCELÓ el reconnect programado a 164s. La sesión quedó "lista"
// sobre un socket muerto 4h41m: no reintentaba (se creía conectada) y el outbox no se
// vaciaba (solo se vacía en 'open'). Todo envío caía a la cola en silencio.
describe('sesión zombi: lista sobre un socket muerto', () => {
  const ID = '51902049935';

  it("ignora el 'open' de un socket obsoleto y NO cancela el reconnect pendiente", async () => {
    await subject.startSession(ID);
    await fireOpen(); // la sesión venía SANA (como en el incidente): backoff normal, no piso de stall
    const viejo = currentSocket;

    // El socket cae → se programa un reconnect → nace un socket nuevo (gen+1).
    await fireClose(428);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(makeWASocket.mock.calls.length).toBeGreaterThan(1);
    expect(currentSocket).not.toBe(viejo);

    // Ahora el socket VIEJO emite 'open' tarde. No debe marcar lista la sesión.
    viejo.ev.emit('connection.update', { connection: 'open' });
    await Promise.resolve();
    await Promise.resolve();

    expect(subject.isSessionReady(ID)).toBe(false);
  });

  it("no marca lista la sesión si el websocket ya está cerrado al llegar el 'open'", async () => {
    await subject.startSession(ID);
    currentSocket.ws.isOpen = false; // murió en el mismo tick que el 'open'

    await fireOpen();

    expect(subject.isSessionReady(ID)).toBe(false);
  });

  it('degrada la sesión si el websocket muere justo después del open (fallo de presencia)', async () => {
    await subject.startSession(ID);
    // El 'open' llega con el ws vivo, pero muere durante la secuencia de bring-up:
    // es exactamente el "Error setting presence: Connection Closed" del incidente.
    currentSocket.sendPresenceUpdate.mockImplementationOnce(async () => {
      currentSocket.ws.isOpen = false;
      throw new Error('Connection Closed');
    });

    await fireOpen();

    expect(subject.isSessionReady(ID)).toBe(false);
  });

  it('el barrido de liveness degrada y reconecta una sesión lista con el socket muerto', async () => {
    await subject.startSession(ID);
    await fireOpen();
    expect(subject.isSessionReady(ID)).toBe(true);

    // El socket muere sin emitir 'close' (el caso que dejaba el estado inconsistente
    // para siempre: nada volvía a mirar).
    currentSocket.ws.isOpen = false;
    const socketsAntes = makeWASocket.mock.calls.length;

    expect(subject.sweepDeadSessions()).toBe(1);
    expect(subject.isSessionReady(ID)).toBe(false);

    // Y además reintenta: sin esto quedaría caída para siempre.
    await jest.advanceTimersByTimeAsync(10_000);
    expect(makeWASocket.mock.calls.length).toBeGreaterThan(socketsAntes);
  });

  it('el barrido NO toca sesiones sanas ni aparcadas', async () => {
    await subject.startSession(ID);
    await fireOpen();

    expect(subject.sweepDeadSessions()).toBe(0);
    expect(subject.isSessionReady(ID)).toBe(true);
  });
});

describe('ciclo de emparejamiento QR (idle-stop + pair-success)', () => {
  const QR_ID = '51902049935';

  it('rota el QR (reconexión rápida) mientras hay un consumidor activo', async () => {
    await subject.startSession(QR_ID);
    subject.markQRRequested(QR_ID); // Portal está polleando el QR
    currentSocket.ev.emit('connection.update', { qr: 'QR-1' });
    const socketsBefore = makeWASocket.mock.calls.length;

    await fireClose(408); // rotación normal de Baileys (QR refs agotados)
    await jest.advanceTimersByTimeAsync(10_000);

    expect(makeWASocket.mock.calls.length).toBe(socketsBefore + 1);
    expect(subject.isSessionParked(QR_ID)).toBe(false);
  });

  it('DETIENE el ciclo si nadie pidió el QR (no rota QRs en vano)', async () => {
    await subject.startSession(QR_ID); // sin markQRRequested: nadie mira el QR
    currentSocket.ev.emit('connection.update', { qr: 'QR-1' });
    const socketsBefore = makeWASocket.mock.calls.length;

    await fireClose(408);
    await jest.advanceTimersByTimeAsync(600_000);

    expect(makeWASocket.mock.calls.length).toBe(socketsBefore); // ni un socket más
    expect(subject.getSession(QR_ID)).toBeUndefined();
    expect(subject.isSessionReady(QR_ID)).toBe(false);
  });

  it('pair-success (515 con creds.me) abre la ventana linking y reconecta rápido', async () => {
    await subject.startSession(QR_ID);
    currentSocket.ev.emit('connection.update', { qr: 'QR-1' });
    currentCreds.me = { id: `${QR_ID}:33@s.whatsapp.net` }; // Baileys setea me al escanear
    const socketsBefore = makeWASocket.mock.calls.length;

    await fireClose(515); // restart required post-pairing

    expect(subject.isPairingLoginInProgress(QR_ID)).toBe(true);
    await jest.advanceTimersByTimeAsync(10_000); // reconexión rápida (sin backoff largo)
    expect(makeWASocket.mock.calls.length).toBe(socketsBefore + 1);
  });

  it('el primer login post-pairing recibe watchdog extendido (no muere a los 90s)', async () => {
    await subject.startSession(QR_ID);
    currentSocket.ev.emit('connection.update', { qr: 'QR-1' });
    currentCreds.me = { id: `${QR_ID}:33@s.whatsapp.net` };
    await fireClose(515);
    await jest.advanceTimersByTimeAsync(10_000); // socket del primer login creado
    const socketsAfterRelogin = makeWASocket.mock.calls.length;

    // Con watchdog normal (90s) ya habría matado el socket y creado otro.
    await jest.advanceTimersByTimeAsync(95_000);
    expect(makeWASocket.mock.calls.length).toBe(socketsAfterRelogin);
  });

  it('un open limpia la ventana linking', async () => {
    await subject.startSession(QR_ID);
    currentSocket.ev.emit('connection.update', { qr: 'QR-1' });
    currentCreds.me = { id: `${QR_ID}:33@s.whatsapp.net` };
    await fireClose(515);
    await jest.advanceTimersByTimeAsync(10_000);

    await fireOpen();

    expect(subject.isPairingLoginInProgress(QR_ID)).toBe(false);
    expect(subject.isSessionReady(QR_ID)).toBe(true);
  });
});

describe('requestPairingCodeForSession (sobre el ciclo endurecido)', () => {
  const PAIR_ID = '51902049935';

  it('devuelve el código y lo registra cuando el socket está en modo pairing', async () => {
    await subject.startSession(PAIR_ID);
    currentSocket.ev.emit('connection.update', { qr: 'QR-1' }); // modo pairing listo

    const code = await subject.requestPairingCodeForSession(PAIR_ID);

    expect(code).toBe('PAIR1234');
    expect(subject.getPairingCode(PAIR_ID)).toBe('PAIR1234');
    expect(currentSocket.requestPairingCode).toHaveBeenCalledWith(PAIR_ID);
  });

  it('sanea el número a solo dígitos (E.164 sin +/espacios/guiones)', async () => {
    await subject.startSession('51111111111');
    currentSocket.ev.emit('connection.update', { qr: 'QR-1' });

    // El caller puede mandar el número con formato; Baileys exige solo dígitos —
    // un número mal formado genera un código huérfano que nunca llega al teléfono.
    await subject.requestPairingCodeForSession('+51 111-111-111');

    expect(currentSocket.requestPairingCode).toHaveBeenCalledWith('51111111111');
  });

  it('rechaza si la sesión ya está conectada (hay que desconectar antes)', async () => {
    await subject.startSession(PAIR_ID);
    currentSocket.ev.emit('connection.update', { qr: 'QR-1' });
    await fireOpen();

    await expect(
      subject.requestPairingCodeForSession(PAIR_ID)
    ).rejects.toThrow(/emparejada o conectada/);
    expect(currentSocket.requestPairingCode).not.toHaveBeenCalled();
  });

  it('un open (código ingresado y login OK) invalida el pairing code registrado', async () => {
    await subject.startSession(PAIR_ID);
    currentSocket.ev.emit('connection.update', { qr: 'QR-1' });
    await subject.requestPairingCodeForSession(PAIR_ID);
    expect(subject.getPairingCode(PAIR_ID)).toBe('PAIR1234');

    await fireOpen();

    expect(subject.getPairingCode(PAIR_ID)).toBeUndefined();
  });
});

describe('reconnectDelayMs (backoff exponencial anti-throttle)', () => {
  // Jitter ±20% → cada intento se valida contra su rango [0.8x, 1.2x].
  const expectInRange = (actual: number, base: number) => {
    expect(actual).toBeGreaterThanOrEqual(base * 0.8);
    expect(actual).toBeLessThanOrEqual(base * 1.2);
  };

  it('primer intento es rápido (~3s) para cubrir cortes breves', () => {
    expectInRange(subject.reconnectDelayMs(1), 3_000);
  });

  it('duplica por intento (curva exponencial, no lineal)', () => {
    expectInRange(subject.reconnectDelayMs(2), 6_000);
    expectInRange(subject.reconnectDelayMs(5), 48_000);
    expectInRange(subject.reconnectDelayMs(8), 384_000);
  });

  it('capa en 10 min para intentos altos (no martillar el login)', () => {
    expectInRange(subject.reconnectDelayMs(10), 600_000);
    expectInRange(subject.reconnectDelayMs(50), 600_000);
  });

  it('tolera intentos <= 0 sin romperse (trata como intento 1)', () => {
    expectInRange(subject.reconnectDelayMs(0), 3_000);
    expectInRange(subject.reconnectDelayMs(-3), 3_000);
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
    expect(clearMongoAuthState).toHaveBeenCalledWith('51111111111');
    expect(clearStoreSnapshot).toHaveBeenCalledWith('51111111111');
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

describe('restartSession (soft restart — creds preserved)', () => {
  it('ends the old socket without logout and starts a fresh one', async () => {
    await subject.startSession('51111111111');
    const oldSocket = currentSocket;
    await subject.restartSession('51111111111');

    expect(oldSocket.end).toHaveBeenCalled();
    expect(oldSocket.logout).not.toHaveBeenCalled();
    // A new socket replaced the old one and the session stays registered.
    expect(subject.getSession('51111111111')).toBe(currentSocket);
    expect(currentSocket).not.toBe(oldSocket);
    expect(subject.listSessions()).toEqual(['51111111111']);
  });

  it('never wipes credentials (safe for shared senders)', async () => {
    await subject.startSession('51111111111');
    await subject.restartSession('51111111111');
    expect(clearMongoAuthState).not.toHaveBeenCalled();
  });

  it('allows auto-reconnect again after restart (shuttingDown cleared)', async () => {
    await subject.startSession('51111111111');
    await subject.restartSession('51111111111');
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    await fireClose(500);
    expect(setTimeoutSpy).toHaveBeenCalled();
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

describe('messaging-history.set handler (sync history into store)', () => {
  it('writes chats / contacts into the store and marks it dirty — but NOT messages', async () => {
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
    // Los mensajes NO se almacenan (evita el crecimiento ilimitado del store, ver
    // SCALABILITY-MULTI-SESSION.spec §3). Solo chats/contactos + markDirty.
    expect(fakeStore.messages.size).toBe(0);
    expect(fakeStore.markDirty).toHaveBeenCalled();
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
