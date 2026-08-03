/**
 * Descarga en ZIP de una carpeta del drive.
 *
 * El Portal firma un token de vida corta y manda al navegador DIRECTO acá: los
 * archivos están en el disco de lila, así que comprimirlos es instantáneo,
 * mientras que hacerlo en una función de Vercel obligaría a bajarlos por la red
 * (~70 s para 15 MB) y moriría en el timeout.
 *
 * El ZIP se streamea mientras se arma: no se materializa en disco ni en RAM, y
 * el navegador muestra su propia barra de descarga.
 */

import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs-extra';
import jwt from 'jsonwebtoken';
import archiver from 'archiver';
import { getFolderModel, getMediaModel } from '../../database/models.js';
import { config } from '../../config/environment.js';
import {
  buildFolderPathResolver,
  resolveMediaAbsolutePath,
} from '../../services/order-export.service.js';
import {
  buildRelativeEntryName,
  collectFolderSubtree,
} from '../../services/drive-folder-export.helpers.js';
import logger from '../../utils/logger.js';

const SCOPE = 'drive-export';

type DriveExportClaims = {
  companyId: string;
  resourceId: string;
  folderId: string;
  scope: string;
};

/** El scope es lo que impide que un token de `/print` —mismo secreto— sirva acá. */
const verifyToken = (raw: unknown): DriveExportClaims | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const decoded = jwt.verify(raw, config.security.jwtSecret) as Partial<DriveExportClaims>;
    if (decoded.scope !== SCOPE) return null;
    if (!decoded.companyId || !decoded.resourceId || !decoded.folderId) return null;
    return decoded as DriveExportClaims;
  } catch {
    return null;
  }
};

export async function exportDriveFolder(req: Request, res: Response, next: NextFunction) {
  const claims = verifyToken(req.query.token);
  if (!claims) {
    res.status(401).json({ message: 'Enlace de descarga invalido o vencido' });
    return;
  }

  const { companyId, resourceId, folderId } = claims;

  try {
    const [FolderModel, MediaModel] = await Promise.all([getFolderModel(), getMediaModel()]);
    const [folders, medias] = await Promise.all([
      FolderModel.find({ companyId, resourceId, status: 'ACTIVE' }).lean(),
      MediaModel.find({ companyId, resourceId, status: 'ACTIVE' }).lean(),
    ]);

    const subtree = collectFolderSubtree(folders as Record<string, unknown>[], folderId);
    if (subtree.size === 0) {
      res.status(404).json({ message: 'Carpeta no encontrada' });
      return;
    }

    const resolveFolderPath = buildFolderPathResolver(folders as Record<string, unknown>[]);
    const rootPath = resolveFolderPath(folderId);
    const entries = await collectEntries({ medias, subtree, resolveFolderPath, rootPath, companyId });

    if (entries.length === 0) {
      res.status(404).json({ message: 'La carpeta no tiene archivos para descargar' });
      return;
    }

    const zipName = `${rootPath.split('/').pop() || 'carpeta'}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipName)}"`);
    res.setHeader('Cache-Control', 'no-store');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (error) => {
      logger.error('[drive-export] Error armando el ZIP', { companyId, folderId, error });
      res.destroy();
    });
    // Si el visitante cancela la descarga, no seguir leyendo archivos.
    res.on('close', () => {
      if (!res.writableEnded) archive.abort();
    });

    archive.pipe(res);
    entries.forEach((entry) => archive.file(entry.absolutePath, { name: entry.entryName }));
    await archive.finalize();
  } catch (error) {
    next(error);
  }
}

/** Archivos del subárbol que existen en disco, con su ruta dentro del ZIP. */
async function collectEntries({
  medias,
  subtree,
  resolveFolderPath,
  rootPath,
  companyId,
}: {
  medias: Record<string, unknown>[];
  subtree: Set<string>;
  resolveFolderPath: (folderId?: string) => string;
  rootPath: string;
  companyId: string;
}) {
  const usedNames = new Set<string>();
  const entries: { absolutePath: string; entryName: string }[] = [];

  for (const media of medias) {
    const mediaFolderId = String(media.folderId ?? '');
    if (!subtree.has(mediaFolderId)) continue;

    const mediaUrl = String(media.url ?? '');
    if (!mediaUrl) continue;

    const absolutePath = resolveMediaAbsolutePath(mediaUrl, companyId);
    if (!absolutePath || !(await fs.pathExists(absolutePath))) {
      logger.warn('[drive-export] Media sin archivo local, se omite', {
        companyId,
        mediaId: String(media._id ?? ''),
      });
      continue;
    }

    const fileName = String(media.name ?? path.basename(absolutePath));
    let entryName = buildRelativeEntryName({
      folderPath: resolveFolderPath(mediaFolderId),
      rootPath,
      fileName,
    });

    // Dos archivos con el mismo nombre en la misma carpeta: el ZIP se abriría
    // con uno solo si no se desambigua.
    let suffix = 2;
    while (usedNames.has(entryName)) {
      const parsed = path.parse(entryName);
      entryName = path.join(parsed.dir, `${parsed.name} (${suffix})${parsed.ext}`);
      suffix += 1;
    }
    usedNames.add(entryName);

    entries.push({ absolutePath, entryName });
  }

  return entries;
}
