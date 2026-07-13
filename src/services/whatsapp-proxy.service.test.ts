import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

// Config mutable por test: el service lee las propiedades en cada llamada.
const mockConfig = {
  nodeEnv: 'development',
  whatsapp: { proxyTargetUrl: 'https://prod.example/api' },
  security: { jwtSecret: 'test-secret' },
};

const loggerWarn = jest.fn();
const loggerInfo = jest.fn();
const getCompanyByWhatsappSender = jest.fn(
  async (_sender: string): Promise<{ companyId: string } | null> => ({
    companyId: 'COMP-001',
  })
);

jest.unstable_mockModule('../config/environment.js', () => ({
  __esModule: true,
  config: mockConfig,
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  __esModule: true,
  default: { info: loggerInfo, warn: loggerWarn, error: jest.fn() },
}));

jest.unstable_mockModule('./quota-validator.service.js', () => ({
  __esModule: true,
  quotaValidatorService: { getCompanyByWhatsappSender },
}));

const resolveFileBufferMock = jest.fn<
  (params: {
    companyId: string;
    filePath?: string;
    fileUrl?: string;
    mimeType?: string;
    fileName?: string;
  }) => Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null>
>(async () => null);

jest.unstable_mockModule('./whatsapp-media.utils.js', () => ({
  __esModule: true,
  resolveFileBuffer: resolveFileBufferMock,
}));

const fetchMock = jest.fn<typeof fetch>();
global.fetch = fetchMock as typeof fetch;

const fakeResponse = (status: number, jsonBody: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(jsonBody),
  }) as unknown as Response;

// NO usar jest.resetModules(): borra el registro de unstable_mockModule y el
// import cargaría el environment real (import.meta rompe bajo el transform CJS).
// El módulo se comparte entre tests; sus flags module-level solo afectan logs.
const loadSubject = async () => import('./whatsapp-proxy.service.js');

beforeEach(() => {
  fetchMock.mockReset();
  loggerWarn.mockClear();
  loggerInfo.mockClear();
  getCompanyByWhatsappSender.mockClear();
  getCompanyByWhatsappSender.mockResolvedValue({ companyId: 'COMP-001' });
  resolveFileBufferMock.mockReset();
  resolveFileBufferMock.mockResolvedValue(null);
  mockConfig.nodeEnv = 'development';
  mockConfig.whatsapp.proxyTargetUrl = 'https://prod.example/api';
});

describe('isWhatsAppProxyMode', () => {
  it('es false sin WHATSAPP_PROXY_TARGET_URL', async () => {
    mockConfig.whatsapp.proxyTargetUrl = '';
    const { isWhatsAppProxyMode } = await loadSubject();

    expect(isWhatsAppProxyMode()).toBe(false);
  });

  it('se IGNORA con warning en producción aunque la URL esté seteada', async () => {
    mockConfig.nodeEnv = 'production';
    const { isWhatsAppProxyMode } = await loadSubject();

    expect(isWhatsAppProxyMode()).toBe(false);
    expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('IGNORADA'));
  });

  it('es true en dev con URL seteada', async () => {
    const { isWhatsAppProxyMode } = await loadSubject();

    expect(isWhatsAppProxyMode()).toBe(true);
  });
});

