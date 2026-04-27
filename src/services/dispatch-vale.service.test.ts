export {};

jest.mock('../config/environment.js', () => ({
  config: {
    portal: { baseUrl: 'https://portal.constroad.com' },
    security: { jwtSecret: 'secret' },
    telegram: {
      botToken: 'telegram-token',
      errorsChatId: '-100errors',
    },
  },
}));

jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('axios');
jest.mock('../database/models.js', () => ({
  getCompanyModel: jest.fn(),
}));
jest.mock('./dispatch-note-document.service.js', () => ({
  generateDispatchNoteDocumentFile: jest.fn(),
}));
jest.mock('./whatsapp-direct.service.js', () => ({
  WhatsAppDirectService: {
    sendDocument: jest.fn(),
    sendMessage: jest.fn(),
  },
}));
jest.mock('./telegram-alert.service.js', () => ({
  sendTelegramAlert: jest.fn().mockResolvedValue(true),
}));
jest.mock('./dispatch-vale-payload.service.js', () => ({
  buildDispatchValePayloadFromPortal: jest.fn(),
}));
jest.mock('../models/dispatch-vale-run.model.js', () => ({
  getDispatchValeRunModel: jest.fn(),
}));

const axios = require('axios');
const { getCompanyModel } = require('../database/models.js');
const { getDispatchValeRunModel } = require('../models/dispatch-vale-run.model.js');
const { generateDispatchNoteDocumentFile } = require('./dispatch-note-document.service.js');
const {
  enqueueDispatchValeWorkflow,
  generateDispatchValeWorkflow,
  validateDispatchValeWorkflowInput,
} = require('./dispatch-vale.service.js');
const { runPublicReceptionWorkflow } = require('../api/controllers/public.controller.js');
const { sendTelegramAlert } = require('./telegram-alert.service.js');
const { WhatsAppDirectService } = require('./whatsapp-direct.service.js');
const { normalizeWhatsAppPhoneNumber } = require('../utils/whatsapp-phone.js');
const { buildDispatchValePayloadFromPortal } = require('./dispatch-vale-payload.service.js');

