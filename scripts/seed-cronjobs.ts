import { getSharedModels } from '../src/database/models.js';

const args = process.argv.slice(2);
const getArg = (key: string, fallback?: string) => {
  const idx = args.indexOf(key);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
};

const hasFlag = (key: string) => args.includes(key);

const companyId = getArg('--companyId') ?? '';
const count = Number(getArg('--count', '120'));
const prefix = getArg('--prefix', 'perf-cron') ?? 'perf-cron';
const cleanup = hasFlag('--cleanup');
const force = hasFlag('--force');

if (!companyId) {
  console.error('Missing --companyId');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !force) {
  console.error('Refusing to run in production. Use --force to override.');
  process.exit(1);
}

const buildCronExpression = (index: number) => {
  const minute = index % 60;
  const hour = index % 24;
  return `${minute} ${hour} * * *`;
};

const randomBool = (index: number) => index % 3 !== 0;

const run = async () => {
  const { CronJobModel } = await getSharedModels();

  if (cleanup) {
    const removed = await CronJobModel.deleteMany({
      companyId,
      name: { $regex: `^${prefix}` },
    });
    console.log(`Removed ${removed.deletedCount} cronjobs with prefix ${prefix}`);
  }

  const now = new Date();
  const jobs = Array.from({ length: count }).map((_, index) => {
    const type = index % 2 === 0 ? 'message' : 'api';
    const cronExpression = buildCronExpression(index + 1);

    return {
      companyId,
      name: `${prefix}-${index + 1}`,
      type,
      isActive: randomBool(index),
      timeout: 20000,
      schedule: {
        cronExpression,
        timezone: 'America/Lima',
      },
      message:
        type === 'message'
          ? {
              chatId: `group-${index + 1}`,
              body: `Mensaje de prueba #${index + 1}`,
              mentions: [],
            }
          : undefined,
      apiConfig:
        type === 'api'
          ? {
              url: `https://example.com/health?job=${index + 1}`,
              method: 'POST',
              headers: { 'x-seed': 'true' },
              body: { ping: true, index: index + 1 },
            }
          : undefined,
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        currentRetries: 0,
      },
      status: 'idle',
      failureCount: 0,
      history: [],
      metadata: {
        createdAt: now,
        updatedAt: now,
        tags: ['perf'],
      },
    };
  });

  if (!jobs.length) {
    console.log('No jobs to insert.');
    return;
  }

  await CronJobModel.insertMany(jobs);
  console.log(`Inserted ${jobs.length} cronjobs for ${companyId}`);
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed', error);
    process.exit(1);
  });
