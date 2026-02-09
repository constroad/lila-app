/**
 * 📦 WhatsApp Media Utilities
 *
 * Helper functions for handling media files (images, videos, documents)
 * Based on legacy message.controller.ts best practices
 */

import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { storagePathService } from './storage-path.service.js';
import { config } from '../config/environment.js';

/**
 * Detect MIME type from filename with proper WhatsApp compatibility
 */
export function detectMimeType(filename: string | undefined, fallback?: string): string {
  if (fallback) return fallback;
  if (!filename) return 'application/octet-stream';

  const ext = filename.split('.').pop()?.toLowerCase();

  // Images
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';

  // Videos
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'avi') return 'video/x-msvideo';
  if (ext === 'mkv') return 'video/x-matroska';

  // Documents
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'doc') return 'application/msword';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'ppt') return 'application/vnd.ms-powerpoint';
  if (ext === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

  // Text
  if (ext === 'txt') return 'text/plain';
  if (ext === 'csv') return 'text/csv';

  // Compressed
  if (ext === 'zip') return 'application/zip';
  if (ext === 'rar') return 'application/vnd.rar';
  if (ext === '7z') return 'application/x-7z-compressed';

  return 'application/octet-stream';
}

/**
 * Get send options for WhatsApp based on recipient type
 * Groups need special options for reliable delivery
 */
export function getSendOptions(recipient: string) {
  if (recipient.endsWith('@g.us')) {
    return {
      useCachedGroupMetadata: false,
      useUserDevicesCache: false,
    } as const;
  }
  return undefined;
}

/**
 * Extract relative path from URL
 */
function extractRelativePathFromUrl(fileUrl: string, companyId: string): string | null {
  try {
    const url = new URL(fileUrl, 'http://localhost');
    const pathname = url.pathname;
    const marker = `/files/companies/${companyId}/`;
    if (!pathname.startsWith(marker)) return null;
    const raw = pathname.slice(marker.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

/**
 * Normalize relative path from various formats
 */
function normalizeRelativePath(input: string, companyId: string): string | null {
  let raw = input.trim();
  if (!raw) return null;

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = new URL(raw);
      raw = url.pathname;
    }
  } catch {
    // ignore URL parse errors
  }

  raw = raw.replace(/\\/g, '/');

  const isUrlPath =
    raw.startsWith('/files/companies/') || raw.startsWith('/companies/');

  if (path.isAbsolute(raw) && !isUrlPath) {
    const companyRoot = storagePathService.getCompanyRoot(companyId);
    const normalizedRoot = path.normalize(companyRoot);
    const normalizedRaw = path.normalize(raw);
    if (normalizedRaw.startsWith(normalizedRoot)) {
      raw = path.relative(normalizedRoot, normalizedRaw);
    } else {
      return null;
    }
  }

  raw = raw.replace(/^\/+/, '');

  const marker = `files/companies/${companyId}/`;
  const altMarker = `companies/${companyId}/`;
  if (raw.startsWith(marker)) {
    raw = raw.slice(marker.length);
  } else if (raw.startsWith(altMarker)) {
    raw = raw.slice(altMarker.length);
  } else {
    const segment = `/companies/${companyId}/`;
    const idx = raw.indexOf(segment);
    if (idx >= 0) {
      raw = raw.slice(idx + segment.length);
    }
  }

  try {
    raw = decodeURIComponent(raw);
  } catch {
    // ignore decode errors
  }

  return raw || null;
}

/**
 * Resolve file buffer from company storage
 * Validates path, checks size limits, reads file
 */
export async function resolveFileBuffer(params: {
  companyId: string;
  filePath?: string;
  fileUrl?: string;
  mimeType?: string;
  fileName?: string;
}): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  const { companyId, filePath, fileUrl, mimeType, fileName } = params;

  let relativePath = filePath ? normalizeRelativePath(filePath, companyId) : null;
  if (!relativePath && fileUrl) {
    relativePath = normalizeRelativePath(fileUrl, companyId) ||
      extractRelativePathFromUrl(fileUrl, companyId);
  }
  if (!relativePath) return null;

  if (path.isAbsolute(relativePath)) {
    throw new Error('filePath must be relative');
  }

  const resolved = storagePathService.resolvePath(companyId, relativePath);
  if (!storagePathService.validateAccess(resolved, companyId)) {
    throw new Error('Invalid filePath');
  }

  const exists = await fs.pathExists(resolved);
  if (!exists) {
    throw new Error('File not found');
  }

  const stat = await fs.stat(resolved);
  const MAX_WTSP_BYTES = 100 * 1024 * 1024; // 100MB
  if (stat.size > MAX_WTSP_BYTES) {
    throw new Error('File too large for WhatsApp (max 100MB)');
  }

  const buffer = await fs.readFile(resolved);
  const resolvedFileName = fileName || path.basename(resolved);
  const resolvedMimeType = detectMimeType(resolvedFileName, mimeType);

  return {
    buffer,
    mimeType: resolvedMimeType,
    fileName: resolvedFileName,
  };
}

/**
 * Download file from URL to temp storage
 */
export async function downloadFileFromUrl(
  fileUrl: string,
  mimeType?: string
): Promise<{ filePath: string; mimeType: string; fileName: string }> {
  const response = await axios.get(fileUrl, { responseType: 'stream' });
  const contentType = response.headers['content-type'];
  const detectedMimeType = mimeType || contentType || 'application/octet-stream';

  // Get extension from URL or mime type
  let extension = 'bin';
  try {
    const urlPath = new URL(fileUrl).pathname;
    const urlExt = path.extname(urlPath).slice(1);
    if (urlExt) extension = urlExt;
  } catch {
    // If URL parsing fails, try to get extension from mime type
    if (detectedMimeType.startsWith('image/')) extension = detectedMimeType.split('/')[1];
    else if (detectedMimeType.startsWith('video/')) extension = detectedMimeType.split('/')[1];
  }

  const tempFileName = `${uuidv4()}.${extension}`;
  const tempFilePath = path.join(config.uploads.directory, tempFileName);

  const writer = fs.createWriteStream(tempFilePath);
  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  return {
    filePath: tempFilePath,
    mimeType: detectedMimeType,
    fileName: tempFileName,
  };
}
