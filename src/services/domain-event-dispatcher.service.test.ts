export {};

jest.mock('../config/environment.js', () => ({
  config: {},
}));

jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../models/domain-event.model.js', () => ({
  DOMAIN_EVENT_STATUS: {
    completed: 'completed',
    exhausted: 'exhausted',
    failed: 'failed',
    pending: 'pending',
    processing: 'processing',
  },
  getDomainEventModel: jest.fn(),
}));

jest.mock('../models/domain-event-run.model.js', () => ({
  DOMAIN_EVENT_RUN_STATUS: {
    completed: 'completed',
    failed: 'failed',
    pending: 'pending',
    running: 'running',
  },
  getDomainEventRunModel: jest.fn(),
}));

jest.mock('./dispatch-completion.service.js', () => ({
  buildDispatchCompletionContext: jest.fn(),
  runDispatchIppDocumentReady: jest.fn(),
  runDispatchIppReadyNotification: jest.fn(),
  runDispatchCompletionNotifications: jest.fn(),
  runDispatchConfigUpdate: jest.fn(),
  runDispatchIppSync: jest.fn(),
  validateDispatchIppReadyNotificationInput: jest.fn(),
  validateDispatchCompletionWorkflowInput: jest.fn(),
}));

jest.mock('./dispatch-vale.service.js', () => ({
  generateDispatchValeWorkflow: jest.fn(),
  validateDispatchValeWorkflowInput: jest.fn(),
}));

const {
  getDomainEventModel,
} = require('../models/domain-event.model.js');
const {
  getDomainEventRunModel,
} = require('../models/domain-event-run.model.js');
const {
  buildDispatchCompletionContext,
  runDispatchIppDocumentReady,
  runDispatchIppReadyNotification,
  runDispatchCompletionNotifications,
  runDispatchConfigUpdate,
  runDispatchIppSync,
  validateDispatchIppReadyNotificationInput,
  validateDispatchCompletionWorkflowInput,
} = require('./dispatch-completion.service.js');
const {
  generateDispatchValeWorkflow: generateDispatchValeWorkflowMock,
  validateDispatchValeWorkflowInput,
} = require('./dispatch-vale.service.js');
const { getDomainEventHandlers } = require('./domain-event-dispatcher.service.js');
const { processPendingDomainEvents } = require('./domain-events.service.js');

