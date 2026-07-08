/**
 * Order Export Service
 *
 * Genera el ZIP de archivos de un pedido (vales, fotos de carga, documentos)
 * para el "Panel de exportación" del reporte público del Portal.
 *
 * Los archivos viven en el disco de lila (storage multi-tenant); las medias
 * y folders se leen de la DB compartida con el Portal (loose models). El
 * estado del job se persiste en `order.exportJob` — el Portal lo lee vía
 * su propio API (`GET /api/order/:id`) para pintar progreso/descarga.
 */

import path from 'path';
import fs from 'fs-extra';
import archiver from 'archiver';
import { Types } from 'mongoose';
import { getFolderModel, getMediaModel, getOrderModel } from '../database/models.js';
import { storagePathService } from './storage-path.service.js';
import logger from '../utils/logger.js';

const EXPORT_TTL_HOURS = 24;
const EXPORTS_MODULE = 'temp';
const EXPORTS_SUBDIR = 'order-exports';

type ExportRequestResult =
  | { ok: true }
  | { ok: false; code: 'not_found' | 'busy' | 'empty' };

type ExportFileResult =
  | { ok: true; absolutePath: string; fileName: string }
  | { ok: false; code: 'not_found' | 'not_ready' };

type LooseDoc = Record<string, unknown>;

const isValidObjectId = (value: string) => Types.ObjectId.isValid(value);

const sanitizeName = (name: string) => name.replace(/[\\/:"*?<>|]+/g, '_').trim();

/** Ruta absoluta del ZIP de un pedido dentro del storage de su company. */
const buildZipPath = (companyId: string, orderId: string) =>
  storagePathService.resolvePath(
    companyId,
    path.join(EXPORTS_MODULE, EXPORTS_SUBDIR, `pedido-${orderId}.zip`)
  );

/**
 * Mapea la URL pública de una media (`…/files/companies/<companyId>/…`) a su
 * ruta absoluta en disco, validada dentro del root de la company.
 */
export const resolveMediaAbsolutePath = (mediaUrl: string, companyId: string): string | null => {
  try {
    const pathname = new URL(mediaUrl, 'http://localhost').pathname;
    const marker = `/files/companies/${companyId}/`;
    if (!pathname.startsWith(marker)) return null;
    const relative = decodeURIComponent(pathname.slice(marker.length));
    const absolute = storagePathService.resolvePath(companyId, relative);
    if (!storagePathService.validateAccess(absolute, companyId)) return null;
    return absolute;
  } catch {
    return null;
  }
};

/** Path de carpeta dentro del zip: cadena de folders del Portal o el type de la media. */
export const buildFolderPathResolver = (folders: LooseDoc[]) => {
  const folderById = new Map(
    folders.map((folder) => [String(folder._id ?? ''), folder])
  );

  const resolve = (folderId: string | undefined, depth = 0): string => {
    if (!folderId || depth > 10) return '';
    const folder = folderById.get(String(folderId));
    if (!folder) return '';
    const parentPath = resolve(folder.parentId as string | undefined, depth + 1);
    const current = sanitizeName(String(folder.name ?? ''));
    if (!current) return parentPath;
    return parentPath ? `${parentPath}/${current}` : current;
  };

  return resolve;
};

const nowIso = () => new Date().toISOString();

const setExportJob = async (orderId: string, exportJob: LooseDoc | null) => {
  const OrderModel = await getOrderModel();
  await OrderModel.updateOne(
    { _id: orderId },
    exportJob ? { $set: { exportJob } } : { $unset: { exportJob: 1 } }
  );
};

/**
 * Construye el ZIP del pedido de forma síncrona (archivos locales: rápido) y
 * deja `order.exportJob` en `done` (o `error`). Reemplaza el ZIP anterior.
 */
export async function requestOrderExport(orderId: string): Promise<ExportRequestResult> {
  if (!isValidObjectId(orderId)) return { ok: false, code: 'not_found' };

  const OrderModel = await getOrderModel();
  const order = (await OrderModel.findById(orderId).lean()) as LooseDoc | null;
  if (!order || !order.companyId) return { ok: false, code: 'not_found' };

  const companyId = String(order.companyId);
  const currentJob = order.exportJob as LooseDoc | undefined;
  if (currentJob && ['queued', 'running'].includes(String(currentJob.status))) {
    return { ok: false, code: 'busy' };
  }

  const jobId = `${orderId}-${Date.now()}`;
  await setExportJob(orderId, {
    id: jobId,
    status: 'running',
    progress: 0,
    startedAt: nowIso(),
  });

  try {
    const [MediaModel, FolderModel] = await Promise.all([getMediaModel(), getFolderModel()]);
    const [medias, folders] = await Promise.all([
      MediaModel.find({ companyId, resourceId: orderId, status: 'ACTIVE' }).lean() as Promise<LooseDoc[]>,
      FolderModel.find({ companyId, resourceId: orderId, status: 'ACTIVE' }).lean() as Promise<LooseDoc[]>,
    ]);

    // Resolver TODO a disco antes de abrir el zip: si no hay nada exportable
    // no se crea archivo (y no queda un stream/abort a medio manejar).
    const resolveFolderPath = buildFolderPathResolver(folders);
    const usedNames = new Set<string>();
    const entries: { absolutePath: string; entryName: string }[] = [];
    for (const media of medias) {
      const mediaUrl = String(media.url ?? '');
      if (!mediaUrl) continue;
      const absolutePath = resolveMediaAbsolutePath(mediaUrl, companyId);
      if (!absolutePath || !(await fs.pathExists(absolutePath))) {
        logger.warn('[order-export] Media sin archivo local, se omite del ZIP', {
          orderId,
          mediaId: String(media._id ?? ''),
        });
        continue;
      }

      const folderPath =
        resolveFolderPath(media.folderId as string | undefined) ||
        sanitizeName(String(media.type ?? ''));
      const baseName = sanitizeName(String(media.name ?? path.basename(absolutePath)));
      let entryName = folderPath ? `${folderPath}/${baseName}` : baseName;
      let dedupe = 1;
      while (usedNames.has(entryName)) {
        const ext = path.extname(baseName);
        const stem = path.basename(baseName, ext);
        const candidate = `${stem} (${dedupe})${ext}`;
        entryName = folderPath ? `${folderPath}/${candidate}` : candidate;
        dedupe += 1;
      }
      usedNames.add(entryName);
      entries.push({ absolutePath, entryName });
    }

    if (entries.length === 0) {
      await setExportJob(orderId, {
        id: jobId,
        status: 'error',
        error: 'El pedido no tiene archivos para exportar',
        startedAt: nowIso(),
        finishedAt: nowIso(),
      });
      return { ok: false, code: 'empty' };
    }

    const zipPath = buildZipPath(companyId, orderId);
    await fs.ensureDir(path.dirname(zipPath));
    await fs.remove(zipPath);

    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    const archiveDone = new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', reject);
      output.on('error', reject);
    });
    archive.pipe(output);
    for (const entry of entries) {
      archive.file(entry.absolutePath, { name: entry.entryName });
    }
    await archive.finalize();
    await archiveDone;

    const stat = await fs.stat(zipPath);
    const expiresAt = new Date(Date.now() + EXPORT_TTL_HOURS * 60 * 60 * 1000).toISOString();
    const obra = sanitizeName(String(order.obra ?? 'pedido'));
    await setExportJob(orderId, {
      id: jobId,
      status: 'done',
      progress: 100,
      filePath: path.join(EXPORTS_MODULE, EXPORTS_SUBDIR, `pedido-${orderId}.zip`),
      fileName: `${obra || 'pedido'}-${orderId.slice(-6)}.zip`,
      sizeBytes: stat.size,
      finishedAt: nowIso(),
      expiresAt,
    });

    logger.info('[order-export] ZIP generado', {
      orderId,
      companyId,
      files: entries.length,
      sizeBytes: stat.size,
    });
    return { ok: true };
  } catch (error) {
    logger.error('[order-export] Error generando ZIP', {
      orderId,
      error: String(error),
    });
    await setExportJob(orderId, {
      id: jobId,
      status: 'error',
      error: 'No se pudo generar el ZIP',
      startedAt: nowIso(),
      finishedAt: nowIso(),
    }).catch(() => undefined);
    return { ok: false, code: 'empty' };
  }
}

