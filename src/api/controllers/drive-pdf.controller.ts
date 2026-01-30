import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import { storagePathService } from '../../services/storage-path.service.js';
import {
  getPdfInfo,
  renderPdfPageToPng,
  renderPdfPageToPngWithGrid,
} from '../../pdf/render.service.js';

function getPdfPathFromRequest(req: Request) {
  const companyId = req.companyId;
  if (!companyId) {
    throw new Error('Company ID is required');
  }

  const { path: pathParam } = req.query as { path?: string };

  if (!pathParam) {
    throw new Error('path is required');
  }

  const resolved = storagePathService.resolvePath(companyId, pathParam);

  if (!storagePathService.validateAccess(resolved, companyId)) {
    throw new Error('Access denied: invalid path');
  }

  return { resolved, normalized: pathParam };
}

function ensurePdfExtension(filePath: string) {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

function decodePath(value: string) {
  let decoded = value;
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

async function resolveExistingPdfPath(
  resolved: string,
  normalized: string,
  companyId: string
) {
  if (await fs.pathExists(resolved)) {
    return { resolved, normalized };
  }

  const candidates = [normalized.normalize('NFC'), normalized.normalize('NFD')].filter(
    (candidate, index, arr) => candidate && arr.indexOf(candidate) === index
  );

  for (const candidate of candidates) {
    const altResolved = storagePathService.resolvePath(companyId, candidate);
    if (await fs.pathExists(altResolved)) {
      return { resolved: altResolved, normalized: candidate };
    }
  }

  return { resolved, normalized };
}

export async function getPdfMetadata(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error: CustomError = new Error('Company ID is required');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }

    const initial = getPdfPathFromRequest(req);
    const { resolved, normalized } = await resolveExistingPdfPath(
      initial.resolved,
      initial.normalized,
      companyId
    );

    if (!normalized || !ensurePdfExtension(resolved)) {
      const error: CustomError = new Error('Only PDF files are allowed');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const exists = await fs.pathExists(resolved);
    if (!exists) {
      const error: CustomError = new Error('File not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    const info = await getPdfInfo(resolved);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        path: normalized,
        pages: info.pages,
      },
    });
  } catch (error) {
    const err: CustomError = error instanceof Error ? error : new Error('Invalid request');
    if (!err.statusCode) {
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
    }
    next(err);
  }
}

export async function getPdfPageImage(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error: CustomError = new Error('Company ID is required');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }

    const initial = getPdfPathFromRequest(req);
    const { resolved, normalized } = await resolveExistingPdfPath(
      initial.resolved,
      initial.normalized,
      companyId
    );
    const page = parseInt(String(req.query.page || '1'), 10);
    const scale = parseFloat(String(req.query.scale || '1.5'));

    if (!normalized || !ensurePdfExtension(resolved)) {
      const error: CustomError = new Error('Only PDF files are allowed');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const exists = await fs.pathExists(resolved);
    if (!exists) {
      const error: CustomError = new Error('File not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    const { cacheFile } = await renderPdfPageToPng(resolved, { page, scale });
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-PDF-Path', normalized);
    res.setHeader('X-PDF-Page', String(page));
    res.status(HTTP_STATUS.OK).sendFile(path.resolve(cacheFile));
  } catch (error) {
    const err: CustomError = error instanceof Error ? error : new Error('Invalid request');
    if (!err.statusCode) {
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
    }
    next(err);
  }
}

export async function getPdfPagePreviewGrid(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error: CustomError = new Error('Company ID is required');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }

    const initial = getPdfPathFromRequest(req);
    const { resolved, normalized } = await resolveExistingPdfPath(
      initial.resolved,
      initial.normalized,
      companyId
    );
    const page = parseInt(String(req.query.page || '1'), 10);
    const scale = parseFloat(String(req.query.scale || '1.5'));
    const gridSize = parseInt(String(req.query.grid || '50'), 10);

    if (!normalized || !ensurePdfExtension(resolved)) {
      const error: CustomError = new Error('Only PDF files are allowed');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    const exists = await fs.pathExists(resolved);
    if (!exists) {
      const error: CustomError = new Error('File not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }

    const { cacheFile } = await renderPdfPageToPngWithGrid(resolved, {
      page,
      scale,
      gridSize,
    });
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-PDF-Path', normalized);
    res.setHeader('X-PDF-Page', String(page));
    res.status(HTTP_STATUS.OK).sendFile(path.resolve(cacheFile));
  } catch (error) {
    const err: CustomError = error instanceof Error ? error : new Error('Invalid request');
    if (!err.statusCode) {
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
    }
    next(err);
  }
}
