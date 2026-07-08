import { Schema, type Model } from 'mongoose';
import { getSharedConnection } from './sharedConnection.js';
import { CronJobSchema, ICronJob } from '../models/cronjob.model.js';
import { CompanySchema, ICompany } from '../models/company.model.js';
import { UsageMetricSchema, IUsageMetric } from '../models/usage-metric.model.js';

let cronJobModel: Model<ICronJob> | null = null;
let companyModel: Model<ICompany> | null = null;
let configModel: Model<Record<string, unknown>> | null = null;
let usageMetricModel: Model<IUsageMetric> | null = null;
const looseSchema = new Schema({}, { strict: false });

export async function getCronJobModel(): Promise<Model<ICronJob>> {
  if (cronJobModel) {
    return cronJobModel;
  }

  const conn = await getSharedConnection();
  cronJobModel =
    (conn.models.CronJob as Model<ICronJob>) ||
    conn.model<ICronJob>('CronJob', CronJobSchema);
  return cronJobModel;
}

export async function getCompanyModel(): Promise<Model<ICompany>> {
  if (companyModel) {
    return companyModel;
  }

  const conn = await getSharedConnection();
  companyModel =
    (conn.models.Company as Model<ICompany>) ||
    conn.model<ICompany>('Company', CompanySchema);
  return companyModel;
}

export async function getConfigModel(): Promise<Model<Record<string, unknown>>> {
  if (configModel) {
    return configModel;
  }

  const conn = await getSharedConnection();
  configModel =
    (conn.models.Config as Model<Record<string, unknown>>) ||
    conn.model<Record<string, unknown>>('Config', looseSchema, 'configs');
  return configModel;
}

let orderModel: Model<Record<string, unknown>> | null = null;
let mediaModel: Model<Record<string, unknown>> | null = null;
let folderModel: Model<Record<string, unknown>> | null = null;

/** Pedidos del Portal (loose): lectura + escritura del subdoc exportJob. */
export async function getOrderModel(): Promise<Model<Record<string, unknown>>> {
  if (orderModel) {
    return orderModel;
  }

  const conn = await getSharedConnection();
  orderModel =
    (conn.models.Order as Model<Record<string, unknown>>) ||
    conn.model<Record<string, unknown>>('Order', looseSchema, 'orders');
  return orderModel;
}

/** Medias del Portal (loose, solo lectura): archivos de un pedido. */
export async function getMediaModel(): Promise<Model<Record<string, unknown>>> {
  if (mediaModel) {
    return mediaModel;
  }

  const conn = await getSharedConnection();
  mediaModel =
    (conn.models.Media as Model<Record<string, unknown>>) ||
    // OJO: mongoose trata "media" como incontable → la colección real es
    // `media` (existe una `medias` legacy vacía; no usarla).
    conn.model<Record<string, unknown>>('Media', looseSchema, 'media');
  return mediaModel;
}

/** Folders del Portal (loose, solo lectura): estructura de carpetas del zip. */
export async function getFolderModel(): Promise<Model<Record<string, unknown>>> {
  if (folderModel) {
    return folderModel;
  }

  const conn = await getSharedConnection();
  folderModel =
    (conn.models.Folder as Model<Record<string, unknown>>) ||
    conn.model<Record<string, unknown>>('Folder', looseSchema, 'folders');
  return folderModel;
}

export async function getUsageMetricModel(): Promise<Model<IUsageMetric>> {
  if (usageMetricModel) {
    return usageMetricModel;
  }

  const conn = await getSharedConnection();
  usageMetricModel =
    (conn.models.UsageMetric as Model<IUsageMetric>) ||
    conn.model<IUsageMetric>('UsageMetric', UsageMetricSchema);
  return usageMetricModel;
}

export async function getSharedModels(): Promise<{
  CronJobModel: Model<ICronJob>;
  CompanyModel: Model<ICompany>;
  ConfigModel: Model<Record<string, unknown>>;
}> {
  const [CronJobModel, CompanyModel, ConfigModel] = await Promise.all([
    getCronJobModel(),
    getCompanyModel(),
    getConfigModel(),
  ]);

  return { CronJobModel, CompanyModel, ConfigModel };
}
