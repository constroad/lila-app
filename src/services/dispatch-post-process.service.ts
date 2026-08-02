import axios from 'axios';
import { config } from '../config/environment.js';
import { getCompanyModel, getConfigModel } from '../database/models.js';
import type {
  DispatchPostProcessContext,
  DispatchPostProcessInput,
} from '../types/dispatch-post-process.js';
import { getCompanyBotLabel } from '../utils/company-bot.js';
import { buildPortalCallbackHeaders } from '../utils/portal-callback.js';
import logger from '../utils/logger.js';
import { sendDispatchNotifications } from './dispatch-notifications.service.js';

type ConfigRecord = {
  _id: string;
  companyId: string;
  currentValue?: unknown;
};

function toNumber(value: unknown): number {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

async function fetchDispatchContext(
  input: DispatchPostProcessInput
): Promise<DispatchPostProcessContext> {
  const CompanyModel = await getCompanyModel();
  const company = await CompanyModel.findOne({ companyId: input.companyId }).lean();
  // whatsappConfig lo escribe Portal (plantGroupId/adminGroupId/alerts); con lean() llega crudo.
  const wa = (company as any)?.whatsappConfig ?? {};
  const alerts = wa.alerts instanceof Map ? Object.fromEntries(wa.alerts) : wa.alerts ?? {};
  return {
    companyBotLabel: getCompanyBotLabel(
      company?.slug || company?.name || input.companyId
    ),
    // plantGroupId puede estar en wa.plantGroupId (campo directo) o en alerts['plant-progress'].groupId
    // (sistema nuevo de alerts). El campo directo toma precedencia si existe.
    plantGroupId: String(wa.plantGroupId ?? alerts?.['plant-progress']?.groupId ?? '').trim(),
    adminGroupId: String(wa.adminGroupId ?? '').trim(),
    plantProgressTemplate: alerts?.['plant-progress']?.customMessage || undefined,
    plantEndTemplate: alerts?.['plant-end']?.customMessage || undefined,
  };
}

export async function updateMaintenanceM3Config(companyId: string, quantity: number) {
  const ConfigModel = await getConfigModel();
  const configs = (await ConfigModel.find({
    companyId,
    type: 'maintenance',
    unit: 'm3',
  }).lean()) as ConfigRecord[];

  if (configs.length === 0) {
    return;
  }

  await Promise.all(
    configs.map((config) =>
      ConfigModel.updateOne(
        { _id: config._id, companyId },
        {
          $set: {
            currentValue: toNumber(config.currentValue) + toNumber(quantity),
          },
        }
      )
    )
  );
}

async function callPortalIppSync(dispatchId: string, companyId: string) {
  await axios.post(
    `${String(config.portal.baseUrl).replace(/\/+$/, '')}/api/dispatch/${dispatchId}`,
    {},
    {
      // Bearer de callback: sin él, el hardening de Portal (prueba de llamador)
      // responde 401 y el sync IPP se pierde en silencio.
      headers: buildPortalCallbackHeaders(companyId, 'lila-dispatch-post-process'),
      timeout: 10000,
    }
  );
}

export async function processPostDispatch(input: DispatchPostProcessInput) {
  if (input.state !== 'despachado') {
    logger.info('dispatch_post_process.skipped', {
      companyId: input.companyId,
      dispatchId: input.dispatchId,
      state: input.state,
    });
    return;
  }

  logger.info('dispatch_post_process.started', {
    companyId: input.companyId,
    dispatchId: input.dispatchId,
    sender: input.sender || '(none)',
    pendingCount: input.pendingCount,
    dispatchedCount: input.dispatchedCount,
    unitNumber: input.unitNumber,
  });

  const context = await fetchDispatchContext(input);
  logger.info('dispatch_post_process.context', {
    companyId: input.companyId,
    plantGroupId: context.plantGroupId || '(empty)',
    adminGroupId: context.adminGroupId || '(empty)',
    hasProgressTemplate: Boolean(context.plantProgressTemplate),
  });

  if (input.truckDispatched && input.quantity) {
    await updateMaintenanceM3Config(input.companyId, input.quantity);
  }

  if (input.orderId) {
    await callPortalIppSync(input.dispatchId, input.companyId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[post-process] IPP sync failed: ${message}`);
    });
  }

  if (!input.sender) {
    console.warn(
      `[post-process] No sender for ${input.companyId}. Telegram remains enabled.`
    );
  }

  await sendDispatchNotifications({
    input,
    context,
  });
}
