/**
 * Company Model - Portal MongoDB Schema
 *
 * Modelo de solo lectura para acceder a la información de empresas
 * desde la base de datos de Portal. Usado para validar quotas.
 *
 * Fase 10: Quotas y Validaciones
 *
 * IMPORTANTE: Este modelo es READ-ONLY desde lila-app.
 * Solo Portal debe modificar datos de Company.
 */

import mongoose, { Schema, Document } from 'mongoose';

// ============================================================================
// TYPES
// ============================================================================

export interface ICompanyLimits {
  whatsappMessages: number; // Límite mensual de mensajes de WhatsApp
  storage: number; // Límite de almacenamiento en GB
  users: number; // Número máximo de usuarios
  orders: number; // Número máximo de órdenes activas
}

export interface ICompany extends Document {
  companyId: string; // ID único de la empresa
  name: string;
  ruc?: string;
  email?: string;
  phone?: string;
  address?: string;
  whatsappConfig?: {
    sender?: string;
    adminGroupId?: string;
    aiEnabled?: boolean;
    cronjobPrefix?: string;
  };

  // Multi-tenant configuration
  limits: ICompanyLimits;
  isActive: boolean;

  // Subscription (shared_db)
  subscription?: {
    limits?: {
      cronJobs?: number;
    };
    usage?: {
      cronJobs?: number;
    };
  };

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// SCHEMA
// ============================================================================

const CompanyLimitsSchema = new Schema<ICompanyLimits>(
  {
    whatsappMessages: {
      type: Number,
      required: true,
      default: 1000,
      min: 0,
    },
    storage: {
      type: Number,
      required: true,
      default: 10, // 10 GB
      min: 0,
    },
    users: {
      type: Number,
      required: true,
      default: 5,
      min: 1,
    },
    orders: {
      type: Number,
      required: true,
      default: 100,
      min: 0,
    },
  },
  { _id: false }
);

const CompanySchema = new Schema<ICompany>(
  {
    companyId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    ruc: {
      type: String,
      sparse: true,
    },
    email: {
      type: String,
      sparse: true,
    },
    phone: {
      type: String,
    },
    address: {
      type: String,
    },
    whatsappConfig: {
      sender: { type: String },
      adminGroupId: { type: String },
      aiEnabled: { type: Boolean, default: false },
      cronjobPrefix: { type: String },
    },
    limits: {
      type: CompanyLimitsSchema,
      required: true,
      default: () => ({}), // Usa defaults del sub-schema
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    subscription: {
      limits: {
        cronJobs: { type: Number },
      },
      usage: {
        cronJobs: { type: Number },
      },
    },
  },
  {
    timestamps: true,
    collection: 'companies', // Nombre de la colección en Portal
  }
);

// ============================================================================
// INDEXES
// ============================================================================

CompanySchema.index({ isActive: 1 });

// ============================================================================
// EXPORT
// ============================================================================

// NOTA: Este modelo se crea dinámicamente en QuotaValidatorService
// para evitar problemas con múltiples conexiones de mongoose
export default CompanySchema;
export { CompanySchema };
