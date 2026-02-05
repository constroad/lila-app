import axios from 'axios';
import { getSharedModels } from '../database/models.js';
import { ICronJob } from '../models/cronjob.model.js';
import { ConnectionManager } from '../whatsapp/baileys/connection.manager.js';
import logger from '../utils/logger.js';

type ApiMessageItem = {
  to?: string;
  message: string;
  mentions?: string[];
};

export class JobExecutor {
  private connectionManager: ConnectionManager;

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
  }

  private resolveRetryPolicy(job: ICronJob) {
    const maxRetries = Math.min(job.retryPolicy?.maxRetries ?? 1, 1);
    const backoffMultiplier = job.retryPolicy?.backoffMultiplier ?? 1;
    const currentRetries = job.retryPolicy?.currentRetries ?? 0;

    return {
      maxRetries: Math.max(0, maxRetries),
      backoffMultiplier: Math.max(1, backoffMultiplier),
      currentRetries: Math.max(0, currentRetries),
    };
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

  private normalizeRecipient(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (trimmed.includes('@')) return trimmed;
    const normalized = trimmed.replace(/[^\d]/g, '');
    return `${normalized}@s.whatsapp.net`;
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
      const hasChatId = Boolean(job.message?.chatId);
      const hasBody = Boolean(job.message?.body?.trim());
      if (!sender && (job.type === 'message' || hasChatId)) {
        throw new Error(`No sender configured for company ${job.companyId}`);
      }

      if (job.type === 'message') {
        await this.executeMessage(job, sender!, cronjobPrefix);
      } else if (job.type === 'api') {
        const apiMessages = await this.executeApi(job);
        if (apiMessages && apiMessages.length > 0) {
          await this.executeBatchMessages(
            sender!,
            apiMessages,
            cronjobPrefix,
            job.message?.chatId
          );
        } else if (hasChatId && hasBody) {
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

      const retryPolicy = this.resolveRetryPolicy(job);
      if (retryPolicy.currentRetries < retryPolicy.maxRetries) {
        await this.scheduleRetry(job, error, retryPolicy);
      } else {
        await this.recordError(job, error, duration);
      }
    }
  }

  private async executeMessage(
    job: ICronJob,
    sender: string,
    prefix?: string,
    overrideBody?: string
  ): Promise<void> {
    if (!job.message) {
      throw new Error('Message configuration is missing');
    }

    const { chatId, body, mentions } = job.message;
    const resolvedBody = (overrideBody ?? body ?? '').trim();
    const messageBody = this.prependBotPrefix(resolvedBody, prefix ?? '');

    await this.connectionManager.sendTextMessage(sender, chatId, messageBody, {
      mentions: mentions || [],
      queueOnFail: true,
    });

    logger.info(`[JobExecutor] Message sent to ${chatId}`);
  }

  private async executeBatchMessages(
    sender: string,
    items: ApiMessageItem[],
    prefix?: string,
    defaultTo?: string
  ): Promise<void> {
    for (const item of items) {
      const rawTo = item.to ?? defaultTo;
      if (!rawTo) {
        logger.warn('[JobExecutor] Skipping message with no recipient');
        continue;
      }
      const recipient = this.normalizeRecipient(rawTo);
      const messageBody = this.prependBotPrefix(item.message, prefix ?? '');
      await this.connectionManager.sendTextMessage(sender, recipient, messageBody, {
        mentions: item.mentions || [],
        queueOnFail: true,
      });
      logger.info(`[JobExecutor] Message sent to ${recipient}`);
    }
  }

  private shouldUseApiResponseMessage(
    job: ICronJob,
    requestHeaders?: Record<string, string>
  ): boolean {
    const headers = requestHeaders ?? job.apiConfig?.headers ?? {};
    const rawFlag =
      headers['x-cronjob-return-message'] ||
      headers['x-cronjob-use-response-message'];
    if (rawFlag && rawFlag !== '0' && rawFlag !== 'false') {
      return true;
    }

    const url = job.apiConfig?.url;
    if (!url) return false;
    try {
      const parsed = new URL(url, 'http://localhost');
      const param = parsed.searchParams.get('returnMessage');
      return param === '1' || param === 'true' || param === 'yes';
    } catch {
      return false;
    }
  }

  private coerceApiMessages(
    payload: any,
    defaultTo?: string
  ): ApiMessageItem[] | undefined {
    if (!payload) return undefined;

    const toItem = (value: any): ApiMessageItem | null => {
      if (!value) return null;
      if (typeof value === 'string') {
        return { to: defaultTo, message: value };
      }
      if (typeof value === 'object') {
        const message =
          typeof value.message === 'string' ? value.message : undefined;
        if (!message) return null;
        const to = typeof value.to === 'string' ? value.to : defaultTo;
        const mentions = Array.isArray(value.mentions)
          ? value.mentions.filter((m: unknown) => typeof m === 'string')
          : undefined;
        return { to, message, mentions };
      }
      return null;
    };

    if (Array.isArray(payload)) {
      const items = payload.map(toItem).filter(Boolean) as ApiMessageItem[];
      return items.length > 0 ? items : undefined;
    }

    const single = toItem(payload);
    return single ? [single] : undefined;
  }

  private mergeApiMessages(
    primary?: ApiMessageItem[],
    secondary?: ApiMessageItem[]
  ): ApiMessageItem[] | undefined {
    if (primary && secondary) return [...primary, ...secondary];
    if (primary && primary.length > 0) return primary;
    if (secondary && secondary.length > 0) return secondary;
    return undefined;
  }

  private extractMessageFromApiResponse(
    data: any,
    companyId?: string,
    defaultTo?: string
  ): ApiMessageItem[] | undefined {
    if (!data) return undefined;
    const topMessages = this.coerceApiMessages(data.messages, defaultTo);
    const topMessage = this.coerceApiMessages(data.message, defaultTo);
    const topLevel = this.mergeApiMessages(topMessages, topMessage);
    if (topLevel && topLevel.length > 0) return topLevel;
    const tenantResults = Array.isArray(data.tenantResults) ? data.tenantResults : null;
    if (!tenantResults || tenantResults.length === 0) return undefined;
    const match = companyId
      ? tenantResults.find((t: any) => t?.companyId === companyId)
      : tenantResults[0];
    const resultMessages = this.coerceApiMessages(match?.result?.messages, defaultTo);
    const resultMessage = this.coerceApiMessages(match?.result?.message, defaultTo);
    return this.mergeApiMessages(resultMessages, resultMessage);
  }

  private async executeApi(job: ICronJob): Promise<ApiMessageItem[] | undefined> {
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
    if (
      !requestHeaders['x-cronjob-return-message'] &&
      !requestHeaders['x-cronjob-use-response-message'] &&
      job.message?.chatId
    ) {
      requestHeaders['x-cronjob-return-message'] = '1';
    }

    const response = await axios.request({
      url,
      method,
      headers: requestHeaders,
      data: body,
      timeout: job.timeout || 30000,
    });

    logger.info(`[JobExecutor] API call to ${url} returned ${response.status}`);
    if (!this.shouldUseApiResponseMessage(job, requestHeaders)) {
      return undefined;
    }
    const messages = this.extractMessageFromApiResponse(
      response.data,
      job.companyId,
      job.message?.chatId
    );
    if (!messages || messages.length === 0) {
      logger.warn(`[JobExecutor] API response did not include messages to send`);
    }
    return messages;
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

  private async scheduleRetry(
    job: ICronJob,
    error: any,
    retryPolicy: {
      maxRetries: number;
      backoffMultiplier: number;
      currentRetries: number;
    }
  ): Promise<void> {
    const { CronJobModel } = await getSharedModels();
    const currentRetries = retryPolicy.currentRetries;
    const maxRetries = retryPolicy.maxRetries;
    const backoffMultiplier = retryPolicy.backoffMultiplier;
    const backoffDelay = Math.pow(backoffMultiplier, currentRetries) * 1000;

    logger.info(
      `[JobExecutor] Scheduling retry ${currentRetries + 1}/${maxRetries} for job ${job._id} in ${backoffDelay}ms`
    );

    const nextRetries = currentRetries + 1;
    await CronJobModel.updateOne(
      { _id: job._id },
      { 'retryPolicy.currentRetries': nextRetries }
    );

    const nextJob: ICronJob = {
      ...job,
      retryPolicy: {
        ...(job.retryPolicy ?? {}),
        maxRetries,
        backoffMultiplier,
        currentRetries: nextRetries,
      },
    };

    setTimeout(async () => {
      await this.execute(nextJob);
    }, backoffDelay);
  }
}
