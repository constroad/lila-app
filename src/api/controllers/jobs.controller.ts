import { Request, Response, NextFunction } from 'express';
import jobScheduler from '../../jobs/scheduler.service.js';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import { validateCronJob, validateCronJobUpdate } from '../../utils/validators.js';

export async function createJob(req: Request, res: Response, next: NextFunction) {
  try {
    const validation = validateCronJob(req.body);

    if (!validation.valid) {
      const error: CustomError = new Error('Validation failed');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = validation.errors;
      return next(error);
    }

    const job = await jobScheduler.createJob(req.body);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const validation = validateCronJobUpdate(req.body);
    if (!validation.valid) {
      const error: CustomError = new Error('Validation failed');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = validation.errors;
      return next(error);
    }

    const job = await jobScheduler.updateJob(id, req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    await jobScheduler.deleteJob(id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Job ${id} deleted`,
    });
  } catch (error) {
    next(error);
  }
}

export async function getJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const job = await jobScheduler.getJob(id);

    if (!job) {
      const error: CustomError = new Error('Job not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const { company } = req.query;
    let jobs;

    if (company && (company === 'constroad' || company === 'altavia')) {
      jobs = await jobScheduler.getJobsByCompany(company as 'constroad' | 'altavia');
    } else {
      jobs = await jobScheduler.getAllJobs();
    }

    res.status(HTTP_STATUS.OK).json(jobs);
  } catch (error) {
    next(error);
  }
}

export async function runJobNow(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    await jobScheduler.runJobNow(id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Job ${id} executed`,
    });
  } catch (error) {
    next(error);
  }
}
