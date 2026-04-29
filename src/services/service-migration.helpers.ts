import fs from 'fs-extra';
import path from 'node:path';
import {
  Connection,
  Model,
  Schema,
  Types,
  type ClientSession,
} from 'mongoose';
import { storagePathService } from './storage-path.service.js';
import { incrementStorageUsage, decrementStorageUsage } from '../middleware/quota.middleware.js';

type PlainDocument = Record<string, unknown> & { _id?: unknown };
type MigrationModel = Model<PlainDocument>;

export type PairingSelection = {
  kind: string;
  sourceId: string;
  targetId: string;
};

export type ServiceMigrationRequest = {
  entityType?: 'order' | 'service';
  sourceCompanyId: string;
  targetCompanyId: string;
  targetServiceId?: string;
  pairings: PairingSelection[];
  confirmationText: string;
  fileJobId?: string;
};

export type MigrationCounts = {
  dispatches: number;
  medias: number;
  folders: number;
  certificates: number;
  kardexEntries: number;
  consumes: number;
  publicLinks: number;
  serviceLinks: number;
  linkedReports: number;
  linkedOrders: number;
  driveItems: number;
  reportComments: number;
  deleteRequests: number;
  financialMovements: number;
};

export type ServiceMigrationQueuedResponse = {
  ok: true;
  entityType: 'service';
  queued: true;
  migratedOrderId: string;
  targetServiceId?: string;
  sourceCompanyId: string;
  targetCompanyId: string;
  movedCounts: MigrationCounts;
  warnings: string[];
  message: string;
};

export type ServiceMigrationResult = {
  ok: true;
  entityType: 'service';
  migratedOrderId: string;
  targetServiceId: string;
  sourceCompanyId: string;
  targetCompanyId: string;
  movedCounts: MigrationCounts;
  warnings: string[];
};

export type MigrationModels = {
  Order: MigrationModel;
  Dispatch: MigrationModel;
  Certificate: MigrationModel;
  Kardex: MigrationModel;
  Consume: MigrationModel;
  ServiceManagement: MigrationModel;
  ServiceManagementReport: MigrationModel;
  ServiceManagementDrive: MigrationModel;
  PublicLink: MigrationModel;
  ReportComment: MigrationModel;
  DeleteRequest: MigrationModel;
  FinancialMovement: MigrationModel;
  Folder: MigrationModel;
  Media: MigrationModel;
};

export type MigrationFile = {
  mediaId: string;
  sourcePath: string;
  targetPath: string;
};

export const SERVICE_MIGRATION_WARNING =
  'El servicio destino tiene otro cliente. Verifica contratos y visibilidad.';
export const DRIVE_BLOCKER =
  'El servicio tiene vínculos al drive global. La migración entre empresas requiere revisión manual.';
export const ORDER_LINKED_FILES_BLOCKER =
  'El servicio usa archivos ligados a pedidos, despacho o laboratorio. La migración entre empresas aún no remapea ese alcance.';
export const ORDER_SUBTREE_BLOCKER =
  'El servicio tiene pedidos con despachos, medias, certificados, kardex, consumos o links propios. La migración entre empresas aún no remapea ese subárbol completo.';
export const REPORT_WARNING =
  'Revisa el pairing de pedidos antes de migrar reportes y métricas.';

const looseSchema = new Schema({}, { strict: false });

export const asText = (value: unknown) => String(value ?? '').trim();

const normalizePath = (value: string) =>
  value.replace(/\\/g, '/').replace(/^\/+/, '');

export const toMongoIdentifier = (value: string) =>
  Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : value;

export const getDocumentId = (document: PlainDocument | null | undefined) =>
  asText(document?._id);

export const getPairingTarget = (
  pairings: PairingSelection[],
  kind: string,
  sourceId: string
) => {
  const pairing = pairings.find((item) => item.kind === kind && item.sourceId === sourceId);
  return asText(pairing?.targetId);
};

