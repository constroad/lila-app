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
  slug?: string;
  ruc?: string;
  email?: string;
  phone?: string;
  address?: string;
  branding?: {
    logoLight?: string;
    logoDark?: string;
    favicon?: string;
  };
  documentSettings?: Record<string, unknown>;
  whatsappConfig?: {
    sender?: string;
    adminGroupId?: string;
    aiEnabled?: boolean;
    cronjobPrefix?: string;
  };

  /**
   * Webhook del proveedor de GPS (Flota F4). Se declara acá —y no se deja al
   * schema laxo— porque por este campo se RESUELVE la empresa del token: una ruta
   * no declarada que `strictQuery` descartara devolvería la primera empresa de la
   * colección. El token en claro nunca se guarda: solo su hash.
   */
  fleetSettings?: {
    gpsWebhook?: {
      secretHash?: string;
      tokenPrefix?: string;
      provider?: string;
      isActive?: boolean;
      createdAt?: Date;
      lastUsedAt?: Date;
      lastPoints?: number;
    };
  };

  // Multi-tenant configuration
  limits: ICompanyLimits;
  isActive: boolean;
  features?: {
    modules?: {
      drive?: boolean;
    };
  };

  // API Key for lila-app direct access (FE)
  'api-key-lila-access'?: {
    keyHash?: string;
    keyEncrypted?: string;
    keyPrefix?: string;
    last4?: string;
    isActive?: boolean;
    createdAt?: Date;
    rotatedAt?: Date;
    lastUsedAt?: Date;
    lastUsedIp?: string;
    allowedOrigins?: string[];
    allowedSenders?: string[];
    rateLimit?: {
      limit: number;
      windowMs: number;
    };
  };

  // Subscription (shared_db)
  subscription?: {
    limits?: {
      cronJobs?: number;
    };
    usage?: {
      cronJobs?: number;
      whatsappMessages?: number;
      storage?: number;
      whatsappSessions?: number;
      apiCallsThisMinute?: number;
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
    slug: {
      type: String,
      index: true,
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
    branding: {
      logoLight: { type: String },
      logoDark: { type: String },
      favicon: { type: String },
    },
    documentSettings: {
      type: Schema.Types.Mixed,
      required: false,
    },
    whatsappConfig: {
      sender: { type: String },
      adminGroupId: { type: String },
      aiEnabled: { type: Boolean, default: false },
      cronjobPrefix: { type: String },
    },
    // Solo el subdoc del webhook de GPS: el resto de `fleetSettings` lo administra
    // el Portal y lila no necesita verlo (menos superficie, menos divergencia).
    fleetSettings: {
      gpsWebhook: {
        secretHash: { type: String },
        tokenPrefix: { type: String },
        provider: { type: String },
        isActive: { type: Boolean },
        createdAt: { type: Date },
        lastUsedAt: { type: Date },
        lastPoints: { type: Number },
      },
    },
    limits: {
      type: CompanyLimitsSchema,
      required: true,
      default: () => ({}), // Usa defaults del sub-schema
    },
    features: {
      modules: {
        drive: { type: Boolean, default: false },
      },
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

    // API Key for lila-app direct access (FE)
    'api-key-lila-access': {
      keyHash: { type: String },
      keyEncrypted: { type: String },
      keyPrefix: { type: String },
      last4: { type: String },
      isActive: { type: Boolean, default: false },
      createdAt: { type: Date },
      rotatedAt: { type: Date },
      lastUsedAt: { type: Date },
      lastUsedIp: { type: String },
      allowedOrigins: { type: [String], default: [] },
      allowedSenders: { type: [String], default: [] },
      rateLimit: {
        limit: { type: Number },
        windowMs: { type: Number },
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
CompanySchema.index({ slug: 1 }, { unique: true, sparse: true });

// ============================================================================
// EXPORT
// ============================================================================

// NOTA: Este modelo se crea dinámicamente en QuotaValidatorService
// para evitar problemas con múltiples conexiones de mongoose
export default CompanySchema;
export { CompanySchema };
