import axios from 'axios';
import sharp from 'sharp';
import { DISPATCH_IPP_READY_NOTIFICATION_DELAY_MS } from '../config/constants.js';
import { config } from '../config/environment.js';
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

type CompletionRow = NonNullable<DispatchPostProcessInput['orderCompletion']>['rows'][number];

async function claimNotificationFlag(key: string, companyId: string) {
  if (shouldBypassDispatchDedupe()) {
    return true;
  }

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
      { upsert: true }
    );

    return updateResult.upsertedCount > 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dispatch-notification-flag] Failed: ${message}`);
    return true;
  }
}

export function shouldBypassDispatchDedupe(nodeEnv = config.nodeEnv) {
  return nodeEnv === 'development';
}

function toSafeText(value: unknown, fallback = ''): string {
  const text = String(value || '').trim();
  return text || fallback;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  return date.toLocaleDateString('es-PE', {
    timeZone: 'America/Lima',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatQuantity(value: number): string {
  return Number(value || 0).toLocaleString('es-PE', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export function buildPlantProgressMessage(
  botLabel: string,
  dispatchOrdinal: number,
  pendingCount: number
): string {
  return [
    botLabel,
    `- 🚛 Unidad ${dispatchOrdinal} *despachado*`,
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

export function buildOrderCompletionCaption(params: {
  botLabel: string;
  clientName: string;
  obra: string;
  totalM3: number;
  totalUnits: number;
}): string {
  return [
    params.botLabel,
    '',
    '✅ Despacho concluido',
    `Cliente: ${params.clientName || 'No identificado'}`,
    `Obra: ${params.obra || 'No especificada'}`,
    `Unidades: ${params.totalUnits}`,
    `M3: ${formatQuantity(params.totalM3)}`,
  ].join('\n');
}

export function buildOrderCompletionSummarySvg(params: {
  clientName: string;
  date: string;
  locationUrl: string;
  obra: string;
  rows: CompletionRow[];
  totalM3: number;
  totalUnits: number;
}): string {
  const rowHeight = 54;
  const headerTop = 260;
  const tableTop = 330;
  const rows = params.rows.slice(0, 14);
  const height = Math.max(760, tableTop + rowHeight * (rows.length + 1) + 120);
  const rowSvg = rows
    .map((row, index) => {
      const y = tableTop + rowHeight * (index + 1);
      return `
        <rect x="32" y="${y}" width="1136" height="${rowHeight}" fill="${index % 2 === 0 ? '#ffffff' : '#f8fafc'}" />
        <text x="72" y="${y + 34}" class="cell">${escapeXml(formatDate(row.date || params.date))}</text>
        <text x="240" y="${y + 34}" class="cell accent">${escapeXml(truncateText(row.plate, 12))}</text>
        <text x="420" y="${y + 34}" class="cell">${escapeXml(truncateText(row.driverName, 28))}</text>
        <text x="700" y="${y + 34}" class="cell">${escapeXml(row.hour || '-')}</text>
        <text x="830" y="${y + 34}" class="cell">${escapeXml(truncateText(row.note, 18))}</text>
        <text x="1095" y="${y + 34}" class="cell right">${escapeXml(formatQuantity(row.quantity))}</text>
      `;
    })
    .join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
      <style>
        .title { font: 700 34px Arial, sans-serif; fill: #20242a; }
        .subtitle { font: 400 22px Arial, sans-serif; fill: #4b5563; }
        .metric { font: 800 38px Arial, sans-serif; fill: #f5a623; }
        .metric-label { font: 700 20px Arial, sans-serif; fill: #20242a; }
        .head { font: 800 21px Arial, sans-serif; fill: #ffffff; letter-spacing: 4px; }
        .cell { font: 400 21px Arial, sans-serif; fill: #272b31; }
        .accent { fill: #1d4ed8; text-decoration: underline; }
        .right { text-anchor: end; }
      </style>
      <rect width="1200" height="${height}" fill="#f4f6fb" />
      <text x="32" y="58" class="title">Hola, ${escapeXml(params.clientName || 'Cliente')}</text>
      <text x="32" y="94" class="subtitle">Resumen de tu pedido, ${escapeXml(params.obra || 'Obra')}</text>
      <g>
        <rect x="32" y="135" width="260" height="142" rx="28" fill="#f7f8fc" stroke="#ffffff" stroke-width="2" />
        <text x="162" y="198" class="metric" text-anchor="middle">${escapeXml(formatDate(params.date))}</text>
        <text x="162" y="246" class="metric-label" text-anchor="middle">Fecha</text>
        <rect x="320" y="135" width="260" height="142" rx="28" fill="#f7f8fc" stroke="#ffffff" stroke-width="2" />
        <text x="450" y="198" class="metric" text-anchor="middle">${escapeXml(formatQuantity(params.totalM3))}</text>
        <text x="450" y="246" class="metric-label" text-anchor="middle">M3</text>
        <rect x="608" y="135" width="260" height="142" rx="28" fill="#f7f8fc" stroke="#ffffff" stroke-width="2" />
        <text x="738" y="198" class="metric" text-anchor="middle">${escapeXml(String(params.totalUnits))}</text>
        <text x="738" y="246" class="metric-label" text-anchor="middle">Unidades</text>
        <rect x="896" y="135" width="260" height="142" rx="28" fill="#f7f8fc" stroke="#ffffff" stroke-width="2" />
        <text x="1026" y="214" class="metric" text-anchor="middle">⌖</text>
        <text x="1026" y="246" class="metric-label" text-anchor="middle">${params.locationUrl ? 'Ubicación' : 'Sin ubicación'}</text>
      </g>
      <rect x="32" y="${headerTop}" width="1136" height="${height - headerTop - 38}" rx="26" fill="#ffffff" />
      <rect x="32" y="${tableTop}" width="1136" height="54" fill="#1f2026" />
      <text x="72" y="${tableTop + 35}" class="head">FECHA</text>
      <text x="240" y="${tableTop + 35}" class="head">PLACA</text>
      <text x="420" y="${tableTop + 35}" class="head">CHOFER</text>
      <text x="700" y="${tableTop + 35}" class="head">HORA</text>
      <text x="830" y="${tableTop + 35}" class="head">NOTA</text>
      <text x="1095" y="${tableTop + 35}" class="head right">M3</text>
      ${rowSvg}
    </svg>
  `;
}

