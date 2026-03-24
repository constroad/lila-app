import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import logger from '../utils/logger.js';
import { getFfmpegCommand, isFfmpegAvailable } from './ffmpeg.service.js';

const FASTSTART_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov']);

interface OptimizeVideoOptions {
  filePath: string;
  fileName: string;
  mimeType?: string;
  timeoutMs?: number;
}

interface OptimizeVideoResult {
  attempted: boolean;
  optimized: boolean;
  sizeDeltaBytes: number;
  reason?: string;
}

const isVideoByMimeOrExt = (mimeType: string | undefined, fileName: string): boolean => {
  const mime = (mimeType || '').toLowerCase();
  const ext = path.extname(fileName).toLowerCase();
  if (mime.startsWith('video/')) return true;
  return ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi', '.mpeg', '.mpg', '.3gp'].includes(ext);
};

const supportsFaststart = (fileName: string): boolean => {
  const ext = path.extname(fileName).toLowerCase();
  return FASTSTART_EXTENSIONS.has(ext);
};

const runFfmpegWithTimeout = async (args: string[], timeoutMs: number): Promise<void> => {
  const ffmpegCommand = getFfmpegCommand() || 'ffmpeg';
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegCommand, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        proc.kill('SIGKILL');
      } catch {}
      reject(new Error(`ffmpeg timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
};

export const isVideoFile = (mimeType: string | undefined, fileName: string): boolean =>
  isVideoByMimeOrExt(mimeType, fileName);

export async function optimizeVideoForProgressiveStreaming(
  options: OptimizeVideoOptions
): Promise<OptimizeVideoResult> {
  if (!isVideoByMimeOrExt(options.mimeType, options.fileName)) {
    return {
      attempted: false,
      optimized: false,
      sizeDeltaBytes: 0,
      reason: 'not-a-video',
    };
  }

  if (!supportsFaststart(options.fileName)) {
    return {
      attempted: false,
      optimized: false,
      sizeDeltaBytes: 0,
      reason: 'unsupported-container',
    };
  }

  if (!isFfmpegAvailable()) {
    return {
      attempted: false,
      optimized: false,
      sizeDeltaBytes: 0,
      reason: 'ffmpeg-not-installed',
    };
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) ? (options.timeoutMs as number) : 180000;
  try {
    const sourceStat = await fs.stat(options.filePath);
    const ext = path.extname(options.fileName).toLowerCase() || '.mp4';
    const tempPath = path.join(
      path.dirname(options.filePath),
      `.tmp_faststart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
    );

    await runFfmpegWithTimeout(
      ['-y', '-i', options.filePath, '-c', 'copy', '-movflags', '+faststart', tempPath],
      timeoutMs
    );

    const optimizedStat = await fs.stat(tempPath);
    await fs.move(tempPath, options.filePath, { overwrite: true });

    return {
      attempted: true,
      optimized: true,
      sizeDeltaBytes: optimizedStat.size - sourceStat.size,
    };
  } catch (error) {
    if (typeof options.filePath === 'string') {
      const ext = path.extname(options.fileName).toLowerCase() || '.mp4';
      const tempPrefix = `.tmp_faststart_`;
      const dir = path.dirname(options.filePath);
      const entries = await fs.readdir(dir).catch(() => []);
      const cleanupTasks = entries
        .filter((entry) => entry.startsWith(tempPrefix) && entry.endsWith(ext))
        .map((entry) => fs.remove(path.join(dir, entry)).catch(() => {}));
      await Promise.all(cleanupTasks);
    }
    logger.warn('[video-stream] Failed to optimize file for progressive streaming', {
      filePath: options.filePath,
      fileName: options.fileName,
      mimeType: options.mimeType,
      error: String(error),
    });

    return {
      attempted: true,
      optimized: false,
      sizeDeltaBytes: 0,
      reason: error instanceof Error ? error.message : 'optimization-failed',
    };
  }
}