export const collectOrderIds = (serviceDocument: PlainDocument, reports: PlainDocument[]) => {
  const orderIds = new Set<string>();
  const serviceOrderIds = Array.isArray(serviceDocument.orderIds) ? serviceDocument.orderIds : [];
  serviceOrderIds.forEach((orderId) => {
    const normalized = asText(orderId);
    if (normalized) orderIds.add(normalized);
  });
  reports.forEach((report) => {
    const reportOrderIds = Array.isArray(report.orderIds) ? report.orderIds : [];
    reportOrderIds.forEach((orderId) => {
      const normalized = asText(orderId);
      if (normalized) orderIds.add(normalized);
    });
  });
  return Array.from(orderIds);
};

export const collectResourceIds = (serviceId: string, reports: PlainDocument[]) => {
  const resourceIds = new Set<string>([`service-${serviceId}`]);
  reports.forEach((report) => {
    const reportId = getDocumentId(report);
    if (reportId) resourceIds.add(reportId);
  });
  return Array.from(resourceIds);
};

export const collectAttachmentMediaFilters = (financialMovements: PlainDocument[]) => {
  const resourceIds = new Set<string>();
  const types = new Set<string>();
  financialMovements.forEach((movement) => {
    const attachmentType = asText(movement.attachmentMediaType);
    if (!attachmentType) return;
    const attachmentIds = Array.isArray(movement.attachmentResourceIds)
      ? movement.attachmentResourceIds
      : [];
    attachmentIds.forEach((attachmentId) => {
      const normalized = asText(attachmentId);
      if (normalized) resourceIds.add(normalized);
    });
    if (attachmentIds.length > 0) types.add(attachmentType);
  });
  return { resourceIds: Array.from(resourceIds), types: Array.from(types) };
};

const resolveRelativePath = (companyId: string, metadata?: Record<string, unknown>) => {
  const explicitPath = asText(metadata?.lilaAppFilePath);
  const lilaUrl = asText(metadata?.lilaAppUrl);
  const rawPath = explicitPath || lilaUrl;
  if (!rawPath) return '';

  let normalizedPath = rawPath;
  if (/^https?:\/\//i.test(normalizedPath)) {
    try {
      normalizedPath = new URL(normalizedPath).pathname;
    } catch {
      return '';
    }
  }

  const pathWithoutSlash = normalizePath(normalizedPath);
  const companyMarker = `companies/${companyId}/`;
  const filesMarker = `files/${companyMarker}`;
  if (pathWithoutSlash.startsWith(filesMarker)) {
    return pathWithoutSlash.slice(filesMarker.length);
  }
  if (pathWithoutSlash.startsWith(companyMarker)) {
    return pathWithoutSlash.slice(companyMarker.length);
  }
  return pathWithoutSlash;
};

const buildTargetPath = (
  sourceCompanyId: string,
  targetCompanyId: string,
  sourcePath: string,
  sourceServiceId: string,
  targetServiceId: string
) => {
  const normalizedPath = normalizePath(sourcePath);
  const sourceMarker = `companies/${sourceCompanyId}/`;
  let relativePath = normalizedPath.startsWith(sourceMarker)
    ? normalizedPath.slice(sourceMarker.length)
    : normalizedPath;

  if (relativePath === `services/${sourceServiceId}`) {
    relativePath = `services/${targetServiceId}`;
  } else if (relativePath.startsWith(`services/${sourceServiceId}/`)) {
    relativePath = relativePath.replace(
      `services/${sourceServiceId}/`,
      `services/${targetServiceId}/`
    );
  }
  if (relativePath === `reports/${sourceServiceId}`) {
    relativePath = `reports/${targetServiceId}`;
  } else if (relativePath.startsWith(`reports/${sourceServiceId}/`)) {
    relativePath = relativePath.replace(
      `reports/${sourceServiceId}/`,
      `reports/${targetServiceId}/`
    );
  }
  if (relativePath === `service/reports/${sourceServiceId}`) {
    relativePath = `service/reports/${targetServiceId}`;
  } else if (relativePath.startsWith(`service/reports/${sourceServiceId}/`)) {
    relativePath = relativePath.replace(
      `service/reports/${sourceServiceId}/`,
      `service/reports/${targetServiceId}/`
    );
  }

  return `companies/${targetCompanyId}/${relativePath}`;
};