describe('proxyTextMessage', () => {
  it('envía a /message/:sender/text con JWT del CAMPO companyId y mapea la respuesta', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { success: true, messageId: 'MSG-1', timestamp: 1234 }));
    const { proxyTextMessage } = await loadSubject();

    const result = await proxyTextMessage('51902049935', '51999888777', 'hola');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://prod.example/api/message/51902049935/text');
    expect(JSON.parse(String(init.body))).toEqual({ to: '51999888777', message: 'hola' });
    const authHeader = (init.headers as Record<string, string>).Authorization;
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), 'test-secret') as { companyId: string };
    expect(decoded.companyId).toBe('COMP-001'); // campo del schema, NO _id de Mongo
    expect(result).toEqual({ key: { id: 'MSG-1' }, messageTimestamp: 1234 });
  });

  it('mapea 202 de prod (sesión no lista, encolado allá) a { queued: true }', async () => {
    fetchMock.mockResolvedValue(fakeResponse(202, { success: true, queued: true }));
    const { proxyTextMessage } = await loadSubject();

    const result = await proxyTextMessage('51902049935', '51999888777', 'hola');

    expect(result).toEqual({ queued: true });
  });

  it('lanza error legible con status y mensaje cuando prod responde no-2xx', async () => {
    fetchMock.mockResolvedValue(fakeResponse(403, { error: { message: 'El sender no pertenece a la empresa autenticada' } }));
    const { proxyTextMessage } = await loadSubject();

    await expect(proxyTextMessage('51902049935', '519', 'x')).rejects.toThrow(
      /403.*sender no pertenece/
    );
  });

  it('lanza error si el sender no tiene company activa (no hay con qué autenticar)', async () => {
    getCompanyByWhatsappSender.mockResolvedValue(null);
    const { proxyTextMessage } = await loadSubject();

    await expect(proxyTextMessage('000', '519', 'x')).rejects.toThrow(/sin company activa/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('proxySessionRead', () => {
  it('lee grupos desde /sessions/:sender/groups con JWT y devuelve el body tal cual', async () => {
    const prodGroups = [{ id: '123@g.us', subject: 'Obra Norte' }];
    fetchMock.mockResolvedValue(fakeResponse(200, prodGroups));
    const { proxySessionRead } = await loadSubject();

    const result = await proxySessionRead('51902049935', 'groups');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://prod.example/api/sessions/51902049935/groups');
    const authHeader = (init.headers as Record<string, string>).Authorization;
    expect(authHeader).toMatch(/^Bearer /);
    expect(result).toEqual(prodGroups);
  });

  it('propaga el statusCode de prod para que el errorHandler local espeje el status', async () => {
    fetchMock.mockResolvedValue(fakeResponse(503, { error: { message: 'Session not connected' } }));
    const { proxySessionRead } = await loadSubject();

    await expect(proxySessionRead('51902049935', 'contacts')).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('503'),
    });
  });
});

describe('proxyMediaMessage', () => {
  it('buffer local viaja como multipart con fileName/mimeType en el file part', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { success: true }));
    const { proxyMediaMessage } = await loadSubject();

    const result = await proxyMediaMessage('file', '51902049935', '51999888777', {
      buffer: Buffer.from('%PDF-fake'),
      fileName: 'vale.pdf',
      mimeType: 'application/pdf',
      caption: 'Vale de despacho',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://prod.example/api/message/51902049935/file');
    const form = init.body as FormData;
    expect(form.get('to')).toBe('51999888777');
    expect(form.get('caption')).toBe('Vale de despacho');
    const filePart = form.get('file') as File;
    expect(filePart.name).toBe('vale.pdf');
    expect(filePart.type).toBe('application/pdf');
    expect(result).toEqual({ success: true });
  });

  it('filePath/fileUrl se reenvían como JSON sin resolver localmente', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { success: true }));
    const { proxyMediaMessage } = await loadSubject();

    await proxyMediaMessage('image', '51902049935', '51999888777', {
      fileUrl: 'https://storage.example/foto.jpg',
      caption: 'Evidencia',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://prod.example/api/message/51902049935/image');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: '51999888777',
      fileUrl: 'https://storage.example/foto.jpg',
      caption: 'Evidencia',
    });
  });

  it('sin buffer, filePath ni fileUrl lanza error', async () => {
    const { proxyMediaMessage } = await loadSubject();

    await expect(
      proxyMediaMessage('video', '51902049935', '519', {})
    ).rejects.toThrow(/buffer, filePath o fileUrl/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('filePath del storage LOCAL se resuelve a buffer y viaja multipart (fix vale PDF)', async () => {
    resolveFileBufferMock.mockResolvedValue({
      buffer: Buffer.from('%PDF-vale'),
      mimeType: 'application/pdf',
      fileName: 'vale-despacho.pdf',
    });
    fetchMock.mockResolvedValue(fakeResponse(200, { success: true }));
    const { proxyMediaMessage } = await loadSubject();

    await proxyMediaMessage('file', '51902049935', '51999888777', {
      companyId: 'test',
      filePath: 'dispatches/vales/nro-2026/vale.pdf',
      caption: 'Tu vale de despacho',
    });

    expect(resolveFileBufferMock).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'test', filePath: 'dispatches/vales/nro-2026/vale.pdf' })
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    const filePart = form.get('file') as File;
    expect(filePart.name).toBe('vale-despacho.pdf');
    expect(filePart.type).toBe('application/pdf');
    // El JSON con path local NUNCA debe llegar a prod (allá no existe el archivo).
    expect(form.get('filePath')).toBeNull();
  });

  it('fileUrl del storage LOCAL se resuelve a buffer y viaja multipart (fix fotos de informe)', async () => {
    resolveFileBufferMock.mockResolvedValue({
      buffer: Buffer.from('img-bytes'),
      mimeType: 'image/jpeg',
      fileName: 'image_1783964110426.jpg',
    });
    fetchMock.mockResolvedValue(fakeResponse(200, { success: true }));
    const { proxyMediaMessage } = await loadSubject();

    await proxyMediaMessage('image', '51902049935', '120363376500470254@g.us', {
      companyId: 'test',
      // URL absoluta al storage LOCAL de dev (lo que manda Portal).
      fileUrl: 'http://localhost:3001/files/companies/test/services/x/panelFotografico/image_1783964110426.jpg',
      caption: 'Unidad ABC-123',
    });

    expect(resolveFileBufferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'test',
        fileUrl:
          'http://localhost:3001/files/companies/test/services/x/panelFotografico/image_1783964110426.jpg',
      })
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    const filePart = form.get('file') as File;
    expect(filePart.type).toBe('image/jpeg');
    // El fileUrl local NUNCA debe llegar a prod como JSON.
    expect(form.get('fileUrl')).toBeNull();
  });

  it('fileUrl EXTERNO (resolveFileBuffer→null) se reenvía como JSON para que prod lo descargue', async () => {
    resolveFileBufferMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(fakeResponse(200, { success: true }));
    const { proxyMediaMessage } = await loadSubject();

    await proxyMediaMessage('image', '51902049935', '51999888777', {
      companyId: 'test',
      fileUrl: 'https://cdn.externo.com/foto.jpg',
      caption: 'Evidencia',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toMatchObject({
      fileUrl: 'https://cdn.externo.com/foto.jpg',
    });
  });

  it('filePath que NO resuelve localmente cae al contrato JSON con warning', async () => {
    resolveFileBufferMock.mockRejectedValue(new Error('File not found'));
    fetchMock.mockResolvedValue(fakeResponse(200, { success: true }));
    const { proxyMediaMessage } = await loadSubject();

    await proxyMediaMessage('file', '51902049935', '51999888777', {
      companyId: 'test',
      filePath: 'reports/informe-prod-only.pdf',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toMatchObject({
      filePath: 'reports/informe-prod-only.pdf',
    });
    expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('no resolvió'));
  });
});
