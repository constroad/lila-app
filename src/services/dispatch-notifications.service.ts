import { DISPATCH_IPP_READY_NOTIFICATION_DELAY_MS } from '../config/constants.js';
import { getDispatchNotificationFlagModel } from '../models/dispatch-notification-flag.model.js';
import type {
  DispatchPostProcessContext,
  DispatchPostProcessInput,
} from '../types/dispatch-post-process.js';
import { WhatsAppDirectService } from './whatsapp-direct.service.js';

type NotificationParams = {
  input: DispatchPostProcessInput;
  context: DispatchPostProcessContext;
};

function toSafeText(value: unknown, fallback = ''): string {
  const text = String(value || '').trim();
  return text || fallback;
}

export function buildPlantProgressMessage(
  botLabel: string,
  note: string,
  pendingCount: number
): string {
  return [
    botLabel,
    `- 🚛 ${note} *despachado*`,
    `- ⏰ Unidades Pendientes: ${pendingCount}`,
  ].join('\n');
}

export function buildClientDispatchMessage(params: {
  botLabel: string;
  note: string;
  quantity: number;
  plate: string;
  driverName: string;
  driverLicense: string;
  driverPhoneNumber: string;
  obra: string;
  pendingCount: number;
}): string {
  return [
    params.botLabel,
    '',
    `- 🎯 ${params.note}, ${params.quantity}m3 *despachado*`,
    `- 🚛 Placa: ${params.plate}`,
    `- 👔 Chofer: ${params.driverName}`,
    `- 🪪 Licencia: ${params.driverLicense}`,
    `- 📱 Telf: ${params.driverPhoneNumber}`,
    `- 🛣️ Obra : ${params.obra}`,
    `- ⏰ Unidades Pendientes: ${params.pendingCount}`,
  ].join('\n');
}

export function buildClientCompleteMessage(botLabel: string, obra: string): string {
  return [`${botLabel}: `, '', '✅ Fin de producción!', `🛣️ Obra: ${obra}`].join('\n');
}

export function buildPlantEndMessage(botLabel: string): string {
  return [
    botLabel,
    '',
    '✅ Fin de la producción',
    '',
    'Tareas:',
    '- Coordinar limpieza de planta por areas (tolvas, faja, polines, etc)',
    '- @Dario, revisar la poza',
    '- @Max, Informe total desperdicio y mediciones tanques',
    '- @Laboratorio, informe de % de agregados usados',
    '- @Wilson, actualizar tanques',
    '',
    '- 🚨 @Todos Comunicar algun incidente',
  ].join('\n');
}

export function buildIppReadyMessage(botLabel: string, obra: string): string {
  return [
    botLabel,
    '',
    '📄 El informe IPP de producción de planta ya está listo en el portal del cliente.',
    `🛣️ Obra: ${obra || 'No especificada'}`,
  ].join('\n');
}

async function sendToTargets(
  sender: string,
  targets: string[],
  message: string,
  companyId: string
) {
  for (const target of targets) {
    await WhatsAppDirectService.sendMessage(sender, target, message, {
      companyId,
      queueOnFail: true,
    });
  }
}

async function sendToGroup(
  sender: string,
  target: string,
  message: string,
  companyId: string
) {
  if (!target.trim()) {
    return;
  }

  await sendToTargets(sender, [target], message, companyId);
}

export function resolveClientTargets(input: DispatchPostProcessInput): string[] {
  if (!input.sendDispatchMessage) {
    return input.adminGroupTarget ? [input.adminGroupTarget] : [];
  }

  return input.clientTargets;
}

export function scheduleIppReadyNotification(params: {
  sender: string;
  targets: string[];
  botLabel: string;
  obra: string;
  companyId: string;
}) {
  if (!params.sender || params.targets.length === 0) {
    return;
  }

  const message = buildIppReadyMessage(params.botLabel, params.obra);
  setTimeout(() => {
    void sendToTargets(params.sender, params.targets, message, params.companyId).catch(
      (error: unknown) => {
        const messageText = error instanceof Error ? error.message : String(error);
        console.error(`[ipp-ready] Failed to send: ${messageText}`);
      }
    );
  }, DISPATCH_IPP_READY_NOTIFICATION_DELAY_MS);
}

export async function sendPlantEndIfNotSent(
  sender: string,
  botLabel: string,
  companyId: string,
  plantGroupTarget: string
) {
  const dayKey = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Lima',
  });
  const key = `plant-end:${companyId}:${dayKey}`;
  try {
    const DispatchNotificationFlagModel = await getDispatchNotificationFlagModel();
    const updateResult = await DispatchNotificationFlagModel.updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          companyId,
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
      }
    );

    if (updateResult.upsertedCount === 0) {
      return;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[plant-end] Flag persistence failed: ${message}`);
  }

  await sendToGroup(
    sender,
    plantGroupTarget,
    buildPlantEndMessage(botLabel),
    companyId
  );
}

export async function sendDispatchNotifications(params: NotificationParams) {
  const { input, context } = params;
  const note = toSafeText(input.note, 'Unidad');
  const quantity = Number.isFinite(Number(input.quantity)) ? Number(input.quantity) : 0;
  const plate = toSafeText(input.plate);
  const driverName = toSafeText(input.driverName);
  const driverLicense = toSafeText(input.driverLicense);
  const driverPhoneNumber = toSafeText(input.driverPhoneNumber);
  const obra = toSafeText(input.obra, 'No especificada');

  await sendToGroup(
    input.sender,
    input.plantGroupTarget,
    buildPlantProgressMessage(context.companyBotLabel, note, input.pendingCount),
    input.companyId
  );

  const clientTargets = resolveClientTargets(input);
  if (clientTargets.length > 0) {
    await sendToTargets(
      input.sender,
      clientTargets,
      buildClientDispatchMessage({
        botLabel: context.companyBotLabel,
        note,
        quantity,
        plate,
        driverName,
        driverLicense,
        driverPhoneNumber,
        obra,
        pendingCount: input.pendingCount,
      }),
      input.companyId
    );
  }

  const realClientTargets = input.sendDispatchMessage ? input.clientTargets : [];
  if (input.dispatchFinished && clientTargets.length > 0) {
    await sendToTargets(
      input.sender,
      clientTargets,
      buildClientCompleteMessage(context.companyBotLabel, obra),
      input.companyId
    );

    if (realClientTargets.length > 0) {
      scheduleIppReadyNotification({
        sender: input.sender,
        targets: realClientTargets,
        botLabel: context.companyBotLabel,
        obra,
        companyId: input.companyId,
      });
    }
  }

  if (input.allDispatched) {
    await sendPlantEndIfNotSent(
      input.sender,
      context.companyBotLabel,
      input.companyId,
      input.plantGroupTarget
    );
  }
}
