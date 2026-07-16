/**
 * Guards de modo send-proxy en los handlers de sesión (incidente 2026-07-13):
 * /clear en una instancia dev con proxy activo borraba las creds de PRODUCCIÓN
 * (Mongo compartido whatsapp_auth). clear y disconnect deben responder 409 en
 * modo proxy, igual que create/QR/pairing, sin tocar el estado compartido.
 */
import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals';

const isWhatsAppProxyMode = jest.fn(() => false);
const clearSession = jest.fn(async () => undefined);
const disconnectSession = jest.fn(async () => undefined);

jest.unstable_mockModule('../../whatsapp/baileys/sessions.simple.js', () => ({
  __esModule: true,
  startSession: jest.fn(),
  requestPairingCodeForSession: jest.fn(async () => 'PAIR1234'),
  getQRCode: jest.fn(),
  getQRCodeGeneratedAt: jest.fn(),
  isSessionReady: jest.fn(() => false),
  isSessionParked: jest.fn(() => false),
  isPairingLoginInProgress: jest.fn(() => false),
  markQRRequested: jest.fn(),
  listSessions: jest.fn(() => []),
  disconnectSession,
  clearSession,
  restartSession: jest.fn(),
  getSession: jest.fn(),
}));

jest.unstable_mockModule('../../services/whatsapp-direct.service.js', () => ({
  __esModule: true,
  WhatsAppDirectService: {},
}));

jest.unstable_mockModule('../../services/whatsapp-proxy.service.js', () => ({
  __esModule: true,
  isWhatsAppProxyMode,
  // El controller decide por sender (excepción local-only); en estos tests el
  // sender no está en WHATSAPP_LOCAL_SESSIONS, así que equivale al modo global.
  isProxiedSender: isWhatsAppProxyMode,
  proxySessionRead: jest.fn(),
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('qrcode', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn(async () => 'data:image/png;base64,xxx') },
}));

type Subject = typeof import('./session.controller.simple.js');
let subject: Subject;

beforeAll(async () => {
  subject = await import('./session.controller.simple.js');
});

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeReq = (phoneNumber?: string) => ({ params: { phoneNumber }, query: {} }) as any;

beforeEach(() => {
  isWhatsAppProxyMode.mockReturnValue(false);
  clearSession.mockClear();
  disconnectSession.mockClear();
});

describe('clearSessionHandler — guard de proxy (protege creds de prod)', () => {
  it('responds 409 and does NOT clear when the send-proxy is active', async () => {
    isWhatsAppProxyMode.mockReturnValue(true);
    const next = jest.fn();

    await subject.clearSessionHandler(makeReq('51902049935'), makeRes(), next);

    expect(clearSession).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0] as any;
    expect(error.statusCode).toBe(409);
    expect(String(error.message)).toMatch(/proxy/i);
  });

  it('clears the session normally when the proxy is off', async () => {
    const res = makeRes();
    const next = jest.fn();

    await subject.clearSessionHandler(makeReq('51902049935'), res, next);

    expect(clearSession).toHaveBeenCalledWith('51902049935');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('responds 400 when phoneNumber is missing (antes del guard)', async () => {
    const next = jest.fn();

    await subject.clearSessionHandler(makeReq(undefined), makeRes(), next);

    expect(clearSession).not.toHaveBeenCalled();
    expect((next.mock.calls[0][0] as any).statusCode).toBe(400);
  });
});

describe('disconnectSessionHandler — guard de proxy', () => {
  it('responds 409 and does NOT disconnect when the send-proxy is active', async () => {
    isWhatsAppProxyMode.mockReturnValue(true);
    const next = jest.fn();

    await subject.disconnectSessionHandler(makeReq('51902049935'), makeRes(), next);

    expect(disconnectSession).not.toHaveBeenCalled();
    expect((next.mock.calls[0][0] as any).statusCode).toBe(409);
  });

  it('disconnects normally when the proxy is off', async () => {
    const res = makeRes();
    const next = jest.fn();

    await subject.disconnectSessionHandler(makeReq('51902049935'), res, next);

    expect(disconnectSession).toHaveBeenCalledWith('51902049935');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
