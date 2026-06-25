import mongoose, { Schema, Document } from 'mongoose';

export interface IUsageMetric extends Document {
  companyId: string;
  period: string;
  whatsapp: {
    total: number;
    daily: Record<string, number>;
  };
  /** Ejecuciones de cron jobs en el mes (mensual; se incrementa por disparo). */
  cronRuns: {
    total: number;
    daily: Record<string, number>;
  };
  storage: {
    total: number;
    byModule: Record<string, number>;
  };
  apiCalls: {
    total: number;
    byEndpoint: Record<string, number>;
  };
  users: {
    active: number;
    total: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UsageMetricSchema = new Schema<IUsageMetric>(
  {
    companyId: {
      type: String,
      required: true,
      ref: 'Company',
      index: true,
    },
    period: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
      index: true,
    },
    whatsapp: {
      total: { type: Number, default: 0 },
      daily: { type: Map, of: Number, default: {} },
    },
    cronRuns: {
      total: { type: Number, default: 0 },
      daily: { type: Map, of: Number, default: {} },
    },
    storage: {
      total: { type: Number, default: 0 },
      byModule: { type: Map, of: Number, default: {} },
    },
    apiCalls: {
      total: { type: Number, default: 0 },
      byEndpoint: { type: Map, of: Number, default: {} },
    },
    users: {
      active: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    collection: 'usage_metrics',
  }
);

UsageMetricSchema.index({ companyId: 1, period: 1 }, { unique: true });

export default UsageMetricSchema;
export { UsageMetricSchema };
