import crypto from 'crypto';
import path from 'path';

const MAX_SAFE_BASENAME_LENGTH = 80;

export function sanitizeStorageFileName(name: string): string {
  const parsed = path.parse(name || 'file');
  const safeBase =
    parsed.name
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, MAX_SAFE_BASENAME_LENGTH) || 'file';
  const safeExt = parsed.ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 16).toLowerCase();

  return `${safeBase}${safeExt}`;
}

export function buildUniqueStorageFileName(originalName: string, uniqueSeed?: string): string {
  const safeName = sanitizeStorageFileName(originalName);
  const parsed = path.parse(safeName);
  const hash = crypto
    .createHash('sha1')
    .update(`${uniqueSeed || crypto.randomUUID()}:${originalName}:${Date.now()}`)
    .digest('hex')
    .slice(0, 10);

  return `${parsed.name}_${hash}${parsed.ext}`;
}
