import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger.js';
import { HTTP_STATUS } from '../../config/constants.js';
import { enqueueDomainEvent } from '../../services/domain-events.service.js';

function normalizePayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export async function ingestDomainEvent(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const startedAt = Date.now();

  try {
    if (!req.companyId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'companyId is required',
      });
    }

    const aggregateId = String(req.body?.aggregateId || '').trim();
    const aggregateType = String(req.body?.aggregateType || 'dispatch').trim();
    const eventType = String(req.body?.eventType || '').trim();

    if (!aggregateId || !eventType) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'aggregateId and eventType are required',
      });
    }

    const event = await enqueueDomainEvent({
      sourceEventId: String(req.body?.sourceEventId || '').trim() || undefined,
      companyId: req.companyId,
      aggregateId,
      aggregateType,
      eventType,
      occurredAt: req.body?.occurredAt,
      payload: normalizePayload(req.body?.payload),
    });

    logger.info('domain_event.accepted', {
      aggregateId,
      companyId: req.companyId,
      durationMs: Date.now() - startedAt,
      eventId: String(event._id),
      eventType,
    });

    return res.status(202).json({
      success: true,
      data: {
        eventId: String(event._id),
        eventType,
      },
    });
  } catch (error) {
    logger.error('domain_event.ingest_failed', {
      companyId: req.companyId,
      durationMs: Date.now() - startedAt,
      error,
      eventType: req.body?.eventType,
    });
    next(error);
  }
}
