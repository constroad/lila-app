import mongoose, { Model, Schema } from 'mongoose';
import { getSharedConnection } from '../database/sharedConnection.js';

export const DOMAIN_EVENT_RUN_STATUS = {
  completed: 'completed',
  failed: 'failed',
  pending: 'pending',
  running: 'running',
} as const;

export type DomainEventRunModel = {
  companyId: string;
  eventId: string;
  eventType: string;
  runKey: string;
  runType: 'handler' | 'workflow';
  status: (typeof DOMAIN_EVENT_RUN_STATUS)[keyof typeof DOMAIN_EVENT_RUN_STATUS];
  attempts: number;
  lockExpiresAt?: Date | null;
  lastError?: string;
  completedAt?: Date | null;
  output?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
};

const DomainEventRunSchema = new Schema<DomainEventRunModel>(
  {
    companyId: { type: String, required: true, index: true },
    eventId: { type: String, required: true, index: true },
    eventType: { type: String, required: true, index: true },
    runKey: { type: String, required: true, index: true },
    runType: {
      type: String,
      required: true,
      enum: ['handler', 'workflow'],
      default: 'handler',
      index: true,
    },
    status: {
      type: String,
      required: true,
      default: DOMAIN_EVENT_RUN_STATUS.pending,
      enum: Object.values(DOMAIN_EVENT_RUN_STATUS),
      index: true,
    },
    attempts: { type: Number, required: true, default: 0 },
    lockExpiresAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    completedAt: { type: Date, default: null },
    output: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, collection: 'domain_event_runs' }
);

DomainEventRunSchema.index(
  { companyId: 1, eventId: 1, runKey: 1 },
  { name: 'idx_domain_event_runs_unique', unique: true }
);

let domainEventRunModel: Model<DomainEventRunModel> | null = null;

export async function getDomainEventRunModel(): Promise<Model<DomainEventRunModel>> {
  if (domainEventRunModel) {
    return domainEventRunModel;
  }

  const conn = await getSharedConnection();
  domainEventRunModel =
    (conn.models.DomainEventRun as Model<DomainEventRunModel>) ||
    conn.model<DomainEventRunModel>('DomainEventRun', DomainEventRunSchema);

  return domainEventRunModel;
}

let DomainEventRun: Model<DomainEventRunModel>;

try {
  DomainEventRun = mongoose.model<DomainEventRunModel>('DomainEventRun');
} catch {
  DomainEventRun = mongoose.model<DomainEventRunModel>(
    'DomainEventRun',
    DomainEventRunSchema
  );
}

export default DomainEventRun;
