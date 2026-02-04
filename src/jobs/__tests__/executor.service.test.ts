// @ts-nocheck
jest.mock('axios', () => ({
  request: jest.fn(),
}));

jest.mock('../../database/models', () => ({
  getSharedModels: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const axios = require('axios');
const { JobExecutor } = require('../executor.service');
const { getSharedModels } = require('../../database/models');

describe('JobExecutor', () => {
  const updateOne = jest.fn();
  const findOne = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getSharedModels as any).mockResolvedValue({
      CronJobModel: { updateOne },
      CompanyModel: { findOne },
    });
  });

  it('ejecuta un job de mensaje y registra exito', async () => {
    const connectionManager = {
      sendTextMessage: jest.fn().mockResolvedValue(undefined),
    };
    const executor = new JobExecutor(connectionManager as any);

    findOne.mockResolvedValue({
      companyId: 'constroad',
      whatsappConfig: { sender: '51999999999' },
    });

    const job = {
      _id: 'job-message',
      name: 'Mensaje diario',
      companyId: 'constroad',
      type: 'message',
      isActive: true,
      schedule: {
        cronExpression: '0 9 * * *',
        timezone: 'America/Lima',
      },
      message: {
        chatId: 'grupo-1',
        body: 'Hola equipo',
        mentions: [],
      },
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        currentRetries: 0,
      },
    };

    await executor.execute(job as any);

    expect(connectionManager.sendTextMessage).toHaveBeenCalledWith(
      '51999999999',
      'grupo-1',
      '🤖 ConstRoadBot\n\nHola equipo',
      { mentions: [], queueOnFail: true }
    );

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'job-message' },
      expect.objectContaining({ status: 'running' })
    );

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'job-message' },
      expect.objectContaining({ status: 'success' })
    );
  });

  it('ejecuta un job de API y registra exito', async () => {
    const connectionManager = {
      sendTextMessage: jest.fn(),
    };
    const executor = new JobExecutor(connectionManager as any);

    findOne.mockResolvedValue({
      companyId: 'constroad',
      whatsappConfig: { sender: '51999999999' },
    });

    (axios as any).request.mockResolvedValue({ status: 200 });

    const job = {
      _id: 'job-api',
      name: 'API ping',
      companyId: 'constroad',
      type: 'api',
      isActive: true,
      timeout: 15000,
      schedule: {
        cronExpression: '*/15 * * * *',
        timezone: 'America/Lima',
      },
      apiConfig: {
        url: 'https://example.com/health',
        method: 'POST',
        headers: { 'x-test': 'true' },
        body: { ping: true },
      },
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        currentRetries: 0,
      },
    };

    await executor.execute(job as any);

    expect((axios as any).request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/health',
        method: 'POST',
        headers: expect.objectContaining({ 'x-test': 'true', 'x-company-id': 'constroad' }),
        data: { ping: true },
        timeout: 15000,
      })
    );

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'job-api' },
      expect.objectContaining({ status: 'success' })
    );
  });
});
