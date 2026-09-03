export {};

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock('./whatsapp-direct.service.js', () => ({
  WhatsAppDirectService: {
    sendDocument: jest.fn().mockResolvedValue({ ok: true }),
    sendImageFile: jest.fn().mockResolvedValue({ ok: true }),
    sendMessage: jest.fn().mockResolvedValue({ ok: true }),
  },
}));

jest.mock('./telegram-alert.service.js', () => ({
  scheduleTelegramAlert: jest.fn().mockResolvedValue(true),
  sendTelegramAlert: jest.fn().mockResolvedValue(true),
}));

jest.mock('../models/dispatch-notification-flag.model.js', () => ({
  getDispatchNotificationFlagModel: jest.fn(),
}));

jest.mock('../database/models.js', () => ({
  getCompanyModel: jest.fn(),
}));

jest.mock('../config/constants.js', () => ({
  DISPATCH_IPP_READY_NOTIFICATION_DELAY_MS: 1000,
}));

jest.mock('../config/environment.js', () => ({
  config: {
    nodeEnv: 'test',
    port: 3001,
  },
}));

jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const axios = require('axios').default;
const logger = require('../utils/logger.js').default;
const { WhatsAppDirectService } = require('./whatsapp-direct.service.js');
const {
  scheduleTelegramAlert,
  sendTelegramAlert,
} = require('./telegram-alert.service.js');
const {
  getDispatchNotificationFlagModel,
} = require('../models/dispatch-notification-flag.model.js');
const { getCompanyModel } = require('../database/models.js');
const notifications = require('./dispatch-notifications.service.js');
const updateOneMock = jest.fn();

function buildTestInput(overrides = {}) {
  return {
    dispatchId: 'dispatch-1',
    companyId: 'constroad',
    state: 'despachado',
    dispatchFinished: false,
    allDispatched: false,
    pendingCount: 3,
    dispatchedCount: 4,
    clientPendingCount: 2,
    clientDispatchedCount: 1,
    sender: '51902049935',
    plantGroupTarget: 'plant@g.us',
    clientTargets: ['client@g.us'],
    sendDispatchMessage: true,
    adminGroupTarget: 'admin@g.us',
    ...overrides,
  };
}

