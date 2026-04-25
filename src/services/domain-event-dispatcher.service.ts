import {
  buildDispatchCompletionContext,
  runDispatchIppDocumentReady,
  runDispatchIppReadyNotification,
  runDispatchCompletionNotifications,
  runDispatchConfigUpdate,
  runDispatchIppSync,
  validateDispatchIppReadyNotificationInput,
  validateDispatchCompletionWorkflowInput,
  type DispatchContext,
  type DispatchCompletionWorkflowInput,
} from './dispatch-completion.service.js';
import {
  generateDispatchValeWorkflow,
  validateDispatchValeWorkflowInput,
} from './dispatch-vale.service.js';

export type DomainEventLike = {
  companyId: string;
  eventType: string;
  payload: Record<string, unknown>;
};

export type DomainEventHandler = {
  key: string;
  run: () => Promise<void>;
};

function buildDispatchCompletedHandlers(
  event: DomainEventLike
): DomainEventHandler[] {
  const input = validateDispatchCompletionWorkflowInput({
    ...event.payload,
    companyId: event.companyId,
  });
  let contextPromise: Promise<DispatchContext> | null = null;
  const getContext = () => {
    if (!contextPromise) {
      contextPromise = buildDispatchCompletionContext(input);
    }

    return contextPromise;
  };

  return [
    {
      key: 'config-update',
      run: async () => {
        await runDispatchConfigUpdate({
          context: await getContext(),
          input,
        });
      },
    },
    {
      key: 'ipp-sync',
      run: async () => {
        await runDispatchIppSync({
          context: await getContext(),
          input,
        });
      },
    },
    {
      key: 'ipp-document',
      run: async () => {
        await runDispatchIppDocumentReady({
          context: await getContext(),
          input,
        });
      },
    },
    {
      key: 'notifications',
      run: async () => {
        await runDispatchCompletionNotifications({
          context: await getContext(),
          input,
        });
      },
    },
  ];
}

function buildDispatchValeRequestedHandlers(
  event: DomainEventLike
): DomainEventHandler[] {
  const input = validateDispatchValeWorkflowInput({
    ...event.payload,
    companyId: event.companyId,
  });

  return [
    {
      key: 'generate-vale',
      run: async () => {
        await generateDispatchValeWorkflow(input);
      },
    },
  ];
}

function buildDispatchIppReadyNotificationHandlers(
  event: DomainEventLike
): DomainEventHandler[] {
  const input = validateDispatchIppReadyNotificationInput({
    ...event.payload,
    companyId: event.companyId,
  });

  return [
    {
      key: 'send-ipp-ready-notification',
      run: async () => {
        await runDispatchIppReadyNotification(input);
      },
    },
  ];
}

const domainEventHandlers: Record<
  string,
  (event: DomainEventLike) => DomainEventHandler[]
> = {
  'dispatch.completed': buildDispatchCompletedHandlers,
  'dispatch.ipp-report.ready-notification.requested': buildDispatchIppReadyNotificationHandlers,
  'dispatch.vale.requested': buildDispatchValeRequestedHandlers,
};

export function getDomainEventHandlers(event: DomainEventLike): DomainEventHandler[] {
  return domainEventHandlers[event.eventType]?.(event) || [];
}
