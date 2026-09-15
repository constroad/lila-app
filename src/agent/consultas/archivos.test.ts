import { jest } from '@jest/globals';

/**
 * EL ENLACE DEL CLIENTE: leerlo si existe, crearlo si no. Crear es la única
 * escritura del agente a pedido de una persona (15/09), y tiene que producir
 * EXACTAMENTE el documento que Portal crea en `POST /api/public-link`: mismo
 * scope, mismo tipo, token de 64 hex, `permissions.tabs` con resumen y
 * producción siempre. El modelo se simula: acá no se toca ninguna base.
 */
const creados: Array<Record<string, unknown>> = [];
let existente: Record<string, unknown> | null = null;
jest.unstable_mockModule('../../database/models.js', () => ({
  __esModule: true,
  getPublicLinkModel: async () => ({
    findOne: () => ({ select: () => ({ sort: () => ({ lean: async () => existente }) }) }),
    create: async (doc: Record<string, unknown>) => {
      creados.push(doc);
      return { toObject: () => ({ ...doc, _id: 'nuevo' }) };
    },
  }),
  getMediaModel: async () => ({}),
  getServiceReportModel: async () => ({}),
}));

type Subject = typeof import('./archivos.js');
let archivos: Subject;
beforeAll(async () => {
  archivos = await import('./archivos.js');
});
beforeEach(() => {
  creados.length = 0;
  existente = null;
});

describe('enlace del cliente', () => {
  it('si existe y no venció, se pasa con sus pestañas', async () => {
    existente = { token: 'abc', permissions: { view: true, tabs: { summary: true, production: true, placement: false, reports: true } } };
    const enlace = await archivos.enlaceDelPedido('globofas-s8k', 'o1', 'globofast');
    expect(enlace).toEqual({ url: 'https://www.constroad.com/public/globofast/client-report/order?token=abc', tabs: ['summary', 'production', 'reports'] });
    expect(creados).toHaveLength(0);
  });

  it('vencido cuenta como que no hay', async () => {
    existente = { token: 'abc', expiresAt: '2026-01-01T00:00:00.000Z', permissions: {} };
    expect(await archivos.enlaceDelPedido('globofas-s8k', 'o1', 'globofast')).toBeNull();
  });

  it('crear escribe el mismo documento que Portal: público, sin vencimiento, producción siempre', async () => {
    const enlace = await archivos.crearEnlaceDelPedido('constroad', 'o2', 'constroad', { placement: true, reports: false }, '268074678808755@lid');
    expect(creados).toHaveLength(1);
    const doc = creados[0];
    expect(doc).toMatchObject({
      companyId: 'constroad',
      scope: 'client-report',
      resourceType: 'order',
      resourceId: 'o2',
      expirationPolicy: 'indefinite',
      permissions: { view: true, tabs: { summary: true, production: true, placement: true, reports: false } },
      createdBy: 'lila:268074678808755@lid',
    });
    expect(String(doc.token)).toMatch(/^[0-9a-f]{64}$/); // 32 bytes, como `generateSecureToken` de Portal
    expect(doc.expiresAt).toBeUndefined();
    expect(enlace.url).toBe(`https://www.constroad.com/public/constroad/client-report/order?token=${doc.token}`);
    expect(enlace.tabs).toEqual(['summary', 'production', 'placement']);
  });

  it('cada enlace lleva su propio token', async () => {
    const a = await archivos.crearEnlaceDelPedido('constroad', 'o2', 'constroad', { placement: false, reports: false }, 'x');
    const b = await archivos.crearEnlaceDelPedido('constroad', 'o2', 'constroad', { placement: false, reports: false }, 'x');
    expect(a.url).not.toBe(b.url);
  });
});
