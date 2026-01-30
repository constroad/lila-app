import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/environment.js';

const rootDir = path.resolve(config.drive.rootDir);

function normalizeRelativePath(input: string | undefined) {
  if (!input) return '';
  const raw = input.replace(/\\/g, '/').trim();
  return raw.replace(/^\/+/, '');
}

export function resolveDrivePath(relativePath: string | undefined) {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(rootDir, normalized);

  if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
    throw new Error('Invalid path');
  }

  return { resolved, normalized };
}

export function ensureDriveRoot() {
  return fs.ensureDir(rootDir);
}

export function buildPublicUrl(relativePath: string) {
  const base = config.drive.publicBaseUrl.replace(/\/+$/, '');
  const clean = normalizeRelativePath(relativePath);
  return `${base}/${encodeURI(clean)}`;
}

export function isValidEntryName(name: string) {
  if (!name) return false;
  if (name === '.' || name === '..') return false;
  return !/[\\/]/.test(name);
}
