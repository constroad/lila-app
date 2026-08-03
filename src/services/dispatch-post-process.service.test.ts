export {};

jest.mock('axios', () => ({
  post: jest.fn(),
}));

jest.mock('../config/environment.js', () => ({
  config: {
    portal: {
      baseUrl: 'https://portal.constroad.com',
    },
    security: {
      jwtSecret: 'secret',
    },
  },
}));

// logger.ts lee config.logging.dir al CARGAR; con environment mockeado sin
// `logging` la suite ni siquiera corría. Mismo mock que dispatch-vale.
jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../database/models.js', () => ({
  getCompanyModel: jest.fn(),
  getConfigModel: jest.fn(),
}));

jest.mock('./dispatch-notifications.service.js', () => ({
  sendDispatchNotifications: jest.fn(),
}));

jest.mock('./driver-arrival-reminder.service.js', () => ({
  scheduleDispatchArrivalAutoClose: jest.fn().mockResolvedValue(undefined),
}));

const axios = require('axios');
const { getCompanyModel, getConfigModel } = require('../database/models.js');
const {
  sendDispatchNotifications,
} = require('./dispatch-notifications.service.js');
const {
  scheduleDispatchArrivalAutoClose,
} = require('./driver-arrival-reminder.service.js');
const service = require('./dispatch-post-process.service.js');

function buildInput(overrides = {}) {
  return {
    dispatchId: 'dispatch-1',
    companyId: 'constroad',
    orderId: 'order-1',
    state: 'despachado',
    dispatchFinished: false,
    allDispatched: false,
    pendingCount: 2,
    dispatchedCount: 1,
    clientPendingCount: 1,
    clientDispatchedCount: 1,
    truckDispatched: false,
    sender: '51902049935',
    plantGroupTarget: 'plant@g.us',
    clientTargets: ['client@g.us'],
    sendDispatchMessage: true,
    adminGroupTarget: 'admin@g.us',
    ...overrides,
  };
}

describe('dispatch-post-process.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    scheduleDispatchArrivalAutoClose.mockResolvedValue(undefined);
    getCompanyModel.mockResolvedValue({
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          name: 'Constroad',
          slug: 'constroad',
        }),
      }),
    });
    getConfigModel.mockResolvedValue({
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    });
    axios.post.mockResolvedValue({ data: { success: true } });
    sendDispatchNotifications.mockResolvedValue(undefined);
  });

  it('returns early when state is not despachado', async () => {
    await service.processPostDispatch(buildInput({ state: 'progreso' }));

    expect(sendDispatchNotifications).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('increments maintenance configs when truckDispatched=true', async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    getConfigModel.mockResolvedValue({
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'config-1', currentValue: 10 },
        ]),
      }),
      updateOne,
    });

    await service.updateMaintenanceM3Config('constroad', 7);

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'config-1', companyId: 'constroad' },
      { $set: { currentValue: 17 } }
    );
  });

  it('does not call maintenance updates when truckDispatched=false', async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    getConfigModel.mockResolvedValue({
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'config-1', currentValue: 10 },
        ]),
      }),
      updateOne,
    });

    await service.processPostDispatch(buildInput({ truckDispatched: false }));

    expect(updateOne).not.toHaveBeenCalled();
  });

  it('calls Portal IPP sync when orderId is present', async () => {
    await service.processPostDispatch(buildInput({ orderId: 'order-1' }));

    // El callback va FIRMADO (buildPortalCallbackHeaders): JWT Bearer +
    // x-company-id. La aserción valida el contrato, no el token exacto.
    expect(axios.post).toHaveBeenCalledWith(
      'https://portal.constroad.com/api/dispatch/dispatch-1',
      {},
      {
        headers: expect.objectContaining({
          'x-company-id': 'constroad',
          Authorization: expect.stringMatching(/^Bearer .+/),
        }),
        timeout: 10000,
      }
    );
  });

  it('continues sending notifications when Portal IPP sync fails', async () => {
    axios.post.mockRejectedValueOnce(new Error('timeout'));

    await service.processPostDispatch(buildInput({ orderId: 'order-1' }));

    expect(sendDispatchNotifications).toHaveBeenCalledWith({
      input: expect.objectContaining({ dispatchId: 'dispatch-1' }),
      context: expect.objectContaining({
        companyBotLabel: '🤖 ConstroadBot',
      }),
    });
  });

  it('keeps Telegram notifications when sender is empty', async () => {
    await service.processPostDispatch(buildInput({ sender: '' }));

    expect(sendDispatchNotifications).toHaveBeenCalledWith({
      input: expect.objectContaining({ sender: '' }),
      context: expect.objectContaining({ companyBotLabel: '🤖 ConstroadBot' }),
    });
  });

  // El cierre de fondo se programaba SOLO desde el flujo del vale, que en el
  // admin corre unicamente si alguien reprocesa el vale a mano. Un despacho
  // cerrado desde el panel se quedaba sin job y "en ruta" para siempre.
  it('programa el cierre de llegada aunque el vale nunca corra (despacho del admin)', async () => {
    await service.processPostDispatch(buildInput({ sendDispatchMessage: false }));

    expect(scheduleDispatchArrivalAutoClose).toHaveBeenCalledWith({
      companyId: 'constroad',
      dispatchId: 'dispatch-1',
    });
  });

  it('no lo programa si el despacho no salio', async () => {
    await service.processPostDispatch(buildInput({ state: 'progreso' }));

    expect(scheduleDispatchArrivalAutoClose).not.toHaveBeenCalled();
  });

  it('si programar el cierre falla, el post-process sigue', async () => {
    scheduleDispatchArrivalAutoClose.mockRejectedValueOnce(new Error('store roto'));

    await expect(service.processPostDispatch(buildInput())).resolves.toBeUndefined();
    expect(sendDispatchNotifications).toHaveBeenCalled();
  });
});
