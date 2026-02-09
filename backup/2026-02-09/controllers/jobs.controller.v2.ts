import { Request, Response } from 'express';
import JobSchedulerV2 from '../../jobs/scheduler.service.v2.js';
import {
  validateCronJobCreate,
  validateCronJobUpdate,
} from '../../utils/validators.js';
import logger from '../../utils/logger.js';
import { getSharedModels } from '../../database/models.js';

export class JobsControllerV2 {
  private scheduler: JobSchedulerV2;

  constructor(scheduler: JobSchedulerV2) {
    this.scheduler = scheduler;
  }

  createJob = async (req: Request, res: Response) => {
    try {
      const validation = validateCronJobCreate(req.body);
      if (!validation.success) {
        return res.status(400).json({
          ok: false,
          message: 'Validation failed',
          errors: validation.errors,
        });
      }

      const job = await this.scheduler.createJob(validation.data);

      return res.status(201).json({
        ok: true,
        data: job,
      });
    } catch (error: any) {
      logger.error('[JobsControllerV2] Create job failed:', error);
      return res.status(500).json({
        ok: false,
        message: error.message,
      });
    }
  };

  listJobs = async (req: Request, res: Response) => {
    try {
      const { companyId, type, isActive } = req.query;
      const filter: Record<string, unknown> = {};

      if (companyId) filter.companyId = companyId;
      if (type) filter.type = type;
      if (isActive !== undefined) filter.isActive = isActive === 'true';

      const { CronJobModel } = await getSharedModels();
      const jobs = await CronJobModel.find(filter).sort({
        'metadata.createdAt': -1,
      });

      return res.status(200).json({
        ok: true,
        data: jobs,
      });
    } catch (error: any) {
      logger.error('[JobsControllerV2] List jobs failed:', error);
      return res.status(500).json({
        ok: false,
        message: error.message,
      });
    }
  };

  getJob = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const job = await this.scheduler.getJob(id);

      if (!job) {
        return res.status(404).json({
          ok: false,
          message: 'Job not found',
        });
      }

      return res.status(200).json({
        ok: true,
        data: job,
      });
    } catch (error: any) {
      logger.error('[JobsControllerV2] Get job failed:', error);
      return res.status(500).json({
        ok: false,
        message: error.message,
      });
    }
  };

  updateJob = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const validation = validateCronJobUpdate(req.body);
      if (!validation.success) {
        return res.status(400).json({
          ok: false,
          message: 'Validation failed',
          errors: validation.errors,
        });
      }

      const job = await this.scheduler.updateJob(id, validation.data);

      return res.status(200).json({
        ok: true,
        data: job,
      });
    } catch (error: any) {
      logger.error('[JobsControllerV2] Update job failed:', error);
      return res.status(500).json({
        ok: false,
        message: error.message,
      });
    }
  };

  deleteJob = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await this.scheduler.deleteJob(id);

      return res.status(200).json({
        ok: true,
        message: `Job ${id} deleted`,
      });
    } catch (error: any) {
      logger.error('[JobsControllerV2] Delete job failed:', error);
      return res.status(500).json({
        ok: false,
        message: error.message,
      });
    }
  };

  runJobNow = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await this.scheduler.runJobNow(id);

      return res.status(200).json({
        ok: true,
        message: `Job ${id} executed`,
      });
    } catch (error: any) {
      logger.error('[JobsControllerV2] Run job failed:', error);
      return res.status(500).json({
        ok: false,
        message: error.message,
      });
    }
  };
}
