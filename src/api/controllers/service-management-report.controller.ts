import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import { getServiceReportModel } from '../../models/service-report.model.js';
import logger from '../../utils/logger.js';

const LOCK_DURATION_MS = 60 * 1000; // 60 seconds

function resolveUserId(req: Request): string {
  const headerUserId = req.headers['x-user-id'];
  if (typeof headerUserId === 'string' && headerUserId.trim()) {
    return headerUserId.trim();
  }
  if (typeof (req as any).user?.id === 'string') {
    return (req as any).user.id;
  }
  return 'unknown-user';
}

function isAdmin(req: Request): boolean {
  const roleHeader = req.headers['x-user-role'];
  if (typeof roleHeader === 'string') {
    return roleHeader === 'admin';
  }
  return (req as any).user?.role === 'admin';
}

export async function listReports(req: Request, res: Response, next: NextFunction) {
  try {
    const ServiceReport = await getServiceReportModel();
    const { serviceManagementId, type } = req.query;
    const filter: Record<string, any> = {};

    if (serviceManagementId) {
      filter.serviceManagementId = serviceManagementId;
    }
    if (type) {
      filter.type = type;
    }

    const reports = await ServiceReport.find(filter).sort({ createdAt: -1 }).lean();
    logger.info('service_reports.list', { serviceManagementId, type, count: reports.length });
    res.status(HTTP_STATUS.OK).json({ success: true, data: reports });
  } catch (error) {
    logger.error('service_reports.list_failed', { error });
    next(error);
  }
}

export async function createReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { serviceManagementId, type, status, schemaData, title, description } = req.body;

    if (!serviceManagementId || !type) {
      const err: CustomError = new Error('serviceManagementId and type are required');
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(err);
    }

    const ServiceReport = await getServiceReportModel();
    const report = await ServiceReport.create({
      serviceManagementId,
      type,
      status: status || 'draft',
      title,
      description,
      schemaData: schemaData || {},
    });

    logger.info('service_reports.created', { id: report._id, serviceManagementId, type });
    res.status(HTTP_STATUS.CREATED).json({ success: true, data: report });
  } catch (error) {
    logger.error('service_reports.create_failed', { error });
    next(error);
  }
}

export async function getReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const ServiceReport = await getServiceReportModel();
    const report = await ServiceReport.findById(id).lean();

    if (!report) {
      logger.warn('service_reports.not_found', { id });
      const err: CustomError = new Error('Report not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(err);
    }

    res.status(HTTP_STATUS.OK).json({ success: true, data: report });
  } catch (error) {
    logger.error('service_reports.get_failed', { error });
    next(error);
  }
}

export async function updateReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const ServiceReport = await getServiceReportModel();

    const report = await ServiceReport.findByIdAndUpdate(id, req.body, { new: true });
    if (!report) {
      logger.warn('service_reports.not_found', { id });
      const err: CustomError = new Error('Report not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(err);
    }

    logger.info('service_reports.updated', { id });
    res.status(HTTP_STATUS.OK).json({ success: true, data: report });
  } catch (error) {
    logger.error('service_reports.update_failed', { error });
    next(error);
  }
}

export async function deleteReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const ServiceReport = await getServiceReportModel();
    const report = await ServiceReport.findByIdAndDelete(id);

    if (!report) {
      logger.warn('service_reports.not_found', { id });
      const err: CustomError = new Error('Report not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(err);
    }

    logger.info('service_reports.deleted', { id });
    res.status(HTTP_STATUS.OK).json({ success: true, data: report });
  } catch (error) {
    logger.error('service_reports.delete_failed', { error });
    next(error);
  }
}

export async function acquireLock(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = resolveUserId(req);
    const ServiceReport = await getServiceReportModel();

    const report = await ServiceReport.findById(id);
    if (!report) {
      logger.warn('service_reports.lock.not_found', { id, userId });
      const err: CustomError = new Error('Report not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(err);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_DURATION_MS);

    if (report.editLock?.lockedBy && report.editLock.expiresAt) {
      const currentExpiry = new Date(report.editLock.expiresAt);
      if (currentExpiry > now && report.editLock.lockedBy !== userId) {
        logger.warn('service_reports.lock.conflict', {
          id,
          userId,
          lockedBy: report.editLock.lockedBy,
          expiresAt: report.editLock.expiresAt,
        });
        const err: CustomError = new Error('Report is locked by another user');
        err.statusCode = HTTP_STATUS.CONFLICT;
        err.details = report.editLock;
        return next(err);
      }
    }

    report.editLock = {
      lockedBy: userId,
      lockedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await report.save();
    logger.info('service_reports.lock.acquired', { id, userId, expiresAt: report.editLock?.expiresAt });
    res.status(HTTP_STATUS.OK).json({ success: true, data: report.editLock });
  } catch (error) {
    logger.error('service_reports.lock.acquire_failed', { error });
    next(error);
  }
}

export async function releaseLock(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = resolveUserId(req);
    const ServiceReport = await getServiceReportModel();
    const report = await ServiceReport.findById(id);

    if (!report) {
      logger.warn('service_reports.lock.not_found', { id, userId });
      const err: CustomError = new Error('Report not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(err);
    }

    if (report.editLock?.lockedBy && report.editLock.lockedBy !== userId && !isAdmin(req)) {
      logger.warn('service_reports.lock.release_forbidden', { id, userId, lockedBy: report.editLock?.lockedBy });
      const err: CustomError = new Error('Not allowed to unlock');
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(err);
    }

    report.editLock = undefined;
    await report.save();

    logger.info('service_reports.lock.released', { id, userId });
    res.status(HTTP_STATUS.OK).json({ success: true, data: { released: true } });
  } catch (error) {
    logger.error('service_reports.lock.release_failed', { error });
    next(error);
  }
}

export async function heartbeatLock(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = resolveUserId(req);
    const ServiceReport = await getServiceReportModel();
    const report = await ServiceReport.findById(id);

    if (!report) {
      logger.warn('service_reports.lock.not_found', { id, userId });
      const err: CustomError = new Error('Report not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(err);
    }

    if (!report.editLock || report.editLock.lockedBy !== userId) {
      logger.warn('service_reports.lock.heartbeat_forbidden', { id, userId, lockedBy: report.editLock?.lockedBy });
      const err: CustomError = new Error('Lock not owned by user');
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(err);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_DURATION_MS);

    report.editLock.lockedAt = now.toISOString();
    report.editLock.expiresAt = expiresAt.toISOString();
    await report.save();

    logger.info('service_reports.lock.heartbeat', { id, userId, expiresAt: report.editLock.expiresAt });
    res.status(HTTP_STATUS.OK).json({ success: true, data: report.editLock });
  } catch (error) {
    logger.error('service_reports.lock.heartbeat_failed', { error });
    next(error);
  }
}
