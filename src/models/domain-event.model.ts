import mongoose, { Model, Schema } from 'mongoose';
import { getSharedConnection } from '../database/sharedConnection.js';

export const DOMAIN_EVENT_STATUS = {
  completed: 'completed',
  exhausted: 'exhausted',
  failed: 'failed',
  pending: 'pending',
  processing: 'processing',
} as const;

export interface DomainEventModel {
  sourceEventId?: string;
  companyId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  status: (typeof DOMAIN_EVENT_STATUS)[keyof typeof DOMAIN_EVENT_STATUS];
  attempts: number;
  nextAttemptAt: Date;
  lockExpiresAt?: Date | null;
  lastError?: string;
  lastProcessedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const DomainEventSchema = new Schema<DomainEventModel>(
  {
    sourceEventId: { type: String },
    companyId: { type: String, required: true, index: true },
    aggregateId: { type: String, required: true, index: true },
    aggregateType: { type: String, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true, default: {} },
    occurredAt: { type: Date, required: true, default: () => new Date() },
    status: {
      type: String,
      required: true,
      default: DOMAIN_EVENT_STATUS.pending,
      enum: Object.values(DOMAIN_EVENT_STATUS),
      index: true,
    },
    attempts: { type: Number, required: true, default: 0 },
    nextAttemptAt: { type: Date, required: true, default: () => new Date(), index: true },
    lockExpiresAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    lastProcessedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'domain_events' }
);

DomainEventSchema.index(
  { companyId: 1, sourceEventId: 1 },
  { name: 'idx_domain_events_source_unique', sparse: true, unique: true }
);
DomainEventSchema.index(
  { status: 1, nextAttemptAt: 1, createdAt: 1 },
  { name: 'idx_domain_events_queue' }
);

let domainEventModel: Model<DomainEventModel> | null = null;

export async function getDomainEventModel(): Promise<Model<DomainEventModel>> {
  if (domainEventModel) {
    return domainEventModel;
  }

  const conn = await getSharedConnection();
  domainEventModel =
    (conn.models.DomainEvent as Model<DomainEventModel>) ||
    conn.model<DomainEventModel>('DomainEvent', DomainEventSchema);

  return domainEventModel;
}

let DomainEvent: Model<DomainEventModel>;

try {
  DomainEvent = mongoose.model<DomainEventModel>('DomainEvent');
} catch {
  DomainEvent = mongoose.model<DomainEventModel>('DomainEvent', DomainEventSchema);
}

export default DomainEvent;
