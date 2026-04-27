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

jest.mock('../database/models.js', () => ({
  getCompanyModel: jest.fn(),
  getConfigModel: jest.fn(),
}));

jest.mock('./dispatch-notifications.service.js', () => ({
  sendDispatchNotifications: jest.fn(),
}));

const axios = require('axios');
const { getCompanyModel, getConfigModel } = require('../database/models.js');
const {
  sendDispatchNotifications,
} = require('./dispatch-notifications.service.js');
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

    expect(axios.post).toHaveBeenCalledWith(
      'https://portal.constroad.com/api/dispatch/dispatch-1',
      {},
      {
        headers: {
          'x-company-id': 'constroad',
        },
        timeout: 10000,
      }
    );
  });

  it('continues sending notifications when Portal IPP sync fails', async () => {
    axios.post.mockRejectedValueOnce(new Error('timeout'));

    await service.processPostDispatch(buildInput({ orderId: 'order-1' }));

    expect(sendDispatchNotifications).toHaveBeenCalledWith({
      input: expect.objectContaining({ dispatchId: 'dispatch-1' }),
      context: { companyBotLabel: '🤖 ConstroadBot' },
    });
  });

  it('skips WhatsApp when sender is empty', async () => {
    await service.processPostDispatch(buildInput({ sender: '' }));

    expect(sendDispatchNotifications).not.toHaveBeenCalled();
  });
});
