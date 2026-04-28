import { Request, Response, NextFunction } from 'express';
import { getSharedModels } from '../../database/models.js';

export async function validateSender(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const directCompanyId =
    (req.body && req.body.companyId) ||
    (req.query && req.query.companyId);
  const { CompanyModel, CronJobModel } = await getSharedModels();

  let companyId = typeof directCompanyId === 'string' ? directCompanyId : '';

  if (!companyId && req.params?.id) {
    const job = await CronJobModel.findById(req.params.id)
      .select('companyId type message')
      .lean();
    const currentBody = req.body && typeof req.body === 'object' ? req.body : {};
    companyId = typeof job?.companyId === 'string' ? job.companyId : '';
    if (!currentBody.type && typeof job?.type === 'string') {
      req.body = { ...currentBody, type: job.type };
    }
    if (!currentBody.message && job?.message) {
      req.body = { ...(req.body && typeof req.body === 'object' ? req.body : currentBody), message: job.message };
    }
  }

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({
      ok: false,
      message: 'companyId is required to validate sender',
    });
  }

  const company = await CompanyModel.findOne({ companyId });
  if (!company) {
    return res.status(404).json({
      ok: false,
      message: `Company ${companyId} not found`,
    });
  }

  const jobType = req.body?.type;
  const hasMessage =
    Boolean(req.body?.message?.chatId) || Boolean(req.body?.message?.body);
  const shouldRequireSender = jobType === 'message' || hasMessage;

  if (shouldRequireSender && !company.whatsappConfig?.sender) {
    return res.status(400).json({
      ok: false,
      message:
        'No hay sender de WhatsApp configurado para esta empresa. Configure uno antes de crear cronjobs.',
    });
  }

  return next();
}
