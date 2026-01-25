import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import {
  buildPublicUrl,
  ensureDriveRoot,
  isValidEntryName,
  resolveDrivePath,
} from '../../storage/drive.store.js';
import { config } from '../../config/environment.js';

function toEntry(relativeBase: string, name: string, stat: fs.Stats) {
  const relPath = relativeBase ? `${relativeBase}/${name}` : name;
  const type = stat.isDirectory() ? 'folder' : 'file';
  const listUrl = type === 'folder' ? `/api/drive/list?path=${encodeURIComponent(relPath)}` : undefined;
  return {
    name,
    path: relPath,
    type,
    size: stat.isFile() ? stat.size : undefined,
    updatedAt: stat.mtime.toISOString(),
    url: stat.isFile() ? buildPublicUrl(relPath) : undefined,
    listUrl,
  };
}

function buildAbsoluteUrl(req: Request, relativeUrl: string) {
  const host = req.get('host');
  if (!host) return relativeUrl;
  const proto = req.protocol;
  return `${proto}://${host}${relativeUrl}`;
}

export async function listEntries(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDriveRoot();
    const { resolved, normalized } = resolveDrivePath(req.query.path as string | undefined);

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
        const entry = toEntry(normalized, name, entryStat);
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
        path: normalized || '',
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
    await ensureDriveRoot();
    const { path: parentPath, name } = req.body;

    if (!name || !isValidEntryName(name)) {
      const error: CustomError = new Error('Invalid folder name');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const { resolved, normalized } = resolveDrivePath(parentPath);
    const parentExists = await fs.pathExists(resolved);
    if (!parentExists) {
      const error: CustomError = new Error('Parent path not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const target = path.join(resolved, name);
    await fs.ensureDir(target);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        name,
        path: normalized ? `${normalized}/${name}` : name,
        type: 'folder',
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDriveRoot();
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

    const { resolved, normalized } = resolveDrivePath(parentPath);
    await fs.ensureDir(resolved);

    const target = path.join(resolved, file.originalname);
    await fs.writeFile(target, file.buffer);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        name: file.originalname,
        path: normalized ? `${normalized}/${file.originalname}` : file.originalname,
        type: 'file',
        size: file.size,
        url: buildPublicUrl(
          normalized ? `${normalized}/${file.originalname}` : file.originalname
        ),
        urlAbsolute: buildAbsoluteUrl(
          req,
          buildPublicUrl(normalized ? `${normalized}/${file.originalname}` : file.originalname)
        ),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteEntry(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDriveRoot();
    const { path: targetPath } = req.query;
    const { resolved, normalized } = resolveDrivePath(targetPath as string | undefined);

    if (!normalized) {
      const error: CustomError = new Error('path is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const exists = await fs.pathExists(resolved);
    if (!exists) {
      const error: CustomError = new Error('Path not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    await fs.remove(resolved);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Entry deleted',
      data: {
        path: normalized,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function moveEntry(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDriveRoot();
    const { from, to } = req.body;

    if (!from || !to) {
      const error: CustomError = new Error('from and to are required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const { resolved: fromResolved, normalized: fromNormalized } = resolveDrivePath(from);
    const { resolved: toResolved, normalized: toNormalized } = resolveDrivePath(to);

    if (!fromNormalized || !toNormalized) {
      const error: CustomError = new Error('from and to must be valid paths');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
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

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        from: fromNormalized,
        to: toNormalized,
        url: buildPublicUrl(toNormalized),
        urlAbsolute: buildAbsoluteUrl(req, buildPublicUrl(toNormalized)),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getInfo(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDriveRoot();
    const { path: targetPath } = req.query;
    const { resolved, normalized } = resolveDrivePath(targetPath as string | undefined);

    if (!normalized) {
      const error: CustomError = new Error('path is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const stat = await fs.stat(resolved);
    const name = path.basename(resolved);

    const parent = path.dirname(normalized).replace(/\\/g, '/');
    const base = parent === '.' ? '' : parent;
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: (() => {
        const entry = toEntry(base, name, stat);
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
