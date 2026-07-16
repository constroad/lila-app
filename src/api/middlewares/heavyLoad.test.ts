import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

// `config/environment` usa import.meta (rompe bajo ts-jest) y `logger` toca disco;
// se mockean como en el resto de la suite. `heavyLoad` se importa dinámicamente
// DESPUÉS de registrar los mocks (requisito del mocking ESM de jest).
jest.unstable_mockModule('../../config/environment.js', () => ({
  __esModule: true,
  config: {
    nodeEnv: 'test',
    security: {
      jwtSecret: 'x',
      rateLimitMax: 200,
      sessionRateMax: 10,
      jobsRateMax: 10,
      messageRateMax: 10,
    },
  },
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

type FakeRes = Response & {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string>;
  finish: () => void;
};

let heavyRequestGuard: (req: Request, res: Response, next: NextFunction) => void;

beforeAll(async () => {
  heavyRequestGuard = (await import('./heavyLoad.js')).heavyRequestGuard;
});

const makeReq = (): Request =>
  ({ originalUrl: '/api/documents/generate', headers: {} } as unknown as Request);

const makeRes = (): FakeRes => {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    headers: {},
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    on(event: string, cb: () => void) {
      (listeners[event] ||= []).push(cb);
      return this;
    },
    // Simula el cierre de la respuesta (dispara la liberación del slot).
    finish() {
      (listeners['finish'] || []).forEach((cb) => cb());
    },
  } as unknown as FakeRes;
};

/** Admite `count` requests seguidos; devuelve los res para poder liberarlos. */
const admit = (count: number) => {
  const results: Array<{ res: FakeRes; nextCalled: boolean }> = [];
  for (let i = 0; i < count; i += 1) {
    const res = makeRes();
    const next = jest.fn() as NextFunction;
    heavyRequestGuard(makeReq(), res, next);
    results.push({ res, nextCalled: (next as jest.Mock).mock.calls.length > 0 });
  }
  return results;
};

// HEAVY_MAX_INFLIGHT default = 12 (no se setea env en el runner).
const CAP = 12;

describe('heavyRequestGuard', () => {
  it('admite mientras hay capacidad y libera el slot al cerrar', () => {
    const first = admit(1)[0];
    expect(first.nextCalled).toBe(true);
    expect(first.res.statusCode).toBeUndefined();
    first.res.finish(); // liberar (contador es module-level)
  });

  it('responde 503 con Retry-After al saturar y se recupera al liberar', () => {
    const held = admit(CAP);
    expect(held.every((entry) => entry.nextCalled)).toBe(true);

    const overflowRes = makeRes();
    const overflowNext = jest.fn() as NextFunction;
    heavyRequestGuard(makeReq(), overflowRes, overflowNext);

    expect(overflowNext).not.toHaveBeenCalled();
    expect(overflowRes.statusCode).toBe(503);
    expect(overflowRes.headers['Retry-After']).toBe('15');

    held[0].res.finish(); // liberar un slot
    const recovered = admit(1)[0];
    expect(recovered.nextCalled).toBe(true);
    expect(recovered.res.statusCode).toBeUndefined();

    held.slice(1).forEach((entry) => entry.res.finish());
    recovered.res.finish();
  });

  it('no libera dos veces el mismo slot (finish idempotente)', () => {
    const entry = admit(1)[0];
    entry.res.finish();
    entry.res.finish(); // segundo disparo no debe restar de nuevo

    const held = admit(CAP);
    expect(held.every((h) => h.nextCalled)).toBe(true);
    held.forEach((h) => h.res.finish());
  });
});
