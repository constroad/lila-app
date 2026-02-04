import mongoose, { Schema, Document } from 'mongoose';

export interface ICronJobMessage {
  sender?: string; // legacy (no usar para envio)
  chatId: string;
  body: string;
  mentions?: string[];
}

export interface ICronJobApiConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: any;
}

export interface ICronJobSchedule {
  cronExpression: string;
  timezone?: string;
  nextRun?: Date;
  lastRun?: Date;
}

export interface ICronJobRetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  currentRetries?: number;
}

export interface ICronJobHistoryEntry {
  status: 'success' | 'error';
  timestamp: Date;
  duration?: number;
  error?: string;
  metadata?: any;
}

export interface ICronJobMetadata {
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  legacyId?: string;
  legacyCompany?: string;
}

export interface ICronJob extends Document {
  companyId: string;
  name: string;
  type: 'api' | 'message';
  isActive: boolean;
  timeout?: number;

  message?: ICronJobMessage;
  apiConfig?: ICronJobApiConfig;

  schedule: ICronJobSchedule;
  retryPolicy: ICronJobRetryPolicy;

  status?: 'idle' | 'running' | 'success' | 'error';
  lastExecution?: Date;
  failureCount: number;
  lastError?: string;

  history: ICronJobHistoryEntry[];
  metadata: ICronJobMetadata;
}

const CronJobMessageSchema = new Schema<ICronJobMessage>(
  {
    sender: { type: String },
    chatId: { type: String, required: true },
    body: { type: String },
    mentions: [{ type: String }],
  },
  { _id: false }
);

const CronJobApiConfigSchema = new Schema<ICronJobApiConfig>(
  {
    url: { type: String, required: true },
    method: { type: String, enum: ['GET', 'POST', 'PUT'], default: 'GET' },
    headers: { type: Map, of: String },
    body: Schema.Types.Mixed,
  },
  { _id: false }
);

const CronJobScheduleSchema = new Schema<ICronJobSchedule>(
  {
    cronExpression: { type: String, required: true },
    timezone: { type: String, default: 'America/Lima' },
    nextRun: Date,
    lastRun: Date,
  },
  { _id: false }
);

const CronJobRetryPolicySchema = new Schema<ICronJobRetryPolicy>(
  {
    maxRetries: { type: Number, default: 3 },
    backoffMultiplier: { type: Number, default: 2 },
    currentRetries: { type: Number, default: 0 },
  },
  { _id: false }
);

const CronJobHistoryEntrySchema = new Schema<ICronJobHistoryEntry>(
  {
    status: { type: String, enum: ['success', 'error'], required: true },
    timestamp: { type: Date, required: true },
    duration: Number,
    error: String,
    metadata: Schema.Types.Mixed,
  },
  { _id: false }
);

const CronJobMetadataSchema = new Schema<ICronJobMetadata>(
  {
    createdBy: String,
    updatedBy: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    tags: [String],
    legacyId: String,
    legacyCompany: String,
  },
  { _id: false }
);

const CronJobSchema = new Schema<ICronJob>(
  {
    companyId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    type: {
      type: String,
      enum: ['api', 'message'],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    timeout: { type: Number, default: 30000 },

    message: CronJobMessageSchema,
    apiConfig: CronJobApiConfigSchema,

    schedule: {
      type: CronJobScheduleSchema,
      required: true,
    },

    retryPolicy: {
      type: CronJobRetryPolicySchema,
      default: () => ({
        maxRetries: 3,
        backoffMultiplier: 2,
        currentRetries: 0,
      }),
    },

    status: {
      type: String,
      enum: ['idle', 'running', 'success', 'error'],
      default: 'idle',
    },
    lastExecution: Date,
    failureCount: {
      type: Number,
      default: 0,
    },
    lastError: String,

    history: {
      type: [CronJobHistoryEntrySchema],
      default: [],
    },

    metadata: {
      type: CronJobMetadataSchema,
      default: () => ({
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      }),
    },
  },
  {
    timestamps: true,
  }
);

CronJobSchema.index({ companyId: 1, isActive: 1 });
CronJobSchema.index({ companyId: 1, type: 1 });
CronJobSchema.index({ 'schedule.nextRun': 1 }, { sparse: true });

CronJobSchema.pre('validate', function () {
  if (this.type === 'message' && !this.message) {
    this.invalidate('message', 'message is required when type is "message"');
  }
  if (this.type === 'message' && (!this.message?.body || !this.message.body.trim())) {
    this.invalidate('message.body', 'message body is required when type is "message"');
  }
  if (this.type === 'api' && !this.apiConfig) {
    this.invalidate('apiConfig', 'apiConfig is required when type is "api"');
  }
});

CronJobSchema.pre('save', function () {
  if (this.history && this.history.length > 50) {
    this.history = this.history.slice(-50);
  }
});

export { CronJobSchema };
