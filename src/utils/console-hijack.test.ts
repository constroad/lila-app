import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Forma real del objeto que libsignal vuelca en node_modules/libsignal/src/session_record.js:273
// (`console.info("Closing session:", session)`). Contiene material criptográfico en claro.
const SESSION_ENTRY = {
  _chains: {
    'BSScL2Hv9SAYiXQm69L6PPyZI4VZTrJO98NbUGQKMf9/': {
      chainKey: { key: Buffer.from('deadbeef', 'hex') },
      chainType: 2,
    },
  },
  registrationId: 1340024216,
  currentRatchet: {
    ephemeralKeyPair: { privKey: Buffer.from('805fd06bb98a9f9d', 'hex') },
    rootKey: Buffer.from('3ae7cacc5b2fa2f6', 'hex'),
  },
  indexInfo: { baseKey: Buffer.from('05223eceb05f0581', 'hex') },
};

type Spies = Record<'log' | 'error' | 'info' | 'warn' | 'debug', jest.Mock>;

describe('console-hijack: ningún método de consola filtra material Signal', () => {
  let realConsole: Console;
  let spies: Spies;

  beforeEach(async () => {
    jest.resetModules();
    realConsole = global.console;
    spies = {
      log: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    // El hijack captura las referencias "originales" al importarse: dándole estos spies
    // como originales, todo lo que NO filtre queda observable aquí.
    global.console = { ...realConsole, ...spies } as unknown as Console;
    await import('./console-hijack.js');
    // El propio módulo loggea su banner de activación al importarse.
    spies.log.mockClear();
  });

  afterEach(() => {
    global.console = realConsole;
  });

  // La regresión concreta: libsignal usa console.info, y `console.info` NO es un alias vivo
  // de `console.log` — es una propiedad aparte. Hijackear solo `console.log` dejaba pasar
  // 1396 volcados de SessionEntry (con privKey/rootKey) al log de producción.
  it.each(['info', 'log', 'warn', 'debug'] as const)(
    'console.%s descarta el volcado de SessionEntry',
    (method) => {
      console[method]('Closing session:', SESSION_ENTRY);
      expect(spies[method]).not.toHaveBeenCalled();
    }
  );

  it('console.error tampoco emite el objeto crudo (lo redacta)', () => {
    console.error('Closing session:', SESSION_ENTRY);
    const emitted = JSON.stringify(spies.error.mock.calls);
    expect(emitted).not.toContain('privKey');
    expect(emitted).not.toContain('rootKey');
    expect(emitted).not.toContain('_chains');
  });

  it.each(['info', 'log', 'warn', 'debug'] as const)(
    'console.%s deja pasar los logs normales (el filtro no es un mute global)',
    (method) => {
      console[method]('arrancando sesión 51999999999');
      expect(spies[method]).toHaveBeenCalledWith('arrancando sesión 51999999999');
    }
  );

  it('descarta el ruido de Signal aunque el objeto venga como texto ya formateado', () => {
    console.info('Closing session: SessionEntry { _chains: {...} }');
    expect(spies.info).not.toHaveBeenCalled();
  });
});
