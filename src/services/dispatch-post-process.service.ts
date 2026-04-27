import axios from 'axios';
import { config } from '../config/environment.js';
import { getCompanyModel, getConfigModel } from '../database/models.js';
import type {
  DispatchPostProcessContext,
  DispatchPostProcessInput,
} from '../types/dispatch-post-process.js';
import { getCompanyBotLabel } from '../utils/company-bot.js';
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
  return {
    companyBotLabel: getCompanyBotLabel(
      company?.slug || company?.name || input.companyId
    ),
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
      headers: {
        'x-company-id': companyId,
      },
      timeout: 10000,
    }
  );
}

export async function processPostDispatch(input: DispatchPostProcessInput) {
  if (input.state !== 'despachado') {
    return;
  }

  const context = await fetchDispatchContext(input);

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
    console.warn(`[post-process] No sender for ${input.companyId}. Skipping WhatsApp.`);
    return;
  }

  await sendDispatchNotifications({
    input,
    context,
  });
}
