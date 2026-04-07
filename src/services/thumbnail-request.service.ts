import fs from 'fs-extra';
import path from 'path';

const THUMB_DIR_NAME = '.thumbs';
const THUMBNAIL_NAME_PATTERN = /^thumb_(.+)_[a-f0-9]{10}\.jpg$/i;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'file';
}

function normalizeRequestPath(requestPath: string): string | null {
  if (!requestPath) return null;

  try {
    const decoded = decodeURIComponent(requestPath);
    const normalized = path.posix.normalize(decoded.startsWith('/') ? decoded.slice(1) : decoded);

    if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

function toAbsolutePath(root: string, relativePath: string) {
  return path.join(root, ...relativePath.split('/'));
}

async function findOriginalForThumbnail(root: string, relativeThumbPath: string): Promise<string | null> {
  const segments = relativeThumbPath.split('/');
  const thumbDirIndex = segments.lastIndexOf(THUMB_DIR_NAME);
  const thumbName = segments[segments.length - 1] || '';
  const match = thumbName.match(THUMBNAIL_NAME_PATTERN);

  if (thumbDirIndex <= 0 || !match?.[1]) {
    return null;
  }

  const parentSegments = segments.slice(0, thumbDirIndex);
  const parentDir = toAbsolutePath(root, parentSegments.join('/'));
  const safeBase = match[1];
  const entries = await fs.readdir(parentDir).catch(() => []);
  const candidates = await Promise.all(
    entries
      .filter((entry) => !entry.startsWith('.'))
      .filter((entry) => sanitizeName(path.parse(entry).name || 'file') === safeBase)
      .map(async (entry) => {
        const absolutePath = path.join(parentDir, entry);
        const stat = await fs.stat(absolutePath).catch(() => null);
        const ext = path.extname(entry).toLowerCase();

        if (!stat?.isFile() || !IMAGE_EXTENSIONS.has(ext)) {
          return null;
        }

        return {
          absolutePath,
          mtimeMs: stat.mtimeMs,
        };
      })
  );

  const validCandidates = candidates
    .filter((candidate): candidate is { absolutePath: string; mtimeMs: number } => Boolean(candidate))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return validCandidates[0]?.absolutePath || null;
}

export async function resolveThumbnailRequestTarget(
  root: string,
  requestPath: string
): Promise<{ absolutePath: string; source: 'thumbnail' | 'original-fallback' } | null> {
  const relativePath = normalizeRequestPath(requestPath);
  if (!relativePath || !relativePath.split('/').includes(THUMB_DIR_NAME)) {
    return null;
  }

  const thumbPath = toAbsolutePath(root, relativePath);
  if (await fs.pathExists(thumbPath)) {
    return {
      absolutePath: thumbPath,
      source: 'thumbnail',
    };
  }

  const originalPath = await findOriginalForThumbnail(root, relativePath);
  if (!originalPath) {
    return null;
  }

  return {
    absolutePath: originalPath,
    source: 'original-fallback',
  };
}