describe('generateDispatchValeWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDispatchValeRunModel.mockResolvedValue({
      findOneAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          attempts: 1,
          companyId: 'constroad',
          dispatchId: 'dispatch-1',
          status: 'running',
        }),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    });
  });

  it('registers media and sends document plus location when whatsapp is enabled', async () => {
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        name: 'ConstRoad',
        whatsappConfig: { sender: '51911111111' },
      }),
    });
    getCompanyModel.mockResolvedValue({ findOne });
    generateDispatchNoteDocumentFile.mockResolvedValue({
      pdfUrl: '/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      pdfUrlAbsolute: 'https://lila.constroad.com/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      totalPages: 1,
      sizeBytes: 4096,
      relativeDir: 'vales/nro-2026',
      fileName: 'vale unidad 1.pdf',
      filePath: 'dispatches/vales/nro-2026/file.pdf',
    });
    axios.post.mockResolvedValue({
      data: {
        media: { _id: 'media-1', url: 'https://lila.constroad.com/file.pdf' },
        storage: { used: 1, limit: 10, percentage: 10, fileCount: 1 },
      },
    });
    WhatsAppDirectService.sendDocument.mockResolvedValue({ ok: true });
    WhatsAppDirectService.sendMessage.mockResolvedValue({ ok: true });

    const result = await generateDispatchValeWorkflow({
      companyId: 'constroad',
      baseUrl: 'https://lila.constroad.com',
      dispatchId: 'dispatch-1',
      orderId: 'order-1',
      note: 'Unidad 1',
      quantity: 15,
      sender: '51902049935',
      driverName: 'Juan Perez',
      driverPhoneNumber: '999888777',
      sendDriverPdf: true,
      orderLocation: '"https://maps.app.goo.gl/demo"',
      fileName: 'vale unidad 1.pdf',
      documentPayload: {
        schemaCode: 'DISPATCH-NOTE',
        orderNumber: '2026-001',
        schemaData: {},
      },
    });

    expect(generateDispatchNoteDocumentFile).toHaveBeenCalledWith({
      companyId: 'constroad',
      baseUrl: 'https://lila.constroad.com',
      payload: {
        schemaCode: 'DISPATCH-NOTE',
        orderNumber: '2026-001',
        schemaData: {},
      },
    });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(WhatsAppDirectService.sendDocument).toHaveBeenCalledWith(
      '51902049935',
      '51999888777',
      expect.objectContaining({
        companyId: 'constroad',
        filePath: 'dispatches/vales/nro-2026/file.pdf',
        fileName: 'vale unidad 1.pdf',
        queueOnFail: true,
      })
    );
    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledWith(
      '51902049935',
      '51999888777',
      expect.stringContaining('https://maps.app.goo.gl/demo'),
      { companyId: 'constroad', queueOnFail: true }
    );
    expect(result.whatsapp.fileSent).toBe(true);
    expect(result.whatsapp.locationSent).toBe(true);
    expect(result.media).toEqual({ _id: 'media-1', url: 'https://lila.constroad.com/file.pdf' });
  });

  it('still registers media when whatsapp delivery is disabled', async () => {
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        name: 'ConstRoad',
        whatsappConfig: { sender: '51999999999' },
      }),
    });
    getCompanyModel.mockResolvedValue({ findOne });
    generateDispatchNoteDocumentFile.mockResolvedValue({
      pdfUrl: '/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      pdfUrlAbsolute: 'https://lila.constroad.com/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      totalPages: 1,
      sizeBytes: 4096,
      relativeDir: 'vales/nro-2026',
      fileName: 'vale unidad 1.pdf',
      filePath: 'dispatches/vales/nro-2026/file.pdf',
    });
    axios.post.mockResolvedValue({
      data: {
        media: { _id: 'media-1' },
        storage: { used: 1, limit: 10, percentage: 10, fileCount: 1 },
      },
    });

    const result = await generateDispatchValeWorkflow({
      companyId: 'constroad',
      baseUrl: 'https://lila.constroad.com',
      dispatchId: 'dispatch-1',
      orderId: 'order-1',
      sendDriverPdf: false,
      documentPayload: {
        schemaCode: 'DISPATCH-NOTE',
        orderNumber: '2026-001',
        schemaData: {},
      },
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(WhatsAppDirectService.sendDocument).not.toHaveBeenCalled();
    expect(WhatsAppDirectService.sendMessage).not.toHaveBeenCalled();
    expect(result.whatsapp.skippedReason).toBe('sendDriverPdf disabled');
    expect(result.media).toEqual({ _id: 'media-1' });
  });

  it('does not mark whatsapp as sent when the message is only queued', async () => {
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        name: 'ConstRoad',
        whatsappConfig: { sender: '51902049935' },
      }),
    });
    getCompanyModel.mockResolvedValue({ findOne });
    generateDispatchNoteDocumentFile.mockResolvedValue({
      pdfUrl: '/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      pdfUrlAbsolute:
        'https://lila.constroad.com/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      totalPages: 1,
      sizeBytes: 4096,
      relativeDir: 'vales/nro-2026',
      fileName: 'vale unidad 1.pdf',
      filePath: 'dispatches/vales/nro-2026/file.pdf',
    });
    axios.post.mockResolvedValue({
      data: {
        media: { _id: 'media-1' },
        storage: { used: 1, limit: 10, percentage: 10, fileCount: 1 },
      },
    });
    WhatsAppDirectService.sendDocument.mockResolvedValue({ queued: true });
    WhatsAppDirectService.sendMessage.mockResolvedValue({ queued: true });

    const result = await generateDispatchValeWorkflow({
      companyId: 'constroad',
      baseUrl: 'https://lila.constroad.com',
      dispatchId: 'dispatch-1',
      orderId: 'order-1',
      driverPhoneNumber: '999888777',
      orderLocation: 'https://maps.app.goo.gl/demo',
      sendDriverPdf: true,
      documentPayload: {
        schemaCode: 'DISPATCH-NOTE',
        orderNumber: '2026-001',
        schemaData: {},
      },
    });

    expect(result.whatsapp.fileSent).toBe(false);
    expect(result.whatsapp.locationSent).toBe(false);
    expect(result.whatsapp.fileError).toBe('queued');
    expect(result.whatsapp.locationError).toBe('queued');
  });

  it('normalizes sender provided by portal during validation', () => {
    expect(
      validateDispatchValeWorkflowInput({
        companyId: 'constroad',
        baseUrl: 'https://lila.constroad.com',
        dispatchId: 'dispatch-1',
        sender: '+51 902 049 935',
      })
    ).toEqual({
      baseUrl: 'https://lila.constroad.com',
      companyId: 'constroad',
      dispatchId: 'dispatch-1',
      documentPayload: undefined,
      driverName: '',
      driverPhoneNumber: '',
      fileName: '',
      note: '',
      orderId: '',
      orderLocation: '',
      quantity: 0,
      sendDriverPdf: true,
      sender: '51902049935',
    });
  });

  it('normalizes Peruvian local mobile numbers before sending whatsapp', async () => {
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        name: 'ConstRoad',
        whatsappConfig: { sender: '51999999999' },
      }),
    });
    getCompanyModel.mockResolvedValue({ findOne });
    generateDispatchNoteDocumentFile.mockResolvedValue({
      pdfUrl: '/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      pdfUrlAbsolute: 'https://lila.constroad.com/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      totalPages: 1,
      sizeBytes: 4096,
      relativeDir: 'vales/nro-2026',
      fileName: 'vale unidad 1.pdf',
      filePath: 'dispatches/vales/nro-2026/file.pdf',
    });
    axios.post.mockResolvedValue({
      data: {
        media: { _id: 'media-1' },
        storage: { used: 1, limit: 10, percentage: 10, fileCount: 1 },
      },
    });
    WhatsAppDirectService.sendDocument.mockResolvedValue({ ok: true });

    await generateDispatchValeWorkflow({
      companyId: 'constroad',
      baseUrl: 'https://lila.constroad.com',
      dispatchId: 'dispatch-1',
      orderId: 'order-1',
      driverPhoneNumber: '981243514',
      sendDriverPdf: true,
      documentPayload: {
        schemaCode: 'DISPATCH-NOTE',
        orderNumber: '2026-001',
        schemaData: {},
      },
    });

    expect(WhatsAppDirectService.sendDocument).toHaveBeenCalledWith(
      '51999999999',
      '51981243514',
      expect.any(Object)
    );
  });

  it('does not block whatsapp delivery when portal media registration fails', async () => {
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        name: 'ConstRoad',
        whatsappConfig: { sender: '51999999999' },
      }),
    });
    getCompanyModel.mockResolvedValue({ findOne });
    generateDispatchNoteDocumentFile.mockResolvedValue({
      pdfUrl: '/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      pdfUrlAbsolute: 'https://lila.constroad.com/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      totalPages: 1,
      sizeBytes: 4096,
      relativeDir: 'vales/nro-2026',
      fileName: 'vale unidad 1.pdf',
      filePath: 'dispatches/vales/nro-2026/file.pdf',
    });
    axios.post.mockRejectedValue(new Error('portal unavailable'));
    WhatsAppDirectService.sendDocument.mockResolvedValue({ ok: true });

    const result = await generateDispatchValeWorkflow({
      companyId: 'constroad',
      baseUrl: 'https://lila.constroad.com',
      dispatchId: 'dispatch-1',
      orderId: 'order-1',
      driverPhoneNumber: '999888777',
      sendDriverPdf: true,
      documentPayload: {
        schemaCode: 'DISPATCH-NOTE',
        orderNumber: '2026-001',
        schemaData: {},
      },
    });

    expect(WhatsAppDirectService.sendDocument).toHaveBeenCalled();
    expect(result.whatsapp.fileSent).toBe(true);
    expect(result.media).toBeNull();
    expect(result.mediaRegistrationError).toBe('portal unavailable');
  });

  it('resolves the full vale payload in background when Portal only sends dispatchId', async () => {
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        name: 'ConstRoad',
        whatsappConfig: { sender: '51999999999' },
      }),
    });
    getCompanyModel.mockResolvedValue({ findOne });
    buildDispatchValePayloadFromPortal.mockResolvedValue({
      companyId: 'constroad',
      dispatchId: 'dispatch-1',
      orderId: 'order-1',
      note: 'Unidad 9',
      quantity: 18,
      driverName: 'Juan Perez',
      driverPhoneNumber: '981243514',
      sendDriverPdf: true,
      orderLocation: 'https://maps.app.goo.gl/demo',
      fileName: 'vale unidad 9.pdf',
      documentPayload: {
        schemaCode: 'DISPATCH-NOTE',
        orderNumber: '2026-009',
        schemaData: {},
      },
    });
    generateDispatchNoteDocumentFile.mockResolvedValue({
      pdfUrl: '/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      pdfUrlAbsolute: 'https://lila.constroad.com/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      totalPages: 1,
      sizeBytes: 4096,
      relativeDir: 'vales/nro-2026',
      fileName: 'vale unidad 9.pdf',
      filePath: 'dispatches/vales/nro-2026/file.pdf',
    });
    axios.post.mockResolvedValue({
      data: {
        media: { _id: 'media-1' },
        storage: { used: 1, limit: 10, percentage: 10, fileCount: 1 },
      },
    });
    WhatsAppDirectService.sendDocument.mockResolvedValue({ ok: true });
    WhatsAppDirectService.sendMessage.mockResolvedValue({ ok: true });

    const result = await generateDispatchValeWorkflow({
      companyId: 'constroad',
      baseUrl: 'https://lila.constroad.com',
      dispatchId: 'dispatch-1',
    });

    expect(buildDispatchValePayloadFromPortal).toHaveBeenCalledWith({
      companyId: 'constroad',
      dispatchId: 'dispatch-1',
    });
    expect(generateDispatchNoteDocumentFile).toHaveBeenCalledWith({
      companyId: 'constroad',
      baseUrl: 'https://lila.constroad.com',
      payload: expect.objectContaining({ orderNumber: '2026-009' }),
    });
    expect(WhatsAppDirectService.sendDocument).toHaveBeenCalledWith(
      '51999999999',
      '51981243514',
      expect.objectContaining({ fileName: 'vale unidad 9.pdf' })
    );
    expect(result.media).toEqual({ _id: 'media-1' });
  });

  it('falls back to the stable portal drive register route when the dedicated internal route returns 404', async () => {
    const findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        name: 'ConstRoad',
        whatsappConfig: { sender: '51999999999' },
      }),
    });
    getCompanyModel.mockResolvedValue({ findOne });
    generateDispatchNoteDocumentFile.mockResolvedValue({
      pdfUrl: '/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      pdfUrlAbsolute: 'https://lila.constroad.com/files/companies/constroad/dispatches/vales/nro-2026/file.pdf',
      totalPages: 1,
      sizeBytes: 4096,
      relativeDir: 'vales/nro-2026',
      fileName: 'vale unidad 1.pdf',
      filePath: 'dispatches/vales/nro-2026/file.pdf',
    });
    axios.post
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({
        data: {
          media: { _id: 'media-fallback' },
          storage: { used: 1, limit: 10, percentage: 10, fileCount: 1 },
        },
      });

    const result = await generateDispatchValeWorkflow({
      companyId: 'constroad',
      baseUrl: 'https://lila.constroad.com',
      dispatchId: 'dispatch-1',
      orderId: 'order-1',
      sendDriverPdf: false,
      documentPayload: {
        schemaCode: 'DISPATCH-NOTE',
        orderNumber: '2026-001',
        schemaData: {},
      },
    });

    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      'https://portal.constroad.com/api/internal/dispatches/vale-media',
      expect.any(Object),
      expect.any(Object)
    );
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      'https://portal.constroad.com/api/drive/register',
      expect.any(Object),
      expect.any(Object)
    );
    expect(result.media).toEqual({ _id: 'media-fallback' });
  });

  it('validates the minimum payload before enqueueing background work', () => {
    expect(() =>
      validateDispatchValeWorkflowInput({
        companyId: 'constroad',
        baseUrl: 'https://lila.constroad.com',
        dispatchId: '',
      })
    ).toThrow('dispatchId is required');
  });

  it('normalizes local dispatch phone numbers', () => {
    expect(normalizeWhatsAppPhoneNumber('981243514')).toBe('51981243514');
    expect(normalizeWhatsAppPhoneNumber('+51 981 243 514')).toBe('51981243514');
    expect(normalizeWhatsAppPhoneNumber('51981243514@s.whatsapp.net')).toBe(
      '51981243514@s.whatsapp.net'
    );
  });

  it('reports telegram alerts when the background workflow fails', async () => {
    const runner = jest.fn().mockRejectedValue(new Error('background failed'));
    const scheduled: Array<() => void> = [];

    enqueueDispatchValeWorkflow(
      validateDispatchValeWorkflowInput({
        companyId: 'constroad',
        baseUrl: 'https://lila.constroad.com',
        dispatchId: 'dispatch-1',
        orderId: 'order-1',
        documentPayload: {
          schemaCode: 'DISPATCH-NOTE',
          orderNumber: '2026-001',
          schemaData: {},
        },
      }),
      {
        persistRun: jest.fn().mockResolvedValue(undefined),
        runWorkflow: runner,
        notifyError: sendTelegramAlert,
        schedule: (fn) => scheduled.push(fn),
      }
    );

    expect(scheduled).toHaveLength(1);
    scheduled[0]();
    await new Promise((resolve) => setImmediate(resolve));

    expect(sendTelegramAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: expect.stringContaining('dispatch-vale:constroad:dispatch-1'),
        message: expect.stringContaining('background failed'),
      })
    );
  });

  it('resets vale run flags without conflicting update paths', async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    getDispatchValeRunModel.mockResolvedValue({
      findOneAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          attempts: 1,
          companyId: 'constroad',
          dispatchId: 'dispatch-1',
          status: 'running',
        }),
      }),
      updateOne,
    });

    const scheduled: Array<() => void> = [];

    enqueueDispatchValeWorkflow(
      validateDispatchValeWorkflowInput({
        companyId: 'constroad',
        baseUrl: 'https://lila.constroad.com',
        dispatchId: 'dispatch-1',
        orderId: 'order-1',
        documentPayload: {
          schemaCode: 'DISPATCH-NOTE',
          orderNumber: '2026-001',
          schemaData: {},
        },
      }),
      {
        runWorkflow: jest.fn().mockResolvedValue(null),
        notifyError: sendTelegramAlert,
        schedule: (fn) => scheduled.push(fn),
      }
    );

    expect(scheduled).toHaveLength(1);
    scheduled[0]();
    await new Promise((resolve) => setImmediate(resolve));

    expect(updateOne).toHaveBeenCalledWith(
      {
        companyId: 'constroad',
        dispatchId: 'dispatch-1',
      },
      {
        $setOnInsert: {
          attempts: 0,
        },
        $set: {
          documentGenerated: false,
          lastError: '',
          lockExpiresAt: null,
          mediaRegistered: false,
          status: 'queued',
          whatsappFileSent: false,
          whatsappLocationSent: false,
        },
      },
      { upsert: true }
    );
  });
});

