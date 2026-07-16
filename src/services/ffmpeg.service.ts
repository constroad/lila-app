import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import logger from '../utils/logger.js';

let ffmpegAvailableCache: boolean | null = null;
let ffmpegMissingLogged = false;
let ffmpegCommandCache: string | null = null;

/**
 * Binario de `ffmpeg-static` (dep del package.json): en `npm install` baja el
 * ffmpeg de la plataforma (arm64 macOS de la Mac mini; Linux si se migra). Se
 * antepone a los candidatos para NO depender de un `brew install` manual. Import
 * defensivo (createRequire, patrón de `pdf-to-docx.service`): si el paquete aún
 * no está instalado, cae a los candidatos del sistema sin romper el arranque.
 */
const getFfmpegStaticPath = (): string | null => {
  try {
    const require = createRequire(import.meta.url);
    const resolved = require('ffmpeg-static');
    return typeof resolved === 'string' && resolved.trim() ? resolved : null;
  } catch {
    return null;
  }
};

const getFfmpegCandidates = (): string[] => {
  const fromEnv = (process.env.FFMPEG_PATH || '').trim();
  const candidates = [
    fromEnv, // override explícito gana
    getFfmpegStaticPath() || '', // binario gestionado por npm
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
