import { Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs-extra';
import jwt from 'jsonwebtoken';
import { config } from '../../config/environment.js';
import { getCompanyModel } from '../../database/models.js';
import { sendTelegramAlert } from '../../services/telegram-alert.service.js';

type CompanyLoginData = {
  companyId: string;
  slug: string;
  name: string;
  isActive: boolean;
  branding?: {
    logoLight?: string;
    logoDark?: string;
    favicon?: string;
  };
};

type UploadedReceptionFile = {
  path: string;
  originalName: string;
  mimeType: string;
  size: number;
};

type PublicReceptionInput = {
  kind: 'input';
  inputMode: 'standard' | 'combustible';
  companyId: string;
  telegramChatId: string;
  materialId: string;
  materialName: string;
  materialDescription: string;
  materialLevel: number;
  providerId: string;
  providerName: string;
  vendorProviderId?: string;
  vendorProviderName?: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  driver?: string;
  m3?: number;
  files: UploadedReceptionFile[];
};

type PublicMeasureReceptionInput = {
  kind: 'measure';
  companyId: string;
  telegramChatId: string;
  typeId: string;
  measureName: string;
  measureValue: number;
  unitLabel: string;
  whatsappPhone?: string;
  whatsappMessage?: string;
  files: UploadedReceptionFile[];
};

type PublicReceptionWorkflowInput =
  | PublicReceptionInput
  | PublicMeasureReceptionInput;

type TelegramUploadedMedia = {
  file_name: string;
  mime_type: string;
  messageId: string | number;
  fileId: string;
  fileUrl: string;
  thumbnailFileId: string;
  thumbnailUrl?: string;
  fileSize?: number;
};

type PortalMediaPayload = {
  resourceId: string;
  type: string;
  name: string;
  mimeTye: string;
  url: string;
  thumbnailUrl: string;
  date: string;
  metadata: Record<string, unknown>;
};

type PortalMediaResponse = {
  _id: string;
};

type PortalInputRecord = {
  _id: string;
  driver: string;
  m3?: number;
  level?: number;
  materialId: string;
  material: string;
  providerId: string;
  providerName: string;
  vendorProviderId?: string;
  vendorProviderName?: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  arriveDate: string;
  status?: string;
};

type PortalMeasureRecord = {
  _id: string;
  name: string;
  measure: number;
  date: string | Date;
  status: string;
  typeId: string;
};

type PortalMediaListResponse = {
  data?: Array<{ _id: string }>;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const PORTAL_TIMEOUT_MS = 30_000;
const TELEGRAM_UPLOAD_CONCURRENCY = 2;
const companyLoginCache = new Map<
  string,
  { expiresAt: number; data: CompanyLoginData | null }
>();

const normalizeSlug = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase();

const isValidSlug = (slug: string): boolean => /^[a-z0-9-]+$/.test(slug);

const setPublicCacheHeaders = (res: Response) => {
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'
  );
};

const trimValue = (value: unknown): string => String(value || '').trim();

const requireString = (value: unknown, label: string): string => {
  const normalizedValue = trimValue(value);
  if (!normalizedValue) {
    throw new Error(`${label} is required`);
  }
  return normalizedValue;
};

const requirePositiveNumber = (value: unknown, label: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
};

const parseNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildPortalCallbackToken = (companyId: string): string =>
  jwt.sign(
    {
      companyId,
      userId: 'lila-public-reception',
      role: 'admin',
    },
    config.security.jwtSecret,
    { expiresIn: '15m' }
  );

const buildPortalHeaders = (companyId: string) => ({
  Authorization: `Bearer ${buildPortalCallbackToken(companyId)}`,
  'Content-Type': 'application/json',
  'x-company-id': companyId,
});

const buildPortalUrl = (path: string) =>
  `${String(config.portal.baseUrl).replace(/\/+$/, '')}${path}`;

const buildTelegramFileUrl = (filePath: string) =>
  `https://api.telegram.org/file/bot${config.telegram.botToken}/${filePath}`;

const parseReceptionFiles = (req: Request): UploadedReceptionFile[] => {
  const rawFiles = Array.isArray(req.files) ? req.files : [];

  return rawFiles
    .map((file) => ({
      path: String(file.path || ''),
      originalName: String(file.originalname || 'upload'),
      mimeType: String(file.mimetype || 'application/octet-stream'),
      size: Number(file.size || 0),
    }))
    .filter((file) => file.path);
};

const parseReceptionInput = (req: Request): PublicReceptionWorkflowInput => {
  const kind = requireString(req.body?.kind, 'kind');
  const companyId = requireString(req.companyId, 'companyId');
  const files = parseReceptionFiles(req);

  if (kind === 'input') {
    const inputMode = requireString(req.body?.inputMode, 'inputMode');
    if (inputMode !== 'standard' && inputMode !== 'combustible') {
      throw new Error('inputMode is invalid');
    }

    const parsedInput: PublicReceptionInput = {
      kind: 'input',
      inputMode,
      companyId,
      telegramChatId: requireString(req.body?.telegramChatId, 'telegramChatId'),
      materialId: requireString(req.body?.materialId, 'materialId'),
      materialName: requireString(req.body?.materialName, 'materialName'),
      materialDescription: trimValue(req.body?.materialDescription),
      materialLevel: parseNumber(req.body?.materialLevel, 0),
      providerId: requireString(req.body?.providerId, 'providerId'),
      providerName: requireString(req.body?.providerName, 'providerName'),
      vendorProviderId: trimValue(req.body?.vendorProviderId) || undefined,
      vendorProviderName: trimValue(req.body?.vendorProviderName) || undefined,
      purchaseOrderId: trimValue(req.body?.purchaseOrderId) || undefined,
      purchaseOrderNumber: trimValue(req.body?.purchaseOrderNumber) || undefined,
      driver: trimValue(req.body?.driver),
      m3: parseNumber(req.body?.m3, 0),
      files,
    };

    if (parsedInput.inputMode === 'standard' && parsedInput.files.length === 0) {
      throw new Error('files are required');
    }

    if (parsedInput.inputMode === 'standard' && !parsedInput.driver) {
      throw new Error('driver is required');
    }

    return parsedInput;
  }

  if (kind === 'measure') {
    return {
      kind: 'measure',
      companyId,
      telegramChatId: requireString(req.body?.telegramChatId, 'telegramChatId'),
      typeId: requireString(req.body?.typeId, 'typeId'),
      measureName: requireString(req.body?.measureName, 'measureName'),
      measureValue: requirePositiveNumber(req.body?.measureValue, 'measureValue'),
      unitLabel: requireString(req.body?.unitLabel, 'unitLabel'),
      whatsappPhone: trimValue(req.body?.whatsappPhone),
      whatsappMessage: trimValue(req.body?.whatsappMessage),
      files,
    };
  }

  throw new Error('kind is invalid');
};

const cleanupUploadedFiles = async (files: UploadedReceptionFile[]) => {
  await Promise.allSettled(files.map((file) => fs.remove(file.path)));
};

const fetchPortalInputList = async (
  companyId: string,
  level: number
): Promise<PortalInputRecord[]> => {
  const response = await axios.get(buildPortalUrl('/api/input'), {
    headers: buildPortalHeaders(companyId),
    params: {
      status: 'Pending',
      levels: JSON.stringify([level]),
    },
    timeout: PORTAL_TIMEOUT_MS,
  });
  return Array.isArray(response.data) ? response.data : [];
};

const fetchPortalMeasureList = async (
  companyId: string,
  typeId: string
): Promise<PortalMeasureRecord[]> => {
  const response = await axios.get(buildPortalUrl('/api/measure'), {
    headers: buildPortalHeaders(companyId),
    params: {
      status: 'Pending',
      typeId,
    },
    timeout: PORTAL_TIMEOUT_MS,
  });
  return Array.isArray(response.data) ? response.data : [];
};

const fetchPortalMediaCount = async (
  companyId: string,
  resourceId: string
): Promise<number> => {
  const response = await axios.get(buildPortalUrl('/api/media'), {
    headers: buildPortalHeaders(companyId),
    params: {
      resourceId,
    },
    timeout: PORTAL_TIMEOUT_MS,
  });

  const payload = response.data as PortalMediaListResponse | undefined;
  return Array.isArray(payload?.data) ? payload.data.length : 0;
};

const createPortalInput = async (
  companyId: string,
  payload: Record<string, unknown>
): Promise<PortalInputRecord> => {
  const response = await axios.post(buildPortalUrl('/api/input'), payload, {
    headers: buildPortalHeaders(companyId),
    timeout: PORTAL_TIMEOUT_MS,
  });
  return response.data as PortalInputRecord;
};

const updatePortalInput = async (
  companyId: string,
  inputId: string,
  payload: Record<string, unknown>
): Promise<PortalInputRecord> => {
  const response = await axios.put(
    buildPortalUrl(`/api/input/${inputId}`),
    payload,
    {
      headers: buildPortalHeaders(companyId),
      timeout: PORTAL_TIMEOUT_MS,
    }
  );
  return response.data as PortalInputRecord;
};

const createPortalMeasure = async (
  companyId: string,
  payload: Record<string, unknown>
): Promise<PortalMeasureRecord> => {
  const response = await axios.post(buildPortalUrl('/api/measure'), payload, {
    headers: buildPortalHeaders(companyId),
    timeout: PORTAL_TIMEOUT_MS,
  });
  return response.data as PortalMeasureRecord;
};

const updatePortalMeasure = async (
  companyId: string,
  measureId: string,
  payload: Record<string, unknown>
): Promise<PortalMeasureRecord> => {
  const response = await axios.put(
    buildPortalUrl(`/api/measure/${measureId}`),
    payload,
    {
      headers: buildPortalHeaders(companyId),
      timeout: PORTAL_TIMEOUT_MS,
    }
  );
  return response.data as PortalMeasureRecord;
};

const createPortalMedia = async (
  companyId: string,
  payload: PortalMediaPayload
): Promise<PortalMediaResponse> => {
  const response = await axios.post(buildPortalUrl('/api/media'), payload, {
    headers: buildPortalHeaders(companyId),
    timeout: PORTAL_TIMEOUT_MS,
  });
  return response.data as PortalMediaResponse;
};

const notifyPortalWhatsApp = async (
  companyId: string,
  phone: string,
  message: string
): Promise<boolean> => {
  try {
    await axios.post(
      buildPortalUrl('/api/notifications/whatsapp'),
      {
        type: 'SendText',
        phone,
        message,
      },
      {
        headers: buildPortalHeaders(companyId),
        timeout: PORTAL_TIMEOUT_MS,
      }
    );
    return true;
  } catch {
    return false;
  }
};

const sendTelegramTextMessage = async (
  chatId: string,
  message: string
): Promise<boolean> => {
  if (!config.telegram.botToken || !chatId) return false;

  try {
    const body = new URLSearchParams();
    body.append('chat_id', chatId);
    body.append('text', message);

    const response = await fetch(
      `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
      {
        method: 'POST',
        body,
      }
    );

    return response.ok;
  } catch {
    return false;
  }
};

const fetchTelegramFileInfo = async (fileId: string) => {
  const response = await fetch(
    `https://api.telegram.org/bot${config.telegram.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; result?: { file_path?: string } }
    | null;

  if (!response.ok || !payload?.ok || !payload.result?.file_path) {
    throw new Error('No se pudo resolver el archivo en Telegram');
  }

  return {
    filePath: payload.result.file_path,
    fileUrl: buildTelegramFileUrl(payload.result.file_path),
  };
};

const uploadFileToTelegram = async (
  chatId: string,
  file: UploadedReceptionFile
): Promise<TelegramUploadedMedia> => {
  if (!config.telegram.botToken) {
    throw new Error('Telegram bot token not configured');
  }

  const buffer = await fs.readFile(file.path);
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append(
    'document',
    new Blob([buffer], { type: file.mimeType }),
    file.originalName
  );

  const response = await fetch(
    `https://api.telegram.org/bot${config.telegram.botToken}/sendDocument`,
    {
      method: 'POST',
      body: form,
    }
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        result?: {
          message_id?: string | number;
          document?: {
            file_id?: string;
            file_name?: string;
            mime_type?: string;
            file_size?: number;
            thumb?: {
              file_id?: string;
            };
          };
        };
      }
    | null;

  const telegramDocument = payload?.result?.document;
  const telegramFileId = trimValue(telegramDocument?.file_id);
  if (!response.ok || !payload?.ok || !telegramFileId) {
    throw new Error('No se pudo subir el archivo a Telegram');
  }

  const fileInfo = await fetchTelegramFileInfo(telegramFileId);
  const thumbnailFileId = trimValue(telegramDocument?.thumb?.file_id);
  const thumbnailInfo = thumbnailFileId
    ? await fetchTelegramFileInfo(thumbnailFileId).catch(() => null)
    : null;

  return {
    file_name: trimValue(telegramDocument?.file_name) || file.originalName,
    mime_type: trimValue(telegramDocument?.mime_type) || file.mimeType,
    messageId: payload?.result?.message_id || '',
    fileId: telegramFileId,
    fileUrl: fileInfo.fileUrl,
    thumbnailFileId,
    thumbnailUrl: thumbnailInfo?.fileUrl,
    fileSize: Number(telegramDocument?.file_size || file.size || 0),
  };
};

const createMediaPayload = (
  resourceId: string,
  media: TelegramUploadedMedia,
  metadata: Record<string, unknown>
): PortalMediaPayload => ({
  resourceId,
  type: 'INPUT_PICTURES',
  name: media.file_name,
  mimeTye: media.mime_type || 'application/octet-stream',
  url: media.fileUrl,
  thumbnailUrl: media.thumbnailUrl || media.fileUrl,
  date: new Date().toISOString(),
  metadata: {
    ...metadata,
    fileId: media.fileId,
    messageId: media.messageId,
    file_name: media.file_name,
    fileUrl: media.fileUrl,
    thumbnailFileId: media.thumbnailFileId,
    thumbnailUrl: media.thumbnailUrl,
    fileSize: media.fileSize,
    storageProvider: 'telegram',
  },
});

const runWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<Array<PromiseSettledResult<R>>> => {
  const results: Array<PromiseSettledResult<R>> = [];
  const pendingItems = [...items];
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, pendingItems.length || 1)) },
    async () => {
      while (pendingItems.length > 0) {
        const nextItem = pendingItems.shift();
        if (!nextItem) return;
        try {
          const value = await worker(nextItem);
          results.push({ status: 'fulfilled', value });
        } catch (error) {
          results.push({ status: 'rejected', reason: error });
        }
      }
    }
  );

  await Promise.all(workers);
  return results;
};

