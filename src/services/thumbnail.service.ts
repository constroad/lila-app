import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { spawn } from 'child_process';
import { renderPdfPageToPng } from '../pdf/render.service.js';
import logger from '../utils/logger.js';
import { getFfmpegCommand, isFfmpegAvailable } from './ffmpeg.service.js';
import { createLimiter } from '../utils/concurrency.js';

type ThumbnailKind = 'image' | 'video' | 'pdf' | 'unsupported';

type ThumbnailStatus = 'ready' | 'unsupported' | 'error';

export interface GenerateThumbnailOptions {
  filePath: string;
  fileName: string;
  mimeType?: string;
  outputDir: string;
}

export interface GenerateThumbnailResult {
  status: ThumbnailStatus;
  thumbnailName?: string;
  thumbnailAbsolutePath?: string;
  sizeBytes?: number;
  reason?: string;
}

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.webm',
  '.m4v',
  '.avi',
  '.mkv',
  '.3gp',
  '.mpeg',
  '.mpg',
]);

const thumbDirName = '.thumbs';

// Lado mayor del thumbnail de imagen/video. Un thumb es para GRIDS (~150-300px
// CSS, 2-3x DPR): 640px sobra y pesa ~40-80KB. El valor histórico (1200px) era
// tamaño display, no thumbnail — grids de 150-330KB por tile en gama media.
// Los PDFs conservan 1200px (legibilidad de la primera página).
const THUMBNAIL_MAX_PX = Number(process.env.THUMBNAIL_MAX_PX) || 640;
const PDF_THUMBNAIL_MAX_PX = 1200;

function resolveKind(mimeType: string | undefined, fileName: string): ThumbnailKind {
  const mime = (mimeType || '').toLowerCase();
  const ext = path.extname(fileName).toLowerCase();

  if ((mime.startsWith('image/') && !mime.includes('svg')) || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
    return 'image';
  }

  if (mime.includes('pdf') || ext === '.pdf') {
    return 'pdf';
  }

  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) {
    return 'video';
  }

  return 'unsupported';
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'file';
}

async function removePreviousThumbnails(outputDir: string, safeBase: string) {
  const thumbDir = path.join(outputDir, thumbDirName);
  await fs.ensureDir(thumbDir);
  const entries = await fs.readdir(thumbDir).catch(() => []);
  const prefix = `thumb_${safeBase}_`;

  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => fs.remove(path.join(thumbDir, entry)).catch(() => {}))
  );
}

async function createThumbTargetPath(options: GenerateThumbnailOptions): Promise<{ thumbName: string; thumbPath: string }> {
  const stat = await fs.stat(options.filePath);
  const parsed = path.parse(options.fileName);
  const safeBase = sanitizeName(parsed.name || 'file');
  const hash = crypto
    .createHash('sha1')
    .update(`${options.filePath}:${stat.size}:${stat.mtimeMs}`)
    .digest('hex')
    .slice(0, 10);

  const thumbName = `thumb_${safeBase}_${hash}.jpg`;
  const thumbDir = path.join(options.outputDir, thumbDirName);
  await fs.ensureDir(thumbDir);
  await removePreviousThumbnails(options.outputDir, safeBase);
  const thumbPath = path.join(thumbDir, thumbName);

  return { thumbName, thumbPath };
}

async function runFfmpeg(args: string[]): Promise<void> {
  const ffmpegCommand = getFfmpegCommand() || 'ffmpeg';
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegCommand, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (error) => {
      reject(error);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

async function generateImageThumbnail(options: GenerateThumbnailOptions, thumbPath: string) {
  const buffer = await sharp(options.filePath)
    .rotate()
    .resize(THUMBNAIL_MAX_PX, THUMBNAIL_MAX_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 72, progressive: true, mozjpeg: true })
    .toBuffer();

  await fs.writeFile(thumbPath, buffer);
}

async function generatePdfThumbnail(options: GenerateThumbnailOptions, thumbPath: string) {
  const { cacheFile } = await renderPdfPageToPng(options.filePath, { page: 1, scale: 1.3 });
  const buffer = await sharp(cacheFile)
    .resize(PDF_THUMBNAIL_MAX_PX, PDF_THUMBNAIL_MAX_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toBuffer();

  await fs.writeFile(thumbPath, buffer);
}

async function generateVideoThumbnail(options: GenerateThumbnailOptions, thumbPath: string) {
  const args = [
    '-y',
    '-ss',
    '00:00:00.000',
    '-i',
    options.filePath,
    '-frames:v',
    '1',
    '-vf',
    `scale=${THUMBNAIL_MAX_PX}:-2:force_original_aspect_ratio=decrease`,
    '-q:v',
    '5',
    thumbPath,
  ];

  await runFfmpeg(args);
}

// Materialización lazy: cuando la ruta estática cae al ORIGINAL (thumb nunca
// generado — media legacy — o invalidado por move/re-subida), regeneramos el
// thumb en background para que los SIGUIENTES requests sirvan el liviano.
// Dedup por original en curso + pool acotado (una galería dispara ~14 a la vez).
const materializing = new Set<string>();
const materializeLimiter = createLimiter(2);

export function materializeThumbnailInBackground(originalAbsolutePath: string): void {
  if (materializing.has(originalAbsolutePath)) return;
  materializing.add(originalAbsolutePath);

  void materializeLimiter
    .run(() =>
      generateThumbnailForFile({
        filePath: originalAbsolutePath,
        fileName: path.basename(originalAbsolutePath),
        outputDir: path.dirname(originalAbsolutePath),
      })
    )
    .then((result) => {
      if (result.status === 'ready') {
        logger.info('[thumbnail] Materialized missing thumbnail', {
          original: originalAbsolutePath,
          thumbnailName: result.thumbnailName,
          sizeBytes: result.sizeBytes,
        });
      }
    })
    .catch((error) => {
      logger.warn('[thumbnail] Background materialization failed', {
        original: originalAbsolutePath,
        error: String(error),
      });
    })
    .finally(() => {
      materializing.delete(originalAbsolutePath);
    });
}

export function buildThumbnailRelativePath(relativePath: string, thumbnailName: string): string {
  if (relativePath) {
    return `${relativePath}/${thumbDirName}/${thumbnailName}`;
  }
  return `${thumbDirName}/${thumbnailName}`;
}

export async function generateThumbnailForFile(
  options: GenerateThumbnailOptions
): Promise<GenerateThumbnailResult> {
  const kind = resolveKind(options.mimeType, options.fileName);
  if (kind === 'unsupported') {
    return { status: 'unsupported', reason: 'File type not supported for thumbnail' };
  }
  if (kind === 'video' && !isFfmpegAvailable()) {
    return { status: 'unsupported', reason: 'ffmpeg-not-installed' };
  }

  try {
    const { thumbName, thumbPath } = await createThumbTargetPath(options);

    if (kind === 'image') {
      await generateImageThumbnail(options, thumbPath);
    } else if (kind === 'pdf') {
      await generatePdfThumbnail(options, thumbPath);
    } else if (kind === 'video') {
      await generateVideoThumbnail(options, thumbPath);
    }

    const stat = await fs.stat(thumbPath);

    return {
      status: 'ready',
      thumbnailName: thumbName,
      thumbnailAbsolutePath: thumbPath,
      sizeBytes: stat.size,
    };
  } catch (error) {
    logger.warn('[thumbnail] Failed to generate thumbnail', {
      filePath: options.filePath,
      fileName: options.fileName,
      mimeType: options.mimeType,
      error: String(error),
    });

    return {
      status: 'error',
      reason: error instanceof Error ? error.message : 'Thumbnail generation failed',
    };
  }
}