const collectTextValues = (value: unknown, values: Set<string>) => {
  if (typeof value === 'string') {
    if (value.trim()) values.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectTextValues(entry, values));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectTextValues(entry, values));
  }
};

const dedupeMigrationFiles = (files: MigrationFile[]) => {
  const filesByKey = new Map<string, MigrationFile>();
  files.forEach((file) => {
    const key = `${file.sourcePath}=>${file.targetPath}`;
    if (!filesByKey.has(key)) filesByKey.set(key, file);
  });
  return Array.from(filesByKey.values());
};

export const buildGeneratedDocumentFiles = (
  reports: PlainDocument[],
  sourceCompanyId: string,
  targetCompanyId: string,
  sourceServiceId: string,
  targetServiceId: string
) =>
  dedupeMigrationFiles(
    reports.flatMap((report) => {
      const paths = new Set<string>();
      collectTextValues(report.generatedDocuments, paths);
      return Array.from(paths).flatMap((pathValue) => {
        const sourceRelativePath = resolveRelativePath(sourceCompanyId, {
          lilaAppUrl: pathValue,
        });
        if (!sourceRelativePath) return [];
        const sourcePath = `companies/${sourceCompanyId}/${sourceRelativePath}`;
        const targetPath = buildTargetPath(
          sourceCompanyId,
          targetCompanyId,
          sourceRelativePath,
          sourceServiceId,
          targetServiceId
        );
        if (sourcePath === targetPath) return [];
        return [{
          mediaId: `generated:${getDocumentId(report)}:${sourceRelativePath}`,
          sourcePath,
          targetPath,
        }];
      });
    })
  );

export const buildMigrationFiles = (
  mediaDocuments: PlainDocument[],
  sourceCompanyId: string,
  targetCompanyId: string,
  sourceServiceId: string,
  targetServiceId: string,
  extraFiles: MigrationFile[] = []
) =>
  dedupeMigrationFiles([
    ...mediaDocuments
      .map((mediaDocument) => {
        const metadata = mediaDocument.metadata as Record<string, unknown> | undefined;
        const sourceRelativePath = resolveRelativePath(sourceCompanyId, metadata);
        const storageProvider = asText(metadata?.storageProvider);
        if (!sourceRelativePath || (storageProvider && storageProvider !== 'lila-app')) {
          return null;
        }
        const sourcePath = `companies/${sourceCompanyId}/${sourceRelativePath}`;
        const targetPath = buildTargetPath(
          sourceCompanyId,
          targetCompanyId,
          sourceRelativePath,
          sourceServiceId,
          targetServiceId
        );
        if (sourcePath === targetPath) return null;
        return { mediaId: getDocumentId(mediaDocument), sourcePath, targetPath };
      })
      .filter((item): item is MigrationFile => Boolean(item?.sourcePath && item?.targetPath)),
    ...extraFiles,
  ]);

const replaceCompanyPath = (
  value: unknown,
  sourceCompanyId: string,
  targetCompanyId: string
) => {
  const textValue = asText(value);
  if (!textValue) return '';
  return textValue
    .replaceAll(`/files/companies/${sourceCompanyId}/`, `/files/companies/${targetCompanyId}/`)
    .replaceAll(`files/companies/${sourceCompanyId}/`, `files/companies/${targetCompanyId}/`)
    .replaceAll(`/companies/${sourceCompanyId}/`, `/companies/${targetCompanyId}/`)
    .replaceAll(`companies/${sourceCompanyId}/`, `companies/${targetCompanyId}/`);
};

const replaceServicePath = (
  value: unknown,
  sourceServiceId: string,
  targetServiceId: string
) => {
  const textValue = asText(value);
  if (!textValue) return '';
  return textValue
    .replaceAll(`/services/${sourceServiceId}/`, `/services/${targetServiceId}/`)
    .replaceAll(`services/${sourceServiceId}/`, `services/${targetServiceId}/`)
    .replaceAll(`/reports/${sourceServiceId}/`, `/reports/${targetServiceId}/`)
    .replaceAll(`reports/${sourceServiceId}/`, `reports/${targetServiceId}/`)
    .replaceAll(`/service/reports/${sourceServiceId}/`, `/service/reports/${targetServiceId}/`)
    .replaceAll(`service/reports/${sourceServiceId}/`, `service/reports/${targetServiceId}/`)
    .replaceAll(`service-${sourceServiceId}`, `service-${targetServiceId}`);
};

