export {};

jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../config/environment.js', () => ({
  config: {
    port: 3001,
    portal: {
      baseUrl: 'https://portal.constroad.com',
    },
    security: {
      jwtSecret: 'test-secret',
    },
  },
}));

jest.mock('../database/sharedConnection.js', () => ({
  getSharedConnection: jest.fn(),
}));

jest.mock('../models/domain-event-run.model.js', () => ({
  getDomainEventRunModel: jest.fn(),
}));

jest.mock('./whatsapp-direct.service.js', () => ({
  WhatsAppDirectService: {
    sendMessage: jest.fn(),
  },
}));

jest.mock('./domain-events.service.js', () => ({
  enqueueDomainEvent: jest.fn(),
}));

const {
  buildDispatchClientAlertMessage,
  buildDispatchIppReadyMessage,
  buildDispatchPlantEndMessage,
  buildDispatchPlantProgressMessage,
  enqueueDispatchCompletionWorkflow,
  mergeIppSchemaDataWithDispatchRows,
  runDispatchIppDocumentReady,
  runDispatchIppReadyNotification,
  runDispatchIppSync,
  runDispatchCompletionNotifications,
  validateDispatchIppReadyNotificationInput,
  resolvePlantProgressUnitLabel,
  validateDispatchCompletionWorkflowInput,
} = require('./dispatch-completion.service.js');
const { getDomainEventRunModel } = require('../models/domain-event-run.model.js');
const { WhatsAppDirectService } = require('./whatsapp-direct.service.js');
const { getSharedConnection } = require('../database/sharedConnection.js');
const { enqueueDomainEvent } = require('./domain-events.service.js');