async function renderOrderCompletionImage(
  completion: NonNullable<DispatchPostProcessInput['orderCompletion']>
) {
  const svg = buildOrderCompletionSummarySvg(completion);
  return sharp(Buffer.from(svg)).png().toBuffer();
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
  dispatchId: string;
  sender: string;
  targets: string[];
  botLabel: string;
  obra: string;
  companyId: string;
  ippReportPayload?: DispatchPostProcessInput['ippReportPayload'];
}) {
  if (!params.sender || params.targets.length === 0) {
    return;
  }

  const message = buildIppReadyMessage(params.botLabel, params.obra);
  setTimeout(() => {
    void (async () => {
      const shouldSend = await claimNotificationFlag(
        `dispatch-ipp-ready:${params.companyId}:${params.dispatchId}`,
        params.companyId
      );
      if (!shouldSend) {
        return;
      }

      const pdfUrl = params.ippReportPayload
        ? await generateIppPdfUrl(params.ippReportPayload).catch((error: unknown) => {
            const messageText = error instanceof Error ? error.message : String(error);
            console.error(`[ipp-ready] PDF generation failed: ${messageText}`);
            return '';
          })
        : '';

      if (!pdfUrl) {
        await sendToTargets(params.sender, params.targets, message, params.companyId);
        return;
      }

      for (const target of params.targets) {
        await WhatsAppDirectService.sendDocument(params.sender, target, {
          fileUrl: pdfUrl,
          fileName: 'informe-produccion-planta.pdf',
          caption: message,
          mimeType: 'application/pdf',
          companyId: params.companyId,
          queueOnFail: true,
        });
      }
    })().catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : String(error);
      console.error(`[ipp-ready] Failed to send: ${messageText}`);
    });
  }, DISPATCH_IPP_READY_NOTIFICATION_DELAY_MS);
}

async function generateIppPdfUrl(reportPayload: DispatchPostProcessInput['ippReportPayload']) {
  if (!reportPayload) return '';
  const response = await axios.post(
    `http://127.0.0.1:${config.port}/api/documents/generate`,
    {
      format: 'pdf',
      reportPayload,
    },
    { timeout: 120000 }
  );
  return String(
    response.data?.data?.pdfUrlAbsolute ||
      response.data?.data?.pdfUrl ||
      ''
  );
}

async function sendOrderCompletionSummary(params: {
  sender: string;
  targets: string[];
  botLabel: string;
  companyId: string;
  completion?: DispatchPostProcessInput['orderCompletion'];
}) {
  if (!params.completion || params.targets.length === 0) return;

  const shouldSend = await claimNotificationFlag(
    `dispatch-order-completion:${params.companyId}:${params.completion.orderId || params.completion.rows.map((row) => row.plate).join('|')}`,
    params.companyId
  );
  if (!shouldSend) return;

  const image = await renderOrderCompletionImage(params.completion);
  const caption = buildOrderCompletionCaption({
    botLabel: params.botLabel,
    clientName: params.completion.clientName,
    obra: params.completion.obra,
    totalM3: params.completion.totalM3,
    totalUnits: params.completion.totalUnits,
  });

  for (const target of params.targets) {
    await WhatsAppDirectService.sendImageFile(params.sender, target, {
      buffer: image,
      fileName: 'resumen-despacho.png',
      caption,
      mimeType: 'image/png',
      companyId: params.companyId,
      queueOnFail: true,
    });
  }
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
  const shouldSend = await claimNotificationFlag(
    `plant-end:${companyId}:${dayKey}`,
    companyId
  );
  if (!shouldSend) {
    return;
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
  const dispatchOrdinal = Math.max(Number(input.dispatchedCount) || 0, 1);
  const clientPendingCount = Math.max(Number(input.clientPendingCount) || 0, 0);
  const dispatchSent = await claimNotificationFlag(
    `dispatch-progress:${input.companyId}:${input.dispatchId}`,
    input.companyId
  );

  if (!dispatchSent) {
    return;
  }

  await sendToGroup(
    input.sender,
    input.plantGroupTarget,
    buildPlantProgressMessage(
      context.companyBotLabel,
      dispatchOrdinal,
      input.pendingCount
    ),
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
        pendingCount: clientPendingCount,
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

    await sendOrderCompletionSummary({
      sender: input.sender,
      targets: clientTargets,
      botLabel: context.companyBotLabel,
      companyId: input.companyId,
      completion: input.orderCompletion,
    });

    if (realClientTargets.length > 0) {
      scheduleIppReadyNotification({
        dispatchId: input.dispatchId,
        sender: input.sender,
        targets: realClientTargets,
        botLabel: context.companyBotLabel,
        obra,
        companyId: input.companyId,
        ippReportPayload: input.ippReportPayload,
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
