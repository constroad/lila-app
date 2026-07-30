import { Request, Response } from 'express';
import logger from '../../utils/logger.js';
import config from '../../config/environment.js';
import {
  buildVisionRequest,
  extractVisionText,
  resolveVisionProvider,
  type VisionProviderName,
} from '../../services/vision-ocr.service.js';

/**
 * Transcripción de un ticket de balanza por LLM (Flota §11.3-11) —
 * `POST /api/vision/weigh-note`. La autenticación la resolvió `requireTenant`, así
 * que `req.companyId` es de confianza.
 *
 * Devuelve TEXTO, no pesos: la validación (bruto − tara = neto), la conversión a
 * toneladas y el cotejo de placa los hace el parser de Portal y los confirma una
 * persona. Acá no se decide nada sobre la plata.
 *
 * Tres protecciones de costo, porque esto pega a una API que se paga por uso:
 * 1. **Sin credencial responde 503** con un mensaje claro: la feature no existe
 *    hasta que alguien la configure, y ninguna pantalla se cae por eso.
 * 2. **Tope de imágenes por empresa y por día** (contador en memoria del proceso):
 *    un bucle de reintentos del cliente no puede convertirse en una factura.
 * 3. **Tope de tamaño de imagen**: una foto de 12 MP son tokens pagados de más sin
 *    mejorar la lectura de un ticket.
 */

/** Tope diario por empresa. Con el free tier de Gemini el techo real es menor. */
const MAX_IMAGES_PER_COMPANY_PER_DAY = 60;
/** 4 MB: una foto de celular comprimida entra de sobra. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Contador en memoria: se reinicia si el proceso reinicia, y eso es aceptable —
 * es un freno de mano contra bucles, no una cuota contable. La cuota real la
 * impone el proveedor.
 */
const usage = new Map<string, { dateKey: string; count: number }>();

const todayKeyLima = (): string =>
  new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);

const consumeQuota = (companyId: string): boolean => {
  const dateKey = todayKeyLima();
  const current = usage.get(companyId);
  if (!current || current.dateKey !== dateKey) {
    usage.set(companyId, { dateKey, count: 1 });
    return true;
  }
  if (current.count >= MAX_IMAGES_PER_COMPANY_PER_DAY) return false;
  current.count += 1;
  return true;
};

export async function readWeighNote(req: Request, res: Response): Promise<void> {
  const companyId = req.companyId;
  if (!companyId) {
    res.status(401).json({ ok: false, message: 'No autorizado' });
    return;
  }

  const provider = resolveVisionProvider({
    provider: config.vision?.provider,
    apiKey: config.vision?.apiKey,
    model: config.vision?.model,
    baseUrl: config.vision?.baseUrl,
  });
  if (!provider) {
    // 503 y NO 500: no es una falla, es una feature sin configurar.
    res.status(503).json({
      ok: false,
      code: 'vision-not-configured',
      message: 'La lectura automática de tickets no está configurada en este servidor',
    });
    return;
  }

  const { base64, mimeType } = (req.body ?? {}) as { base64?: string; mimeType?: string };
  if (!base64 || typeof base64 !== 'string') {
    res.status(400).json({ ok: false, message: 'Falta la imagen del ticket' });
    return;
  }
  if (!ALLOWED_MIME.has(String(mimeType))) {
    res.status(400).json({ ok: false, message: 'Formato no soportado (usa JPG, PNG o WebP)' });
    return;
  }
  // base64 pesa ~4/3 del binario: se estima antes de mandarlo a pagar tokens.
  if ((base64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    res.status(413).json({ ok: false, message: 'La foto es muy grande: reduce la calidad' });
    return;
  }
  if (!consumeQuota(companyId)) {
    res.status(429).json({
      ok: false,
      code: 'vision-daily-cap',
      message: `Se alcanzó el tope de ${MAX_IMAGES_PER_COMPANY_PER_DAY} lecturas del día. Ingresa el peso a mano.`,
    });
    return;
  }

  const request = buildVisionRequest(provider, { base64, mimeType: String(mimeType) });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      // El detalle del proveedor va al log, no al cliente (puede traer la cuota,
      // el modelo o parte de la credencial).
      logger.warn('[vision] proveedor respondió con error', {
        companyId,
        provider: provider.provider,
        status: response.status,
      });
      res.status(502).json({
        ok: false,
        code: 'vision-provider-error',
        message: 'El lector no pudo procesar la foto. Ingresa el peso a mano.',
      });
      return;
    }

    const text = extractVisionText(provider.provider as VisionProviderName, payload);
    if (!text) {
      res.status(422).json({
        ok: false,
        code: 'vision-empty',
        message: 'No se pudo leer el ticket. Ingresa el peso a mano.',
      });
      return;
    }

    res.status(200).json({ ok: true, text, provider: provider.provider, model: provider.model });
  } catch (error) {
    const aborted = (error as { name?: string })?.name === 'AbortError';
    logger.error('[vision] fallo al leer el ticket', {
      companyId,
      provider: provider.provider,
      aborted,
    });
    res.status(aborted ? 504 : 502).json({
      ok: false,
      message: 'El lector no respondió. Ingresa el peso a mano.',
    });
  } finally {
    clearTimeout(timeout);
  }
}
