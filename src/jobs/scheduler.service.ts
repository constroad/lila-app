import cron from 'node-cron';
import axios from 'axios';
import logger from '../utils/logger.js';
import JsonStore from '../storage/json.store.js';
import { CronJobData } from '../types/index.js';
import { validateCronExpression } from '../utils/validators.js';
import { config } from '../config/environment.js';
import { retry } from '../utils/retry.js';
import path from 'path';
import connectionManager from '../whatsapp/baileys/connection.manager.js';

interface ScheduledTask {
  task: cron.ScheduledTask;
  data: CronJobData;
}

export class JobScheduler {
  private store: JsonStore;
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private jobsFile: string;

  constructor() {
    this.jobsFile = config.jobs.storageFile;
    this.store = new JsonStore({
      baseDir: path.dirname(this.jobsFile),
      autoBackup: true,
    });
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Job Scheduler...');
      const jobs = await this.loadJobs();
      
      for (const job of jobs) {
        if (job.isActive) {
          await this.scheduleJob(job);
        }
      }

      logger.info(`Loaded and scheduled ${jobs.length} cron jobs`);
    } catch (error) {
      logger.error('Error initializing Job Scheduler:', error);
    }
  }

  async createJob(jobData: Omit<CronJobData, 'id' | 'metadata'>): Promise<CronJobData> {
    try {
      // Validar expresión cron
      if (!validateCronExpression(jobData.cronExpression)) {
        throw new Error('Invalid cron expression');
      }

      const type = jobData.type || (jobData.url ? 'api' : 'message');
      const job: CronJobData = {
        id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...jobData,
        type,
        url: jobData.url || '',
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          failureCount: 0,
        },
        retryPolicy: jobData.retryPolicy || { maxRetries: 3, backoffMultiplier: 2 },
        timeout: jobData.timeout || 30000,
      };

      await this.saveJob(job);

      if (job.isActive) {
        await this.scheduleJob(job);
      }

      logger.info(`Created job: ${job.id}`);
      return job;
    } catch (error) {
      logger.error('Error creating job:', error);
      throw error;
    }
  }

  async updateJob(id: string, updates: Partial<CronJobData>): Promise<CronJobData> {
    try {
      const jobs = await this.loadJobs();
      const jobIndex = jobs.findIndex((j) => j.id === id);

      if (jobIndex === -1) {
        throw new Error(`Job ${id} not found`);
      }

      const job = jobs[jobIndex];
      const nextType = updates.type || job.type || (updates.url || job.url ? 'api' : 'message');
      const updated: CronJobData = {
        ...job,
        ...updates,
        id: job.id, // No actualizar ID
        type: nextType,
        url: updates.url ?? job.url ?? '',
        metadata: {
          ...job.metadata,
          updatedAt: new Date().toISOString(),
        },
        retryPolicy:
          updates.retryPolicy ||
          job.retryPolicy ||
          { maxRetries: 3, backoffMultiplier: 2 },
        timeout: updates.timeout || job.timeout || 30000,
      };

      // Desactivar tarea anterior si existe
      const scheduled = this.scheduledTasks.get(id);
      if (scheduled) {
        scheduled.task.stop();
        this.scheduledTasks.delete(id);
      }

      // Guardar y reprogramar si está activo
      jobs[jobIndex] = updated;
      await this.saveAllJobs(jobs);

      if (updated.isActive) {
        await this.scheduleJob(updated);
      }

      logger.info(`Updated job: ${id}`);
      return updated;
    } catch (error) {
      logger.error('Error updating job:', error);
      throw error;
    }
  }

  async deleteJob(id: string): Promise<void> {
    try {
      const scheduled = this.scheduledTasks.get(id);
      if (scheduled) {
        scheduled.task.stop();
        this.scheduledTasks.delete(id);
      }

      const jobs = await this.loadJobs();
      const filtered = jobs.filter((j) => j.id !== id);
      await this.saveAllJobs(filtered);

      logger.info(`Deleted job: ${id}`);
    } catch (error) {
      logger.error('Error deleting job:', error);
      throw error;
    }
  }

  async runJobNow(id: string): Promise<void> {
    try {
      const jobs = await this.loadJobs();
      const job = jobs.find((j) => j.id === id);

      if (!job) {
        throw new Error(`Job ${id} not found`);
      }

      logger.info(`Running job manually: ${job.name}`);
      await this.executeJob(job, { throwOnError: true });
    } catch (error) {
      logger.error(`Error running job ${id}:`, error);
      throw error;
    }
  }

  async getJob(id: string): Promise<CronJobData | null> {
    const jobs = await this.loadJobs();
    return jobs.find((j) => j.id === id) || null;
  }

  async getAllJobs(): Promise<CronJobData[]> {
    return await this.loadJobs();
  }

  async getJobsByCompany(company: 'constroad' | 'altavia'): Promise<CronJobData[]> {
    const jobs = await this.loadJobs();
    return jobs.filter((j) => j.company === company);
  }

  private async scheduleJob(job: CronJobData): Promise<void> {
    try {
      if (!validateCronExpression(job.cronExpression)) {
        throw new Error(`Invalid cron expression for job ${job.id}`);
      }

      const task = cron.schedule(job.cronExpression, async () => {
        await this.executeJob(job);
      });

      this.scheduledTasks.set(job.id, { task, data: job });
      logger.debug(`Scheduled job: ${job.id} - ${job.name}`);
    } catch (error) {
      logger.error(`Error scheduling job ${job.id}:`, error);
    }
  }

  private async executeJob(
    job: CronJobData,
    options: { throwOnError?: boolean } = {}
  ): Promise<void> {
    try {
      const startTime = Date.now();
      const retryPolicy = job.retryPolicy || { maxRetries: 3, backoffMultiplier: 2 };
      const timeout = job.timeout || 30000;

      logger.info(`Executing job: ${job.name} (${job.id})`);

      if (job.type === 'message') {
        const sender = job.message?.sender;
        const chatId = job.message?.chatId;
        const body = job.message?.body;
        if (!sender || !chatId || !body) {
          throw new Error('Message job missing sender, chatId, or body');
        }

        await retry(
          async () => {
            const result = await connectionManager.sendTextMessage(sender, chatId, body);
            if (result.queued) {
              logger.info(`Message job queued for ${sender} -> ${chatId}`);
            }
          },
          retryPolicy.maxRetries,
          1000,
          retryPolicy.backoffMultiplier
        );
      } else {
      await retry(
        async () => {
          if (!job.url) {
            throw new Error('API job missing url');
          }
          const response = await axios.get(
            job.url,
              // {
              //   jobId: job.id,
              //   jobName: job.name,
              //   company: job.company,
              //   executedAt: new Date().toISOString(),
              // },
              {
                timeout,
              }
            );

            return response;
          },
          retryPolicy.maxRetries,
          1000,
          retryPolicy.backoffMultiplier
        );
      }

      const duration = Date.now() - startTime;

      // Actualizar metadata
      const jobs = await this.loadJobs();
      const jobIndex = jobs.findIndex((j) => j.id === job.id);

      if (jobIndex !== -1) {
        const runTimestamp = new Date().toISOString();
        jobs[jobIndex].metadata = jobs[jobIndex].metadata || {
          createdAt: runTimestamp,
          updatedAt: runTimestamp,
          failureCount: 0,
        };
        jobs[jobIndex].metadata.lastRun = new Date().toISOString();
        jobs[jobIndex].metadata.failureCount = 0;
        jobs[jobIndex].lastExecution = runTimestamp;
        jobs[jobIndex].status = 'success';
        jobs[jobIndex].history = [
          ...this.normalizeHistory(jobs[jobIndex].history),
          { status: 'success', timestamp: runTimestamp },
        ].slice(-10);
        await this.saveAllJobs(jobs);
      }

      logger.info(`✅ Job completed: ${job.name} (${duration}ms)`);
    } catch (error) {
      logger.error(`❌ Job failed: ${job.name}`, error);

      // Incrementar contador de fallos
      const jobs = await this.loadJobs();
      const jobIndex = jobs.findIndex((j) => j.id === job.id);

      if (jobIndex !== -1) {
        const runTimestamp = new Date().toISOString();
        jobs[jobIndex].metadata = jobs[jobIndex].metadata || {
          createdAt: runTimestamp,
          updatedAt: runTimestamp,
          failureCount: 0,
        };
        jobs[jobIndex].metadata.failureCount++;
        jobs[jobIndex].metadata.lastError = (error as Error).message;
        jobs[jobIndex].lastExecution = runTimestamp;
        jobs[jobIndex].status = 'error';
        jobs[jobIndex].history = [
          ...this.normalizeHistory(jobs[jobIndex].history),
          {
            status: 'error',
            timestamp: runTimestamp,
            error: (error as Error).message,
          },
        ].slice(-10);
        await this.saveAllJobs(jobs);
      }

      if (options.throwOnError) {
        throw error;
      }
    }
  }

  private normalizeHistory(
    history?: CronJobData['history']
  ): NonNullable<CronJobData['history']> {
    if (!history || !Array.isArray(history)) {
      return [];
    }

    return history.filter((item) => {
      return (
        !!item &&
        (item.status === 'success' || item.status === 'error') &&
        typeof item.timestamp === 'string'
      );
    });
  }

  private async loadJobs(): Promise<CronJobData[]> {
    try {
      const filename = path.basename(this.jobsFile);
      const key = filename.replace('.json', '');
      const data = await this.store.get<unknown>(key);
      if (Array.isArray(data)) {
        return data.map((job) => this.normalizeJob(job as CronJobData));
      }
      if (data && typeof data === 'object' && 'jobs' in data) {
        const wrapped = data as { jobs?: CronJobData[] };
        return (wrapped.jobs || []).map((job) => this.normalizeJob(job));
      }
      return [];
    } catch (error) {
      logger.warn('Error loading jobs, returning empty array:', error);
      return [];
    }
  }

  private normalizeJob(job: CronJobData): CronJobData {
    const now = new Date().toISOString();
    return {
      ...job,
      metadata: job.metadata || {
        createdAt: now,
        updatedAt: now,
        failureCount: 0,
      },
      retryPolicy: job.retryPolicy || { maxRetries: 3, backoffMultiplier: 2 },
      timeout: job.timeout || 30000,
      history: this.normalizeHistory(job.history),
    };
  }

  private async saveJob(job: CronJobData): Promise<void> {
    const jobs = await this.loadJobs();
    const index = jobs.findIndex((j) => j.id === job.id);

    if (index >= 0) {
      jobs[index] = job;
    } else {
      jobs.push(job);
    }

    await this.saveAllJobs(jobs);
  }

  private async saveAllJobs(jobs: CronJobData[]): Promise<void> {
    const filename = path.basename(this.jobsFile);
    const key = filename.replace('.json', '');
    
    await this.store.set(key, jobs);
  }

  async shutdown(): Promise<void> {
    for (const [, scheduled] of this.scheduledTasks) {
      scheduled.task.stop();
    }
    this.scheduledTasks.clear();
    logger.info('Job Scheduler shut down');
  }
}

export default new JobScheduler();
