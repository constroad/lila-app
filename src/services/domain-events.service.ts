import logger from '../utils/logger.js';
import { DOMAIN_EVENT_MAX_ATTEMPTS } from '../config/constants.js';
import {
  DOMAIN_EVENT_RUN_STATUS,
  getDomainEventRunModel,
  type DomainEventRunModel,
} from '../models/domain-event-run.model.js';
import {
  DOMAIN_EVENT_STATUS,
  getDomainEventModel,
  type DomainEventModel,
} from '../models/domain-event.model.js';
import { getDomainEventHandlers } from './domain-event-dispatcher.service.js';

const DOMAIN_EVENT_LOCK_MS = 60 * 1000;
const DOMAIN_EVENT_HANDLER_LOCK_MS = 60 * 1000;
const DOMAIN_EVENT_WORKER_INTERVAL_MS = 5000;
const DOMAIN_EVENT_BATCH_SIZE = 5;

export type DomainEventInput = {
  sourceEventId?: string;
  companyId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: Record<string, unknown>;
  availableAt?: Date | string;
  occurredAt?: Date | string;
};

let domainEventWorkerTimer: NodeJS.Timeout | null = null;
let domainEventWorkerRunning = false;
let domainEventWorkerScheduled = false;

function getRetryDelayMs(attempts: number): number {
  const retries = Math.max(1, attempts);
  return Math.min(60_000, 2 ** Math.min(retries, 5) * 1000);
}

function toDate(value?: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

async function acquirePendingDomainEvent(): Promise<
  (DomainEventModel & { _id: unknown }) | null
> {
  const DomainEventModel = await getDomainEventModel();
  const now = new Date();

  return DomainEventModel.findOneAndUpdate(
    {
      nextAttemptAt: { $lte: now },
      status: {
        $in: [DOMAIN_EVENT_STATUS.pending, DOMAIN_EVENT_STATUS.failed],
      },
      $or: [
        { lockExpiresAt: null },
        { lockExpiresAt: { $exists: false } },
        { lockExpiresAt: { $lt: now } },
      ],
    },
    {
      $inc: { attempts: 1 },
      $set: {
        lockExpiresAt: new Date(now.getTime() + DOMAIN_EVENT_LOCK_MS),
        status: DOMAIN_EVENT_STATUS.processing,
      },
    },
    {
      new: true,
      sort: { nextAttemptAt: 1, createdAt: 1 },
    }
  ).lean();
}

async function markDomainEventCompleted(eventId: string) {
  const DomainEventModel = await getDomainEventModel();

  await DomainEventModel.updateOne(
    { _id: eventId },
    {
      $set: {
        lastError: '',
        lastProcessedAt: new Date(),
        lockExpiresAt: null,
        status: DOMAIN_EVENT_STATUS.completed,
      },
    }
  );
}

async function markDomainEventFailed(params: {
  attempts: number;
  eventId: string;
  error: unknown;
}) {
  const DomainEventModel = await getDomainEventModel();
  const isExhausted = params.attempts >= DOMAIN_EVENT_MAX_ATTEMPTS;

  await DomainEventModel.updateOne(
    { _id: params.eventId },
    {
      $set: {
        lastError:
          params.error instanceof Error ? params.error.message : String(params.error),
        lastProcessedAt: isExhausted ? new Date() : null,
        lockExpiresAt: null,
        nextAttemptAt: isExhausted
          ? new Date()
          : new Date(Date.now() + getRetryDelayMs(params.attempts)),
        status: isExhausted ? DOMAIN_EVENT_STATUS.exhausted : DOMAIN_EVENT_STATUS.failed,
      },
    }
  );
}

async function acquireHandlerRun(params: {
  companyId: string;
  eventId: string;
  eventType: string;
  handlerKey: string;
}): Promise<(DomainEventRunModel & { _id: unknown }) | null> {
  const EventRunModel = await getDomainEventRunModel();
  const now = new Date();
  const runKey = `handler:${params.handlerKey}`;

  try {
    return await EventRunModel.findOneAndUpdate(
      {
        companyId: params.companyId,
        eventId: params.eventId,
        runKey,
        status: { $ne: DOMAIN_EVENT_RUN_STATUS.completed },
        $or: [
          { lockExpiresAt: null },
          { lockExpiresAt: { $exists: false } },
          { lockExpiresAt: { $lt: now } },
          { status: { $ne: DOMAIN_EVENT_RUN_STATUS.running } },
        ],
      },
      {
        $setOnInsert: {
          eventType: params.eventType,
          runKey,
          runType: 'handler',
        },
        $inc: { attempts: 1 },
        $set: {
          completedAt: null,
          lastError: '',
          lockExpiresAt: new Date(now.getTime() + DOMAIN_EVENT_HANDLER_LOCK_MS),
          status: DOMAIN_EVENT_RUN_STATUS.running,
        },
      },
      { new: true, upsert: true }
    ).lean();
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      return null;
    }

    throw error;
  }
}

