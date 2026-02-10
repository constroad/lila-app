import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import fs from 'fs-extra';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/environment.js';
import { HTTP_STATUS } from '../config/constants.js';
import logger from '../utils/logger.js';
import { storagePathService } from './storage-path.service.js';
import { incrementStorageUsage } from '../middleware/quota.middleware.js';
import { quotaValidatorService } from './quota-validator.service.js';

interface TusUploadMetadata {
  filename?: string;
  filetype?: string;
  companyId?: string;
  path?: string;
  resourceId?: string;
  type?: string;
  folderId?: string;
}

interface TusUploadInfo {
  id: string;
  companyId: string;
  name: string;
  path: string;
  size: number;
  url: string;
  urlAbsolute: string;
  createdAt: string;
}

const MAX_ORDERS_BYTES = 100 * 1024 * 1024; // 100MB
const MAX_DRIVE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

let TUS_STORAGE_DIR = path.join(config.storage.root, 'temp', 'tus-uploads');
try {
  fs.ensureDirSync(TUS_STORAGE_DIR);
} catch (error) {
  if (config.nodeEnv !== 'production') {
    const fallback = path.join(process.cwd(), 'data', 'storage', 'temp', 'tus-uploads');
    fs.ensureDirSync(fallback);
    logger.warn(`[tus] Failed to init storage dir at ${TUS_STORAGE_DIR}. Using fallback: ${fallback}`);
    TUS_STORAGE_DIR = fallback;
  } else {
    throw error;
  }
}

const TUS_META_DIR = path.join(TUS_STORAGE_DIR, 'metadata');
fs.ensureDirSync(TUS_META_DIR);

function isValidEntryName(name: string) {
  if (!name) return false;
  if (name === '.' || name === '..') return false;
  return !/[\\/]/.test(name);
}

function resolveProto(req: Request): string {
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0];
  }
  return req.protocol;
}

function buildAbsoluteUrl(req: Request, relativeUrl: string) {
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return relativeUrl;
  const proto = resolveProto(req);
  return `${proto}://${host}${relativeUrl}`;
}

function parseMetadata(metadataHeader?: string): TusUploadMetadata {
  if (!metadataHeader) return {};
  const metadata: TusUploadMetadata = {};
  metadataHeader.split(',').forEach((pair) => {
    const [key, base64Value] = pair.trim().split(' ');
    if (key && base64Value) {
      try {
        const decoded = Buffer.from(base64Value, 'base64').toString('utf-8');
        (metadata as any)[key] = decoded;
      } catch (error) {
        logger.warn(`[tus] Failed to decode metadata key: ${key}`, error);
      }
    }
  });
  return metadata;
}

function getUploadSize(upload: any): number {
  return Number(upload?.size || upload?.upload_length || 0);
}

function getUploadId(upload: any): string {
  return String(upload?.id || '');
}

async function storeUploadInfo(info: TusUploadInfo): Promise<void> {
  const infoPath = path.join(TUS_META_DIR, `${info.id}.json`);
  await fs.writeJson(infoPath, info, { spaces: 2 });
}

async function finalizeUpload(upload: any, req: Request): Promise<void> {
  const headerMetadata = parseMetadata(req.headers['upload-metadata'] as string);
  const storedMetadata =
    upload && typeof upload.metadata === 'object' ? (upload.metadata as TusUploadMetadata) : {};
  const metadata: TusUploadMetadata = {
    ...storedMetadata,
    ...headerMetadata,
  };
  const companyId = (req as any).companyId || metadata.companyId;
  if (!companyId) {
    throw new Error('Company ID is required');
  }

  const relativePath = (metadata.path || '').trim();
  const filename = metadata.filename || getUploadId(upload);

  if (!isValidEntryName(filename)) {
    throw new Error('Invalid file name');
  }

  const uploadSize = getUploadSize(upload);
  const isDriveRoot = relativePath.startsWith('drive');
  const maxAllowedBytes = isDriveRoot ? MAX_DRIVE_BYTES : MAX_ORDERS_BYTES;

  if (uploadSize > maxAllowedBytes) {
    throw new Error('File too large');
  }

  const resolved = storagePathService.resolvePath(companyId, relativePath);
  if (!storagePathService.validateAccess(resolved, companyId)) {
    throw new Error('Access denied: invalid path');
  }

  await fs.ensureDir(resolved);

  const target = path.join(resolved, filename);
  if (!storagePathService.validateAccess(target, companyId)) {
    throw new Error('Access denied: invalid target path');
  }

  const tempPath = path.join(TUS_STORAGE_DIR, getUploadId(upload));
  await fs.move(tempPath, target, { overwrite: true });

  await incrementStorageUsage(companyId, uploadSize);

  const filePath = relativePath ? `${relativePath}/${filename}` : filename;
  const publicUrl = `/files/companies/${companyId}/${filePath}`;

  const info: TusUploadInfo = {
    id: getUploadId(upload),
    companyId,
    name: filename,
    path: filePath,
    size: uploadSize,
    url: publicUrl,
    urlAbsolute: buildAbsoluteUrl(req, publicUrl),
    createdAt: new Date().toISOString(),
  };

  await storeUploadInfo(info);
}

