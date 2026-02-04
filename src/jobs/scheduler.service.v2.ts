import cron from 'node-cron';
import { getSharedModels } from '../database/models.js';
import { ICronJob } from '../models/cronjob.model.js';
import { ConnectionManager } from '../whatsapp/baileys/connection.manager.js';
import { JobExecutor } from './executor.service.js';
import { calculateNextRun } from '../utils/cronHelpers.js';
import logger from '../utils/logger.js';

interface ScheduledTask {
  jobId: string;
  task: cron.ScheduledTask;
}

class JobSchedulerV2 {
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private executor: JobExecutor;
  private connectionManager: ConnectionManager;

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
    this.executor = new JobExecutor(connectionManager);
  }

  async initialize(): Promise<void> {
    try {
      logger.info('[JobScheduler] Initializing v2...');
      const { CronJobModel } = await getSharedModels();
      const activeJobs = await CronJobModel.find({ isActive: true });

      logger.info(`[JobScheduler] Found ${activeJobs.length} active jobs`);

      for (const job of activeJobs) {
        await this.scheduleJob(job, { silent: true });
      }

      logger.info(`[JobScheduler] Scheduled ${activeJobs.length} active jobs`);
      logger.info('[JobScheduler] Initialization complete');
    } catch (error) {
      logger.error('[JobScheduler] Initialization failed:', error);
      throw error;
    }
  }

  async createJob(data: Partial<ICronJob>): Promise<ICronJob> {
    try {
      const { CronJobModel, CompanyModel } = await getSharedModels();

      const company = await CompanyModel.findOne({ companyId: data.companyId });
      if (!company) {
        throw new Error(`Company ${data.companyId} not found`);
      }

      if (data.type === 'message' && !company.whatsappConfig?.sender) {
        throw new Error(
          `Company ${data.companyId} does not have WhatsApp sender configured`
        );
      }

      const limit = company.subscription?.limits?.cronJobs;
      if (typeof limit === 'number') {
        const currentCount = await CronJobModel.countDocuments({
          companyId: data.companyId,
          isActive: true,
        });

        if (currentCount >= limit) {
          throw new Error(`Cronjob limit reached for company ${data.companyId}`);
        }
      }

      const schedule = data.schedule || {
        cronExpression: '',
        timezone: 'America/Lima',
      };

      if (schedule.cronExpression) {
        schedule.nextRun = calculateNextRun(
          schedule.cronExpression,
          schedule.timezone || 'America/Lima'
        );
      }

      const job = await CronJobModel.create({
        ...data,
        schedule,
        metadata: {
          ...data.metadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      if (company.subscription?.usage?.cronJobs !== undefined) {
        await CompanyModel.updateOne(
          { companyId: data.companyId },
          { $inc: { 'subscription.usage.cronJobs': 1 } }
        );
      }

      if (job.isActive) {
        await this.scheduleJob(job);
      }

      logger.info(
        `[JobScheduler] Created job ${job._id} for company ${job.companyId}`
      );

      return job;
    } catch (error) {
      logger.error('[JobScheduler] Failed to create job:', error);
      throw error;
    }
  }

  async updateJob(jobId: string, updates: Partial<ICronJob>): Promise<ICronJob> {
    try {
      const { CronJobModel } = await getSharedModels();
      const job = await CronJobModel.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      if (
        job.type === 'message' &&
        updates.message &&
        (!updates.message.body || !updates.message.body.trim())
      ) {
        throw new Error('message.body is required when type is "message"');
      }

      Object.assign(job, updates, {
        'metadata.updatedAt': new Date(),
        'metadata.updatedBy': updates.metadata?.updatedBy,
      });

      if (updates.schedule?.cronExpression) {
        job.schedule.nextRun = calculateNextRun(
          updates.schedule.cronExpression,
          updates.schedule.timezone || job.schedule.timezone || 'America/Lima'
        );
      }

      await job.save();

      if (updates.schedule?.cronExpression || updates.isActive !== undefined) {
        this.unscheduleJob(jobId);

        if (job.isActive) {
          await this.scheduleJob(job);
        }
      }

      logger.info(`[JobScheduler] Updated job ${jobId}`);
      return job;
    } catch (error) {
      logger.error('[JobScheduler] Failed to update job:', error);
      throw error;
    }
  }

  async deleteJob(jobId: string): Promise<void> {
    try {
      const { CronJobModel, CompanyModel } = await getSharedModels();
      const job = await CronJobModel.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      this.unscheduleJob(jobId);

      if (job.companyId) {
        await CompanyModel.updateOne(
          { companyId: job.companyId },
          { $inc: { 'subscription.usage.cronJobs': -1 } }
        );
      }

      await CronJobModel.deleteOne({ _id: jobId });
      logger.info(`[JobScheduler] Deleted job ${jobId}`);
    } catch (error) {
      logger.error('[JobScheduler] Failed to delete job:', error);
      throw error;
    }
  }

  async runJobNow(jobId: string): Promise<void> {
    try {
      const { CronJobModel } = await getSharedModels();
      const job = await CronJobModel.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      logger.info(`[JobScheduler] Running job ${jobId} manually`);
      await this.executor.execute(job);
    } catch (error) {
      logger.error('[JobScheduler] Failed to run job manually:', error);
      throw error;
    }
  }

  async getJobsByCompany(companyId: string): Promise<ICronJob[]> {
    const { CronJobModel } = await getSharedModels();
    return CronJobModel.find({ companyId }).sort({ 'metadata.createdAt': -1 });
  }

  async getAllJobs(): Promise<ICronJob[]> {
    const { CronJobModel } = await getSharedModels();
    return CronJobModel.find({}).sort({ 'metadata.createdAt': -1 });
  }

  async getJob(jobId: string): Promise<ICronJob | null> {
    const { CronJobModel } = await getSharedModels();
    return CronJobModel.findById(jobId);
  }

  private async scheduleJob(
    job: ICronJob,
    options: { silent?: boolean } = {}
  ): Promise<void> {
    try {
      const task = cron.schedule(
        job.schedule.cronExpression,
        async () => {
          await this.executor.execute(job);
        },
        {
          timezone: job.schedule.timezone || 'America/Lima',
          scheduled: true,
        }
      );

      this.scheduledTasks.set(job._id.toString(), {
        jobId: job._id.toString(),
        task,
      });

      if (!options.silent) {
        logger.debug(
          `[JobScheduler] Scheduled job ${job._id} with expression ${job.schedule.cronExpression}`
        );
      }
    } catch (error) {
      logger.error(
        `[JobScheduler] Failed to schedule job ${job._id}:`,
        error
      );
      throw error;
    }
  }

  private unscheduleJob(jobId: string): void {
    const scheduled = this.scheduledTasks.get(jobId);
    if (scheduled) {
      scheduled.task.stop();
      this.scheduledTasks.delete(jobId);
      logger.debug(`[JobScheduler] Unscheduled job ${jobId}`);
    }
  }

  async shutdown(): Promise<void> {
    logger.info('[JobScheduler] Shutting down...');

    for (const [, scheduled] of this.scheduledTasks) {
      scheduled.task.stop();
    }

    this.scheduledTasks.clear();
    logger.info('[JobScheduler] Shutdown complete');
  }

  async syncFromDatabase(): Promise<void> {
    logger.info('[JobScheduler] Syncing from database...');

    for (const [, scheduled] of this.scheduledTasks) {
      scheduled.task.stop();
    }
    this.scheduledTasks.clear();

    await this.initialize();
  }
}

export default JobSchedulerV2;
