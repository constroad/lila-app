import mongoose, { Model, Schema, Document } from 'mongoose';
import { getSharedConnection } from '../database/sharedConnection.js';

export interface ServiceReportModel extends Document {
  serviceManagementId: string;
  type: string;
  status: 'draft' | 'in_progress' | 'completed';
  title?: string;
  description?: string;
  schemaData?: Record<string, any>;
  generatedDocuments?: {
    docxUrl?: string;
    pdfUrl?: string;
    generatedAt?: string;
    totalPages?: number;
    mainPages?: number;
    annexPages?: number;
  };
  draftData?: {
    schemaData: Record<string, any>;
    schemaOverrides?: Record<string, any>;
    customSections?: Array<Record<string, any>>;
    annexes?: Array<Record<string, any>>;
    folioConfig?: Record<string, any>;
    savedAt: string;
    savedBy: string;
  };
  editLock?: {
    lockedBy: string;
    lockedAt: string;
    expiresAt: string;
  };
  auditLog?: Array<{
    action: string;
    userId: string;
    userName: string;
    timestamp: string;
    changes?: Array<{
      field: string;
      oldValue: any;
      newValue: any;
    }>;
  }>;
  attachments?: Array<{
    mediaId: string;
    filename: string;
    mediaType: string;
    purpose: string;
  }>;
  schemaOverrides?: Record<string, any>;
  customSections?: Array<Record<string, any>>;
  annexes?: Array<Record<string, any>>;
  folioConfig?: Record<string, any>;
  // Legacy fields for backward compatibility
  sections?: Record<string, any>;
  metrics?: Record<string, any>;
  visibility?: boolean;
}

const ServiceReportSchema = new Schema<ServiceReportModel>(
  {
    serviceManagementId: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, required: true, default: 'draft' },
    title: { type: String, required: false },
    description: { type: String, required: false },
    schemaData: { type: Schema.Types.Mixed, required: false },
    generatedDocuments: {
      docxUrl: { type: String, required: false },
      pdfUrl: { type: String, required: false },
      generatedAt: { type: String, required: false },
      totalPages: { type: Number, required: false },
      mainPages: { type: Number, required: false },
      annexPages: { type: Number, required: false },
    },
    draftData: {
      schemaData: { type: Schema.Types.Mixed, required: false },
      schemaOverrides: { type: Schema.Types.Mixed, required: false },
      customSections: { type: [Schema.Types.Mixed], required: false, default: [] },
      annexes: { type: [Schema.Types.Mixed], required: false, default: [] },
      folioConfig: { type: Schema.Types.Mixed, required: false },
      savedAt: { type: String, required: false },
      savedBy: { type: String, required: false },
    },
    editLock: {
      lockedBy: { type: String, required: false },
      lockedAt: { type: String, required: false },
      expiresAt: { type: String, required: false },
    },
    auditLog: { type: [Schema.Types.Mixed], required: false, default: [] },
    attachments: { type: [Schema.Types.Mixed], required: false, default: [] },
    schemaOverrides: { type: Schema.Types.Mixed, required: false },
    customSections: { type: [Schema.Types.Mixed], required: false, default: [] },
    annexes: { type: [Schema.Types.Mixed], required: false, default: [] },
    folioConfig: { type: Schema.Types.Mixed, required: false },
    sections: { type: Schema.Types.Mixed, required: false },
    metrics: { type: Schema.Types.Mixed, required: false },
    visibility: { type: Boolean, required: false, default: false },
  },
  { timestamps: true }
);

ServiceReportSchema.index({ serviceManagementId: 1, type: 1 });

let serviceReportModel: Model<ServiceReportModel> | null = null;

export async function getServiceReportModel(): Promise<Model<ServiceReportModel>> {
  if (serviceReportModel) {
    return serviceReportModel;
  }

  const conn = await getSharedConnection();
  serviceReportModel =
    (conn.models.ServiceManagementReport as Model<ServiceReportModel>) ||
    conn.model<ServiceReportModel>('ServiceManagementReport', ServiceReportSchema);
  return serviceReportModel;
}

export default ServiceReportSchema;