describe('dispatch-notifications.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    getDispatchNotificationFlagModel.mockResolvedValue({
      updateOne: updateOneMock,
    });
    getCompanyModel.mockResolvedValue({
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          companyId: 'constroad',
          isActive: true,
          whatsappConfig: {
            sender: '51902049935',
            plantGroupId: 'plant@g.us',
          },
        }),
      }),
    });
    axios.post.mockResolvedValue({
      data: { data: { pdfUrlAbsolute: 'https://files.test/ipp.pdf' } },
    });
    updateOneMock.mockResolvedValue({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 1,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds the exact plant progress message', () => {
    const message = notifications.buildPlantProgressMessage('Bot', 7, 5);

    expect(message).toBe(
      ['Bot', '- 🚛 Unidad 7 *despachado*', '- ⏰ Unidades Pendientes: 5'].join('\n')
    );
  });

  it('builds the client dispatch message with all fields', () => {
    const message = notifications.buildClientDispatchMessage({
      botLabel: 'Bot',
      note: 'Unidad 2',
      quantity: 8,
      plate: 'ABC-123',
      driverName: 'Juan',
      driverLicense: 'LIC-001',
      driverPhoneNumber: '999999999',
      obra: 'Obra Norte',
      pendingCount: 3,
    });

    expect(message).toContain('8m3 *despachado*');
    expect(message).toContain('Placa: ABC-123');
    expect(message).toContain('Chofer: Juan');
  });

  it('uses the client pending count in customer messages', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput({
        pendingCount: 9,
        clientPendingCount: 2,
      }),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });

    expect(WhatsAppDirectService.sendMessage).toHaveBeenNthCalledWith(
      2,
      '51902049935',
      'client@g.us',
      expect.stringContaining('Unidades Pendientes: 2'),
      expect.anything()
    );
  });

  it('renders the custom plant-progress template to the plant group', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput(),
      context: {
        companyBotLabel: 'Bot',
        plantGroupId: 'plant@g.us',
        adminGroupId: 'admin@g.us',
        plantProgressTemplate: '⚡ {{unidad}}/{{pendientes}}',
      },
    });

    // dispatchOrdinal = max(dispatchedCount=4,1)=4 ; pendingCount=3 → '⚡ 4/3' al grupo de planta.
    expect(WhatsAppDirectService.sendMessage).toHaveBeenNthCalledWith(
      1,
      '51902049935',
      'plant@g.us',
      '⚡ 4/3',
      expect.anything()
    );
  });

  it('skips the plant WhatsApp send when no plant group is configured', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput(),
      context: { companyBotLabel: 'Bot', plantGroupId: '', adminGroupId: 'admin@g.us' },
    });

    // Sin grupo de planta → el primer envío WhatsApp es al cliente, no a planta.
    expect(WhatsAppDirectService.sendMessage).toHaveBeenNthCalledWith(
      1,
      '51902049935',
      'client@g.us',
      expect.anything(),
      expect.anything()
    );
  });

  it('sin grupo de planta, el Telegram dice QUÉ falta: es el único fallback que hay', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput(),
      context: { companyBotLabel: 'Bot', plantGroupId: '', adminGroupId: 'admin@g.us' },
    });

    expect(sendTelegramAlert).toHaveBeenCalledWith({
      message: expect.stringContaining('Sin grupo de planta configurado (whatsappConfig.plantGroupId)'),
    });
  });

  it('con grupo de planta, el Telegram no lleva el aviso de grupo faltante', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput(),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });

    const messages = sendTelegramAlert.mock.calls.map((call: [{ message: string }]) => call[0].message);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m: string) => m.includes('Sin grupo de planta'))).toBe(false);
  });

  it('sends Telegram progress without a WhatsApp sender', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput({ sender: '' }),
      context: {
        companyBotLabel: 'Bot',
        plantGroupId: 'plant@g.us',
        adminGroupId: 'admin@g.us',
      },
    });

    expect(WhatsAppDirectService.sendMessage).not.toHaveBeenCalled();
    expect(sendTelegramAlert).toHaveBeenCalledWith({
      message: expect.stringContaining('Unidades Pendientes: 3'),
    });
  });

  it('keeps Telegram active when WhatsApp fails', async () => {
    WhatsAppDirectService.sendMessage.mockRejectedValueOnce(
      new Error('session unavailable')
    );

    await notifications.sendDispatchNotifications({
      input: buildTestInput(),
      context: {
        companyBotLabel: 'Bot',
        plantGroupId: 'plant@g.us',
        adminGroupId: 'admin@g.us',
      },
    });

    expect(sendTelegramAlert).toHaveBeenCalledWith({
      message: expect.stringContaining('Unidad 4'),
    });
    expect(logger.error).toHaveBeenCalledWith(
      'plant_progress.whatsapp_failed',
      expect.objectContaining({ companyId: 'constroad' })
    );
  });

  it('schedules Telegram plant-end without a WhatsApp sender', async () => {
    getCompanyModel.mockResolvedValueOnce({
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          companyId: 'constroad',
          isActive: true,
          whatsappConfig: {
            sender: '',
            plantGroupId: '',
          },
        }),
      }),
    });

    await notifications.sendDispatchNotifications({
      input: buildTestInput({
        allDispatched: true,
        dispatchFinished: true,
        pendingCount: 0,
        sender: '',
      }),
      context: {
        companyBotLabel: 'Bot',
        plantGroupId: 'plant@g.us',
        adminGroupId: 'admin@g.us',
      },
    });

    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
    expect(scheduleTelegramAlert).toHaveBeenCalledWith({
      availableAt: expect.any(Date),
      dedupeKey: expect.stringContaining('telegram:plant-end:constroad:'),
      message: expect.stringContaining('Fin de la producción'),
    });
    await jest.runOnlyPendingTimersAsync();
    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
    expect(WhatsAppDirectService.sendMessage).not.toHaveBeenCalled();
  });

  it('builds the client completion and plant end messages', () => {
    expect(notifications.buildClientCompleteMessage('Bot', 'Obra Sur')).toContain(
      '✅ Fin de producción!'
    );
    expect(notifications.buildPlantEndMessage('Bot')).toContain(
      '@Todos Comunicar algun incidente'
    );
  });

  it('builds the IPP ready message with fallback obra', () => {
    expect(notifications.buildIppReadyMessage('Bot', '')).toContain('No especificada');
  });

  it('builds the order completion image svg with dispatch rows', () => {
    const svg = notifications.buildOrderCompletionSummarySvg({
      clientName: 'Cliente Norte',
      date: '2026-03-17T10:00:00.000Z',
      locationUrl: 'https://maps.test',
      obra: 'Obra Central',
      rows: [
        {
          date: '2026-03-17T10:00:00.000Z',
          driverName: 'Juan Perez',
          hour: '06:35',
          note: 'Unidad 1',
          plate: 'ABC-123',
          quantity: 25.5,
        },
      ],
      totalM3: 25.5,
      totalUnits: 1,
    });

    expect(svg).toContain('Cliente Norte');
    expect(svg).toContain('ABC-123');
    expect(svg).toContain('Unidad 1');
  });

  it('resolves the admin group when sendDispatchMessage=false', () => {
    expect(
      notifications.resolveClientTargets(
        buildTestInput({
          sendDispatchMessage: false,
          adminGroupTarget: 'admin@g.us',
        })
      )
    ).toEqual(['admin@g.us']);
  });

  it('returns the real client targets when sendDispatchMessage=true', () => {
    expect(
      notifications.resolveClientTargets(
        buildTestInput({
          clientTargets: ['client@g.us'],
        })
      )
    ).toEqual(['client@g.us']);
  });

  it('schedules the IPP ready notification only for real client targets', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput({
        dispatchFinished: true,
      }),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });

    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledTimes(3);
    expect(updateOneMock).toHaveBeenNthCalledWith(
      1,
      { key: 'dispatch-progress:constroad:dispatch-1' },
      expect.anything(),
      { upsert: true }
    );

    await jest.runOnlyPendingTimersAsync();

    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledTimes(4);
    expect(WhatsAppDirectService.sendMessage).toHaveBeenLastCalledWith(
      '51902049935',
      'client@g.us',
      expect.stringContaining('informe IPP'),
      expect.anything()
    );
  });

  it('sends the IPP ready notification with the generated PDF', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput({
        dispatchFinished: true,
        ippReportPayload: { orderId: 'order-1' },
      }),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });

    await jest.runOnlyPendingTimersAsync();

    expect(axios.post).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/documents/generate',
      expect.objectContaining({
        format: 'pdf',
        reportPayload: { orderId: 'order-1' },
      }),
      { timeout: 120000 }
    );
    expect(WhatsAppDirectService.sendDocument).toHaveBeenCalledWith(
      '51902049935',
      'client@g.us',
      expect.objectContaining({
        caption: expect.stringContaining('informe IPP'),
        fileName: 'informe-produccion-planta.pdf',
        fileUrl: 'https://files.test/ipp.pdf',
        mimeType: 'application/pdf',
      })
    );
  });

  it('falls back to text when IPP PDF generation fails', async () => {
    axios.post.mockRejectedValueOnce(new Error('pdf timeout'));

    await notifications.sendDispatchNotifications({
      input: buildTestInput({
        dispatchFinished: true,
        ippReportPayload: { orderId: 'order-1' },
      }),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });

    await jest.runOnlyPendingTimersAsync();

    expect(WhatsAppDirectService.sendDocument).not.toHaveBeenCalled();
    expect(WhatsAppDirectService.sendMessage).toHaveBeenLastCalledWith(
      '51902049935',
      'client@g.us',
      expect.stringContaining('informe IPP'),
      expect.anything()
    );
  });

  it('uses the company current sender when the delayed IPP notification runs', async () => {
    getCompanyModel.mockResolvedValueOnce({
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          companyId: 'constroad',
          isActive: true,
          whatsappConfig: {
            sender: '51999999999',
            plantGroupId: 'new-plant@g.us',
          },
        }),
      }),
    });

    await notifications.sendDispatchNotifications({
      input: buildTestInput({ dispatchFinished: true }),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });
    await jest.runOnlyPendingTimersAsync();

    expect(WhatsAppDirectService.sendMessage).toHaveBeenLastCalledWith(
      '51999999999',
      'client@g.us',
      expect.stringContaining('informe IPP'),
      expect.anything()
    );
  });

  it('skips delayed IPP WhatsApp when the company disconnected its sender', async () => {
    getCompanyModel.mockResolvedValueOnce({
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          companyId: 'constroad',
          isActive: true,
          whatsappConfig: {
            sender: '',
            plantGroupId: '',
          },
        }),
      }),
    });

    await notifications.sendDispatchNotifications({
      input: buildTestInput({ dispatchFinished: true }),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });
    const callsBeforeDelay = WhatsAppDirectService.sendMessage.mock.calls.length;
    await jest.runOnlyPendingTimersAsync();

    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledTimes(callsBeforeDelay);
    expect(logger.info).toHaveBeenCalledWith(
      'dispatch_ipp_ready.skipped_no_current_sender',
      expect.objectContaining({ companyId: 'constroad' })
    );
  });

  it('sends an order completion image when the order finishes', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput({
        dispatchFinished: true,
        orderCompletion: {
          clientName: 'Cliente Norte',
          date: '2026-03-17T10:00:00.000Z',
          locationUrl: '',
          obra: 'Obra Central',
          orderId: 'order-1',
          rows: [
            {
              date: '2026-03-17T10:00:00.000Z',
              driverName: 'Juan Perez',
              hour: '06:35',
              note: 'Unidad 1',
              plate: 'ABC-123',
              quantity: 25.5,
            },
          ],
          totalM3: 25.5,
          totalUnits: 1,
        },
      }),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });

    expect(WhatsAppDirectService.sendImageFile).toHaveBeenCalledWith(
      '51902049935',
      'client@g.us',
      expect.objectContaining({
        caption: expect.stringContaining('Fin de producción'),
        fileName: 'resumen-despacho.png',
        mimeType: 'image/png',
      })
    );
    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('logs why the IPP payload is unavailable', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput({
        dispatchFinished: true,
        ippReportUnavailableReason: 'no-linked-service',
      }),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });

    await jest.runOnlyPendingTimersAsync();

    expect(logger.warn).toHaveBeenCalledWith(
      'dispatch_ipp_ready.pdf_missing_payload',
      expect.objectContaining({
        dispatchId: 'dispatch-1',
        reason: 'no-linked-service',
      })
    );
  });

  it('does not schedule the IPP ready notification for admin redirects', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput({
        dispatchFinished: true,
        sendDispatchMessage: false,
        clientTargets: ['client@g.us'],
      }),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });

    await jest.runOnlyPendingTimersAsync();

    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledTimes(3);
  });

  it('does not send the plant end message before the last dispatch of the day', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput({
        dispatchFinished: true,
        allDispatched: false,
      }),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });

    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledTimes(3);
  });

  it('does not resend the same dispatch notifications twice', async () => {
    updateOneMock
      .mockResolvedValueOnce({
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
      })
      .mockResolvedValueOnce({
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 0,
        upsertedCount: 0,
      });

    await notifications.sendDispatchNotifications({
      input: buildTestInput(),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });
    await notifications.sendDispatchNotifications({
      input: buildTestInput(),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });

    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('still evaluates plant-end after duplicated progress', async () => {
    updateOneMock
      .mockResolvedValueOnce({
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 0,
        upsertedCount: 0,
      })
      .mockResolvedValueOnce({
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
      });

    await notifications.sendDispatchNotifications({
      input: buildTestInput({ allDispatched: true }),
      context: {
        companyBotLabel: 'Bot',
        plantGroupId: '',
        adminGroupId: '',
      },
    });
    await jest.runOnlyPendingTimersAsync();

    expect(sendTelegramAlert).not.toHaveBeenCalled();
    expect(scheduleTelegramAlert).toHaveBeenCalledWith({
      availableAt: expect.any(Date),
      dedupeKey: expect.stringContaining('telegram:plant-end:constroad:'),
      message: expect.stringContaining('Fin de la producción'),
    });
  });

  it('bypasses dispatch notification dedupe only in development', () => {
    expect(notifications.shouldBypassDispatchDedupe('development')).toBe(true);
    expect(notifications.shouldBypassDispatchDedupe('production')).toBe(false);
    expect(notifications.shouldBypassDispatchDedupe('test')).toBe(false);
  });

  it('sends the plant end message only once per day', async () => {
    updateOneMock
      .mockResolvedValueOnce({
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
      })
      .mockResolvedValueOnce({
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 0,
        upsertedCount: 0,
      });

    await notifications.sendPlantEndIfNotSent(
      '51902049935',
      'Bot',
      'constroad',
      'plant@g.us'
    );
    await notifications.sendPlantEndIfNotSent(
      '51902049935',
      'Bot',
      'constroad',
      'plant@g.us'
    );

    expect(updateOneMock).toHaveBeenCalledTimes(2);
    // El aviso de fin de producción se envía 30 min después (setTimeout) → avanzar timers.
    await jest.runOnlyPendingTimersAsync();
    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('still sends the plant end message when flag persistence fails', async () => {
    updateOneMock.mockRejectedValueOnce(new Error('db timeout'));

    await notifications.sendPlantEndIfNotSent(
      '51902049935',
      'Bot',
      'constroad',
      'plant@g.us'
    );

    await jest.runOnlyPendingTimersAsync();
    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('uses current sender and plant group for the delayed plant-end message', async () => {
    getCompanyModel.mockResolvedValueOnce({
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          companyId: 'constroad',
          isActive: true,
          whatsappConfig: {
            sender: '51999999999',
            plantGroupId: 'new-plant@g.us',
          },
        }),
      }),
    });

    await notifications.sendPlantEndIfNotSent(
      '51902049935',
      'Bot',
      'constroad',
      'plant@g.us'
    );
    await jest.runOnlyPendingTimersAsync();

    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledWith(
      '51999999999',
      'new-plant@g.us',
      expect.stringContaining('Fin de la producción'),
      expect.anything()
    );
  });

  it('numera el aviso de planta con el unitNumber del PEDIDO, no con dispatchedCount', async () => {
    // `dispatchedCount` cuenta despachos por EMPRESA y dia operativo: con dos
    // pedidos el mismo dia, planta veia un numero y el cliente otro por el MISMO
    // camion. Portal ahora manda el "Unidad N" congelado del pedido.
    await notifications.sendDispatchNotifications({
      input: buildTestInput({ unitNumber: 2 }),
      context: {
        companyBotLabel: 'Bot',
        plantGroupId: 'plant@g.us',
        adminGroupId: 'admin@g.us',
        plantProgressTemplate: '⚡ {{unidad}}/{{pendientes}}',
      },
    });

    // buildTestInput trae dispatchedCount=4; con unitNumber=2 manda el 2.
    expect(WhatsAppDirectService.sendMessage).toHaveBeenNthCalledWith(
      1,
      '51902049935',
      'plant@g.us',
      '⚡ 2/3',
      expect.anything()
    );
  });

  it('ordena las filas del resumen por unidad, no por como llegan', () => {
    // Incidente 2026-08-02: la imagen del resumen salia 2,1,3 porque Portal
    // manda los despachos con `date: -1` y aca no se ordenaba. El cliente ve
    // una tabla desordenada de su propio pedido.
    const svg = notifications.buildOrderCompletionSummarySvg({
      clientName: 'Cliente',
      date: '2026-08-02T12:00:00.000Z',
      locationUrl: '',
      obra: 'PACHACAMAC',
      rows: [
        { date: '2026-08-02', driverName: 'Clemente', hour: '08:06', note: 'Unidad 2', plate: 'C9R753', quantity: 24, unitNumber: 2 },
        { date: '2026-08-02', driverName: 'Lucio', hour: '07:35', note: 'Unidad 1', plate: 'BBE942', quantity: 24, unitNumber: 1 },
        { date: '2026-08-02', driverName: 'Jose', hour: '09:10', note: 'Unidad 3', plate: 'T2T809', quantity: 24, unitNumber: 3 },
      ],
      totalM3: 72,
      totalUnits: 3,
    });

    const orden = ['Lucio', 'Clemente', 'Jose'].map((n) => svg.indexOf(n));
    expect(orden).toEqual([...orden].sort((a, b) => a - b));
  });

  it('sin unitNumber (payload viejo) ordena por hora de salida', () => {
    const svg = notifications.buildOrderCompletionSummarySvg({
      clientName: 'Cliente',
      date: '2026-08-02T12:00:00.000Z',
      locationUrl: '',
      obra: 'PACHACAMAC',
      rows: [
        { date: '2026-08-02', driverName: 'Tarde', hour: '09:10', note: '', plate: 'C', quantity: 24 },
        { date: '2026-08-02', driverName: 'Temprano', hour: '07:35', note: '', plate: 'A', quantity: 24 },
      ],
      totalM3: 48,
      totalUnits: 2,
    });

    expect(svg.indexOf('Temprano')).toBeLessThan(svg.indexOf('Tarde'));
  });

  const filasResumen = (cantidad: number) =>
    Array.from({ length: cantidad }, (_, index) => ({
      date: '2026-08-02T12:00:00.000Z',
      driverName: `Chofer ${index + 1}`,
      hour: `0${index % 9}:00`,
      note: `Unidad ${index + 1}`,
      plate: `PL-${index + 1}`,
      quantity: 24,
      unitNumber: index + 1,
    }));

  const resumenCon = (cantidad: number) =>
    notifications.buildOrderCompletionSummarySvg({
      clientName: 'Cliente',
      date: '2026-08-02T12:00:00.000Z',
      locationUrl: '',
      obra: 'PACHACAMAC',
      rows: filasResumen(cantidad),
      totalM3: cantidad * 24,
      totalUnits: cantidad,
    });

  it('no recorta el pedido mas grande de produccion (28 unidades)', () => {
    // 16 de 307 pedidos de constroad pasan de 14 unidades (max 28). El recorte
    // mudo dejaba al cliente con un encabezado que decia "28 Unidades" y una
    // tabla con 14: el resumen se contradecia solo.
    const svg = resumenCon(28);

    expect(svg).toContain('Unidad 28');
    expect(svg).toContain('Chofer 28');
  });

  it('la imagen crece con las filas en vez de perderlas', () => {
    const alto = (svg: string) => Number(/height="(\d+)"/.exec(svg)?.[1]);

    expect(alto(resumenCon(28))).toBeGreaterThan(alto(resumenCon(9)));
  });

  it('si el pedido es enorme avisa cuantas quedaron fuera, no las oculta', () => {
    const svg = resumenCon(45);

    expect(svg).toContain('unidades mas');
    expect(svg).not.toContain('Unidad 45');
  });

  it('avisa cuando el resumen NO se envia, en vez de salirse mudo', async () => {
    // El resumen es lo ultimo que ve el cliente de su pedido: si Portal no manda
    // `orderCompletion` o no hay destinatarios, tiene que quedar rastro.
    const loggerModule = require('../utils/logger');
    const warnSpy = jest.spyOn(loggerModule.default ?? loggerModule.logger, 'warn');

    await notifications.sendDispatchNotifications({
      input: buildTestInput({ dispatchFinished: true, orderCompletion: undefined }),
      context: { companyBotLabel: 'Bot', plantGroupId: 'plant@g.us', adminGroupId: 'admin@g.us' },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      'dispatch_order_completion.skipped',
      expect.objectContaining({ hasCompletion: false })
    );
    warnSpy.mockRestore();
  });
});