async function markHandlerRunCompleted(params: {
  companyId: string;
  eventId: string;
  handlerKey: string;
}) {
  const EventRunModel = await getDomainEventRunModel();

  await EventRunModel.updateOne(
    {
      companyId: params.companyId,
      eventId: params.eventId,
      runKey: `handler:${params.handlerKey}`,
    },
    {
      $set: {
        completedAt: new Date(),
        lastError: '',
        lockExpiresAt: null,
        status: DOMAIN_EVENT_RUN_STATUS.completed,
      },
    }
  );
}

async function markHandlerRunFailed(params: {
  companyId: string;
  eventId: string;
  handlerKey: string;
  error: unknown;
}) {
  const EventRunModel = await getDomainEventRunModel();

  await EventRunModel.updateOne(
    {
      companyId: params.companyId,
      eventId: params.eventId,
      runKey: `handler:${params.handlerKey}`,
    },
    {
      $set: {
        lastError:
          params.error instanceof Error ? params.error.message : String(params.error),
        lockExpiresAt: null,
        status: DOMAIN_EVENT_RUN_STATUS.failed,
      },
    }
  );
}

async function runEventHandlers(event: DomainEventModel & { _id: unknown }) {
  const handlers = getDomainEventHandlers({
    companyId: event.companyId,
    eventType: event.eventType,
    payload: event.payload,
  });

  if (handlers.length === 0) {
    throw new Error(`No handlers registered for ${event.eventType}`);
  }

  for (const handler of handlers) {
    const handlerRun = await acquireHandlerRun({
      companyId: event.companyId,
      eventId: String(event._id),
      eventType: event.eventType,
      handlerKey: handler.key,
    });

    if (!handlerRun) {
      continue;
    }

    try {
      await handler.run();
      await markHandlerRunCompleted({
        companyId: event.companyId,
        eventId: String(event._id),
        handlerKey: handler.key,
      });
    } catch (error) {
      await markHandlerRunFailed({
        companyId: event.companyId,
        eventId: String(event._id),
        handlerKey: handler.key,
        error,
      });
      throw error;
    }
  }
}

async function runDomainEventWorkerTick(limit = DOMAIN_EVENT_BATCH_SIZE) {
  if (domainEventWorkerRunning) {
    return [];
  }

  domainEventWorkerRunning = true;

  try {
    const results: Array<{ eventId: string; status: string }> = [];

    for (let index = 0; index < limit; index += 1) {
      const event = await acquirePendingDomainEvent();
      if (!event) {
        break;
      }

      try {
        await runEventHandlers(event);
        await markDomainEventCompleted(String(event._id));
        results.push({ eventId: String(event._id), status: DOMAIN_EVENT_STATUS.completed });
      } catch (error) {
        const nextStatus =
          event.attempts >= DOMAIN_EVENT_MAX_ATTEMPTS
            ? DOMAIN_EVENT_STATUS.exhausted
            : DOMAIN_EVENT_STATUS.failed;
        await markDomainEventFailed({
          attempts: event.attempts,
          eventId: String(event._id),
          error,
        });
        results.push({ eventId: String(event._id), status: nextStatus });
        logger.error('domain_event.processing_failed', {
          attempts: event.attempts,
          companyId: event.companyId,
          eventId: String(event._id),
          eventType: event.eventType,
          error,
        });
      }
    }

    return results;
  } finally {
    domainEventWorkerRunning = false;
  }
}

export async function enqueueDomainEvent(input: DomainEventInput) {
  const DomainEventModel = await getDomainEventModel();

  if (input.sourceEventId) {
    const existingEvent = await DomainEventModel.findOne({
      companyId: input.companyId,
      sourceEventId: input.sourceEventId,
    }).lean();
    if (existingEvent) {
      scheduleDomainEventProcessing();
      return existingEvent;
    }
  }

  const createdEvent = await DomainEventModel.create({
    sourceEventId: input.sourceEventId,
    companyId: input.companyId,
    aggregateId: input.aggregateId,
    aggregateType: input.aggregateType,
    eventType: input.eventType,
    occurredAt: toDate(input.occurredAt),
    payload: input.payload,
    status: DOMAIN_EVENT_STATUS.pending,
    nextAttemptAt: toDate(input.availableAt),
  });

  scheduleDomainEventProcessing();
  return createdEvent.toObject();
}

export async function processPendingDomainEvents(limit = DOMAIN_EVENT_BATCH_SIZE) {
  return runDomainEventWorkerTick(limit);
}

export function scheduleDomainEventProcessing() {
  if (domainEventWorkerScheduled) {
    return;
  }

  domainEventWorkerScheduled = true;
  setImmediate(() => {
    domainEventWorkerScheduled = false;
    void processPendingDomainEvents().catch((error) => {
      logger.error('domain_event.schedule_failed', { error });
    });
  });
}

export function startDomainEventWorker() {
  if (domainEventWorkerTimer) {
    return;
  }

  scheduleDomainEventProcessing();
  domainEventWorkerTimer = setInterval(() => {
    void processPendingDomainEvents().catch((error) => {
      logger.error('domain_event.worker_failed', { error });
    });
  }, DOMAIN_EVENT_WORKER_INTERVAL_MS);
}

export function stopDomainEventWorker() {
  if (!domainEventWorkerTimer) {
    return;
  }

  clearInterval(domainEventWorkerTimer);
  domainEventWorkerTimer = null;
}