const buildSuccessStatusMessage = (
  input: PublicReceptionWorkflowInput,
  options: {
    resourceId: string;
    uploadedCount: number;
    failedCount: number;
    whatsappSent?: boolean;
  }
) => {
  const header =
    input.kind === 'measure'
      ? '✅ Registro de medida completado'
      : '✅ Registro de ingreso completado';
  const targetName =
    input.kind === 'measure'
      ? input.measureName
      : `${input.materialName} ${input.materialDescription}`.trim();

  const lines = [
    header,
    `Empresa: ${input.companyId}`,
    `Recurso: ${options.resourceId}`,
    `Detalle: ${targetName}`,
    `Transportista: ${input.kind === 'input' ? input.providerName : 'N/A'}`,
    `Proveedor venta: ${input.kind === 'input' ? input.vendorProviderName || 'N/A' : 'N/A'}`,
    `Evidencias nuevas: ${options.uploadedCount}`,
  ];

  if (options.failedCount > 0) {
    lines.push(`Evidencias fallidas: ${options.failedCount}`);
  }

  if (input.kind === 'measure') {
    lines.push(`Medida: ${input.measureValue} ${input.unitLabel}`);
    lines.push(
      `WhatsApp: ${options.whatsappSent === false ? 'pendiente' : 'enviado'}`
    );
  }

  return lines.join('\n');
};

