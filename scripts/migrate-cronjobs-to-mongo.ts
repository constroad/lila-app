import fs from 'fs-extra';
import path from 'path';
import mongoose from 'mongoose';
import { config } from '../src/config/environment.js';

type LegacyCronJob = {
  id: string;
  name: string;
  url?: string;
  cronExpression: string;
  company: string;
  type?: 'api' | 'message';
  isActive?: boolean;
  message?: {
    sender?: string;
    chatId: string;
    body: string;
  };
  lastExecution?: string;
  status?: 'success' | 'error' | 'idle' | 'running';
  history?: Array<{
    status: 'success' | 'error';
    timestamp: string;
    error?: string;
  }>;
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    failureCount?: number;
    lastRun?: string;
    lastError?: string;
  };
  retryPolicy?: {
    maxRetries: number;
    backoffMultiplier: number;
  };
  timeout?: number;
};

type CompanyRow = {
  companyId: string;
  name?: string;
};

type MigrationDoc = Record<string, unknown>;

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const shouldExecute = args.has('--execute');
const force = args.has('--force');
const listCompaniesOnly = args.has('--list-companies');

const parseMappings = (input: string[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const entry of input) {
    const [from, to] = entry.split('=').map((value) => value?.trim());
    if (from && to) {
      map.set(from.toLowerCase(), to);
    }
  }
  return map;
};

const mappingArgs = rawArgs.filter((arg) => arg.startsWith('--map='));
const mappingEntries = mappingArgs.flatMap((arg) =>
  arg.replace('--map=', '').split(',')
);
const mappingOverrides = parseMappings(mappingEntries);
const fallbackCompany = (() => {
  const entry = rawArgs.find((arg) => arg.startsWith('--fallback-company='));
  return entry ? entry.replace('--fallback-company=', '').trim() : '';
})();

const jobsFile = path.join(process.cwd(), 'data', 'cronjobs.json');
const backupDir = path.join(process.cwd(), 'data', 'backups');

const toDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const normalize = (value?: string): string => (value || '').trim().toLowerCase();

const resolveCompanyId = (
  legacyCompany: string,
  companies: CompanyRow[]
): string | null => {
  const key = normalize(legacyCompany);
  if (!key) return null;

  const exact = companies.find((company) => normalize(company.companyId) === key);
  if (exact) return exact.companyId;

  const matches = companies.filter((company) => {
    const companyId = normalize(company.companyId);
    const name = normalize(company.name);
    return companyId.includes(key) || name.includes(key);
  });

  if (matches.length === 1) {
    return matches[0].companyId;
  }

  return null;
};

const buildDoc = (
  legacyJob: LegacyCronJob,
  companyId: string
): MigrationDoc | null => {
  if (!legacyJob.name || !legacyJob.cronExpression) {
    return null;
  }

  const resolvedType =
    legacyJob.type || (legacyJob.message ? 'message' : 'api');
  const legacyUrl = (legacyJob.url || '').trim();

  if (resolvedType === 'api' && !legacyUrl) {
    return null;
  }

  const scheduleLastRun =
    toDate(legacyJob.metadata?.lastRun) || toDate(legacyJob.lastExecution);

  const history =
    legacyJob.history
      ?.map((entry) => ({
        status: entry.status,
        timestamp: toDate(entry.timestamp),
        error: entry.error,
      }))
      .filter((entry) => entry.timestamp) || [];

  return {
    companyId,
    name: legacyJob.name,
    type: resolvedType,
    isActive: legacyJob.isActive ?? true,
    timeout: legacyJob.timeout ?? 30000,
    message: legacyJob.message
      ? {
          sender: legacyJob.message.sender,
          chatId: legacyJob.message.chatId,
          body: legacyJob.message.body,
          mentions: [],
        }
      : undefined,
    apiConfig:
      resolvedType === 'api'
        ? {
            url: legacyUrl,
            method: 'GET',
          }
        : undefined,
    schedule: {
      cronExpression: legacyJob.cronExpression,
      timezone: 'America/Lima',
      lastRun: scheduleLastRun,
    },
    retryPolicy: legacyJob.retryPolicy || {
      maxRetries: 3,
      backoffMultiplier: 2,
      currentRetries: 0,
    },
    status: legacyJob.status || 'idle',
    lastExecution: toDate(legacyJob.lastExecution),
    failureCount: legacyJob.metadata?.failureCount || 0,
    lastError: legacyJob.metadata?.lastError,
    history,
    metadata: {
      createdAt: toDate(legacyJob.metadata?.createdAt) || new Date(),
      updatedAt: toDate(legacyJob.metadata?.updatedAt) || new Date(),
      legacyId: legacyJob.id,
      legacyCompany: legacyJob.company,
      tags: [],
    },
  };
};

