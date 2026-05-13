import { describe, it, expect, jest } from '@jest/globals';

const stub = jest.fn(() => undefined);

jest.unstable_mockModule('../controllers/session.controller.simple.js', () => ({
  __esModule: true,
  listActiveSessions: stub,
  createSession: stub,
  getQRCodeImage: stub,
  createPairingSessionHandler: stub,
  getSessionStatus: stub,
  logoutSession: stub,
  clearSession: stub,
  getGroupList: stub,
  syncGroups: stub,
  getContactsHandler: stub,
  disconnectSession: stub,
  getAllSessions: stub,
}));

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { name: string; handle: (...args: unknown[]) => unknown }[];
  };
};

const findRoute = (
  stack: Layer[],
  method: string,
  path: string
): Layer['route'] | undefined =>
  stack
    .map((l) => l.route)
    .find(
      (r) =>
        r &&
        r.path === path &&
        r.methods[method.toLowerCase()] === true
    );

const hasMiddlewareNamed = (route: NonNullable<Layer['route']>, name: string) =>
  route.stack.some((s) => s.name === name);

describe('session.routes — middleware wiring', () => {
  it('applies validateApiKey to all destructive / state-changing endpoints', async () => {
    const mod = await import('./session.routes.js');
    const stack = (mod.default as unknown as { stack: Layer[] }).stack;

    const PROTECTED = [
      { method: 'post', path: '/' },
      { method: 'get', path: '/:phoneNumber/qr' },
      { method: 'post', path: '/:phoneNumber/request-pairing-code' },
      { method: 'post', path: '/:phoneNumber/logout' },
      { method: 'post', path: '/:phoneNumber/clear' },
      { method: 'get', path: '/:phoneNumber/syncGroups' },
      { method: 'delete', path: '/:phoneNumber' },
    ];

    for (const { method, path } of PROTECTED) {
      const route = findRoute(stack, method, path);
      expect(route).toBeDefined();
      expect(hasMiddlewareNamed(route!, 'validateApiKey')).toBe(true);
    }
  });

  it('keeps read-only endpoints open (status quo, no breaking change)', async () => {
    const mod = await import('./session.routes.js');
    const stack = (mod.default as unknown as { stack: Layer[] }).stack;

    const OPEN = [
      { method: 'get', path: '/list' },
      { method: 'get', path: '/:phoneNumber/status' },
      { method: 'get', path: '/:phoneNumber/groups' },
      { method: 'get', path: '/:phoneNumber/contacts' },
      { method: 'get', path: '/' },
    ];

    for (const { method, path } of OPEN) {
      const route = findRoute(stack, method, path);
      expect(route).toBeDefined();
      expect(hasMiddlewareNamed(route!, 'validateApiKey')).toBe(false);
    }
  });
});