const buildFailureStatusMessage = (
  input: PublicReceptionWorkflowInput,
  error: unknown
) => {
  const message = error instanceof Error ? error.message : String(error);
  const targetName =
    input.kind === 'measure'
      ? input.measureName
      : `${input.materialName} ${input.materialDescription}`.trim();

  return [
    input.kind === 'measure'
      ? '❌ Registro de medida fallido'
      : '❌ Registro de ingreso fallido',
    `Empresa: ${input.companyId}`,
    `Detalle: ${targetName}`,
    `Transportista: ${input.kind === 'input' ? input.providerName : 'N/A'}`,
    `Proveedor venta: ${input.kind === 'input' ? input.vendorProviderName || 'N/A' : 'N/A'}`,
    `Motivo: ${message}`,
  ].join('\n');
};

const processEvidenceUploads = async (params: {
  companyId: string;
  resourceId: string;
  files: UploadedReceptionFile[];
  telegramChatId: string;
  metadata: Record<string, unknown>;
}): Promise<{ uploadedCount: number; failedCount: number }> => {
  const { companyId, resourceId, files, telegramChatId, metadata } = params;

  if (files.length === 0) {
    return { uploadedCount: 0, failedCount: 0 };
  }

  const settled = await runWithConcurrency(
    files,
    TELEGRAM_UPLOAD_CONCURRENCY,
    async (file) => {
      const uploadedFile = await uploadFileToTelegram(telegramChatId, file);
      return createPortalMedia(
        companyId,
        createMediaPayload(resourceId, uploadedFile, metadata)
      );
    }
  );

  const uploadedCount = settled.filter(
    (result) => result.status === 'fulfilled'
  ).length;
  const failedCount = settled.length - uploadedCount;

  return { uploadedCount, failedCount };
};