export function createTusServer(): Server {
  const fileStore = new FileStore({
    directory: TUS_STORAGE_DIR,
  });

  const tusServer = new Server({
    // Express router is mounted at /api/drive; generate correct Location for PATCH
    path: '/api/drive/upload-tus',
    datastore: fileStore,
    namingFunction: () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    respectForwardedHeaders: true,
    allowedHeaders: [
      'Authorization',
      'x-api-key',
      'Content-Type',
      'Upload-Length',
      'Upload-Offset',
      'Upload-Metadata',
      'Upload-Defer-Length',
      'Upload-Checksum',
      'Tus-Resumable',
    ],
    async onUploadCreate(req, res, upload) {
      const metadata = parseMetadata(req.headers['upload-metadata'] as string);
      const companyId = (req as any).companyId || metadata.companyId;
      if (!companyId) {
        const error: any = new Error('Company ID is required');
        error.status_code = HTTP_STATUS.UNAUTHORIZED;
        throw error;
      }

      const filename = metadata.filename || getUploadId(upload);
      if (!isValidEntryName(filename)) {
        const error: any = new Error('Invalid file name');
        error.status_code = HTTP_STATUS.BAD_REQUEST;
        throw error;
      }

      const uploadSize = getUploadSize(upload);
      const relativePath = (metadata.path || '').trim();
      const isDriveRoot = relativePath.startsWith('drive');
      const maxAllowedBytes = isDriveRoot ? MAX_DRIVE_BYTES : MAX_ORDERS_BYTES;

      if (uploadSize > maxAllowedBytes) {
        const error: any = new Error('File too large');
        error.status_code = HTTP_STATUS.REQUEST_TOO_LONG;
        throw error;
      }

      if (quotaValidatorService.isReady()) {
        const allowed = await quotaValidatorService.checkStorageQuota(companyId, uploadSize);
        if (!allowed) {
          const error: any = new Error('Storage quota exceeded');
          error.status_code = 429;
          throw error;
        }
      }

      (upload as any).metadata = {
        ...(upload as any).metadata,
        ...metadata,
        companyId,
      };
      // Keep the response object intact for tus server internals
      return res;
    },
    async onUploadFinish(req, res, upload) {
      logger.info('[tus] Upload finished:', {
        id: getUploadId(upload),
        size: getUploadSize(upload),
      });

      try {
        await finalizeUpload(upload, req);
        logger.info('[tus] Upload finalized:', getUploadId(upload));
      } catch (error) {
        logger.error('[tus] Failed to finalize upload:', error);
        throw error;
      }

      return res;
    },
  });

  logger.info(`[tus] Server initialized at ${TUS_STORAGE_DIR}`);
  return tusServer;
}

export function tusMiddleware(tusServer: Server) {
  return (req: Request, res: Response) => {
    return tusServer.handle(req, res);
  };
}

export async function getTusUploadInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = (req as any).companyId;
    const uploadId = req.params.id;

    if (!uploadId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: { message: 'Upload ID is required' },
      });
    }

    const infoPath = path.join(TUS_META_DIR, `${uploadId}.json`);
    const exists = await fs.pathExists(infoPath);
    if (!exists) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { message: 'Upload info not found' },
      });
    }

    const info = (await fs.readJson(infoPath)) as TusUploadInfo;
    if (companyId && info.companyId && info.companyId !== companyId) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: { message: 'Access denied' },
      });
    }

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: info,
    });
  } catch (error) {
    next(error);
  }
}
