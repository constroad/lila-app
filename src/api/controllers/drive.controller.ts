import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import { storagePathService } from '../../services/storage-path.service.js';
import { incrementStorageUsage, decrementStorageUsage } from '../../middleware/quota.middleware.js';
import logger from '../../utils/logger.js';
import {
  buildThumbnailRelativePath,
  generateThumbnailForFile,
} from '../../services/thumbnail.service.js';
import {
  isVideoFile,
  optimizeVideoForProgressiveStreaming,
} from '../../services/video-stream.service.js';
import { buildUniqueStorageFileName } from '../../services/storage-file-name.service.js';
import { sendTelegramAlert } from '../../services/telegram-alert.service.js';
import JsonStore from '../../storage/json.store.js';
import { config } from '../../config/environment.js';

type MigrationCopyJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

type MigrationCopyJobEntry = {
  sourcePath: string;
  targetPath: string;
  status: MigrationCopyJobStatus;
  size?: number;
  error?: string;
};

type MigrationCopyJob = {
  id: string;
  sourceCompanyId: string;
  targetCompanyId: string;
  status: MigrationCopyJobStatus;
  entries: MigrationCopyJobEntry[];
  createdAt: string;
  updatedAt: string;
  error?: string;
};

type MigrationDeleteJobEntry = {
  filePath: string;
  status: MigrationCopyJobStatus;
  size?: number;
  error?: string;
};

type MigrationDeleteJob = {
  id: string;
  companyId: string;
  status: MigrationCopyJobStatus;
  entries: MigrationDeleteJobEntry[];
  createdAt: string;
  updatedAt: string;
  error?: string;
};

const MAX_MIGRATION_COPY_ENTRIES = 500;
const migrationJobStore = new JsonStore({
  baseDir: path.join(config.storage.root, 'migration-jobs'),
  autoBackup: false,
});
const activeMigrationCopyJobs = new Set<string>();

// Helper: Validar nombre de archivo/folder
function isValidEntryName(name: string) {
  if (!name) return false;
  if (name === '.' || name === '..') return false;
  return !/[\\/]/.test(name);
}

