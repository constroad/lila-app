import path from 'path';
import sharp from 'sharp';
import axios from 'axios';
import logger from '../utils/logger.js';
import { storagePathService } from './storage-path.service.js';
import { resolveThumbnailRequestTarget } from './thumbnail-request.service.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import fs from 'fs-extra';

/**
 * Inliner de imágenes para el HTML de documentos (canvas de Portal Y renderer
 * Handlebars): reemplaza cada `<img src>` por un data URL para que el HTML sea
 * AUTOCONTENIDO — Puppeteer no debe tocar la red durante `setContent` (práctica
 * estándar; `networkidle0` con imágenes remotas fue la causa del timeout de
 * 180s del informe IPP, jul-2026).
 *
 * Orden de resolución por imagen (disco primero, HTTP como último recurso):
 * 1. Ruta de storage local de la company (`/files/companies/...`).
 * 2. Si la ruta es un thumbnail `.thumbs/thumb_*` que NO existe en disco →
 *    ORIGINAL local vía `resolveThumbnailRequestTarget` (mismo fallback que la
 *    ruta estática). Antes esto se descargaba por HTTP a nosotros mismos
 *    (salía por Tailscale y volvía) y disparaba la generación on-demand.
 * 3. Descarga HTTP (URLs externas), con timeout y pool acotado.
 *
 * Toda imagen embebida se REDIMENSIONA a tamaño de PDF (antes, cualquier foto
 * ≤1MB entraba a resolución completa: 14 fotos ≈ 5.7MB de HTML base64).
 */

const IMG_SRC_REGEX = /(<img\b[^>]*?\bsrc=)(["'])(.*?)\2/gi;

// Timeout de descarga por imagen (solo para URLs realmente externas).
const IMG_DOWNLOAD_TIMEOUT_MS = 30_000;

// Concurrencia máxima al resolver imágenes: 14 sharp simultáneos saturaban la
// CPU de la Mac mini y cada imagen tardaba MÁS (timeouts en cascada).
const INLINE_CONCURRENCY = 4;

// Lado mayor máximo (px) de una imagen embebida. 1600px cubre fotos a media
// página y membretes A4 sin degradación visible; las fotos de despacho pasan
// de ~300KB a ~150KB re-encodadas. Override por env si un doc exige más.
const PDF_IMAGE_MAX_PX = Number(process.env.PDF_INLINE_IMAGE_MAX_PX) || 1600;
const PDF_IMAGE_JPEG_QUALITY = 72;

type StorageRef = {
  absolutePath: string;
  companyRoot: string;
  relativePath: string;
};

const resolveStorageRefFromUrl = (urlCandidate: string, companyId: string): StorageRef | null => {
  if (!companyId) return null;
  try {
    const rawPath = urlCandidate.startsWith('http') ? new URL(urlCandidate).pathname : urlCandidate;
    const marker = '/files/companies/';
    const idx = rawPath.indexOf(marker);
    if (idx === -1) return null;
    const remainder = rawPath.slice(idx + marker.length);
    const parts = remainder.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
    if (parts.length < 2) return null;
    const relativePath = parts.slice(1).join('/');
    return {
      absolutePath: storagePathService.resolvePath(parts[0], relativePath),
      companyRoot: storagePathService.getCompanyRoot(parts[0]),
      relativePath,
    };
  } catch (error) {
    logger.warn('canvasHtmlInliner: failed to resolve storage path', {
      error: String(error),
      urlCandidate,
    });
    return null;
  }
};

/** Lee la imagen desde disco: ruta exacta o, si es un thumb faltante, su ORIGINAL. */
const readLocalImage = async (ref: StorageRef): Promise<Buffer | null> => {
  try {
    if (await fs.pathExists(ref.absolutePath)) {
      return await fs.readFile(ref.absolutePath);
    }
    const target = await resolveThumbnailRequestTarget(ref.companyRoot, ref.relativePath);
    if (target) {
      return await fs.readFile(target.absolutePath);
    }
  } catch (error) {
    logger.warn('canvasHtmlInliner: failed to read storage image', {
      error: String(error),
      storagePath: ref.absolutePath,
    });
  }
  return null;
};

const resolveImageBuffer = async (
  urlCandidate: string,
  companyId: string
): Promise<Buffer | null> => {
  const ref = resolveStorageRefFromUrl(urlCandidate, companyId);
  if (ref) {
    const local = await readLocalImage(ref);
    if (local) return local;
  }

  if (!urlCandidate.startsWith('http')) return null;

  try {
    const response = await axios.get(urlCandidate, {
      responseType: 'arraybuffer',
      timeout: IMG_DOWNLOAD_TIMEOUT_MS,
    });
    return Buffer.from(response.data);
  } catch (error) {
    logger.warn('canvasHtmlInliner: failed to download image', {
      error: String(error),
      urlCandidate,
    });
    return null;
  }
};

/**
 * Re-encode a tamaño de PDF y devuelve el data URL:
 * - SVG → PNG rasterizado (density 300, membretes/logos nítidos).
 * - Con alfa (firmas/sellos) → PNG (JPEG aplana la transparencia sobre negro).
 * - Opacas → JPEG q72 mozjpeg.
 * Nunca rompe: ante error devuelve el buffer original en base64.
 */
const toPdfDataUrl = async (buffer: Buffer): Promise<string> => {
  let format = 'jpeg';
  let hasAlpha = false;
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.format) format = metadata.format;
    hasAlpha = Boolean(metadata.hasAlpha);
  } catch (error) {
    logger.warn('canvasHtmlInliner: failed to detect image format', { error: String(error) });
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  }

  try {
    const source = format === 'svg' ? sharp(buffer, { density: 300 }) : sharp(buffer);
    const pipeline = source.resize(PDF_IMAGE_MAX_PX, PDF_IMAGE_MAX_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    });
    // Solo el alfa obliga PNG (firmas/sellos/logos); todo lo opaco va a JPEG.
    const usePng = hasAlpha;
    const output = await (usePng
      ? pipeline.png({ compressionLevel: 9 })
      : pipeline.jpeg({ quality: PDF_IMAGE_JPEG_QUALITY, progressive: true, mozjpeg: true })
    ).toBuffer();
    return `data:image/${usePng ? 'png' : 'jpeg'};base64,${output.toString('base64')}`;
  } catch (error) {
    logger.warn('canvasHtmlInliner: failed to re-encode image, embedding as-is', {
      error: String(error),
      format,
    });
    const fallbackFormat = format === 'svg' ? 'svg+xml' : format;
    return `data:image/${fallbackFormat};base64,${buffer.toString('base64')}`;
  }
};

