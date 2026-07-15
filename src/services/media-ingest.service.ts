import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import fs from 'fs-extra';
import logger from '../utils/logger.js';

/**
 * Normalización de imágenes al INGERIR (red de seguridad server-side).
 *
 * Portal ya optimiza en el cliente (`optimizeBrowserImageFile`: ~1MB / canvas),
 * pero el estándar es que el server NO confíe en eso: cualquier cliente (canvas
 * que falla silencioso, curl, integraciones futuras) puede subir fotos de 8MB+
 * que luego castigan a los teléfonos de gama media al verlas y engordan PDFs.
 *
 * Política: techo GENEROSO (2560px) — para archivos ya optimizados por el
 * cliente (≤1600px) es un no-op y no hay doble pérdida de calidad; solo acota
 * lo que se pasó del límite. El original acotado sigue siendo la fuente para
 * zoom/descarga/PDF; el thumbnail (640px) cubre los grids.
 */

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// 0 = deshabilitado (guardar originales intactos, comportamiento previo).
const MEDIA_INGEST_MAX_PX = Number(process.env.MEDIA_INGEST_MAX_PX ?? 2560);
const NORMALIZED_JPEG_QUALITY = 82;

export type ImageNormalizationResult = {
  normalized: boolean;
  sizeDeltaBytes: number;
  reason?: string;
};

const isNormalizableImage = (fileName: string, mimeType?: string): boolean => {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('svg') || mime.includes('gif')) return false;
  if (mime.startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
};

/**
 * Redimensiona la imagen EN SU LUGAR si supera el techo (escritura atómica:
 * tmp + rename). Devuelve el delta de bytes para ajustar el contador de storage.
 * Nunca lanza: ante cualquier error deja el archivo original intacto.
 */
export async function normalizeImageInPlace(params: {
  filePath: string;
  fileName: string;
  mimeType?: string;
  maxPx?: number;
}): Promise<ImageNormalizationResult> {
  const maxPx = params.maxPx ?? MEDIA_INGEST_MAX_PX;
  if (!Number.isFinite(maxPx) || maxPx <= 0) {
    return { normalized: false, sizeDeltaBytes: 0, reason: 'disabled' };
  }
  if (!isNormalizableImage(params.fileName, params.mimeType)) {
    return { normalized: false, sizeDeltaBytes: 0, reason: 'not-an-image' };
  }

  try {
    const metadata = await sharp(params.filePath).metadata();
    const longestSide = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    if (!longestSide || longestSide <= maxPx) {
      // Ya está dentro del techo (caso normal con cliente optimizando):
      // no re-encodear = cero pérdida de calidad adicional.
      return { normalized: false, sizeDeltaBytes: 0, reason: 'within-limit' };
    }

    const originalSize = (await fs.stat(params.filePath)).size;
    const hasAlpha = Boolean(metadata.hasAlpha);
    const pipeline = sharp(params.filePath)
      .rotate() // hornear orientación EXIF (los thumbs ya lo hacen)
      .resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true });
    const output = await (hasAlpha
      ? pipeline.png({ compressionLevel: 9 })
      : pipeline.jpeg({ quality: NORMALIZED_JPEG_QUALITY, progressive: true, mozjpeg: true })
    ).toBuffer();

    const tmpPath = path.join(
      path.dirname(params.filePath),
      `.ingest-${randomUUID()}.tmp`
    );
    await fs.writeFile(tmpPath, output);
    await fs.move(tmpPath, params.filePath, { overwrite: true });

    const sizeDeltaBytes = output.length - originalSize;
    logger.info('[media-ingest] Imagen normalizada al techo de ingest', {
      fileName: params.fileName,
      fromPx: longestSide,
      toPx: maxPx,
      fromBytes: originalSize,
      toBytes: output.length,
    });
    return { normalized: true, sizeDeltaBytes };
  } catch (error) {
    logger.warn('[media-ingest] Falló la normalización, se conserva el original', {
      fileName: params.fileName,
      error: String(error),
    });
    return { normalized: false, sizeDeltaBytes: 0, reason: 'error' };
  }
}
