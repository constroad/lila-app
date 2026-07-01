import mongoose from 'mongoose';
import { config } from '../src/config/environment.js';

type CronJobDocument = {
  _id: unknown;
  companyId: string;
  name: string;
  type: string;
  isActive?: boolean;
  apiConfig?: { url?: string };
  message?: { chatId?: string; body?: string };
  schedule?: { cronExpression?: string; cronExpressions?: string[] };
};

const ALERT_BY_PATH: Record<string, string> = {
  '/api/cron/daily-cash-flow-summary': 'cashflow-daily-summary',
  '/api/cron/employee-daily-alert': 'employee-daily-alert',
  '/api/cron/daily-attendance-missing-signatures': 'attendance-missing-signatures',
  '/api/cron/kardex-check': 'kardex-check',
  '/api/cron/missing-order-certificates': 'missing-order-certificates',
  '/api/cron/fluids-report': 'fluids-report',
  '/api/cron/maintenance-check': 'maintenance-check',
};

const parseArguments = () => {
  const args = process.argv.slice(2);
  return {
    apply: args.includes('--apply'),
    prune: args.includes('--prune'),
    companyId: args.find((argument) => !argument.startsWith('--'))?.trim() || '',
  };
};

const resolvePath = (rawUrl: string): string => {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return rawUrl.split('?')[0];
  }
};

const cronToTime = (expression: string): string | null => {
  const match = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(expression.trim());
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (minute > 59 || hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const readSchedule = (job: CronJobDocument): string[] => {
  const expressions = job.schedule?.cronExpressions?.length
    ? job.schedule.cronExpressions
    : job.schedule?.cronExpression
      ? [job.schedule.cronExpression]
      : [];
  return Array.from(new Set(expressions.map(cronToTime).filter(
    (time): time is string => Boolean(time)
  ))).sort();
};

const main = async (): Promise<void> => {
  const options = parseArguments();
  const connection = await mongoose.createConnection(config.mongodb.portalUri, {
    dbName: config.mongodb.sharedDb,
  }).asPromise();

  try {
    const jobsCollection = connection.db.collection<CronJobDocument>('cronjobs');
    const companiesCollection = connection.db.collection('companies');
    const jobs = await jobsCollection.find({
      type: 'api',
      ...(options.companyId ? { companyId: options.companyId } : {}),
    }).toArray();
    const candidates = new Map<string, Array<{ job: CronJobDocument; alertKey: string }>>();

    jobs.forEach((job) => {
      const alertKey = ALERT_BY_PATH[resolvePath(String(job.apiConfig?.url || ''))];
      if (!alertKey || job.name.startsWith('alerts.')) return;
      const key = `${job.companyId}:${alertKey}`;
      candidates.set(key, [...(candidates.get(key) ?? []), { job, alertKey }]);
    });

    console.log(`Modo: ${options.apply ? 'APPLY' : 'DRY-RUN'}`);
    if (candidates.size === 0) {
      console.log('Nada que adoptar.');
      return;
    }

    for (const [key, entries] of candidates) {
      const ordered = [...entries].sort(
        (left, right) => Number(Boolean(right.job.isActive)) - Number(Boolean(left.job.isActive))
      );
      const winner = ordered[0];
      const losers = ordered.slice(1);
      const schedule = readSchedule(winner.job);
      console.log(`${key}: ${winner.job.name}, horarios=${schedule.join(',') || 'ninguno'}`);
      if (!options.apply) continue;

      const alertConfig = {
        enabled: Boolean(winner.job.isActive),
        groupId: String(winner.job.message?.chatId || '').trim() || undefined,
        schedule,
        customMessage: String(winner.job.message?.body || '').trim() || undefined,
        cronJobId: String(winner.job._id),
        updatedAt: new Date(),
      };
      await companiesCollection.updateOne(
        { companyId: winner.job.companyId },
        { $set: { [`whatsappConfig.alerts.${winner.alertKey}`]: alertConfig } }
      );
      await jobsCollection.updateOne(
        { _id: winner.job._id },
        { $set: { name: `alerts.${winner.alertKey}` } }
      );
      if (options.prune && losers.length > 0) {
        await jobsCollection.updateMany(
          { _id: { $in: losers.map(({ job }) => job._id) } },
          { $set: { isActive: false } }
        );
      }
    }
  } finally {
    await connection.close();
  }
};

main().catch((error: unknown) => {
  console.error('Migración falló:', error);
  process.exitCode = 1;
});
