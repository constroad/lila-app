import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import { storagePathService } from '../../services/storage-path.service.js';
import { incrementStorageUsage, decrementStorageUsage } from '../../middleware/quota.middleware.js';

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

    const target = path.join(resolved, file.originalname);

    // Validar acceso al archivo de destino
    if (!storagePathService.validateAccess(target, companyId)) {
      const error: CustomError = new Error('Access denied: invalid target path');
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }

    await fs.move(file.path, target, { overwrite: true });

    // Incrementar contador de almacenamiento (Fase 10)
    await incrementStorageUsage(companyId, file.size);

    const filePath = relativePath ? `${relativePath}/${file.originalname}` : file.originalname;
    const publicUrl = `/files/companies/${companyId}/${filePath}`;

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        name: file.originalname,
        path: filePath,
        type: 'file',
        size: file.size,
        url: publicUrl,
        urlAbsolute: buildAbsoluteUrl(req, publicUrl),
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