const replaceDeepText = (
  value: unknown,
  transform: (input: string) => string
): unknown => {
  if (typeof value === 'string') return transform(value);
  if (Array.isArray(value)) return value.map((entry) => replaceDeepText(entry, transform));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, currentValue]) => [key, replaceDeepText(currentValue, transform)])
    );
  }
  return value;
};

const replaceDeepExactString = (
  value: unknown,
  replacements: Map<string, string>
): unknown => {
  if (typeof value === 'string') {
    return replacements.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => replaceDeepExactString(entry, replacements));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, currentValue]) => [
        key,
        replaceDeepExactString(currentValue, replacements),
      ])
    );
  }
  return value;
};

export const buildOrderIdReplacementMap = (
  sourceOrderIds: string[],
  pairings: PairingSelection[]
) => {
  const replacements = new Map<string, string>();
  sourceOrderIds.forEach((sourceOrderId) => {
    const targetOrderId = getPairingTarget(pairings, 'order', sourceOrderId);
    if (targetOrderId && targetOrderId !== sourceOrderId) {
      replacements.set(sourceOrderId, targetOrderId);
    }
  });
  return replacements;
};

export const rewriteReportOrderReferences = (
  payload: unknown,
  replacements: Map<string, string>
) => {
  if (replacements.size === 0) return payload;
  return replaceDeepExactString(payload, replacements);
};

export const emptyCounts = (): MigrationCounts => ({
  dispatches: 0,
  medias: 0,
  folders: 0,
  certificates: 0,
  kardexEntries: 0,
  consumes: 0,
  publicLinks: 0,
  serviceLinks: 0,
  linkedReports: 0,
  linkedOrders: 0,
  driveItems: 0,
  reportComments: 0,
  deleteRequests: 0,
  financialMovements: 0,
});

export const getModels = (connection: Connection): MigrationModels => ({
  Order: (connection.models.Order ||
    connection.model('Order', looseSchema)) as MigrationModel,
  Dispatch: (connection.models.Dispatch ||
    connection.model('Dispatch', looseSchema)) as MigrationModel,
  Certificate: (connection.models.Certificate ||
    connection.model('Certificate', looseSchema)) as MigrationModel,
  Kardex: (connection.models.Kardex ||
    connection.model('Kardex', looseSchema)) as MigrationModel,
  Consume: (connection.models.Consume ||
    connection.model('Consume', looseSchema)) as MigrationModel,
  ServiceManagement: (connection.models.ServiceManagement ||
    connection.model('ServiceManagement', looseSchema)) as MigrationModel,
  ServiceManagementReport: (connection.models.ServiceManagementReport ||
    connection.model('ServiceManagementReport', looseSchema)) as MigrationModel,
  ServiceManagementDrive: (connection.models.ServiceManagementDriveItem ||
    connection.model('ServiceManagementDriveItem', looseSchema)) as MigrationModel,
  PublicLink: (connection.models.PublicLink ||
    connection.model('PublicLink', looseSchema)) as MigrationModel,
  ReportComment: (connection.models.ReportComment ||
    connection.model('ReportComment', looseSchema)) as MigrationModel,
  DeleteRequest: (connection.models.DeleteRequest ||
    connection.model('DeleteRequest', looseSchema)) as MigrationModel,
  FinancialMovement: (connection.models.FinancialMovement ||
    connection.model('FinancialMovement', looseSchema)) as MigrationModel,
  Folder: (connection.models.Folder ||
    connection.model('Folder', looseSchema)) as MigrationModel,
  Media: (connection.models.Media ||
    connection.model('Media', looseSchema)) as MigrationModel,
});

const rawUpdateMany = async (
  model: MigrationModel,
  filter: Record<string, unknown>,
  updateOperation: Record<string, unknown>,
  session?: ClientSession
) => {
  await model.collection.updateMany(filter, updateOperation, session ? { session } : undefined);
};

