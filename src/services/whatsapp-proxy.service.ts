/**
 * WhatsApp Send Proxy — reenvía el envío final al lila de PRODUCCIÓN (solo dev).
 *
 * Un número WhatsApp admite UN solo socket vivo, y ese socket vive en prod. Para
 * probar flujos Portal↔lila locales con mensajes REALES (texto y archivos) sin
 * pelear la sesión (guerra 440) ni corromper signal keys, lila local NO abre
 * sockets: toda la lógica de negocio corre local y el último paso se reenvía a
 * los endpoints públicos de prod `/message/:sender/{text|image|video|file}`,
 * autenticado con un JWT de tenant corto firmado con el JWT_SECRET compartido
 * (mismo formato que firma Portal).
 *
 * Guard doble: inactivo sin WHATSAPP_PROXY_TARGET_URL; ignorado con warning si
 * nodeEnv === 'production'. Las respuestas HTTP se mapean de vuelta a la forma
 * que devuelven los métodos de WhatsAppDirectService para no romper callers
 * internos: 202 → `{ queued: true }` · 200 texto → `{ key: { id }, messageTimestamp }`.
 *
 * IMPORTANTE: el JWT lleva el CAMPO `companyId` del schema Company (NO el _id de
 * Mongo); `requireSenderOwnership` en prod compara contra ese campo.
 */
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import logger from '../utils/logger.js';
import { quotaValidatorService } from './quota-validator.service.js';
import { resolveFileBuffer } from './whatsapp-media.utils.js';

const TENANT_TOKEN_TTL = '5m';
const TEXT_TIMEOUT_MS = 30_000;
// Subir media (hasta 10 MB, límite multer de prod) por Tailscale puede ser lento.
const MEDIA_TIMEOUT_MS = 120_000;

export type ProxyQueuedResult = { queued: true };
export type ProxySentTextResult = {
  key: { id: string | null };
  messageTimestamp?: number | string;
};
export type ProxySentMediaResult = { success: true };

/** Sufijo de ruta en `/message/:sender/…` por tipo de media. */
export type ProxyMediaKind = 'image' | 'video' | 'file';

export interface ProxyMediaOptions {
  buffer?: Buffer;
  fileName?: string;
  filePath?: string;
  fileUrl?: string;
  caption?: string;
  mimeType?: string;
  /** Necesario para resolver filePath del storage LOCAL antes de reenviar. */
  companyId?: string;
}

interface ProdMessageResponse {
  queued?: boolean;
  messageId?: string;
  timestamp?: number | string;
  error?: { message?: string };
}

let warnedProductionIgnored = false;
let loggedActive = false;

/**
 * True si los envíos deben reenviarse a prod. Los métodos de envío de
 * WhatsAppDirectService consultan esto como PRIMERA línea (early return).
 */
export function isWhatsAppProxyMode(): boolean {
  const targetUrl = config.whatsapp.proxyTargetUrl;
  if (!targetUrl) return false;

  if (config.nodeEnv === 'production') {
    if (!warnedProductionIgnored) {
      warnedProductionIgnored = true;
      logger.warn(
        'WHATSAPP_PROXY_TARGET_URL seteada en producción — IGNORADA (el send-proxy es solo dev)'
      );
    }
    return false;
  }

  if (!loggedActive) {
    loggedActive = true;
    logger.info(
      `🛰 WhatsApp send-proxy ACTIVO → ${targetUrl} (los envíos salen por el socket de prod)`
    );
  }
  return true;
}

/**
 * Firma un JWT de tenant corto para autenticarse contra prod. La company se
 * resuelve por el sender (igual que `requireSenderOwnership` en prod), así el
 * ownership check pasa siempre que el sender tenga company activa.
 */
async function mintTenantToken(sender: string): Promise<string> {
  const company = await quotaValidatorService.getCompanyByWhatsappSender(sender);
  if (!company?.companyId) {
    throw new Error(
      `WhatsApp proxy: sin company activa para el sender ${sender} — no se puede autenticar contra prod`
    );
  }
  return jwt.sign(
    { companyId: company.companyId, role: 'admin' },
    config.security.jwtSecret,
    { expiresIn: TENANT_TOKEN_TTL }
  );
}

/**
 * POST a `/message/:sender/:pathSuffix` de prod y parseo de la respuesta.
 * Lanza error legible ante status no-2xx o fallo de red (NO encola local: si la
 * sesión de prod no está lista, es PROD quien encola en su outbox y responde 202).
 */
