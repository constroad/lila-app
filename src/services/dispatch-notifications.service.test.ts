export {};

jest.mock('./whatsapp-direct.service.js', () => ({
  WhatsAppDirectService: {
    sendMessage: jest.fn().mockResolvedValue({ ok: true }),
  },
}));

jest.mock('../models/dispatch-notification-flag.model.js', () => ({
  getDispatchNotificationFlagModel: jest.fn(),
}));

jest.mock('../config/constants.js', () => ({
  DISPATCH_IPP_READY_NOTIFICATION_DELAY_MS: 1000,
}));

const { WhatsAppDirectService } = require('./whatsapp-direct.service.js');
const {
  getDispatchNotificationFlagModel,
} = require('../models/dispatch-notification-flag.model.js');
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
      context: { companyBotLabel: 'Bot' },
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

  it('does not schedule the IPP ready notification for admin redirects', async () => {
    await notifications.sendDispatchNotifications({
      input: buildTestInput({
        dispatchFinished: true,
        sendDispatchMessage: false,
        clientTargets: ['client@g.us'],
      }),
      context: { companyBotLabel: 'Bot' },
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
      context: { companyBotLabel: 'Bot' },
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
      context: { companyBotLabel: 'Bot' },
    });
    await notifications.sendDispatchNotifications({
      input: buildTestInput(),
      context: { companyBotLabel: 'Bot' },
    });

    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledTimes(2);
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

    expect(WhatsAppDirectService.sendMessage).toHaveBeenCalledTimes(1);
  });
});