const runInputReceptionWorkflow = async (input: PublicReceptionInput) => {
  const telegramChatId = input.telegramChatId;

  if (input.inputMode === 'standard') {
    const createdInput = await createPortalInput(input.companyId, {
      driver: input.driver,
      m3: input.m3 || 0,
      level: input.materialLevel,
      materialId: input.materialId,
      material: `${input.materialName} ${input.materialDescription}`.trim(),
      providerId: input.providerId,
      providerName: input.providerName,
      vendorProviderId: input.vendorProviderId,
      vendorProviderName: input.vendorProviderName,
      purchaseOrderId: input.purchaseOrderId,
      purchaseOrderNumber: input.purchaseOrderNumber,
      arriveDate: new Date().toLocaleString(),
    });

    const uploadSummary = await processEvidenceUploads({
      companyId: input.companyId,
      resourceId: createdInput._id,
      files: input.files,
      telegramChatId,
      metadata: {
        materialId: input.materialId,
      },
    });

    if (uploadSummary.uploadedCount === 0) {
      throw new Error('No se pudo registrar ninguna evidencia del ingreso');
    }

    await sendTelegramTextMessage(
      telegramChatId,
      buildSuccessStatusMessage(input, {
        resourceId: createdInput._id,
        uploadedCount: uploadSummary.uploadedCount,
        failedCount: uploadSummary.failedCount,
      })
    );

    return;
  }

  const [pendingInput] = await fetchPortalInputList(
    input.companyId,
    input.materialLevel
  );

  const activeInput =
    pendingInput ||
    (await createPortalInput(input.companyId, {
      driver: 'Recepción de Cisterna de PEN',
      m3: 0,
      level: input.materialLevel,
      materialId: input.materialId,
      material: `${input.materialName} ${input.materialDescription}`.trim(),
      providerId: input.providerId,
      providerName: input.providerName,
      vendorProviderId: input.vendorProviderId,
      vendorProviderName: input.vendorProviderName,
      purchaseOrderId: input.purchaseOrderId,
      purchaseOrderNumber: input.purchaseOrderNumber,
      arriveDate: new Date().toLocaleString(),
    }));

  const uploadSummary = await processEvidenceUploads({
    companyId: input.companyId,
    resourceId: activeInput._id,
    files: input.files,
    telegramChatId,
    metadata: {
      materialId: input.materialId,
    },
  });

  const existingMediaCount = await fetchPortalMediaCount(
    input.companyId,
    activeInput._id
  );
  if (existingMediaCount === 0) {
    throw new Error('No hay evidencias disponibles para completar el ingreso');
  }

  await updatePortalInput(input.companyId, activeInput._id, {
    ...activeInput,
    materialId: input.materialId,
    providerId: input.providerId,
    providerName: input.providerName,
    vendorProviderId: input.vendorProviderId,
    vendorProviderName: input.vendorProviderName,
    purchaseOrderId: input.purchaseOrderId,
    purchaseOrderNumber: input.purchaseOrderNumber,
    status: 'Completed',
  });

  await sendTelegramTextMessage(
    telegramChatId,
    buildSuccessStatusMessage(input, {
      resourceId: activeInput._id,
      uploadedCount: uploadSummary.uploadedCount,
      failedCount: uploadSummary.failedCount,
    })
  );
};