/**
 * Reemplaza en el HTML cada `<img src>` resoluble por su data URL. Las que ya
 * son data URL o no se pueden resolver se dejan intactas (nunca rompe el HTML).
 */
export const inlineCanvasHtmlImages = async (
  html: string,
  companyId: string
): Promise<string> => {
  if (!html) return html;
  const startedAt = Date.now();

  const sources = new Set<string>();
  let match: RegExpExecArray | null;
  IMG_SRC_REGEX.lastIndex = 0;
  while ((match = IMG_SRC_REGEX.exec(html)) !== null) {
    const src = match[3];
    if (src && !src.startsWith('data:')) sources.add(src);
  }

  if (sources.size === 0) return html;

  const resolved = new Map<string, string>();
  await mapWithConcurrency(Array.from(sources), INLINE_CONCURRENCY, async (src) => {
    const buffer = await resolveImageBuffer(src, companyId);
    if (buffer) resolved.set(src, await toPdfDataUrl(buffer));
  });

  if (resolved.size === 0) return html;

  IMG_SRC_REGEX.lastIndex = 0;
  const inlined = html.replace(IMG_SRC_REGEX, (whole, prefix, quote, src) => {
    const dataUrl = resolved.get(src);
    return dataUrl ? `${prefix}${quote}${dataUrl}${quote}` : whole;
  });

  logger.info('canvasHtmlInliner: inlined document images', {
    companyId,
    images: sources.size,
    inlined: resolved.size,
    htmlBytesBefore: Buffer.byteLength(html),
    htmlBytesAfter: Buffer.byteLength(inlined),
    durationMs: Date.now() - startedAt,
  });

  return inlined;
};
