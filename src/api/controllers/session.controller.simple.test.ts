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
const startSession = jest.fn(async () => ({}));
const getQRCode = jest.fn((_id: string): string | undefined => undefined);
const isSessionReady = jest.fn(() => false);
const isPairingLoginInProgress = jest.fn(() => false);
const markQRRequested = jest.fn();
const getSession = jest.fn((_id: string): unknown => undefined);

jest.unstable_mockModule('../../whatsapp/baileys/sessions.simple.js', () => ({
  __esModule: true,
  startSession,
  requestPairingCodeForSession: jest.fn(async () => 'PAIR1234'),
  getQRCode,
  getQRCodeGeneratedAt: jest.fn(() => 1_700_000_000_000),
  isSessionReady,
  isSessionParked: jest.fn(() => false),
  isPairingLoginInProgress,
  markQRRequested,
  listSessions: jest.fn(() => []),
  disconnectSession,
  clearSession,
  restartSession: jest.fn(),
  getSession,
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
  startSession.mockClear();
  markQRRequested.mockClear();
  getQRCode.mockReturnValue(undefined);
  isSessionReady.mockReturnValue(false);
  isPairingLoginInProgress.mockReturnValue(false);
  getSession.mockReturnValue(undefined);
});

/**
 * `resolveQrState` es el núcleo del emparejamiento que comparten Portal (GET /qr) y
 * el panel Dali (A14): marca al consumidor, levanta la sesión si no existe y dice en
 * qué está (conectada / vinculando / esperando QR / el QR como imagen).
 */
describe('resolveQrState — el estado del emparejamiento, compartido con Dali', () => {
  it('sesión conectada: no la toca y dice «connected» sin QR', async () => {
    getSession.mockReturnValue({});
    isSessionReady.mockReturnValue(true);
    const estado = await subject.resolveQrState('51949376824');
    expect(estado).toEqual({ status: 'connected', qr: null, qrImage: null });
    expect(startSession).not.toHaveBeenCalled();
    expect(markQRRequested).toHaveBeenCalledWith('51949376824');
  });

  it('sin sesión: la levanta y devuelve el QR como imagen cuando Baileys ya lo emitió', async () => {
    getQRCode.mockReturnValue('2@abc');
    const estado = await subject.resolveQrState('51949376824');
    expect(startSession).toHaveBeenCalledWith('51949376824', expect.any(Function));
    expect(estado).toEqual({ status: 'waiting_qr', qr: '2@abc', qrImage: 'data:image/png;base64,xxx', qrGeneratedAt: 1_700_000_000_000 });
  });

  it('si la sesión no se puede levantar (sin lease, proxy), lo dice en `startError` en vez de «connecting» para siempre', async () => {
    startSession.mockRejectedValueOnce(new Error('Esta instancia no posee el lease de sockets WhatsApp'));
    const estado = await subject.resolveQrState('51949376824');
    expect(estado.status).toBe('connecting');
    expect(estado.startError).toContain('no posee el lease');
    // Con la sesión ya viva, el error viejo se olvida.
    getSession.mockReturnValue({});
    isSessionReady.mockReturnValue(true);
    expect((await subject.resolveQrState('51949376824')).startError).toBeUndefined();
  });

  it('QR ya escaneado (primer login en curso): «linking», sin esperar un QR nuevo', async () => {
    getSession.mockReturnValue({});
    isPairingLoginInProgress.mockReturnValue(true);
    const estado = await subject.resolveQrState('51949376824');
    expect(estado).toEqual({ status: 'linking', qr: null, qrImage: null });
    expect(startSession).not.toHaveBeenCalled();
  });
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
