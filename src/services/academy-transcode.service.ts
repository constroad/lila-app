import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';
import { createLimiter } from '../utils/concurrency.js';
import { isFfmpegAvailable } from './ffmpeg.service.js';
import { runFfmpegWithTimeout } from './video-stream.service.js';
import { getAcademyTutorialModel } from '../database/models.js';
import { storagePathService } from './storage-path.service.js';

/**
 * academy-transcode.service — transcode ASYNC de tutoriales (Portal Academia).
 * La fuente (WebM grabado o MP4 externo) se guarda bajo la company `academy`;
 * lila la convierte a 2 renditions MP4 H.264 chicas (HD ~720p / SD ~480p) +
 * poster, con faststart, para reproducción fluida sin CDN (Range progresivo).
 * Ref: Portal/specs/ACADEMY-TUTORIALS.spec.md §4.
 *
 * Concurrencia acotada (createLimiter(1)): el re-encode compite con WhatsApp/PDF
 * en la Mac mini y es infrecuente (solo super-admin). Degrada sin romper: si
 * ffmpeg falla o falta, marca `error` y conserva la fuente.
 */

const ACADEMY_COMPANY_ID = 'academy';
const RENDITION_TIMEOUT_MS = 10 * 60 * 1000; // 10 min por rendition (5 min de video)
const POSTER_TIMEOUT_MS = 60 * 1000;
const MAX_ATTEMPTS = 3;

// 1 a la vez: el transcode es pesado y no urgente.
const transcodeLimiter = createLimiter(1);

/** Path relativo bajo `academy` a partir de una URL de archivo de lila. */
const relativePathFromUrl = (url: string): string | null => {
  const marker = `/files/companies/${ACADEMY_COMPANY_ID}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
};

const publicUrl = (relPath: string): string =>
  `/files/companies/${ACADEMY_COMPANY_ID}/${relPath}`;

const hdArgs = (input: string, output: string): string[] => [
  '-y', '-i', input,
  '-vf', "scale='min(1280,iw)':-2",
  '-r', '24',
  '-c:v', 'libx264', '-profile:v', 'high', '-crf', '28',
  '-maxrate', '1000k', '-bufsize', '2000k', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '96k', '-ac', '1',
  '-movflags', '+faststart', output,
];

const sdArgs = (input: string, output: string): string[] => [
  '-y', '-i', input,
  '-vf', "scale='min(854,iw)':-2",
  '-r', '15',
  '-c:v', 'libx264', '-profile:v', 'high', '-crf', '30',
  '-maxrate', '600k', '-bufsize', '1200k', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
  '-movflags', '+faststart', output,
];

const posterArgs = (input: string, output: string): string[] => [
  '-y', '-ss', '00:00:01', '-i', input, '-frames:v', '1',
  '-vf', 'scale=640:-2', output,
];

const markError = async (tutorialId: string, reason: string): Promise<void> => {
  const Tutorial = await getAcademyTutorialModel();
  await Tutorial.updateOne(
    { _id: tutorialId },
    { $set: { status: 'error', 'processing.state': 'error', 'processing.error': reason }, $inc: { 'processing.attempts': 1 } }
  );
  logger.error('[academy] transcode failed', { tutorialId, reason });
};

/**
 * Transcodea la fuente de un tutorial y publica sus renditions. Idempotente:
 * re-ejecutable (pisa hd/sd/poster). No lanza — reporta estado en el doc.
 */
export async function transcodeAcademyTutorial(tutorialId: string): Promise<void> {
  const Tutorial = await getAcademyTutorialModel();
  const doc = await Tutorial.findById(tutorialId).lean();
  if (!doc) {
    logger.warn('[academy] tutorial no encontrado para transcode', { tutorialId });
    return;
  }

  const source = (doc as { source?: { url?: string } }).source;
  const sourceRel = source?.url ? relativePathFromUrl(source.url) : null;
  if (!sourceRel) {
    await markError(tutorialId, 'source-url-invalid');
    return;
  }

  const attempts = Number((doc as { processing?: { attempts?: number } }).processing?.attempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) {
    logger.warn('[academy] max intentos de transcode alcanzado', { tutorialId, attempts });
    return;
  }

  if (!isFfmpegAvailable()) {
    await markError(tutorialId, 'ffmpeg-not-installed');
    return;
  }

  const sourceAbs = storagePathService.resolvePath(ACADEMY_COMPANY_ID, sourceRel);
  if (!(await fs.pathExists(sourceAbs))) {
    await markError(tutorialId, 'source-file-missing');
    return;
  }

  const dirRel = path.dirname(sourceRel);
  const hdRel = path.posix.join(dirRel, 'hd.mp4');
  const sdRel = path.posix.join(dirRel, 'sd.mp4');
  const posterRel = path.posix.join(dirRel, 'poster.jpg');
  const hdAbs = storagePathService.resolvePath(ACADEMY_COMPANY_ID, hdRel);
  const sdAbs = storagePathService.resolvePath(ACADEMY_COMPANY_ID, sdRel);
  const posterAbs = storagePathService.resolvePath(ACADEMY_COMPANY_ID, posterRel);

  try {
    await Tutorial.updateOne({ _id: tutorialId }, { $set: { status: 'processing', 'processing.state': 'transcoding' } });

    await transcodeLimiter.run(async () => {
      await runFfmpegWithTimeout(hdArgs(sourceAbs, hdAbs), RENDITION_TIMEOUT_MS);
      await runFfmpegWithTimeout(sdArgs(sourceAbs, sdAbs), RENDITION_TIMEOUT_MS);
      await runFfmpegWithTimeout(posterArgs(sourceAbs, posterAbs), POSTER_TIMEOUT_MS);
    });

    const [hdStat, sdStat] = await Promise.all([fs.stat(hdAbs), fs.stat(sdAbs)]);

    await Tutorial.updateOne(
      { _id: tutorialId },
      {
        $set: {
          'renditions.hd': { url: publicUrl(hdRel), width: 1280, sizeBytes: hdStat.size },
          'renditions.sd': { url: publicUrl(sdRel), width: 854, sizeBytes: sdStat.size },
          posterUrl: publicUrl(posterRel),
          // Queda LISTO en borrador; el superadmin publica explícitamente desde
          // el panel (decisión: publicación manual, no automática al procesar).
          status: 'draft',
          'processing.state': 'done',
          'processing.error': '',
        },
      }
    );
    logger.info('[academy] tutorial transcodeado', {
      tutorialId,
      hdMB: (hdStat.size / 1048576).toFixed(1),
      sdMB: (sdStat.size / 1048576).toFixed(1),
    });
  } catch (error) {
    await markError(tutorialId, error instanceof Error ? error.message : String(error));
  }
}

/** Encola el transcode sin bloquear la respuesta (fire-and-forget acotado). */
export function enqueueAcademyTranscode(tutorialId: string): void {
  void transcodeAcademyTutorial(tutorialId).catch((error) => {
    logger.error('[academy] enqueue transcode error', { tutorialId, error: String(error) });
  });
}
