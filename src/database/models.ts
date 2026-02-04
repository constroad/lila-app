import type { Model } from 'mongoose';
import { getSharedConnection } from './sharedConnection.js';
import { CronJobSchema, ICronJob } from '../models/cronjob.model.js';
import { CompanySchema, ICompany } from '../models/company.model.js';

let cronJobModel: Model<ICronJob> | null = null;
let companyModel: Model<ICompany> | null = null;

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

export async function getSharedModels(): Promise<{
  CronJobModel: Model<ICronJob>;
  CompanyModel: Model<ICompany>;
}> {
  const [CronJobModel, CompanyModel] = await Promise.all([
    getCronJobModel(),
    getCompanyModel(),
  ]);

  return { CronJobModel, CompanyModel };
}
