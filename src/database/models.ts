import { Schema, type Model } from 'mongoose';
import { getSharedConnection } from './sharedConnection.js';
import { CronJobSchema, ICronJob } from '../models/cronjob.model.js';
import { CompanySchema, ICompany } from '../models/company.model.js';

let cronJobModel: Model<ICronJob> | null = null;
let companyModel: Model<ICompany> | null = null;
let configModel: Model<Record<string, unknown>> | null = null;
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
