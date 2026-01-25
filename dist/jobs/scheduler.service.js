import cron from 'node-cron';
import axios from 'axios';
import logger from '../../utils/logger';
import JsonStore from '../../storage/json.store';
import { validateCronExpression } from '../../utils/validators';
import { config } from '../../config/environment';
import { retry } from '../../utils/retry';
import path from 'path';
export class JobScheduler {
    constructor() {
        this.scheduledTasks = new Map();
        this.jobsFile = config.jobs.storageFile;
        this.store = new JsonStore({
            baseDir: path.dirname(this.jobsFile),
            autoBackup: true,
        });
    }
    async initialize() {
        try {
            logger.info('Initializing Job Scheduler...');
            const jobs = await this.loadJobs();
            for (const job of jobs) {
                if (job.isActive) {
                    await this.scheduleJob(job);
                }
            }
            logger.info(`Loaded and scheduled ${jobs.length} cron jobs`);
        }
        catch (error) {
            logger.error('Error initializing Job Scheduler:', error);
        }
    }
    async createJob(jobData) {
        try {
            // Validar expresión cron
            if (!validateCronExpression(jobData.cronExpression)) {
                throw new Error('Invalid cron expression');
            }
            const job = {
                id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                ...jobData,
                metadata: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    failureCount: 0,
                },
            };
            await this.saveJob(job);
            if (job.isActive) {
                await this.scheduleJob(job);
            }
            logger.info(`Created job: ${job.id}`);
            return job;
        }
        catch (error) {
            logger.error('Error creating job:', error);
            throw error;
        }
    }
    async updateJob(id, updates) {
        try {
            const jobs = await this.loadJobs();
            const jobIndex = jobs.findIndex((j) => j.id === id);
            if (jobIndex === -1) {
                throw new Error(`Job ${id} not found`);
            }
            const job = jobs[jobIndex];
            const updated = {
                ...job,
                ...updates,
                id: job.id, // No actualizar ID
                metadata: {
                    ...job.metadata,
                    updatedAt: new Date().toISOString(),
                },
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
        }
        catch (error) {
            logger.error('Error updating job:', error);
            throw error;
        }
    }
    async deleteJob(id) {
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
        }
        catch (error) {
            logger.error('Error deleting job:', error);
            throw error;
        }
    }
    async runJobNow(id) {
        try {
            const jobs = await this.loadJobs();
            const job = jobs.find((j) => j.id === id);
            if (!job) {
                throw new Error(`Job ${id} not found`);
            }
            logger.info(`Running job manually: ${job.name}`);
            await this.executeJob(job);
        }
        catch (error) {
            logger.error(`Error running job ${id}:`, error);
            throw error;
        }
    }
    async getJob(id) {
        const jobs = await this.loadJobs();
        return jobs.find((j) => j.id === id) || null;
    }
    async getAllJobs() {
        return await this.loadJobs();
    }
    async getJobsByCompany(company) {
        const jobs = await this.loadJobs();
        return jobs.filter((j) => j.company === company);
    }
    async scheduleJob(job) {
        try {
            if (!validateCronExpression(job.cronExpression)) {
                throw new Error(`Invalid cron expression for job ${job.id}`);
            }
            const task = cron.schedule(job.cronExpression, async () => {
                await this.executeJob(job);
            });
            this.scheduledTasks.set(job.id, { task, data: job });
            logger.debug(`Scheduled job: ${job.id} - ${job.name}`);
        }
        catch (error) {
            logger.error(`Error scheduling job ${job.id}:`, error);
        }
    }
    async executeJob(job) {
        try {
            const startTime = Date.now();
            logger.info(`Executing job: ${job.name} (${job.id})`);
            await retry(async () => {
                const response = await axios.post(job.url, {
                    jobId: job.id,
                    jobName: job.name,
                    company: job.company,
                    executedAt: new Date().toISOString(),
                });
                return response;
            }, job.retryPolicy.maxRetries, 1000, job.retryPolicy.backoffMultiplier);
            const duration = Date.now() - startTime;
            // Actualizar metadata
            const jobs = await this.loadJobs();
            const jobIndex = jobs.findIndex((j) => j.id === job.id);
            if (jobIndex !== -1) {
                jobs[jobIndex].metadata.lastRun = new Date().toISOString();
                jobs[jobIndex].metadata.failureCount = 0;
                await this.saveAllJobs(jobs);
            }
            logger.info(`✅ Job completed: ${job.name} (${duration}ms)`);
        }
        catch (error) {
            logger.error(`❌ Job failed: ${job.name}`, error);
            // Incrementar contador de fallos
            const jobs = await this.loadJobs();
            const jobIndex = jobs.findIndex((j) => j.id === job.id);
            if (jobIndex !== -1) {
                jobs[jobIndex].metadata.failureCount++;
                jobs[jobIndex].metadata.lastError = error.message;
                await this.saveAllJobs(jobs);
            }
        }
    }
    async loadJobs() {
        try {
            const filename = path.basename(this.jobsFile);
            const key = filename.replace('.json', '');
            const data = await this.store.get(key);
            return data?.jobs || [];
        }
        catch (error) {
            logger.warn('Error loading jobs, returning empty array:', error);
            return [];
        }
    }
    async saveJob(job) {
        const jobs = await this.loadJobs();
        const index = jobs.findIndex((j) => j.id === job.id);
        if (index >= 0) {
            jobs[index] = job;
        }
        else {
            jobs.push(job);
        }
        await this.saveAllJobs(jobs);
    }
    async saveAllJobs(jobs) {
        const filename = path.basename(this.jobsFile);
        const key = filename.replace('.json', '');
        await this.store.set(key, {
            version: '1.0',
            lastModified: new Date().toISOString(),
            jobs,
        });
    }
    async shutdown() {
        for (const [, scheduled] of this.scheduledTasks) {
            scheduled.task.stop();
        }
        this.scheduledTasks.clear();
        logger.info('Job Scheduler shut down');
    }
}
export default new JobScheduler();
//# sourceMappingURL=scheduler.service.js.map