describe('domain-event-dispatcher.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers dispatch.completed handlers and reuses one shared context', async () => {
    validateDispatchCompletionWorkflowInput.mockReturnValue({
      companyId: 'constroad',
      dispatchFinished: true,
      dispatchId: 'dispatch-1',
      sender: '51902049935',
      state: 'despachado',
      truckDispatched: true,
    });
    buildDispatchCompletionContext.mockResolvedValue({
      dispatch: { _id: 'dispatch-1' },
    });

    const handlers = getDomainEventHandlers({
      companyId: 'constroad',
      eventType: 'dispatch.completed',
      payload: {
        dispatchFinished: true,
        dispatchId: 'dispatch-1',
        sender: '51902049935',
        state: 'despachado',
        truckDispatched: true,
      },
    });

    expect(handlers.map((handler: { key: string }) => handler.key)).toEqual([
      'config-update',
      'ipp-sync',
      'ipp-document',
      'notifications',
    ]);

    await handlers[0].run();
    await handlers[1].run();
    await handlers[2].run();
    await handlers[3].run();

    expect(buildDispatchCompletionContext).toHaveBeenCalledTimes(1);
    expect(runDispatchConfigUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ dispatchId: 'dispatch-1' }),
      })
    );
    expect(runDispatchIppSync).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ dispatchId: 'dispatch-1' }),
      })
    );
    expect(runDispatchIppDocumentReady).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ dispatchId: 'dispatch-1' }),
      })
    );
    expect(runDispatchCompletionNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ dispatchId: 'dispatch-1' }),
      })
    );
    expect(validateDispatchCompletionWorkflowInput).toHaveBeenCalledWith({
      companyId: 'constroad',
      dispatchFinished: true,
      dispatchId: 'dispatch-1',
      sender: '51902049935',
      state: 'despachado',
      truckDispatched: true,
    });
  });

  it('registers dispatch.vale.requested with a single vale handler', async () => {
    validateDispatchValeWorkflowInput.mockReturnValue({
      baseUrl: 'https://lila.constroad.com',
      companyId: 'constroad',
      dispatchId: 'dispatch-vale-1',
      sender: '51902049935',
    });

    const handlers = getDomainEventHandlers({
      companyId: 'constroad',
      eventType: 'dispatch.vale.requested',
      payload: {
        baseUrl: 'https://lila.constroad.com',
        dispatchId: 'dispatch-vale-1',
        sender: '51902049935',
      },
    });

    expect(handlers.map((handler: { key: string }) => handler.key)).toEqual([
      'generate-vale',
    ]);
    expect(validateDispatchValeWorkflowInput).toHaveBeenCalledWith({
      baseUrl: 'https://lila.constroad.com',
      companyId: 'constroad',
      dispatchId: 'dispatch-vale-1',
      sender: '51902049935',
    });

    await handlers[0].run();

    expect(generateDispatchValeWorkflowMock).toHaveBeenCalledWith({
      baseUrl: 'https://lila.constroad.com',
      companyId: 'constroad',
      dispatchId: 'dispatch-vale-1',
      sender: '51902049935',
    });
  });

  it('registers delayed ipp ready notification handlers', async () => {
    validateDispatchIppReadyNotificationInput.mockReturnValue({
      companyId: 'constroad',
      message: 'IPP listo',
      sender: '51902049935',
      targets: ['120363043706150862@g.us'],
    });

    const handlers = getDomainEventHandlers({
      companyId: 'constroad',
      eventType: 'dispatch.ipp-report.ready-notification.requested',
      payload: {
        message: 'IPP listo',
        sender: '51902049935',
        targets: ['120363043706150862@g.us'],
      },
    });

    expect(handlers.map((handler: { key: string }) => handler.key)).toEqual([
      'send-ipp-ready-notification',
    ]);

    await handlers[0].run();

    expect(validateDispatchIppReadyNotificationInput).toHaveBeenCalledWith({
      companyId: 'constroad',
      message: 'IPP listo',
      sender: '51902049935',
      targets: ['120363043706150862@g.us'],
    });
    expect(runDispatchIppReadyNotification).toHaveBeenCalledWith({
      companyId: 'constroad',
      message: 'IPP listo',
      sender: '51902049935',
      targets: ['120363043706150862@g.us'],
    });
  });

  it('acquires handler runs without conflicting attempts operators', async () => {
    validateDispatchCompletionWorkflowInput.mockReturnValue({
      companyId: 'constroad',
      dispatchFinished: true,
      dispatchId: 'dispatch-1',
      state: 'despachado',
      truckDispatched: true,
    });
    buildDispatchCompletionContext.mockResolvedValue({
      dispatch: { _id: 'dispatch-1' },
    });
    runDispatchConfigUpdate.mockResolvedValue(undefined);
    runDispatchIppSync.mockResolvedValue(undefined);
    runDispatchIppDocumentReady.mockResolvedValue(undefined);
    runDispatchCompletionNotifications.mockResolvedValue(undefined);

    const domainEventModel = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'event-1',
          attempts: 1,
          companyId: 'constroad',
          eventType: 'dispatch.completed',
          payload: {
            dispatchFinished: true,
            dispatchId: 'dispatch-1',
            state: 'despachado',
            truckDispatched: true,
          },
        }),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };
    const handlerRunModel = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'handler-run-1',
          attempts: 1,
          companyId: 'constroad',
          eventId: 'event-1',
          handlerKey: 'config-update',
          status: 'running',
        }),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };

    getDomainEventModel.mockResolvedValue(domainEventModel);
    getDomainEventRunModel.mockResolvedValue(handlerRunModel);

    await processPendingDomainEvents(1);

    expect(handlerRunModel.findOneAndUpdate).toHaveBeenCalled();
    expect(handlerRunModel.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $inc: { attempts: 1 },
      $set: {
        completedAt: null,
        lastError: '',
        lockExpiresAt: expect.any(Date),
        status: 'running',
      },
      $setOnInsert: {
        eventType: 'dispatch.completed',
        runKey: 'handler:config-update',
        runType: 'handler',
      },
    });
  });

  it('marks events as exhausted after the max retry count', async () => {
    validateDispatchCompletionWorkflowInput.mockReturnValue({
      companyId: 'constroad',
      dispatchFinished: true,
      dispatchId: 'dispatch-1',
      state: 'despachado',
      truckDispatched: true,
    });
    buildDispatchCompletionContext.mockRejectedValue(new Error('ipp unavailable'));

    const domainEventModel = {
      findOneAndUpdate: jest
        .fn()
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue({
            _id: 'event-2',
            attempts: 8,
            companyId: 'constroad',
            eventType: 'dispatch.completed',
            payload: {
              dispatchFinished: true,
              dispatchId: 'dispatch-1',
              state: 'despachado',
              truckDispatched: true,
            },
          }),
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue(null),
        }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };
    const handlerRunModel = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'handler-run-2',
          attempts: 8,
          companyId: 'constroad',
          eventId: 'event-2',
          handlerKey: 'config-update',
          status: 'running',
        }),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };

    getDomainEventModel.mockResolvedValue(domainEventModel);
    getDomainEventRunModel.mockResolvedValue(handlerRunModel);

    const result = await processPendingDomainEvents(1);

    expect(result).toEqual([{ eventId: 'event-2', status: 'exhausted' }]);
    expect(domainEventModel.updateOne).toHaveBeenCalledWith(
      { _id: 'event-2' },
      {
        $set: expect.objectContaining({
          lastError: 'ipp unavailable',
          status: 'exhausted',
        }),
      }
    );
  });

  it('continues with later handlers when an earlier one fails', async () => {
    validateDispatchCompletionWorkflowInput.mockReturnValue({
      companyId: 'constroad',
      dispatchFinished: true,
      dispatchId: 'dispatch-1',
      sender: '51949376824',
      state: 'despachado',
      truckDispatched: true,
    });
    buildDispatchCompletionContext.mockResolvedValue({
      companyBotLabel: 'Globofast',
      dispatch: { _id: 'dispatch-1' },
      sender: '51949376824',
    });
    runDispatchConfigUpdate.mockResolvedValue(undefined);
    runDispatchIppSync.mockRejectedValue(new Error('ipp sync failed'));
    runDispatchIppDocumentReady.mockResolvedValue(undefined);
    runDispatchCompletionNotifications.mockResolvedValue(undefined);

    const domainEventModel = {
      findOneAndUpdate: jest
        .fn()
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue({
            _id: 'event-3',
            attempts: 1,
            companyId: 'constroad',
            eventType: 'dispatch.completed',
            payload: {
              dispatchFinished: true,
              dispatchId: 'dispatch-1',
              sender: '51949376824',
              state: 'despachado',
              truckDispatched: true,
            },
          }),
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue(null),
        }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };
    const handlerRunModel = {
      findOneAndUpdate: jest
        .fn()
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue({
            _id: 'run-1',
            attempts: 1,
            companyId: 'constroad',
            eventId: 'event-3',
            status: 'running',
          }),
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue({
            _id: 'run-2',
            attempts: 1,
            companyId: 'constroad',
            eventId: 'event-3',
            status: 'running',
          }),
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue({
            _id: 'run-3',
            attempts: 1,
            companyId: 'constroad',
            eventId: 'event-3',
            status: 'running',
          }),
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue({
            _id: 'run-4',
            attempts: 1,
            companyId: 'constroad',
            eventId: 'event-3',
            status: 'running',
          }),
        }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };

    getDomainEventModel.mockResolvedValue(domainEventModel);
    getDomainEventRunModel.mockResolvedValue(handlerRunModel);

    const result = await processPendingDomainEvents(1);

    expect(runDispatchCompletionNotifications).toHaveBeenCalledTimes(1);
    expect(runDispatchIppDocumentReady).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ eventId: 'event-3', status: 'failed' }]);
  });
});