describe('runPublicReceptionWorkflow', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  let originalFetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            message_id: 1178,
            document: {
              file_id: 'file-1',
              file_name: 'evidence.jpg',
              mime_type: 'image/jpeg',
              file_size: 1024,
              thumb: { file_id: 'thumb-1' },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { file_path: 'documents/file_1.jpg' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { file_path: 'thumbnails/thumb_1.jpg' },
        }),
      })
      .mockResolvedValueOnce({ ok: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates the measure, registers media and triggers whatsapp via portal', async () => {
    axios.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { data: [{ _id: 'media-1' }] } });
    axios.post
      .mockResolvedValueOnce({
        data: {
          _id: 'measure-1',
          name: 'PEN #3',
          measure: 17,
          status: 'Pending',
          typeId: 'tanque-pen-3',
        },
      })
      .mockResolvedValueOnce({ data: { _id: 'media-1' } })
      .mockResolvedValueOnce({ data: { status: 'ok' } });
    axios.put.mockResolvedValueOnce({
      data: {
        _id: 'measure-1',
        name: 'PEN #3',
        measure: 17,
        status: 'Completed',
        typeId: 'tanque-pen-3',
      },
    });

    const tempFilePath = path.join(os.tmpdir(), `reception-${Date.now()}.jpg`);
    fs.writeFileSync(tempFilePath, Buffer.from('image'));

    await runPublicReceptionWorkflow({
      kind: 'measure',
      companyId: 'constroad',
      telegramChatId: '-100medias',
      typeId: 'tanque-pen-3',
      measureName: 'PEN #3',
      measureValue: 17,
      unitLabel: 'centímetros',
      whatsappPhone: '120363402457346500@g.us',
      whatsappMessage: 'mensaje de prueba',
      files: [
        {
          path: tempFilePath,
          originalName: 'evidence.jpg',
          mimeType: 'image/jpeg',
          size: 1024,
        },
      ],
    });

    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      'https://portal.constroad.com/api/measure',
      expect.objectContaining({
        name: 'PEN #3',
        measure: 17,
        status: 'Pending',
        typeId: 'tanque-pen-3',
      }),
      expect.any(Object)
    );
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      'https://portal.constroad.com/api/media',
      expect.objectContaining({
        resourceId: 'measure-1',
        type: 'INPUT_PICTURES',
        name: 'evidence.jpg',
      }),
      expect.any(Object)
    );
    expect(axios.put).toHaveBeenCalledWith(
      'https://portal.constroad.com/api/measure/measure-1',
      expect.objectContaining({
        status: 'Completed',
      }),
      expect.any(Object)
    );
    expect(axios.post).toHaveBeenNthCalledWith(
      3,
      'https://portal.constroad.com/api/notifications/whatsapp',
      expect.objectContaining({
        type: 'SendText',
        phone: '120363402457346500@g.us',
        message: 'mensaje de prueba',
      }),
      expect.any(Object)
    );
  });
});