const runMeasureReceptionWorkflow = async (
  input: PublicMeasureReceptionInput
) => {
  const telegramChatId = input.telegramChatId;
  const [pendingMeasure] = await fetchPortalMeasureList(input.companyId, input.typeId);

  const activeMeasure =
    pendingMeasure ||
    (await createPortalMeasure(input.companyId, {
      name: input.measureName,
      measure: input.measureValue,
      date: new Date().toISOString(),
      status: 'Pending',
      typeId: input.typeId,
    }));

  const uploadSummary = await processEvidenceUploads({
    companyId: input.companyId,
    resourceId: activeMeasure._id,
    files: input.files,
    telegramChatId,
    metadata: {
      typeId: input.typeId,
      measure: input.measureValue,
    },
  });

  const existingMediaCount = await fetchPortalMediaCount(
    input.companyId,
    activeMeasure._id
  );
  if (existingMediaCount === 0) {
    throw new Error('No hay evidencias disponibles para completar la medida');
  }

  await updatePortalMeasure(input.companyId, activeMeasure._id, {
    ...activeMeasure,
    name: input.measureName,
    measure: input.measureValue,
    typeId: input.typeId,
    status: 'Completed',
  });

  const whatsappSent =
    input.whatsappPhone && input.whatsappMessage
      ? await notifyPortalWhatsApp(
          input.companyId,
          input.whatsappPhone,
          input.whatsappMessage
        )
      : false;

  await sendTelegramTextMessage(
    telegramChatId,
    buildSuccessStatusMessage(input, {
      resourceId: activeMeasure._id,
      uploadedCount: uploadSummary.uploadedCount,
      failedCount: uploadSummary.failedCount,
      whatsappSent,
    })
  );
};