function toEntry(relativeBase: string, name: string, stat: fs.Stats, companyId: string) {
  const relPath = relativeBase ? `${relativeBase}/${name}` : name;
  const type = stat.isDirectory() ? 'folder' : 'file';
  const listUrl = type === 'folder' ? `/api/drive/list?path=${encodeURIComponent(relPath)}` : undefined;
  return {
    name,
    path: relPath,
    type,
    size: stat.isFile() ? stat.size : undefined,
    updatedAt: stat.mtime.toISOString(),
    url: stat.isFile() ? `/files/companies/${companyId}/${relPath}` : undefined,
    listUrl,
  };
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

export async function listEntries(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error: CustomError = new Error('Company ID is required');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }

    // Asegurar estructura de empresa
    await storagePathService.ensureCompanyStructure(companyId);

    // Resolver ruta dentro del espacio de la empresa
    const relativePath = (req.query.path as string) || '';
    const resolved = storagePathService.resolvePath(companyId, relativePath);

    // Validar acceso
    if (!storagePathService.validateAccess(resolved, companyId)) {
      const error: CustomError = new Error('Access denied: invalid path');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }

    const exists = await fs.pathExists(resolved);
    if (!exists) {
      const error: CustomError = new Error('Path not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      const error: CustomError = new Error('Path is not a folder');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const entries = (await fs.readdir(resolved)).filter((name) => !name.startsWith('.'));
    const results = await Promise.all(
      entries.map(async (name) => {
        const entryStat = await fs.stat(path.join(resolved, name));
        const entry = toEntry(relativePath, name, entryStat, companyId);
        const result: Record<string, unknown> = { ...entry };
        if (entry.url) {
          result.urlAbsolute = buildAbsoluteUrl(req, entry.url);
        }
        if (entry.listUrl) {
          result.listUrlAbsolute = buildAbsoluteUrl(req, entry.listUrl);
        }
        return result;
      })
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        path: relativePath || '',
        total: results.length,
        entries: results,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createFolder(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error: CustomError = new Error('Company ID is required');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }

    const { path: parentPath, name } = req.body;

    if (!name || !isValidEntryName(name)) {
      const error: CustomError = new Error('Invalid folder name');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    // Resolver ruta padre
    const relativePath = parentPath || '';
    const resolved = storagePathService.resolvePath(companyId, relativePath);

    // Validar acceso
    if (!storagePathService.validateAccess(resolved, companyId)) {
      const error: CustomError = new Error('Access denied: invalid path');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }

    const parentExists = await fs.pathExists(resolved);
    if (!parentExists) {
      const error: CustomError = new Error('Parent path not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    const target = path.join(resolved, name);

    // Validar que la carpeta de destino también esté dentro del espacio de la empresa
    if (!storagePathService.validateAccess(target, companyId)) {
      const error: CustomError = new Error('Access denied: invalid target path');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }

    await fs.ensureDir(target);

    const newPath = relativePath ? `${relativePath}/${name}` : name;

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        name,
        path: newPath,
        type: 'folder',
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error: CustomError = new Error('Company ID is required');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }

    const { path: parentPath } = req.body;
    const file = req.file;

    if (!file) {
      const error: CustomError = new Error('file is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    if (!isValidEntryName(file.originalname)) {
      const error: CustomError = new Error('Invalid file name');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    // Resolver ruta
    const relativePath = parentPath || '';
    const resolved = storagePathService.resolvePath(companyId, relativePath);

    // Validar acceso
    if (!storagePathService.validateAccess(resolved, companyId)) {
      const error: CustomError = new Error('Access denied: invalid path');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }

    await fs.ensureDir(resolved);

    const MAX_ORDERS_BYTES = 100 * 1024 * 1024; // 100MB
    const MAX_DRIVE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
    const isDriveRoot = relativePath.startsWith('drive');
    const maxAllowedBytes = isDriveRoot ? MAX_DRIVE_BYTES : MAX_ORDERS_BYTES;
    if (file.size > maxAllowedBytes) {
      await fs.remove(file.path).catch(() => {});
      const error: CustomError = new Error('File too large');
      error.statusCode = HTTP_STATUS.REQUEST_TOO_LONG;
      return next(error);
    }

    const storageFileName = buildUniqueStorageFileName(file.originalname, file.path);
    const target = path.join(resolved, storageFileName);

    // Validar acceso al archivo de destino
    if (!storagePathService.validateAccess(target, companyId)) {
      const error: CustomError = new Error('Access denied: invalid target path');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }

    await fs.move(file.path, target, { overwrite: false });

    // Incrementar contador de almacenamiento (Fase 10)
    await incrementStorageUsage(companyId, file.size);

    const videoLike = isVideoFile(file.mimetype, storageFileName);
    let streamStatus: 'ready' | 'unsupported' | 'error' = videoLike ? 'ready' : 'unsupported';
    const streamType = videoLike ? 'progressive-range' : undefined;

    if (videoLike) {
      const optimization = await optimizeVideoForProgressiveStreaming({
        filePath: target,
        fileName: storageFileName,
        mimeType: file.mimetype,
      });

      if (optimization.optimized && optimization.sizeDeltaBytes !== 0) {
        if (optimization.sizeDeltaBytes > 0) {
          await incrementStorageUsage(companyId, optimization.sizeDeltaBytes);
        } else {
          await decrementStorageUsage(companyId, Math.abs(optimization.sizeDeltaBytes));
        }
      }
    }

    const filePath = relativePath ? `${relativePath}/${storageFileName}` : storageFileName;
    const publicUrl = `/files/companies/${companyId}/${filePath}`;
    const streamUrl = videoLike ? publicUrl : undefined;
    let thumbnailUrl: string | undefined;
    let thumbnailStatus: 'ready' | 'pending' | 'unsupported' | 'error' = 'pending';

    const thumbnailResult = await generateThumbnailForFile({
      filePath: target,
      fileName: storageFileName,
      mimeType: file.mimetype,
      outputDir: resolved,
    });

    if (thumbnailResult.status === 'ready' && thumbnailResult.thumbnailName) {
      const thumbPath = buildThumbnailRelativePath(relativePath, thumbnailResult.thumbnailName);
      thumbnailUrl = `/files/companies/${companyId}/${thumbPath}`;
      if (thumbnailResult.sizeBytes && thumbnailResult.sizeBytes > 0) {
        await incrementStorageUsage(companyId, thumbnailResult.sizeBytes);
      }
      thumbnailStatus = 'ready';
    } else if (thumbnailResult.status === 'unsupported') {
      thumbnailStatus = 'unsupported';
    } else if (thumbnailResult.status === 'error') {
      thumbnailStatus = 'error';
    }

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        name: file.originalname,
        path: filePath,
        storageFileName,
        type: 'file',
        size: file.size,
        url: publicUrl,
        urlAbsolute: buildAbsoluteUrl(req, publicUrl),
        streamStatus,
        ...(streamType ? { streamType } : {}),
        ...(streamUrl
          ? {
              streamUrl,
              streamUrlAbsolute: buildAbsoluteUrl(req, streamUrl),
            }
          : {}),
        thumbnailStatus,
        ...(thumbnailUrl ? { thumbnailUrl, thumbnailUrlAbsolute: buildAbsoluteUrl(req, thumbnailUrl) } : {}),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error: CustomError = new Error('Company ID is required');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }

    const bodyPath =
      req.body && typeof req.body === 'object' && typeof (req.body as any).path === 'string'
        ? String((req.body as any).path)
        : '';
    const targetPath = (req.query.path as string) || bodyPath;

    if (!targetPath) {
      const error: CustomError = new Error('path is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const resolved = storagePathService.resolvePath(companyId, targetPath);

    // Validar acceso
    if (!storagePathService.validateAccess(resolved, companyId)) {
      const error: CustomError = new Error('Access denied: invalid path');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }

    const exists = await fs.pathExists(resolved);
    if (!exists) {
      const error: CustomError = new Error('Path not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    // Obtener stats antes de eliminar (Fase 10)
    const stats = await fs.stat(resolved);
    const isFile = stats.isFile();
    const fileSize = isFile ? stats.size : 0;

    await fs.remove(resolved);

    // Decrementar contador de almacenamiento si es un archivo (Fase 10)
    if (isFile && fileSize > 0) {
      await decrementStorageUsage(companyId, fileSize);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Entry deleted',
      data: {
        path: targetPath,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function moveEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error: CustomError = new Error('Company ID is required');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }

    const { from, to } = req.body;

    if (!from || !to) {
      const error: CustomError = new Error('from and to are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const fromResolved = storagePathService.resolvePath(companyId, from);
    const toResolved = storagePathService.resolvePath(companyId, to);

    // Validar acceso a ambas rutas
    if (!storagePathService.validateAccess(fromResolved, companyId)) {
      const error: CustomError = new Error('Access denied: invalid source path');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }

    if (!storagePathService.validateAccess(toResolved, companyId)) {
      const error: CustomError = new Error('Access denied: invalid destination path');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }

    const exists = await fs.pathExists(fromResolved);
    if (!exists) {
      const error: CustomError = new Error('Source not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    await fs.ensureDir(path.dirname(toResolved));
    await fs.move(fromResolved, toResolved, { overwrite: false });

    const publicUrl = `/files/companies/${companyId}/${to}`;

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        from,
        to,
        url: publicUrl,
        urlAbsolute: buildAbsoluteUrl(req, publicUrl),
      },
    });
  } catch (error) {
    next(error);
  }
}

const cleanMigrationPath = (companyId: string, rawPath: string) => {
  let normalizedPath = String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const filesMarker = `files/companies/${companyId}/`;
  const companyMarker = `companies/${companyId}/`;

  if (normalizedPath.startsWith(filesMarker)) {
    normalizedPath = normalizedPath.slice(filesMarker.length);
  }
  if (normalizedPath.startsWith(companyMarker)) {
    normalizedPath = normalizedPath.slice(companyMarker.length);
  }

  return normalizedPath;
};

const buildMigrationJobId = () =>
  `file-migration-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getMigrationJobKey = (jobId: string) => `order-file-${jobId}`;
const getDeleteMigrationJobKey = (jobId: string) => `order-file-delete-${jobId}`;

const saveMigrationCopyJob = (job: MigrationCopyJob) =>
  migrationJobStore.set(getMigrationJobKey(job.id), job);

const getMigrationCopyJob = (jobId: string) =>
  migrationJobStore.get<MigrationCopyJob>(getMigrationJobKey(jobId));

export const getMigrationCopyJobSnapshot = (jobId: string) => getMigrationCopyJob(jobId);

const saveMigrationDeleteJob = (job: MigrationDeleteJob) =>
  migrationJobStore.set(getDeleteMigrationJobKey(job.id), job);

const getMigrationDeleteJob = (jobId: string) =>
  migrationJobStore.get<MigrationDeleteJob>(getDeleteMigrationJobKey(jobId));

const getSuperAdminTargetCompanyId = (req: Request) => {
  const targetCompanyId = req.companyId;
  if (!targetCompanyId) {
    const error: CustomError = new Error('Company ID is required');
    error.statusCode = HTTP_STATUS.UNAUTHORIZED;
    throw error;
  }
  if (req.auth?.role !== 'super-admin') {
    const error: CustomError = new Error('Super admin role is required');
    error.statusCode = HTTP_STATUS.FORBIDDEN;
    throw error;
  }
  return targetCompanyId;
};

const copyCompanyFileEntry = async (params: {
  sourceCompanyId: string;
  targetCompanyId: string;
  sourcePath: string;
  targetPath: string;
}) => {
  const sourceResolved = storagePathService.resolvePath(
    params.sourceCompanyId,
    params.sourcePath
  );
  const targetResolved = storagePathService.resolvePath(
    params.targetCompanyId,
    params.targetPath
  );

  if (!storagePathService.validateAccess(sourceResolved, params.sourceCompanyId)) {
    const error: CustomError = new Error('Access denied: invalid source path');
    error.statusCode = HTTP_STATUS.FORBIDDEN;
    throw error;
  }
  if (!storagePathService.validateAccess(targetResolved, params.targetCompanyId)) {
    const error: CustomError = new Error('Access denied: invalid target path');
    error.statusCode = HTTP_STATUS.FORBIDDEN;
    throw error;
  }

  const sourceExists = await fs.pathExists(sourceResolved);
  if (!sourceExists) {
    const error: CustomError = new Error('Source not found');
    error.statusCode = HTTP_STATUS.NOT_FOUND;
    throw error;
  }

  const sourceStats = await fs.stat(sourceResolved);
  if (!sourceStats.isFile()) {
    const error: CustomError = new Error('Source must be a file');
    error.statusCode = HTTP_STATUS.BAD_REQUEST;
    throw error;
  }

  await storagePathService.ensureCompanyStructure(params.targetCompanyId);
  await fs.ensureDir(path.dirname(targetResolved));

  const targetExists = await fs.pathExists(targetResolved);
  let createdTarget = false;
  if (targetExists) {
    const targetStats = await fs.stat(targetResolved);
    if (targetStats.size !== sourceStats.size) {
      const error: CustomError = new Error('Target already exists with different size');
      error.statusCode = HTTP_STATUS.CONFLICT;
      throw error;
    }
  } else {
    await fs.copy(sourceResolved, targetResolved, { overwrite: false });
    await incrementStorageUsage(params.targetCompanyId, sourceStats.size);
    createdTarget = true;
  }

  return { created: createdTarget, size: sourceStats.size };
};

const deleteCompanyFileEntry = async (params: {
  companyId: string;
  filePath: string;
}) => {
  const resolved = storagePathService.resolvePath(params.companyId, params.filePath);

  if (!storagePathService.validateAccess(resolved, params.companyId)) {
    const error: CustomError = new Error('Access denied: invalid target path');
    error.statusCode = HTTP_STATUS.FORBIDDEN;
    throw error;
  }

  const exists = await fs.pathExists(resolved);
  if (!exists) {
    return { deleted: false, size: 0 };
  }

  const stats = await fs.stat(resolved);
  const fileSize = stats.isFile() ? stats.size : 0;
  await fs.remove(resolved);
  if (fileSize > 0) {
    await decrementStorageUsage(params.companyId, fileSize);
  }
  return { deleted: true, size: fileSize };
};

async function runMigrationCopyJob(jobId: string) {
  if (activeMigrationCopyJobs.has(jobId)) return;
  const job = await getMigrationCopyJob(jobId);
  if (!job) return;
  if (job.status === 'succeeded' || job.status === 'failed') return;
  activeMigrationCopyJobs.add(jobId);

  try {
    job.status = 'running';
    job.updatedAt = new Date().toISOString();
    await saveMigrationCopyJob(job);

    for (const entry of job.entries) {
      if (entry.status === 'succeeded') continue;
      try {
        entry.status = 'running';
        job.updatedAt = new Date().toISOString();
        await saveMigrationCopyJob(job);
        const copiedEntry = await copyCompanyFileEntry({
          sourceCompanyId: job.sourceCompanyId,
          targetCompanyId: job.targetCompanyId,
          sourcePath: entry.sourcePath,
          targetPath: entry.targetPath,
        });
        entry.status = 'succeeded';
        entry.size = copiedEntry.size;
        job.updatedAt = new Date().toISOString();
        await saveMigrationCopyJob(job);
      } catch (error) {
        entry.status = 'failed';
        entry.error = error instanceof Error ? error.message : 'Unknown error';
        job.status = 'failed';
        job.error = entry.error;
        job.updatedAt = new Date().toISOString();
        await saveMigrationCopyJob(job);
        break;
      }
    }

    if (job.status !== 'failed') {
      job.status = 'succeeded';
    }
    job.updatedAt = new Date().toISOString();
    await saveMigrationCopyJob(job);
    await sendTelegramAlert({
      dedupeKey: `order-migration-files-${job.id}`,
      message: `Migración de archivos ${job.status}: ${job.sourceCompanyId} -> ${job.targetCompanyId}. Archivos: ${job.entries.length}`,
    });
  } finally {
    activeMigrationCopyJobs.delete(jobId);
  }
}

async function runMigrationDeleteJob(jobId: string) {
  if (activeMigrationCopyJobs.has(jobId)) return;
  const job = await getMigrationDeleteJob(jobId);
  if (!job) return;
  if (job.status === 'succeeded' || job.status === 'failed') return;
  activeMigrationCopyJobs.add(jobId);

  try {
    job.status = 'running';
    job.updatedAt = new Date().toISOString();
    await saveMigrationDeleteJob(job);

    for (const entry of job.entries) {
      if (entry.status === 'succeeded') continue;
      try {
        entry.status = 'running';
        job.updatedAt = new Date().toISOString();
        await saveMigrationDeleteJob(job);
        const deletedEntry = await deleteCompanyFileEntry({
          companyId: job.companyId,
          filePath: entry.filePath,
        });
        entry.status = 'succeeded';
        entry.size = deletedEntry.size;
        job.updatedAt = new Date().toISOString();
        await saveMigrationDeleteJob(job);
      } catch (error) {
        entry.status = 'failed';
        entry.error = error instanceof Error ? error.message : 'Unknown error';
        job.status = 'failed';
        job.error = entry.error;
        job.updatedAt = new Date().toISOString();
        await saveMigrationDeleteJob(job);
        break;
      }
    }

    if (job.status !== 'failed') {
      job.status = 'succeeded';
    }
    job.updatedAt = new Date().toISOString();
    await saveMigrationDeleteJob(job);
    await sendTelegramAlert({
      dedupeKey: `order-migration-delete-${job.id}`,
      message: `Limpieza de archivos ${job.status}: ${job.companyId}. Archivos: ${job.entries.length}`,
    });
  } finally {
    activeMigrationCopyJobs.delete(jobId);
  }
}

export async function copyCompanyEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const targetCompanyId = getSuperAdminTargetCompanyId(req);
    const sourceCompanyId = String(req.body?.sourceCompanyId || '').trim();
    const sourcePath = cleanMigrationPath(sourceCompanyId, String(req.body?.sourcePath || ''));
    const targetPath = cleanMigrationPath(targetCompanyId, String(req.body?.targetPath || ''));

    if (!sourceCompanyId || !sourcePath || !targetPath) {
      const error: CustomError = new Error('sourceCompanyId, sourcePath and targetPath are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const copiedEntry = await copyCompanyFileEntry({
      sourceCompanyId,
      targetCompanyId,
      sourcePath,
      targetPath,
    });
    const publicUrl = `/files/companies/${targetCompanyId}/${targetPath}`;
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        sourceCompanyId,
        targetCompanyId,
        sourcePath,
        targetPath,
        size: copiedEntry.size,
        created: copiedEntry.created,
        url: publicUrl,
        urlAbsolute: buildAbsoluteUrl(req, publicUrl),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function copyCompanyEntries(req: Request, res: Response, next: NextFunction) {
  try {
    const targetCompanyId = getSuperAdminTargetCompanyId(req);
    const sourceCompanyId = String(req.body?.sourceCompanyId || '').trim();
    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    if (!sourceCompanyId || rawEntries.length === 0) {
      const error: CustomError = new Error('sourceCompanyId and entries are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (rawEntries.length > MAX_MIGRATION_COPY_ENTRIES) {
      const error: CustomError = new Error('Too many migration entries');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const entries = rawEntries.map((rawEntry: Record<string, unknown>) => ({
      sourcePath: cleanMigrationPath(sourceCompanyId, String(rawEntry.sourcePath || '')),
      targetPath: cleanMigrationPath(targetCompanyId, String(rawEntry.targetPath || '')),
      status: 'queued' as const,
    })).filter((entry) => entry.sourcePath && entry.targetPath);

    if (entries.length !== rawEntries.length) {
      const error: CustomError = new Error('Invalid migration entry path');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const now = new Date().toISOString();
    const job: MigrationCopyJob = {
      id: buildMigrationJobId(),
      sourceCompanyId,
      targetCompanyId,
      status: 'queued',
      entries,
      createdAt: now,
      updatedAt: now,
    };
    await saveMigrationCopyJob(job);
    setImmediate(() => {
      runMigrationCopyJob(job.id).catch((error) => {
        logger.error('Migration copy job failed', error);
      });
    });

    res.status(HTTP_STATUS.ACCEPTED).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
}

export async function getCopyCompanyEntriesJob(req: Request, res: Response, next: NextFunction) {
  try {
    getSuperAdminTargetCompanyId(req);
    const jobId = String(req.params.jobId || '').trim();
    const job = await getMigrationCopyJob(jobId);
    if (!job) {
      const error: CustomError = new Error('Migration copy job not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    if (job.status === 'queued' || job.status === 'running') {
      setImmediate(() => {
        runMigrationCopyJob(job.id).catch((error) => {
          logger.error('Migration copy job resume failed', error);
        });
      });
    }
    res.status(HTTP_STATUS.OK).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
}

export async function deleteCompanyEntries(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = getSuperAdminTargetCompanyId(req);
    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    if (rawEntries.length === 0) {
      const error: CustomError = new Error('entries are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (rawEntries.length > MAX_MIGRATION_COPY_ENTRIES) {
      const error: CustomError = new Error('Too many migration entries');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const entries = rawEntries
      .map((rawEntry: Record<string, unknown>) => ({
        filePath: cleanMigrationPath(companyId, String(rawEntry.filePath || '')),
        status: 'queued' as const,
      }))
      .filter((entry) => entry.filePath);

    if (entries.length !== rawEntries.length) {
      const error: CustomError = new Error('Invalid migration entry path');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const now = new Date().toISOString();
    const job: MigrationDeleteJob = {
      id: buildMigrationJobId(),
      companyId,
      status: 'queued',
      entries,
      createdAt: now,
      updatedAt: now,
    };
    await saveMigrationDeleteJob(job);
    setImmediate(() => {
      runMigrationDeleteJob(job.id).catch((error) => {
        logger.error('Migration delete job failed', error);
      });
    });

    res.status(HTTP_STATUS.ACCEPTED).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
}

export async function getDeleteCompanyEntriesJob(req: Request, res: Response, next: NextFunction) {
  try {
    getSuperAdminTargetCompanyId(req);
    const jobId = String(req.params.jobId || '').trim();
    const job = await getMigrationDeleteJob(jobId);
    if (!job) {
      const error: CustomError = new Error('Migration delete job not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    if (job.status === 'queued' || job.status === 'running') {
      setImmediate(() => {
        runMigrationDeleteJob(job.id).catch((error) => {
          logger.error('Migration delete job resume failed', error);
        });
      });
    }
    res.status(HTTP_STATUS.OK).json({ success: true, data: job });
  } catch (error) {
    next(error);
  }
}

export async function getInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error: CustomError = new Error('Company ID is required');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }

    const targetPath = req.query.path as string;

    if (!targetPath) {
      const error: CustomError = new Error('path is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const resolved = storagePathService.resolvePath(companyId, targetPath);

    // Validar acceso
    if (!storagePathService.validateAccess(resolved, companyId)) {
      const error: CustomError = new Error('Access denied: invalid path');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }

    const stat = await fs.stat(resolved);
    const name = path.basename(resolved);

    const parent = path.dirname(targetPath).replace(/\\/g, '/');
    const base = parent === '.' ? '' : parent;

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: (() => {
        const entry = toEntry(base, name, stat, companyId);
        const result: Record<string, unknown> = { ...entry };
        if (entry.url) {
          result.urlAbsolute = buildAbsoluteUrl(req, entry.url);
        }
        if (entry.listUrl) {
          result.listUrlAbsolute = buildAbsoluteUrl(req, entry.listUrl);
        }
        return result;
      })(),
    });
  } catch (error) {
    next(error);
  }
}
