import axios from 'axios';
import { getSharedModels } from '../database/models.js';
import { ICronJob } from '../models/cronjob.model.js';
import { ConnectionManager } from '../whatsapp/baileys/connection.manager.js';
import logger from '../utils/logger.js';

export class JobExecutor {
  private connectionManager: ConnectionManager;

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
  }

  private prependBotPrefix(message: string, prefix: string): string {
    const fallbackPrefix = '🤖 ConstRoadBot';
    const effectivePrefix = prefix && prefix.trim() ? prefix.trim() : fallbackPrefix;
    const trimmed = (message ?? '').trim();

    if (!trimmed) {
      return effectivePrefix;
    }

    const normalized = trimmed.replace(/\r\n/g, '\n');
    if (normalized.toLowerCase().startsWith(effectivePrefix.toLowerCase())) {
      return normalized;
    }

    return `${effectivePrefix}\n\n${normalized}`;
  }

  async execute(job: ICronJob): Promise<void> {
    const startTime = Date.now();
    const { CronJobModel, CompanyModel } = await getSharedModels();

    try {
      logger.info(
        `[JobExecutor] Executing job ${job._id} (${job.name}) for company ${job.companyId}`
      );

      await CronJobModel.updateOne(
        { _id: job._id },
        { status: 'running', lastExecution: new Date() }
      );

      const company = await CompanyModel.findOne({ companyId: job.companyId });
      if (!company) {
        throw new Error(`Company ${job.companyId} not found`);
      }

      const sender = company.whatsappConfig?.sender;
      const cronjobPrefix = company.whatsappConfig?.cronjobPrefix;
      const shouldNotify =
        Boolean(job.message?.chatId) && Boolean(job.message?.body?.trim());
      if (!sender && (job.type === 'message' || shouldNotify)) {
        throw new Error(`No sender configured for company ${job.companyId}`);
      }

      if (job.type === 'message') {
        await this.executeMessage(job, sender!, cronjobPrefix);
      } else if (job.type === 'api') {
        await this.executeApi(job);
        if (shouldNotify) {
          await this.executeMessage(job, sender!, cronjobPrefix);
        }
      }

      const duration = Date.now() - startTime;
      await this.recordSuccess(job, duration);

      logger.info(
        `[JobExecutor] Job ${job._id} completed successfully in ${duration}ms`
      );
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(`[JobExecutor] Job ${job._id} failed:`, error);

      const currentRetries = job.retryPolicy?.currentRetries || 0;
      if (currentRetries < job.retryPolicy.maxRetries) {
        await this.scheduleRetry(job, error);
      } else {
        await this.recordError(job, error, duration);
      }
    }
  }

  private async executeMessage(
    job: ICronJob,
    sender: string,
    prefix?: string
  ): Promise<void> {
    if (!job.message) {
      throw new Error('Message configuration is missing');
    }

    const { chatId, body, mentions } = job.message;
    const messageBody = this.prependBotPrefix(body, prefix ?? '');

    await this.connectionManager.sendTextMessage(sender, chatId, messageBody, {
      mentions: mentions || [],
      queueOnFail: true,
    });

    logger.info(`[JobExecutor] Message sent to ${chatId}`);
  }

  private async executeApi(job: ICronJob): Promise<void> {
    if (!job.apiConfig) {
      throw new Error('API configuration is missing');
    }

    const { url, method, headers, body } = job.apiConfig;
    const requestHeaders: Record<string, string> = {
      ...(headers || {}),
    };
    if (job.companyId && !requestHeaders['x-company-id']) {
      requestHeaders['x-company-id'] = String(job.companyId);
    }
    if (job.message?.chatId && !requestHeaders['x-cronjob-chat-id']) {
      requestHeaders['x-cronjob-chat-id'] = String(job.message.chatId);
    }

    const response = await axios.request({
      url,
      method,
      headers: requestHeaders,
      data: body,
      timeout: job.timeout || 30000,
    });

    logger.info(`[JobExecutor] API call to ${url} returned ${response.status}`);
  }

  private async recordSuccess(job: ICronJob, duration: number): Promise<void> {
    const { CronJobModel } = await getSharedModels();

    await CronJobModel.updateOne(
      { _id: job._id },
      {
        status: 'success',
        failureCount: 0,
        lastError: null,
        'retryPolicy.currentRetries': 0,
        $push: {
          history: {
            $each: [
              {
                status: 'success',
                timestamp: new Date(),
                duration,
              },
            ],
            $slice: -50,
          },
        },
      }
    );
  }

  private async recordError(
    job: ICronJob,
    error: any,
    duration: number
  ): Promise<void> {
    const { CronJobModel } = await getSharedModels();

    await CronJobModel.updateOne(
      { _id: job._id },
      {
        status: 'error',
        $inc: { failureCount: 1 },
        lastError: error.message,
        $push: {
          history: {
            $each: [
              {
                status: 'error',
                timestamp: new Date(),
                duration,
                error: error.message,
              },
            ],
            $slice: -50,
          },
        },
      }
    );
  }

  private async scheduleRetry(job: ICronJob, error: any): Promise<void> {
    const { CronJobModel } = await getSharedModels();
    const currentRetries = job.retryPolicy?.currentRetries || 0;
    const backoffDelay =
      Math.pow(job.retryPolicy.backoffMultiplier, currentRetries) * 1000;

    logger.info(
      `[JobExecutor] Scheduling retry ${currentRetries + 1}/${
        job.retryPolicy.maxRetries
      } for job ${job._id} in ${backoffDelay}ms`
    );

    await CronJobModel.updateOne(
      { _id: job._id },
      { 'retryPolicy.currentRetries': currentRetries + 1 }
    );

    setTimeout(async () => {
      await this.execute(job);
    }, backoffDelay);
  }
}