async function postToProd(
  pathSuffix: string,
  sender: string,
  body: BodyInit,
  contentType: string | undefined,
  timeoutMs: number
): Promise<ProdMessageResponse> {
  const token = await mintTenantToken(sender);
  const url = `${config.whatsapp.proxyTargetUrl}/message/${sender}/${pathSuffix}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  // Con FormData, fetch setea Content-Type + boundary solo — no pisarlo.
  if (contentType) headers['Content-Type'] = contentType;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const rawBody = await response.text();
  let parsed: ProdMessageResponse = {};
  try {
    parsed = JSON.parse(rawBody) as ProdMessageResponse;
  } catch {
    parsed = {}; // respuesta no-JSON (ej. HTML de error): se reporta por status abajo
  }

  if (!response.ok) {
    throw new Error(
      `WhatsApp proxy: prod respondió ${response.status} en /${pathSuffix}: ` +
        `${parsed.error?.message || rawBody.slice(0, 200)}`
    );
  }
  return parsed;
}

/** Endpoints de lectura de sesión proxeables (`/sessions/:sender/…`). */
export type ProxySessionReadPath = 'groups' | 'contacts' | 'syncGroups';

// syncGroups en prod hace groupFetchAllParticipating (puede tardar varios segundos).
const SESSION_READ_TIMEOUT_MS = 30_000;
const SYNC_GROUPS_TIMEOUT_MS = 60_000;

/**
 * Lee grupos/contactos desde PROD (la sesión y su store viven allá; el store
 * local solo se puebla con socket). Devuelve el body de prod tal cual — los
 * endpoints locales y de prod comparten contrato, así que es pass-through.
 * Ante no-2xx lanza error con `statusCode` de prod para que el errorHandler
 * local espeje el status real (ej. 503 si la sesión de prod está caída).
 */
export async function proxySessionRead(
  sender: string,
  readPath: ProxySessionReadPath
): Promise<unknown> {
  const token = await mintTenantToken(sender);
  const url = `${config.whatsapp.proxyTargetUrl}/sessions/${sender}/${readPath}`;
  const timeoutMs = readPath === 'syncGroups' ? SYNC_GROUPS_TIMEOUT_MS : SESSION_READ_TIMEOUT_MS;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const rawBody = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    parsed = null; // respuesta no-JSON: se reporta por status abajo
  }

  if (!response.ok) {
    const prodMessage =
      (parsed as { error?: { message?: string } } | null)?.error?.message ||
      rawBody.slice(0, 200);
    const proxyError: Error & { statusCode?: number } = new Error(
      `WhatsApp proxy: prod respondió ${response.status} en /${readPath}: ${prodMessage}`
    );
    proxyError.statusCode = response.status;
    throw proxyError;
  }
  return parsed;
}

/**
 * Reenvía un mensaje de texto. Mapea la respuesta a la forma Baileys mínima que
 * consumen los callers (`result.key.id`, `messageTimestamp`).
 */
export async function proxyTextMessage(
  sender: string,
  to: string,
  message: string,
  options: { mentions?: string[] } = {}
): Promise<ProxyQueuedResult | ProxySentTextResult> {
  if (options.mentions?.length) {
    logger.warn(
      `WhatsApp proxy: mentions no soportadas por el endpoint de prod — mensaje a ${to} sale sin mención`
    );
  }

  const prodResponse = await postToProd(
    'text',
    sender,
    JSON.stringify({ to, message }),
    'application/json',
    TEXT_TIMEOUT_MS
  );

  if (prodResponse.queued) return { queued: true };
  return {
    key: { id: prodResponse.messageId ?? null },
    messageTimestamp: prodResponse.timestamp,
  };
}

/**
 * Resuelve una referencia del storage LOCAL (`filePath` O `fileUrl` apuntando al
 * disco de dev, ej. `http://localhost:3001/files/companies/:id/...`) a buffer
 * para reenviarla multipart: prod NO ve el disco de dev, así que reenviar la
 * referencia tal cual termina en "File not found" (el vale PDF y las fotos de
 * informe recién subidas a dev). `resolveFileBuffer` devuelve null si la
 * referencia NO es del storage local (URL externa) → se cae al contrato JSON de
 * siempre y prod la descarga.
 */
async function resolveLocalStorageBuffer(
  options: ProxyMediaOptions
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const reference = options.filePath || options.fileUrl;
  if (!reference || options.buffer || !options.companyId) return null;
  try {
    return await resolveFileBuffer({
      companyId: options.companyId,
      filePath: options.filePath,
      fileUrl: options.fileUrl,
      mimeType: options.mimeType,
      fileName: options.fileName,
    });
  } catch (error) {
    logger.warn(
      `WhatsApp proxy: la referencia local "${reference}" no resolvió en el storage local ` +
        `(${error instanceof Error ? error.message : String(error)}) — se reenvía a prod`
    );
    return null;
  }
}

/**
 * Reenvía media (imagen/video/documento). Buffers locales y archivos del
 * storage LOCAL viajan como multipart (prod no ve este disco); fileUrl y
 * filePath no-locales se reenvían tal cual — mismo contrato que Portal usa
 * contra prod hoy.
 */
export async function proxyMediaMessage(
  kind: ProxyMediaKind,
  sender: string,
  to: string,
  options: ProxyMediaOptions
): Promise<ProxyQueuedResult | ProxySentMediaResult> {
  let body: BodyInit;
  let contentType: string | undefined;

  const localFile = await resolveLocalStorageBuffer(options);
  if (localFile) {
    options = {
      ...options,
      buffer: localFile.buffer,
      mimeType: localFile.mimeType,
      fileName: options.fileName || localFile.fileName,
      filePath: undefined,
      fileUrl: undefined,
    };
  }

  if (options.buffer) {
    const form = new FormData();
    form.append('to', to);
    if (options.caption) form.append('caption', options.caption);
    if (options.mimeType) form.append('mimeType', options.mimeType);
    // El controller de prod lee fileName/mimeType de originalname/mimetype del file part.
    form.append(
      'file',
      new Blob([options.buffer], { type: options.mimeType || 'application/octet-stream' }),
      options.fileName || 'archivo'
    );
    body = form;
  } else if (options.filePath || options.fileUrl) {
    body = JSON.stringify({
      to,
      caption: options.caption,
      filePath: options.filePath,
      fileUrl: options.fileUrl,
      mimeType: options.mimeType,
      fileName: options.fileName,
    });
    contentType = 'application/json';
  } else {
    throw new Error('WhatsApp proxy: se requiere buffer, filePath o fileUrl');
  }

  const prodResponse = await postToProd(kind, sender, body, contentType, MEDIA_TIMEOUT_MS);
  if (prodResponse.queued) return { queued: true };
  return { success: true };
}