const summarizeByCompany = (docs: MigrationDoc[]): Record<string, number> => {
  const summary: Record<string, number> = {};
  for (const doc of docs) {
    const companyId = String(doc.companyId || 'unknown');
    summary[companyId] = (summary[companyId] || 0) + 1;
  }
  return summary;
};

const ensureBackup = async (): Promise<string> => {
  await fs.ensureDir(backupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `cronjobs.json.${stamp}.bak`);
  await fs.copy(jobsFile, backupPath);
  return backupPath;
};

const main = async (): Promise<void> => {
  const connection = await mongoose
    .createConnection(config.mongodb.portalUri, {
      dbName: config.mongodb.sharedDb,
    })
    .asPromise();

  try {
    const companies = (await connection.db
      .collection('companies')
      .find({}, { projection: { companyId: 1, name: 1 } })
      .toArray()) as CompanyRow[];

    if (!companies.length) {
      throw new Error('No companies found in shared_db.');
    }

    if (listCompaniesOnly) {
      console.log('Companies in shared_db:');
      console.log(companies);
      return;
    }

    const legacyJobs: LegacyCronJob[] = await fs.readJson(jobsFile);

    if (!legacyJobs.length) {
      console.log('No cronjobs found in cronjobs.json. Aborting.');
      return;
    }

    const legacyCompanies = Array.from(
      new Set(legacyJobs.map((job) => job.company))
    );

    const mapping = new Map<string, string>();
    for (const legacyCompany of legacyCompanies) {
      const override = mappingOverrides.get(legacyCompany.toLowerCase());
      const resolved = override
        ? resolveCompanyId(override, companies)
        : resolveCompanyId(legacyCompany, companies);
      if (!resolved) {
        if (fallbackCompany) {
          const fallbackResolved = resolveCompanyId(fallbackCompany, companies);
          if (!fallbackResolved) {
            throw new Error(
              `Cannot resolve fallback company "${fallbackCompany}". Available: ${companies
                .map((company) => `${company.companyId}:${company.name || ''}`)
                .join(', ')}`
            );
          }
          mapping.set(legacyCompany, fallbackResolved);
          continue;
        }

        throw new Error(
          `Cannot resolve company "${legacyCompany}". Available: ${companies
            .map((company) => `${company.companyId}:${company.name || ''}`)
            .join(', ')}`
        );
      }
      mapping.set(legacyCompany, resolved);
    }

    const docs: MigrationDoc[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const legacyJob of legacyJobs) {
      const companyId = mapping.get(legacyJob.company);
      if (!companyId) {
        skipped.push({
          id: legacyJob.id,
          reason: `Unknown company ${legacyJob.company}`,
        });
        continue;
      }

      const doc = buildDoc(legacyJob, companyId);
      if (!doc) {
        skipped.push({
          id: legacyJob.id,
          reason: 'Invalid job (missing name/cronExpression or API url)',
        });
        continue;
      }

      docs.push(doc);
    }

    console.log(`Legacy jobs: ${legacyJobs.length}`);
    console.log(`Ready to migrate: ${docs.length}`);
    console.log(`Skipped: ${skipped.length}`);
    console.log('Mapping:', Object.fromEntries(mapping));
    console.log('By company:', summarizeByCompany(docs));

    if (!shouldExecute) {
      console.log('Dry run complete. Re-run with --execute to migrate.');
      return;
    }

    const cronjobsCollection = connection.db.collection('cronjobs');
    const existingCount = await cronjobsCollection.countDocuments();
    if (existingCount > 0 && !force) {
      throw new Error(
        `cronjobs collection is not empty (${existingCount}). Use --force to continue.`
      );
    }

    const backupPath = await ensureBackup();
    console.log(`Backup created: ${backupPath}`);

    if (docs.length) {
      await cronjobsCollection.insertMany(docs, { ordered: false });
    }

    console.log('Migration completed successfully.');
  } finally {
    await connection.close();
  }
};

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