/** Ruta del ZIP listo para descargar (valida job done + archivo presente). */
export async function getOrderExportFile(orderId: string): Promise<ExportFileResult> {
  if (!isValidObjectId(orderId)) return { ok: false, code: 'not_found' };

  const OrderModel = await getOrderModel();
  const order = (await OrderModel.findById(orderId).lean()) as LooseDoc | null;
  if (!order || !order.companyId) return { ok: false, code: 'not_found' };

  const job = order.exportJob as LooseDoc | undefined;
  if (!job || job.status !== 'done' || !job.filePath) {
    return { ok: false, code: 'not_ready' };
  }

  const companyId = String(order.companyId);
  const absolutePath = storagePathService.resolvePath(companyId, String(job.filePath));
  if (!storagePathService.validateAccess(absolutePath, companyId)) {
    return { ok: false, code: 'not_ready' };
  }
  if (!(await fs.pathExists(absolutePath))) {
    return { ok: false, code: 'not_ready' };
  }

  return {
    ok: true,
    absolutePath,
    fileName: String(job.fileName ?? `pedido-${orderId}.zip`),
  };
}

/** Borra el ZIP del disco y limpia `order.exportJob` (idempotente). */
export async function deleteOrderExport(orderId: string): Promise<{ ok: boolean }> {
  if (!isValidObjectId(orderId)) return { ok: false };

  const OrderModel = await getOrderModel();
  const order = (await OrderModel.findById(orderId).lean()) as LooseDoc | null;
  if (!order || !order.companyId) return { ok: false };

  const companyId = String(order.companyId);
  const zipPath = buildZipPath(companyId, orderId);
  if (storagePathService.validateAccess(zipPath, companyId)) {
    await fs.remove(zipPath).catch(() => undefined);
  }
  await setExportJob(orderId, null);
  return { ok: true };
}
