import { Request, Response, NextFunction } from 'express';
import { getSharedModels } from '../../database/models.js';

export async function validateCompany(
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
      message: 'companyId is required',
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

  req.companyId = companyId;
  return next();
}