describe('dispatch-completion.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('validates input and normalizes booleans', () => {
    const result = validateDispatchCompletionWorkflowInput({
      baseUrl: 'https://lila.constroad.com/',
      companyId: 'constroad',
      dispatchFinished: true,
      dispatchId: 'dispatch-1',
      sender: '+51 902 049 935',
      state: 'despachado',
      truckDispatched: true,
    });

    expect(result).toEqual({
      baseUrl: 'https://lila.constroad.com',
      companyId: 'constroad',
      dispatchFinished: true,
      dispatchId: 'dispatch-1',
      sender: '51902049935',
      state: 'despachado',
      truckDispatched: true,
    });
  });

  it('schedules background workflow once', async () => {
    const persistRun = jest.fn().mockResolvedValue(undefined);
    const runWorkflow = jest.fn().mockResolvedValue(undefined);
    const schedule = jest.fn((runner) => runner());

    const result = enqueueDispatchCompletionWorkflow(
      {
        companyId: 'constroad',
        dispatchFinished: true,
        dispatchId: 'dispatch-1',
        sender: '51902049935',
        state: 'despachado',
        truckDispatched: true,
      },
      { persistRun, runWorkflow, schedule }
    );

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(persistRun).toHaveBeenCalledWith({
      companyId: 'constroad',
      dispatchFinished: true,
      dispatchId: 'dispatch-1',
      sender: '51902049935',
      state: 'despachado',
      truckDispatched: true,
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(runWorkflow).toHaveBeenCalledWith({
      companyId: 'constroad',
      dispatchFinished: true,
      dispatchId: 'dispatch-1',
      sender: '51902049935',
      state: 'despachado',
      truckDispatched: true,
    });
    expect(result.accepted).toBe(true);
  });

  it('builds client alert message with dispatch payload', () => {
    const message = buildDispatchClientAlertMessage('🤖 TestBot', {
      driverLicense: 'LIC-1',
      driverName: 'Luis',
      driverPhoneNumber: '999999999',
      note: 'Unidad 2',
      obra: 'Obra Norte',
      pending: 0,
      plate: 'ABC-123',
      quantity: 7,
    });

    expect(message).toContain('Unidad 2, 7m3 *despachado*');
    expect(message).toContain('Placa: ABC-123');
    expect(message).toContain('Unidades Pendientes: 0');
  });

  it('builds plant progress and end messages', () => {
    expect(buildDispatchPlantProgressMessage('🤖 TestBot', 'Unidad 3', 4)).toContain(
      'Unidad 3 *despachado*'
    );
    expect(buildDispatchPlantEndMessage('🤖 TestBot')).toContain('Fin de la producción');
    expect(buildDispatchIppReadyMessage('🤖 TestBot', 'Obra Norte')).toContain(
      'informe IPP de producción de planta ya está listo'
    );
  });

  it('resolves plant progress label with same-day operational sequence', () => {
    const label = resolvePlantProgressUnitLabel({
      dispatch: {
        _id: 'dispatch-3',
        date: '2026-04-24T14:00:00.000Z',
        note: 'Unidad 15',
      },
      dispatches: [
        {
          _id: '507f191e810c19729de860ea',
          createdAt: '2026-04-24T08:00:00.000Z',
          date: '2026-04-24T08:00:00.000Z',
          state: 'despachado',
        },
        {
          _id: '507f191e810c19729de860eb',
          createdAt: '2026-04-24T10:00:00.000Z',
          date: '2026-04-24T10:00:00.000Z',
          state: 'despachado',
        },
        {
          _id: 'dispatch-3',
          createdAt: '2026-04-24T14:00:00.000Z',
          date: '2026-04-24T14:00:00.000Z',
          state: 'despachado',
        },
      ],
    });

    expect(label).toBe('Unidad 3');
  });

  it('merges ipp rows and updates summary data', () => {
    const result = mergeIppSchemaDataWithDispatchRows({
      currentSchemaData: {
        registroDespachos: [
          { _dispatchId: 'dispatch-1', estado: 'observado', guiaRemision: 'G-1' },
          { item: 9, placa: 'MANUAL-1' },
        ],
      },
      incomingRows: [
        {
          _dispatchId: 'dispatch-1',
          chofer: 'Luis',
          estado: 'conforme',
          fecha: '2026-04-24',
          guiaRemision: 'G-NEW',
          horaSalida: '08:00',
          licencia: 'LIC-1',
          nroCubos: 7,
          placa: 'ABC-123',
          tempSalida: 20,
        },
        {
          _dispatchId: 'dispatch-2',
          chofer: 'Mario',
          estado: 'conforme',
          fecha: '2026-04-24',
          guiaRemision: 'G-2',
          horaSalida: '09:00',
          licencia: 'LIC-2',
          nroCubos: 5,
          placa: 'DEF-456',
          tempSalida: 22,
        },
      ],
      orderId: 'order-1',
      plantSettings: {
        planta: 'Planta 1',
      },
    });

    expect(result.__ippOrderId).toBe('order-1');
    expect(result.datosPlanta.planta).toBe('Planta 1');
    expect(result.registroDespachos).toHaveLength(3);
    expect(
      result.registroDespachos.find(
        (row: { _dispatchId?: string }) => row._dispatchId === 'dispatch-1'
      )?.guiaRemision
    ).toBe('G-1');
    expect(result.resumenProduccion.totalDespachos).toBe(3);
    expect(result.resumenProduccion.totalCubos).toBe(12);
  });

  it('does not mark notification flags when whatsapp only queues the message', async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    getDomainEventRunModel.mockResolvedValue({ updateOne });
    WhatsAppDirectService.sendMessage.mockResolvedValue({ queued: true });

    await runDispatchCompletionNotifications({
      context: {
        client: {
          notifications: {
            whatsAppAlerts: ['120363043706150862@g.us'],
          },
        },
        company: null,
        companyBotLabel: '🤖 TestBot',
        dispatch: {
          _id: 'dispatch-1',
          driverLicense: 'LIC-1',
          driverName: 'Luis',
          driverPhoneNumber: '999999999',
          note: 'Unidad 1',
          obra: 'Obra Norte',
          plate: 'ABC-123',
          quantity: 7,
          placeholders: {},
        },
        operationalPendingCount: 1,
        order: { obra: 'Obra Norte' },
        orderDispatches: [],
        remainingOrderDispatches: 1,
        sender: '51902049935',
      },
      input: {
        companyId: 'constroad',
        dispatchFinished: false,
        dispatchId: 'dispatch-1',
        sender: '51902049935',
        state: 'despachado',
        truckDispatched: true,
      },
      run: {},
      trackRun: true,
    });

    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({ clientAlertSent: true }),
      })
    );
    expect(updateOne).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({ plantProgressAlertSent: true }),
      })
    );
  });

  it('delegates ipp sync to portal so portal remains the only writer', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true }),
    });

    await runDispatchIppSync({
      context: {
        client: null,
        company: null,
        companyBotLabel: '🤖 TestBot',
        dispatch: { _id: 'dispatch-1' },
        operationalPendingCount: 0,
        order: { _id: 'order-1' },
        orderDispatches: [],
        remainingOrderDispatches: 0,
        sender: '51902049935',
      },
      input: {
        companyId: 'constroad',
        dispatchFinished: true,
        dispatchId: 'dispatch-1',
        sender: '51902049935',
        state: 'despachado',
        truckDispatched: true,
      },
      run: {},
      trackRun: false,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://portal.constroad.com/api/dispatch/dispatch-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ orderId: 'order-1' }),
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer '),
          'Content-Type': 'application/json',
          'x-company-id': 'constroad',
        }),
      })
    );
  });

  it('validates and sends delayed ipp ready notifications', async () => {
    WhatsAppDirectService.sendMessage.mockResolvedValue({ ok: true });

    const input = validateDispatchIppReadyNotificationInput({
      companyId: 'constroad',
      message: 'IPP listo',
      sender: '+51 902 049 935',
      targets: ['120363043706150862@g.us'],
    });

    expect(input).toEqual({
      companyId: 'constroad',
      message: 'IPP listo',
      sender: '51902049935',
      targets: ['120363043706150862@g.us'],
    });

    await runDispatchIppReadyNotification(input);

    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledWith(
      '51902049935',
      '120363043706150862@g.us',
      'IPP listo',
      expect.objectContaining({
        companyId: 'constroad',
        queueOnFail: true,
      })
    );
  });

  it('schedules a delayed ipp ready notification after the ipp pdf is ready', async () => {
    const ServiceManagementModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ _id: 'service-1', orderIds: ['order-1'] }]),
        }),
      }),
    };
    const ReportModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: 'report-1',
              date: '2026-04-24T10:00:00.000Z',
              executionDate: '2026-04-24T10:00:00.000Z',
              orderIds: ['order-1'],
              serviceManagementId: 'service-1',
              title: 'Producción de planta',
              type: 'IPP',
            },
          ]),
        }),
      }),
    };

    getSharedConnection.mockResolvedValue({
      model: jest.fn((modelName: string) => {
        if (modelName === 'ServiceManagement') return ServiceManagementModel;
        if (modelName === 'ServiceManagementReport') return ReportModel;
        throw new Error(`Unexpected model ${modelName}`);
      }),
      models: {},
    });

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            pdfSizeBytes: 140000,
            pdfUrlAbsolute:
              'https://lila.constroad.com/files/companies/constroad/service/reports/service-1/ipp.pdf',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
      });

    await runDispatchIppDocumentReady({
      context: {
        client: {
          notifications: {
            whatsAppAlerts: ['120363043706150862@g.us'],
          },
        },
        company: null,
        companyBotLabel: '🤖 TestBot',
        dispatch: {
          _id: 'dispatch-1',
          driverLicense: 'LIC-1',
          driverName: 'Luis',
          driverPhoneNumber: '999999999',
          note: 'Unidad 1',
          obra: 'Obra Norte',
          plate: 'ABC-123',
          quantity: 7,
          placeholders: {},
        },
        operationalPendingCount: 0,
        order: { _id: 'order-1', obra: 'Obra Norte' },
        orderDispatches: [],
        remainingOrderDispatches: 0,
        sender: '51902049935',
      },
      input: {
        companyId: 'constroad',
        baseUrl: 'https://lila.constroad.com',
        dispatchFinished: true,
        dispatchId: 'dispatch-1',
        sender: '51902049935',
        state: 'despachado',
        truckDispatched: true,
      },
      run: {},
      trackRun: false,
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:3001/api/documents/generate',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(enqueueDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: 'order-1',
        aggregateType: 'order',
        companyId: 'constroad',
        eventType: 'dispatch.ipp-report.ready-notification.requested',
        payload: expect.objectContaining({
          message: expect.stringContaining('portal del cliente'),
          sender: '51902049935',
          targets: ['120363043706150862@g.us'],
        }),
        sourceEventId: 'dispatch.completed:dispatch-1:ipp-ready-notification',
      })
    );
  });
});