const rawUpdateOne = async (
  model: MigrationModel,
  filter: Record<string, unknown>,
  updateOperation: Record<string, unknown>,
  session?: ClientSession
) => {
  await model.collection.updateOne(filter, updateOperation, session ? { session } : undefined);
};

const setCompanyAndFields = async (
  model: MigrationModel,
  filter: Record<string, unknown>,
  fields: Record<string, unknown>,
  session?: ClientSession
) => {
  await model.collection.updateMany(filter, { $set: fields }, session ? { session } : undefined);
};

const cleanCompanyPath = (companyId: string, value: string) => {
  const normalized = normalizePath(value);
  const prefix = `companies/${companyId}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
};

export const copyPhysicalFiles = async (
  files: MigrationFile[],
  sourceCompanyId: string,
  targetCompanyId: string
) => {
  const createdPaths: string[] = [];

  try {
    for (const file of files) {
      const sourceRelative = cleanCompanyPath(sourceCompanyId, file.sourcePath);
      const targetRelative = cleanCompanyPath(targetCompanyId, file.targetPath);
      const sourceAbsolute = storagePathService.resolvePath(sourceCompanyId, sourceRelative);
      const targetAbsolute = storagePathService.resolvePath(targetCompanyId, targetRelative);
      if (!storagePathService.validateAccess(sourceAbsolute, sourceCompanyId)) {
        throw new Error('Ruta física origen inválida.');
      }
      if (!storagePathService.validateAccess(targetAbsolute, targetCompanyId)) {
        throw new Error('Ruta física destino inválida.');
      }
      if (!(await fs.pathExists(sourceAbsolute))) {
        throw new Error(`Archivo origen no existe: ${sourceRelative}`);
      }
      const sourceStats = await fs.stat(sourceAbsolute);
      if (await fs.pathExists(targetAbsolute)) {
        const targetStats = await fs.stat(targetAbsolute);
        if (targetStats.size !== sourceStats.size) {
          throw new Error(`Archivo destino ya existe con otro tamaño: ${targetRelative}`);
        }
        continue;
      }
      if (!sourceStats.isFile()) {
        throw new Error(`Origen no es un archivo regular: ${sourceRelative}`);
      }
      const targetDirectory = path.dirname(targetAbsolute);
      if (!targetDirectory || targetDirectory === '.') {
        throw new Error(`Directorio destino inválido: ${targetRelative}`);
      }
      await fs.ensureDir(targetDirectory);
      await fs.copy(sourceAbsolute, targetAbsolute);
      createdPaths.push(targetAbsolute);
      if (sourceStats.isFile()) {
        await incrementStorageUsage(targetCompanyId, sourceStats.size);
      }
    }
  } catch (error) {
    await rollbackCopiedFiles(targetCompanyId, createdPaths);
    throw error;
  }

  return createdPaths;
};

export const deleteSourceFiles = async (files: MigrationFile[], sourceCompanyId: string) => {
  const warnings: string[] = [];
  for (const file of files) {
    try {
      const sourceRelative = cleanCompanyPath(sourceCompanyId, file.sourcePath);
      const sourceAbsolute = storagePathService.resolvePath(sourceCompanyId, sourceRelative);
      if (!storagePathService.validateAccess(sourceAbsolute, sourceCompanyId)) continue;
      if (!(await fs.pathExists(sourceAbsolute))) continue;
      const stats = await fs.stat(sourceAbsolute);
      await fs.remove(sourceAbsolute);
      if (stats.isFile()) {
        await decrementStorageUsage(sourceCompanyId, stats.size);
      }
    } catch (error) {
      warnings.push(
        `No se pudo limpiar ${file.sourcePath}: ${error instanceof Error ? error.message : 'error'}`
      );
    }
  }
  return warnings;
};

export const rollbackCopiedFiles = async (
  targetCompanyId: string,
  createdPaths: string[]
) => {
  for (const targetAbsolute of createdPaths) {
    try {
      if (!(await fs.pathExists(targetAbsolute))) continue;
      const stats = await fs.stat(targetAbsolute);
      await fs.remove(targetAbsolute);
      if (stats.isFile()) {
        await decrementStorageUsage(targetCompanyId, stats.size);
      }
    } catch (error) {
      console.error(
        `[service-migration] rollback failed for ${targetAbsolute}: ${
          error instanceof Error ? error.message : 'error'
        }`
      );
    }
  }
};

const rewriteMediaLocations = async (params: {
  models: MigrationModels;
  mediaDocuments: PlainDocument[];
  files: MigrationFile[];
  sourceCompanyId: string;
  targetCompanyId: string;
  sourceServiceId: string;
  targetServiceId: string;
  session: ClientSession;
}) => {
  const filesByMediaId = new Map(params.files.map((file) => [file.mediaId, file]));

  for (const mediaDocument of params.mediaDocuments) {
    const mediaId = getDocumentId(mediaDocument);
    if (!mediaId) continue;
    const file = filesByMediaId.get(mediaId);
    const metadata = mediaDocument.metadata as Record<string, unknown> | undefined;
    const rewriteText = (value: unknown) =>
      replaceServicePath(
        replaceCompanyPath(value, params.sourceCompanyId, params.targetCompanyId),
        params.sourceServiceId,
        params.targetServiceId
      );
    const rewrittenMetadata = replaceDeepText(metadata, rewriteText) as
      | Record<string, unknown>
      | undefined;
    const targetPublicUrl = file
      ? `/files/${file.targetPath}`
      : rewriteText(mediaDocument.url) || asText(mediaDocument.url);
    const targetDirectory = file
      ? file.targetPath.split('/').filter(Boolean).slice(0, -1).join('/')
      : asText(rewrittenMetadata?.lilaAppPath);
    const targetLilaPath = file
      ? cleanCompanyPath(params.targetCompanyId, targetDirectory)
      : targetDirectory;
    const targetThumbnailUrl =
      rewriteText(mediaDocument.thumbnailUrl || rewrittenMetadata?.thumbnailUrl) ||
      asText(mediaDocument.thumbnailUrl) ||
      targetPublicUrl;

    await rawUpdateOne(
      params.models.Media,
      { _id: toMongoIdentifier(mediaId), companyId: params.targetCompanyId },
      {
        $set: {
          url: rewriteText(mediaDocument.url) || targetPublicUrl,
          thumbnailUrl: targetThumbnailUrl,
          metadata: {
            ...(rewrittenMetadata ?? {}),
            ...(file
              ? {
                  lilaAppUrl: rewriteText(metadata?.lilaAppUrl) || targetPublicUrl,
                  thumbnailUrl: targetThumbnailUrl,
                  lilaAppPath: targetLilaPath,
                  lilaAppFilePath: file.targetPath,
                }
              : {}),
          },
        },
      },
      params.session
    );
  }
};

const rewriteReportPayloads = async (params: {
  models: MigrationModels;
  reports: PlainDocument[];
  sourceCompanyId: string;
  targetCompanyId: string;
  sourceServiceId: string;
  targetServiceId: string;
  orderIdReplacements: Map<string, string>;
  session: ClientSession;
}) => {
  for (const report of params.reports) {
    const reportId = getDocumentId(report);
    if (!reportId) continue;
    const transform = (value: string) =>
      replaceCompanyPath(
        value
          .replaceAll(`service-${params.sourceServiceId}`, `service-${params.targetServiceId}`)
          .replaceAll(params.sourceServiceId, params.targetServiceId),
        params.sourceCompanyId,
        params.targetCompanyId
      );

    await rawUpdateOne(
      params.models.ServiceManagementReport,
      { _id: toMongoIdentifier(reportId), companyId: params.targetCompanyId },
      {
        $set: {
          schemaData: rewriteReportOrderReferences(
            replaceDeepText(report.schemaData, transform),
            params.orderIdReplacements
          ),
          draftData: rewriteReportOrderReferences(
            replaceDeepText(report.draftData, transform),
            params.orderIdReplacements
          ),
          attachments: rewriteReportOrderReferences(
            replaceDeepText(report.attachments, transform),
            params.orderIdReplacements
          ),
          schemaOverrides: rewriteReportOrderReferences(
            replaceDeepText(report.schemaOverrides, transform),
            params.orderIdReplacements
          ),
          customSections: rewriteReportOrderReferences(
            replaceDeepText(report.customSections, transform),
            params.orderIdReplacements
          ),
          annexes: rewriteReportOrderReferences(
            replaceDeepText(report.annexes, transform),
            params.orderIdReplacements
          ),
          generatedDocuments: rewriteReportOrderReferences(
            replaceDeepText(report.generatedDocuments, transform),
            params.orderIdReplacements
          ),
        },
      },
      params.session
    );
  }
};

export const executeDbMigration = async (params: {
  connection: Connection;
  models: MigrationModels;
  sourceService: PlainDocument;
  targetService: PlainDocument;
  reports: PlainDocument[];
  mediaDocuments: PlainDocument[];
  files: MigrationFile[];
  request: ServiceMigrationRequest;
  orderIds: string[];
  sourceServiceId: string;
  targetServiceId: string;
}) => {
  const reportIds = params.reports.map((report) => getDocumentId(report)).filter(Boolean);
  const mediaIds = params.mediaDocuments
    .map((mediaDocument) => getDocumentId(mediaDocument))
    .filter(Boolean);
  const sourceResourceId = `service-${params.sourceServiceId}`;
  const targetResourceId = `service-${params.targetServiceId}`;
  const orderIdReplacements = buildOrderIdReplacementMap(
    params.orderIds,
    params.request.pairings
  );
  const mappedOrderIds = Array.from(
    new Set(
      (Array.isArray(params.sourceService.orderIds) ? params.sourceService.orderIds : [])
        .map((orderId) => {
          const normalized = asText(orderId);
          return getPairingTarget(params.request.pairings, 'order', normalized) || normalized;
        })
        .filter(Boolean)
    )
  );
  const mergedOrderIds = Array.from(
    new Set([
      ...(Array.isArray(params.targetService.orderIds) ? params.targetService.orderIds : []),
      ...mappedOrderIds,
    ].map((value) => asText(value)).filter(Boolean))
  );
  const mergedReportOrder = Array.from(
    new Set([
      ...(Array.isArray(params.targetService.reportOrder) ? params.targetService.reportOrder : []),
      ...(Array.isArray(params.sourceService.reportOrder) ? params.sourceService.reportOrder : []),
    ].map((value) => asText(value)).filter(Boolean))
  );
  const sourceSummary = (params.sourceService.summary as Record<string, unknown> | undefined) ?? {};
  const targetSummary = (params.targetService.summary as Record<string, unknown> | undefined) ?? {};
  const sourceM3ByOrder = (sourceSummary.m3ByOrder as Record<string, number> | undefined) ?? {};
  const targetM3ByOrder = (targetSummary.m3ByOrder as Record<string, number> | undefined) ?? {};
  const mergedM3ByOrder = { ...targetM3ByOrder } as Record<string, number>;

  Object.entries(sourceM3ByOrder).forEach(([sourceOrderId, amount]) => {
    const targetOrderId =
      getPairingTarget(params.request.pairings, 'order', sourceOrderId) || sourceOrderId;
    mergedM3ByOrder[targetOrderId] = Number(mergedM3ByOrder[targetOrderId] ?? 0) + Number(amount ?? 0);
  });

  const session = await params.connection.startSession();
  try {
    await session.withTransaction(async () => {
      await rawUpdateOne(params.models.ServiceManagement, { _id: toMongoIdentifier(params.targetServiceId), companyId: params.request.targetCompanyId }, { $set: { orderIds: mergedOrderIds, reportOrder: mergedReportOrder, 'summary.m3ByOrder': mergedM3ByOrder, partidas: [...(Array.isArray(params.targetService.partidas) ? params.targetService.partidas : []), ...(Array.isArray(params.sourceService.partidas) ? params.sourceService.partidas : [])], updatedAt: new Date() } }, session);
      await rawUpdateOne(params.models.ServiceManagement, { _id: toMongoIdentifier(params.sourceServiceId), companyId: params.request.sourceCompanyId }, { $set: { orderIds: [], reportOrder: [], 'summary.m3ByOrder': {}, partidas: [], updatedAt: new Date() } }, session);

      await setCompanyAndFields(params.models.ServiceManagementReport, { companyId: params.request.sourceCompanyId, serviceManagementId: params.sourceServiceId }, { companyId: params.request.targetCompanyId, serviceManagementId: params.targetServiceId }, session);
      for (const report of params.reports) {
        const reportId = getDocumentId(report);
        const reportOrderIds = Array.isArray(report.orderIds) ? report.orderIds : [];
        await rawUpdateOne(params.models.ServiceManagementReport, { _id: toMongoIdentifier(reportId), companyId: params.request.targetCompanyId }, { $set: { orderIds: reportOrderIds.map((orderId) => { const normalized = asText(orderId); return getPairingTarget(params.request.pairings, 'order', normalized) || normalized; }) } }, session);
      }

      await setCompanyAndFields(params.models.ServiceManagementDrive, { companyId: params.request.sourceCompanyId, serviceManagementId: params.sourceServiceId }, { companyId: params.request.targetCompanyId, serviceManagementId: params.targetServiceId }, session);
      await rawUpdateMany(params.models.ReportComment, { companyId: params.request.sourceCompanyId, $or: [{ serviceManagementId: params.sourceServiceId }, ...(reportIds.length > 0 ? [{ reportId: { $in: reportIds } }] : [])] }, { $set: { companyId: params.request.targetCompanyId, serviceManagementId: params.targetServiceId } }, session);
      await rawUpdateMany(params.models.DeleteRequest, { companyId: params.request.sourceCompanyId, $or: [{ serviceManagementId: params.sourceServiceId }, ...(reportIds.length > 0 ? [{ reportId: { $in: reportIds } }] : [])] }, { $set: { companyId: params.request.targetCompanyId, serviceManagementId: params.targetServiceId } }, session);
      await rawUpdateMany(params.models.PublicLink, { companyId: params.request.sourceCompanyId, $or: [{ serviceManagementId: params.sourceServiceId }, ...(reportIds.length > 0 ? [{ reportIds: { $in: reportIds } }] : [])] }, { $set: { companyId: params.request.targetCompanyId, serviceManagementId: params.targetServiceId } }, session);
      await rawUpdateMany(params.models.FinancialMovement, { companyId: params.request.sourceCompanyId, $or: [{ serviceManagementId: params.sourceServiceId }, { resourceType: 'service', resourceId: params.sourceServiceId }] }, { $set: { companyId: params.request.targetCompanyId, serviceManagementId: params.targetServiceId } }, session);
      await rawUpdateMany(params.models.FinancialMovement, { companyId: params.request.targetCompanyId, resourceType: 'service', resourceId: params.sourceServiceId }, { $set: { resourceId: params.targetServiceId } }, session);
      await rawUpdateMany(params.models.Folder, { companyId: params.request.sourceCompanyId, resourceId: sourceResourceId }, { $set: { companyId: params.request.targetCompanyId, resourceId: targetResourceId } }, session);
      await rawUpdateMany(params.models.Folder, { companyId: params.request.sourceCompanyId, resourceId: { $in: reportIds } }, { $set: { companyId: params.request.targetCompanyId } }, session);
      await rawUpdateMany(params.models.Media, { companyId: params.request.sourceCompanyId, _id: { $in: mediaIds.map(toMongoIdentifier) } }, { $set: { companyId: params.request.targetCompanyId } }, session);
      await rawUpdateMany(params.models.Media, { companyId: params.request.targetCompanyId, _id: { $in: mediaIds.map(toMongoIdentifier) }, resourceId: sourceResourceId }, { $set: { resourceId: targetResourceId } }, session);

      await rewriteMediaLocations({ models: params.models, mediaDocuments: params.mediaDocuments, files: params.files, sourceCompanyId: params.request.sourceCompanyId, targetCompanyId: params.request.targetCompanyId, sourceServiceId: params.sourceServiceId, targetServiceId: params.targetServiceId, session });
      await rewriteReportPayloads({ models: params.models, reports: params.reports, sourceCompanyId: params.request.sourceCompanyId, targetCompanyId: params.request.targetCompanyId, sourceServiceId: params.sourceServiceId, targetServiceId: params.targetServiceId, orderIdReplacements, session });
    });
  } finally {
    await session.endSession();
  }
};
