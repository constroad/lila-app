import type { Request, Response } from 'express';
import { enqueueAcademyTranscode } from '../../services/academy-transcode.service.js';

const ACADEMY_COMPANY_ID = 'academy';

/**
 * POST /api/academy/transcode — encola el transcode de un tutorial (fire-and-
 * forget). Solo la company `academy` (JWT). Responde 202: el trabajo corre en
 * background y actualiza el doc `academy_tutorials` (processing → published/error).
 */
export async function triggerAcademyTranscode(req: Request, res: Response): Promise<Response> {
  if (req.companyId !== ACADEMY_COMPANY_ID) {
    return res
      .status(403)
      .json({ success: false, error: 'Solo la company academy puede transcodear tutoriales' });
  }

  const tutorialId = String((req.body as { tutorialId?: unknown })?.tutorialId || '').trim();
  if (!tutorialId) {
    return res.status(400).json({ success: false, error: 'tutorialId requerido' });
  }

  enqueueAcademyTranscode(tutorialId);
  return res.status(202).json({ success: true, status: 'processing' });
}
