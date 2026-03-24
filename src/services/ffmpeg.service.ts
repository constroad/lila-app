import { spawnSync } from 'child_process';
import logger from '../utils/logger.js';

let ffmpegAvailableCache: boolean | null = null;
let ffmpegMissingLogged = false;
let ffmpegCommandCache: string | null = null;

const getFfmpegCandidates = (): string[] => {
  const fromEnv = (process.env.FFMPEG_PATH || '').trim();
  const candidates = [
    fromEnv,
    'ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ].filter(Boolean);

  return Array.from(new Set(candidates));
};

const resolveFfmpegCommand = (): string | null => {
  for (const candidate of getFfmpegCandidates()) {
    const check = spawnSync(candidate, ['-version'], { stdio: 'ignore' });
    const ok = !check.error && check.status === 0;
    if (ok) return candidate;
  }
  return null;
};

export const getFfmpegCommand = (): string | null => {
  if (ffmpegCommandCache !== null) {
    return ffmpegCommandCache;
  }

  ffmpegCommandCache = resolveFfmpegCommand();
  return ffmpegCommandCache;
};

export const isFfmpegAvailable = (): boolean => {
  if (ffmpegAvailableCache !== null) {
    return ffmpegAvailableCache;
  }

  const command = getFfmpegCommand();
  ffmpegAvailableCache = Boolean(command);

  if (!ffmpegAvailableCache && !ffmpegMissingLogged) {
    ffmpegMissingLogged = true;
    logger.info(
      '[ffmpeg] Binary not found (PATH/common routes). Set FFMPEG_PATH if installed elsewhere. Video optimization and video thumbnails are disabled.'
    );
  }

  return ffmpegAvailableCache;
};
