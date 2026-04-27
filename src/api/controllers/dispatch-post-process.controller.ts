import type { Request, Response } from 'express';
import { processPostDispatch } from '../../services/dispatch-post-process.service.js';
import { sendTelegramAlert } from '../../services/telegram-alert.service.js';
import { validatePostProcessInput } from '../../validators/dispatch-post-process.validator.js';

export async function postProcess(req: Request, res: Response) {
  const validation = validatePostProcessInput(req.body);
  if (!validation.ok) {
    res.status(400).json({ ok: false, error: validation.error });
    return;
  }

  res.status(202).json({ ok: true, message: 'accepted' });

  setImmediate(() => {
    void processPostDispatch(validation.data).catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[post-process] Error: ${message}`);
      await sendTelegramAlert({
        dedupeKey: `dispatch-post-process:${validation.data.companyId}:${validation.data.dispatchId}`,
        message: `dispatch post-process failed: ${message}`,
      });
    });
  });
}
