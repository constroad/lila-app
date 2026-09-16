import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * El historial de la línea (Dali A14): cada conexión, caída, vinculación y
 * acción del panel queda en `whatsapp_session_events`. Registrar nunca puede
 * tumbar al socket (fire-and-forget), y leer devuelve lo más nuevo primero.
 */
const created: unknown[] = [];
let failCreate = false;
const fakeModel = {
  create: jest.fn(async (doc: unknown) => {
    if (failCreate) throw new Error('mongo caído');
    created.push(doc);
    return doc;
  }),
  find: jest.fn((filtro: unknown) => ({
    sort: () => ({ limit: () => ({ lean: async () => [{ sessionId: '51949376824', kind: 'connected', at: new Date('2026-09-15T13:00:00Z'), filtro }] }) }),
  })),
  countDocuments: jest.fn(async () => 2),
};
const models: Record<string, unknown> = {};
jest.unstable_mockModule('../../database/sharedConnection.js', () => ({
  __esModule: true,
  getSharedConnection: async () => ({ models, model: (name: string) => (models[name] = fakeModel) }),
}));
const warn = jest.fn();
jest.unstable_mockModule('../../utils/logger.js', () => ({ __esModule: true, default: { info: jest.fn(), warn, error: jest.fn() } }));

type Subject = typeof import('./session-events.js');
let subject: Subject;

beforeEach(async () => {
  jest.resetModules();
  created.length = 0;
  failCreate = false;
  warn.mockClear();
  subject = await import('./session-events.js');
});

describe('recordSessionEvent', () => {
  it('guarda el evento con la hora y el número de sesión, sin esperar al llamador', async () => {
    subject.recordSessionEvent({ sessionId: '51949376824', kind: 'disconnected', code: 428, detail: 'connection closed' });
    await new Promise((r) => setImmediate(r));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ sessionId: '51949376824', kind: 'disconnected', code: 428, detail: 'connection closed' });
    expect((created[0] as { at: Date }).at).toBeInstanceOf(Date);
  });

  it('si Mongo falla, avisa en el log y no lanza (el socket sigue como si nada)', async () => {
    failCreate = true;
    expect(() => subject.recordSessionEvent({ sessionId: '51949376824', kind: 'connected' })).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('mongo caído');
  });
});

describe('listSessionEvents / countSessionEvents', () => {
  it('lee los eventos de ESA sesión desde una fecha, los más nuevos primero', async () => {
    const eventos = await subject.listSessionEvents('51949376824', { sinceMs: Date.parse('2026-09-08T00:00:00Z'), limit: 20 });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].kind).toBe('connected');
    const filtro = (eventos[0] as unknown as { filtro: { sessionId: string; at: { $gte: Date } } }).filtro;
    expect(filtro.sessionId).toBe('51949376824');
    expect(filtro.at.$gte.toISOString()).toBe('2026-09-08T00:00:00.000Z');
  });

  it('cuenta por empresa y tipo desde una fecha (los envíos fallidos de hoy)', async () => {
    const n = await subject.countSessionEvents({ companyId: 'constroad', kind: 'send-failed', sinceMs: Date.parse('2026-09-15T05:00:00Z') });
    expect(n).toBe(2);
    expect(fakeModel.countDocuments).toHaveBeenCalledWith({ companyId: 'constroad', kind: 'send-failed', at: { $gte: new Date('2026-09-15T05:00:00Z') } });
  });
});
