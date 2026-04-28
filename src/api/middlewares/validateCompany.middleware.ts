import { Request, Response, NextFunction } from 'express';
import { getSharedModels } from '../../database/models.js';

export async function validateCompany(
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
    const job = await CronJobModel.findById(req.params.id).select('companyId').lean();
    companyId = typeof job?.companyId === 'string' ? job.companyId : '';
  }

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({
      ok: false,
      message: 'companyId is required',
    });
  }

  const company = await CompanyModel.findOne({ companyId });
  if (!company) {
    return res.status(404).json({
      ok: false,
      message: `Company ${companyId} not found`,
    });
  }

  req.companyId = companyId;
  return next();
}
