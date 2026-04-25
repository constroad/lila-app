import mongoose, { Model, Schema } from 'mongoose';
import { getSharedConnection } from '../database/sharedConnection.js';

export interface DispatchPostProcessRunModel {
  companyId: string;
  dispatchId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  attempts: number;
  configUpdated: boolean;
  ippSynced: boolean;
  clientAlertSent: boolean;
  clientFinalAlertSent: boolean;
  plantProgressAlertSent: boolean;
  plantFinishedAlertSent: boolean;
  lockExpiresAt?: Date;
  lastError?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const DispatchPostProcessRunSchema = new Schema<DispatchPostProcessRunModel>(
  {
    companyId: { type: String, required: true, index: true },
    dispatchId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed'],
      required: true,
      default: 'queued',
    },
    attempts: { type: Number, required: true, default: 0 },
    configUpdated: { type: Boolean, required: true, default: false },
    ippSynced: { type: Boolean, required: true, default: false },
    clientAlertSent: { type: Boolean, required: true, default: false },
    clientFinalAlertSent: { type: Boolean, required: true, default: false },
    plantProgressAlertSent: { type: Boolean, required: true, default: false },
    plantFinishedAlertSent: { type: Boolean, required: true, default: false },
    lockExpiresAt: { type: Date, required: false },
    lastError: { type: String, required: false },
  },
  { timestamps: true, collection: 'dispatch_post_process_runs' }
);

DispatchPostProcessRunSchema.index(
  { companyId: 1, dispatchId: 1 },
  { unique: true, name: 'idx_dispatch_post_process_unique' }
);

let dispatchPostProcessRunModel: Model<DispatchPostProcessRunModel> | null = null;

export async function getDispatchPostProcessRunModel(): Promise<
  Model<DispatchPostProcessRunModel>
> {
  if (dispatchPostProcessRunModel) {
    return dispatchPostProcessRunModel;
  }

  const conn = await getSharedConnection();
  dispatchPostProcessRunModel =
    (conn.models.DispatchPostProcessRun as Model<DispatchPostProcessRunModel>) ||
    conn.model<DispatchPostProcessRunModel>(
      'DispatchPostProcessRun',
      DispatchPostProcessRunSchema
    );

  return dispatchPostProcessRunModel;
}
