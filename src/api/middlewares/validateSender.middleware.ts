import { Request, Response, NextFunction } from 'express';
import { getSharedModels } from '../../database/models.js';

export async function validateSender(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const companyId =
    (req.body && req.body.companyId) ||
    (req.query && req.query.companyId);

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({
      ok: false,
      message: 'companyId is required to validate sender',
    });
  }

  const { CompanyModel } = await getSharedModels();
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