export const runPublicReceptionWorkflow = async (
  input: PublicReceptionWorkflowInput
) => {
  if (input.kind === 'measure') {
    await runMeasureReceptionWorkflow(input);
    return;
  }

  await runInputReceptionWorkflow(input);
};

export const enqueuePublicReceptionWorkflow = (
  input: PublicReceptionWorkflowInput
) => {
  setImmediate(() => {
    void runPublicReceptionWorkflow(input).catch(async (error) => {
      const message = buildFailureStatusMessage(input, error);
      await sendTelegramTextMessage(input.telegramChatId, message);
      await sendTelegramAlert({
        dedupeKey: `public-reception:${input.companyId}:${input.kind}:${error instanceof Error ? error.message : String(error)}`,
        message,
      });
    }).finally(async () => {
      await cleanupUploadedFiles(input.files);
    });
  });

  return {
    accepted: true,
    kind: input.kind,
  };
};

export async function getCompanyLogin(req: Request, res: Response) {
  try {
    const slug = normalizeSlug(req.query.slug);

    if (!slug || !isValidSlug(slug)) {
      return res.status(400).json({
        ok: false,
        message: 'slug invalido',
      });
    }

    const cached = companyLoginCache.get(slug);
    if (cached && cached.expiresAt > Date.now()) {
      setPublicCacheHeaders(res);
      if (!cached.data) {
        return res.status(404).json({ ok: false, message: 'Empresa no encontrada' });
      }
      return res.status(200).json({ ok: true, data: cached.data });
    }

    const Company = await getCompanyModel();
    const company = await Company.findOne(
      { slug },
      {
        companyId: 1,
        slug: 1,
        name: 1,
        isActive: 1,
        'branding.logoLight': 1,
        'branding.logoDark': 1,
        'branding.favicon': 1,
      }
    ).lean();

    if (!company || company.isActive === false) {
      companyLoginCache.set(slug, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: null,
      });
      setPublicCacheHeaders(res);
      return res.status(404).json({ ok: false, message: 'Empresa no encontrada' });
    }

    const data: CompanyLoginData = {
      companyId: company.companyId,
      slug: company.slug || slug,
      name: company.name,
      isActive: company.isActive !== false,
      branding: company.branding || undefined,
    };

    companyLoginCache.set(slug, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data,
    });

    setPublicCacheHeaders(res);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    console.error('[public] company-login error', error);
    return res.status(500).json({
      ok: false,
      message: 'Error consultando empresa',
    });
  }
}

export async function submitPublicReception(req: Request, res: Response) {
  const files = parseReceptionFiles(req);

  try {
    const input = parseReceptionInput(req);
    const accepted = enqueuePublicReceptionWorkflow(input);
    return res.status(202).json({
      success: true,
      data: accepted,
    });
  } catch (error) {
    await cleanupUploadedFiles(files);
    const message =
      error instanceof Error ? error.message : 'No se pudo iniciar el registro';
    return res.status(400).json({
      success: false,
      error: {
        message,
      },
    });
  }
}
