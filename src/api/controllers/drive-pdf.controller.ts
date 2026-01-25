import { Request, Response, NextFunction } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { HTTP_STATUS } from '../../config/constants.js';
import { CustomError } from '../middlewares/errorHandler.js';
import { resolveDrivePath } from '../../storage/drive.store.js';
import { config } from '../../config/environment.js';
import {
  getPdfInfo,
  renderPdfPageToPng,
  renderPdfPageToPngWithGrid,
} from '../../pdf/render.service.js';

function getPdfPathFromRequest(req: Request) {
  const { url, path: pathParam } = req.query as { url?: string; path?: string };

  if (pathParam) {
    const { resolved, normalized } = resolveDrivePath(pathParam);
    return { resolved, normalized };
  }

  if (!url) {
    throw new Error('url or path is required');
  }

  const base = `${req.protocol}://${req.get('host') || 'localhost'}`;
  const parsed = new URL(url, base);

  if (parsed.origin !== base) {
    throw new Error('URL not allowed');
  }

  const publicBase = config.drive.publicBaseUrl.replace(/\/+$/, '');
  if (!parsed.pathname.startsWith(publicBase + '/')) {
    throw new Error('URL not allowed');
  }

  let relative = parsed.pathname.slice(publicBase.length + 1);
  relative = decodePath(relative);
  const { resolved, normalized } = resolveDrivePath(relative);
  return { resolved, normalized };
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

async function resolveExistingPdfPath(resolved: string, normalized: string) {
  if (await fs.pathExists(resolved)) {
    return { resolved, normalized };
  }

  const candidates = [normalized.normalize('NFC'), normalized.normalize('NFD')].filter(
    (candidate, index, arr) => candidate && arr.indexOf(candidate) === index
  );

  for (const candidate of candidates) {
    const alt = resolveDrivePath(candidate);
    if (await fs.pathExists(alt.resolved)) {
      return alt;
    }
  }

  return { resolved, normalized };
}

export async function getPdfMetadata(req: Request, res: Response, next: NextFunction) {
  try {
    const initial = getPdfPathFromRequest(req);
    const { resolved, normalized } = await resolveExistingPdfPath(
      initial.resolved,
      initial.normalized
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
    const initial = getPdfPathFromRequest(req);
    const { resolved, normalized } = await resolveExistingPdfPath(
      initial.resolved,
      initial.normalized
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
    const initial = getPdfPathFromRequest(req);
    const { resolved, normalized } = await resolveExistingPdfPath(
      initial.resolved,
      initial.normalized
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
