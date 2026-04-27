import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import {
  enqueueDispatchValeWorkflow,
  validateDispatchValeWorkflowInput,
} from '../../services/dispatch-vale.service.js';

function resolveProto(req: Request): string {
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0];
  }
  return req.protocol;
}

function buildAbsoluteBaseUrl(req: Request) {
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return '';
  return `${resolveProto(req)}://${host}`;
}

export async function generateValeAndNotify(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  try {
    if (!req.companyId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const workflowInput = validateDispatchValeWorkflowInput({
      companyId: req.companyId,
      baseUrl: buildAbsoluteBaseUrl(req),
      dispatchId: String(req.body?.dispatchId || '').trim(),
      orderId: String(req.body?.orderId || '').trim(),
      note: req.body?.note,
      quantity: req.body?.quantity,
      sender: req.body?.sender,
      driverName: req.body?.driverName,
      driverPhoneNumber: req.body?.driverPhoneNumber,
      sendDriverPdf: req.body?.sendDriverPdf,
      orderLocation: req.body?.orderLocation,
      fileName: req.body?.fileName,
      documentPayload: req.body?.documentPayload,
    });
    enqueueDispatchValeWorkflow(workflowInput);

    logger.info('dispatch_vale.generate.accepted', {
      companyId: req.companyId,
      dispatchId: workflowInput.dispatchId,
      durationMs: Date.now() - startedAt,
      orderId: workflowInput.orderId,
    });

    return res.status(202).json({
      success: true,
      data: {
        accepted: true,
        dispatchId: workflowInput.dispatchId,
      },
    });
  } catch (error) {
    logger.error('dispatch_vale.generate.failed', {
      companyId: req.companyId,
      dispatchId: req.body?.dispatchId,
      durationMs: Date.now() - startedAt,
      error,
    });
    next(error);
  }
}
