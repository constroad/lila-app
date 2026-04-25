import mongoose, { Model, Schema } from 'mongoose';
import { getSharedConnection } from '../database/sharedConnection.js';

export interface DispatchValeRunModel {
  companyId: string;
  dispatchId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  attempts: number;
  documentGenerated: boolean;
  mediaRegistered: boolean;
  whatsappFileSent: boolean;
  whatsappLocationSent: boolean;
  lockExpiresAt?: Date | null;
  lastError?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const DispatchValeRunSchema = new Schema<DispatchValeRunModel>(
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
    documentGenerated: { type: Boolean, required: true, default: false },
    mediaRegistered: { type: Boolean, required: true, default: false },
    whatsappFileSent: { type: Boolean, required: true, default: false },
    whatsappLocationSent: { type: Boolean, required: true, default: false },
    lockExpiresAt: { type: Date, required: false, default: null },
    lastError: { type: String, required: false, default: '' },
  },
  { timestamps: true, collection: 'dispatch_vale_runs' }
);

DispatchValeRunSchema.index(
  { companyId: 1, dispatchId: 1 },
  { unique: true, name: 'idx_dispatch_vale_run_unique' }
);

let dispatchValeRunModel: Model<DispatchValeRunModel> | null = null;

export async function getDispatchValeRunModel(): Promise<Model<DispatchValeRunModel>> {
  if (dispatchValeRunModel) {
    return dispatchValeRunModel;
  }

  const conn = await getSharedConnection();
  dispatchValeRunModel =
    (conn.models.DispatchValeRun as Model<DispatchValeRunModel>) ||
    conn.model<DispatchValeRunModel>('DispatchValeRun', DispatchValeRunSchema);

  return dispatchValeRunModel;
}

let DispatchValeRun: Model<DispatchValeRunModel>;

try {
  DispatchValeRun = mongoose.model<DispatchValeRunModel>('DispatchValeRun');
} catch {
  DispatchValeRun = mongoose.model<DispatchValeRunModel>(
    'DispatchValeRun',
    DispatchValeRunSchema
  );
}

export default DispatchValeRun;
