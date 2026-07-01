import type { NextFunction, Request, Response } from 'express';
import fs from 'fs-extra';
import {
  generatePlantSettlementPdf,
  type PlantSettlementPdfPayload,
} from '../../services/plant-dispatch-settlement-document.service.js';

export async function downloadPlantSettlementPdf(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.companyId) throw new Error('Company ID is required.');
    const payload = req.body as PlantSettlementPdfPayload;
    const generated = await generatePlantSettlementPdf({
      companyId: req.companyId,
      payload,
    });
    res.download(generated.filePath, generated.fileName, (error) => {
      void fs.remove(generated.filePath);
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    next(error);
  }
}
