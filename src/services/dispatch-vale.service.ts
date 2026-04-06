import axios from 'axios';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import { config } from '../config/environment.js';
import { getCompanyModel } from '../database/models.js';
import {
  DispatchNoteDocumentPayload,
  generateDispatchNoteDocumentFile,
} from './dispatch-note-document.service.js';
import { WhatsAppDirectService } from './whatsapp-direct.service.js';
import { sendTelegramAlert } from './telegram-alert.service.js';
import { normalizeWhatsAppPhoneNumber } from '../utils/whatsapp-phone.js';

export interface DispatchValeWorkflowInput {
  companyId: string;
  baseUrl: string;
  dispatchId: string;
  orderId: string;
  note?: string;
  quantity?: number;
  driverName?: string;
  driverPhoneNumber?: string;
  sendDriverPdf?: boolean;
  orderLocation?: string;
  fileName?: string;
  documentPayload: DispatchNoteDocumentPayload;
}

type DispatchValeWorkflowInputLike = Partial<DispatchValeWorkflowInput> & {
  companyId?: string;
  baseUrl?: string;
  dispatchId?: string;
  orderId?: string;
  documentPayload?: DispatchNoteDocumentPayload;
};

function cleanUrl(url: string): string {
  return String(url || '').replace(/^"+|"+$/g, '').trim();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildPortalCallbackToken(companyId: string): string {
  return jwt.sign(
    {
      companyId,
      userId: 'lila-dispatch-vale',
      role: 'admin',
    },
    config.security.jwtSecret,
    { expiresIn: '15m' }
  );
}

async function registerValeMedia(params: {
  companyId: string;
  dispatchId: string;
  orderId: string;
  note?: string;
  document: Awaited<ReturnType<typeof generateDispatchNoteDocumentFile>>;
  preferredFileName?: string;
}) {
  const { companyId, dispatchId, orderId, note, document, preferredFileName } = params;
  const payload = {
    resourceId: orderId,
    type: 'VALE',
    name: preferredFileName || document.fileName,
    mimeType: 'application/pdf',
    fileSize: document.sizeBytes,
    url: document.pdfUrlAbsolute,
    lilaAppPath: document.relativeDir,
    lilaAppFilePath: document.filePath,
    metadata: {
      dispatchId,
      note: note || '',
    },
  };
  const headers = {
    Authorization: `Bearer ${buildPortalCallbackToken(companyId)}`,
    'Content-Type': 'application/json',
    'x-company-id': companyId,
  };

  try {
    const response = await axios.post(
      `${config.portal.baseUrl}/api/internal/dispatches/vale-media`,
      payload,
      {
        headers,
        timeout: 30000,
      }
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status !== 404) {
      throw error;
    }

    logger.warn('dispatch_vale.register_media.internal_route_missing_fallback', {
      companyId,
      dispatchId,
      orderId,
      endpoint: `${config.portal.baseUrl}/api/internal/dispatches/vale-media`,
    });

    const fallbackResponse = await axios.post(
      `${config.portal.baseUrl}/api/drive/register`,
      payload,
      {
        headers,
        timeout: 30000,
      }
    );
    return fallbackResponse.data;
  }
}

export function validateDispatchValeWorkflowInput(
  input: DispatchValeWorkflowInputLike
): DispatchValeWorkflowInput {
  const companyId = String(input.companyId || '').trim();
  const baseUrl = String(input.baseUrl || '').trim();
  const dispatchId = String(input.dispatchId || '').trim();
  const orderId = String(input.orderId || '').trim();

  if (!companyId) throw new Error('companyId is required');
  if (!baseUrl) throw new Error('baseUrl is required');
  if (!dispatchId) throw new Error('dispatchId is required');
  if (!orderId) throw new Error('orderId is required');
  if (!input.documentPayload || typeof input.documentPayload !== 'object') {
    throw new Error('documentPayload is required');
  }

  return {
    companyId,
    baseUrl,
    dispatchId,
    orderId,
    note: typeof input.note === 'string' ? input.note : '',
    quantity: Number(input.quantity || 0),
    driverName: typeof input.driverName === 'string' ? input.driverName : '',
    driverPhoneNumber:
      typeof input.driverPhoneNumber === 'string' ? input.driverPhoneNumber : '',
    sendDriverPdf: input.sendDriverPdf !== false,
    orderLocation: typeof input.orderLocation === 'string' ? input.orderLocation : '',
    fileName: typeof input.fileName === 'string' ? input.fileName : '',
    documentPayload: input.documentPayload,
  };
}

function buildDispatchValeErrorAlert(input: DispatchValeWorkflowInput, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return [
    'LILA-APP DISPATCH VALE ERROR!',
    '---------------------',
    `companyId: ${input.companyId}`,
    `dispatchId: ${input.dispatchId}`,
    `orderId: ${input.orderId}`,
    `driverPhoneNumber: ${input.driverPhoneNumber || 'N/A'}`,
    `message: ${message}`,
  ].join('\n');
}

export function enqueueDispatchValeWorkflow(
  input: DispatchValeWorkflowInput,
  deps?: {
    runWorkflow?: (payload: DispatchValeWorkflowInput) => Promise<unknown>;
    notifyError?: (params: { dedupeKey?: string; message: string }) => Promise<boolean>;
    schedule?: (runner: () => void) => void;
  }
) {
  const runWorkflow = deps?.runWorkflow || generateDispatchValeWorkflow;
  const notifyError = deps?.notifyError || sendTelegramAlert;
  const schedule =
    deps?.schedule ||
    ((runner: () => void) => {
      setImmediate(runner);
    });

  schedule(() => {
    void runWorkflow(input).catch(async (error) => {
      logger.error('dispatch_vale.background.failed', {
        companyId: input.companyId,
        dispatchId: input.dispatchId,
        orderId: input.orderId,
        error,
      });

      await notifyError({
        dedupeKey: `dispatch-vale:${input.companyId}:${input.dispatchId}:${error instanceof Error ? error.message : String(error)}`,
        message: buildDispatchValeErrorAlert(input, error),
      });
    });
  });

  return {
    accepted: true,
    dispatchId: input.dispatchId,
    orderId: input.orderId,
  };
}

export async function generateDispatchValeWorkflow(input: DispatchValeWorkflowInput) {
  const {
    companyId,
    baseUrl,
    dispatchId,
    orderId,
    note,
    quantity,
    driverName,
    driverPhoneNumber,
    orderLocation,
    fileName,
    documentPayload,
  } = input;
  const sendDriverPdf = input.sendDriverPdf !== false;

  if (!companyId) throw new Error('companyId is required');
  if (!dispatchId) throw new Error('dispatchId is required');
  if (!orderId) throw new Error('orderId is required');
  if (!documentPayload) throw new Error('documentPayload is required');

  const CompanyModel = await getCompanyModel();
  const company = await CompanyModel.findOne({ companyId, isActive: true }).lean();
  const companyName = String(company?.name || 'ConstRoad').trim() || 'ConstRoad';
  const sender = String(company?.whatsappConfig?.sender || '').trim();
  const normalizedPhone = normalizeWhatsAppPhoneNumber(driverPhoneNumber);
  const normalizedDriverName = String(driverName || '').trim();
  const normalizedLocation = cleanUrl(String(orderLocation || ''));
  const normalizedNote = String(note || '').trim();

  const document = await generateDispatchNoteDocumentFile({
    companyId,
    baseUrl,
    payload: documentPayload,
  });

  let mediaRegistrationError = '';
  const mediaRegistrationPromise = registerValeMedia({
    companyId,
    dispatchId,
    orderId,
    note: normalizedNote,
    document,
    preferredFileName: fileName,
  }).catch((error) => {
    mediaRegistrationError = error instanceof Error ? error.message : String(error);
    logger.error('dispatch_vale.register_media_failed', {
      companyId,
      dispatchId,
      orderId,
      error: mediaRegistrationError,
    });
    return null;
  });

  const whatsapp = {
    requested: sendDriverPdf,
    sender,
    fileSent: false,
    locationSent: false,
    skippedReason: '',
    fileError: '',
    locationError: '',
  };

  if (!sendDriverPdf) {
    whatsapp.skippedReason = 'sendDriverPdf disabled';
  } else if (!normalizedPhone) {
    whatsapp.skippedReason = 'driverPhoneNumber missing';
  } else if (!sender) {
    whatsapp.skippedReason = 'company sender not configured';
  } else {
    const caption = `${companyName}:\n\nHola ${normalizedDriverName || 'chofer'} *${companyName}* te envia tu vale de despacho\n- Cubos: ${Number(quantity || 0)}m3`;

    try {
      logger.info('dispatch_vale.whatsapp_file_sending', {
        companyId,
        dispatchId,
        sender,
        driverPhoneNumber: normalizedPhone,
      });
      await withTimeout(
        WhatsAppDirectService.sendDocument(sender, normalizedPhone, {
          companyId,
          filePath: document.filePath,
          fileName: fileName || document.fileName,
          mimeType: 'application/pdf',
          caption,
          queueOnFail: true,
        }),
        25000,
        'dispatch vale WhatsApp document send'
      );
      whatsapp.fileSent = true;
      logger.info('dispatch_vale.whatsapp_file_sent', {
        companyId,
        dispatchId,
        driverPhoneNumber: normalizedPhone,
      });
    } catch (error) {
      whatsapp.fileError = error instanceof Error ? error.message : String(error);
      logger.error('dispatch_vale.whatsapp_file_failed', {
        companyId,
        dispatchId,
        error: whatsapp.fileError,
      });
    }

    if (normalizedLocation) {
      try {
        await withTimeout(
          WhatsAppDirectService.sendMessage(
            sender,
            normalizedPhone,
            `${companyName}:\n\n${normalizedDriverName || 'Chofer'} te enviamos la Ubicación de la obra:\n- 📍 aqui: ${normalizedLocation}`,
            { companyId, queueOnFail: true }
          ),
          25000,
          'dispatch vale WhatsApp location send'
        );
        whatsapp.locationSent = true;
      } catch (error) {
        whatsapp.locationError = error instanceof Error ? error.message : String(error);
        logger.error('dispatch_vale.whatsapp_location_failed', {
          companyId,
          dispatchId,
          error: whatsapp.locationError,
        });
      }
    }
  }

  if (whatsapp.skippedReason) {
    logger.warn('dispatch_vale.whatsapp_skipped', {
      companyId,
      dispatchId,
      reason: whatsapp.skippedReason,
      requested: whatsapp.requested,
      hasDriverPhoneNumber: Boolean(normalizedPhone),
      hasSender: Boolean(sender),
    });
  }

  const mediaRegistration = await mediaRegistrationPromise;

  logger.info('dispatch_vale.generate.completed', {
    companyId,
    dispatchId,
    orderId,
    mediaRegistered: Boolean(mediaRegistration),
    mediaRegistrationError,
    whatsapp,
  });

  return {
    document,
    media: mediaRegistration?.media ?? null,
    storage: mediaRegistration?.storage ?? null,
    mediaRegistrationError,
    whatsapp,
  };
}
