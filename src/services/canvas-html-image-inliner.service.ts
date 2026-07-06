import path from 'path';
import sharp from 'sharp';
import axios from 'axios';
import logger from '../utils/logger.js';
import { storagePathService } from './storage-path.service.js';
import { ImageCompressionService } from './image-compression.service.js';
import fs from 'fs-extra';

/**
 * Inliner de imágenes para el HTML del canvas (Fase 2, paso 2).
 *
 * Portal serializa el canvas y lo manda con `<img src>` apuntando a Drive/lila
 * (URLs autenticadas que Puppeteer no puede fetchear por CORS). Este servicio
 * resuelve cada `src` a un data URL en el server: primero por ruta de storage
 * local de la company, luego por descarga HTTP. Reusa `storagePathService` e
 * `ImageCompressionService` (no toca el renderer Handlebars).
 */

const IMG_SRC_REGEX = /(<img\b[^>]*?\bsrc=)(["'])(.*?)\2/gi;

const resolveStoragePathFromUrl = (urlCandidate: string, companyId: string): string | null => {
  if (!companyId) return null;
  try {
    const rawPath = urlCandidate.startsWith('http') ? new URL(urlCandidate).pathname : urlCandidate;
    const marker = '/files/companies/';
    const idx = rawPath.indexOf(marker);
    if (idx === -1) return null;
    const remainder = rawPath.slice(idx + marker.length);
    const parts = remainder.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const relative = parts.slice(1).join('/');
    return storagePathService.resolvePath(parts[0], relative);
  } catch (error) {
    logger.warn('canvasHtmlInliner: failed to resolve storage path', {
      error: String(error),
      urlCandidate,
    });
    return null;
  }
};

const resolveImageBuffer = async (
  urlCandidate: string,
  companyId: string
): Promise<Buffer | null> => {
  const storagePath = resolveStoragePathFromUrl(urlCandidate, companyId);
  if (storagePath) {
    try {
      if (await fs.pathExists(storagePath)) {
        const raw = await fs.readFile(storagePath);
        return ImageCompressionService.processImage(raw, path.basename(storagePath));
      }
    } catch (error) {
      logger.warn('canvasHtmlInliner: failed to read storage image', {
        error: String(error),
        storagePath,
      });
    }
  }

  if (!urlCandidate.startsWith('http')) return null;

  try {
    const response = await axios.get(urlCandidate, { responseType: 'arraybuffer', timeout: 10000 });
    const buffer = Buffer.from(response.data);
    return ImageCompressionService.processImage(buffer, path.basename(urlCandidate));
  } catch (error) {
    logger.warn('canvasHtmlInliner: failed to download image', {
      error: String(error),
      urlCandidate,
    });
    return null;
  }
};

const bufferToDataUrl = async (buffer: Buffer): Promise<string> => {
  let format = 'jpeg';
  let outputBuffer = buffer;
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.format) format = metadata.format;
  } catch (error) {
    logger.warn('canvasHtmlInliner: failed to detect image format', { error: String(error) });
  }

  if (format === 'svg') {
    try {
      outputBuffer = await sharp(buffer, { density: 300 }).png().toBuffer();
      format = 'png';
    } catch {
      format = 'svg+xml';
    }
  }

  return `data:image/${format};base64,${outputBuffer.toString('base64')}`;
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

  const sources = new Set<string>();
  let match: RegExpExecArray | null;
  IMG_SRC_REGEX.lastIndex = 0;
  while ((match = IMG_SRC_REGEX.exec(html)) !== null) {
    const src = match[3];
    if (src && !src.startsWith('data:')) sources.add(src);
  }

  if (sources.size === 0) return html;

  const resolved = new Map<string, string>();
  await Promise.all(
    Array.from(sources).map(async (src) => {
      const buffer = await resolveImageBuffer(src, companyId);
      if (buffer) resolved.set(src, await bufferToDataUrl(buffer));
    })
  );

  if (resolved.size === 0) return html;

  IMG_SRC_REGEX.lastIndex = 0;
  return html.replace(IMG_SRC_REGEX, (whole, prefix, quote, src) => {
    const dataUrl = resolved.get(src);
    return dataUrl ? `${prefix}${quote}${dataUrl}${quote}` : whole;
  });
};
