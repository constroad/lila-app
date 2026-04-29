import { getSharedConnection } from '../database/sharedConnection.js';
import { getMigrationCopyJobSnapshot } from '../api/controllers/drive.controller.js';
import { sendTelegramAlert } from './telegram-alert.service.js';
import {
  buildGeneratedDocumentFiles,
  DRIVE_BLOCKER,
  REPORT_WARNING,
  SERVICE_MIGRATION_WARNING,
  asText,
  buildMigrationFiles,
  collectAttachmentMediaFilters,
  collectOrderIds,
  collectResourceIds,
  copyPhysicalFiles,
  deleteSourceFiles,
  emptyCounts,
  executeDbMigration,
  getModels,
  getPairingTarget,
  rollbackCopiedFiles,
  toMongoIdentifier,
  type ServiceMigrationQueuedResponse,
  type ServiceMigrationRequest,
  type ServiceMigrationResult,
} from './service-migration.helpers.js';

const activeMigrations = new Set<string>();

const normalizeMigrationPath = (companyId: string, value: string) =>
  asText(value)
    .replace(/^\/+/, '')
    .replace(new RegExp(`^files/companies/${companyId}/`), '')
    .replace(new RegExp(`^companies/${companyId}/`), '');

export const validatePreparedFiles = async (
  request: ServiceMigrationRequest,
  files: Array<{ sourcePath: string; targetPath: string }>
) => {
  const fileJobId = asText(request.fileJobId);
  if (!fileJobId || files.length === 0) return;
  const fileJob = await getMigrationCopyJobSnapshot(fileJobId);
  if (!fileJob || fileJob.status !== 'succeeded') {
    throw new Error('La preparación de archivos no está completa.');
  }
  if (fileJob.sourceCompanyId !== request.sourceCompanyId) {
    throw new Error('Job de archivos no pertenece al origen.');
  }
  if (fileJob.targetCompanyId !== request.targetCompanyId) {
    throw new Error('Job de archivos no pertenece al destino.');
  }
  if (fileJob.entries.length !== files.length) {
    throw new Error('Job de archivos no coincide con el preflight.');
  }
  const expectedTargets = new Set(
    files.map((file) => normalizeMigrationPath(request.targetCompanyId, file.targetPath))
  );
  if (fileJob.entries.some((entry) => !expectedTargets.has(
    normalizeMigrationPath(request.targetCompanyId, entry.targetPath)
  ))) {
    throw new Error('Job de archivos apunta a otro destino.');
  }
};

export const validateOrderPairings = async (params: {
  models: ReturnType<typeof getModels>;
  sourceCompanyId: string;
  targetCompanyId: string;
  orderIds: string[];
  pairings: ServiceMigrationRequest['pairings'];
}) => {
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const recentTargetOrders = await params.models.Order.find(
    { companyId: params.targetCompanyId },
    { cliente: 1, obra: 1, fechaProgramacion: 1, createdAt: 1 }
  ).sort({ fechaProgramacion: -1, createdAt: -1 }).limit(20).lean();
  const validTargetsBySource = new Map<string, Set<string>>();

  for (const orderId of params.orderIds) {
    const sourceOrder = await params.models.Order.findOne(
      { _id: toMongoIdentifier(orderId), companyId: params.sourceCompanyId },
      { cliente: 1, obra: 1 }
    ).lean();
    if (!sourceOrder) continue;
    const filters = [
      asText(sourceOrder.cliente)
        ? { cliente: { $regex: `^${escapeRegex(asText(sourceOrder.cliente))}$`, $options: 'i' } }
        : null,
      asText(sourceOrder.obra)
        ? { obra: { $regex: `^${escapeRegex(asText(sourceOrder.obra))}$`, $options: 'i' } }
        : null,
    ].filter(Boolean);
    const suggestedTargets = filters.length > 0
      ? await params.models.Order.find({
          companyId: params.targetCompanyId,
          $or: filters,
        }).limit(20).lean()
      : [];
    validTargetsBySource.set(
      orderId,
      new Set([...suggestedTargets, ...recentTargetOrders].map((order) => asText(order._id)).filter(Boolean))
    );
  }

  const invalidPairings = params.pairings.filter((pairing) => {
    if (pairing.kind !== 'order') return true;
    const validTargets = validTargetsBySource.get(pairing.sourceId);
    if (!validTargets) return true;
    return !validTargets.has(asText(pairing.targetId));
  });
  if (invalidPairings.length > 0) {
    throw new Error(`Pairings inválidos: ${invalidPairings.length}`);
  }
};

const runMigration = async (serviceId: string, request: ServiceMigrationRequest) => {
  const targetServiceId = asText(request.targetServiceId);
  if (!targetServiceId) throw new Error('Servicio destino requerido.');
  if (request.confirmationText !== serviceId) throw new Error('Confirmación inválida.');

  const connection = await getSharedConnection();
  const models = getModels(connection);
  const sameCompanyMigration = request.sourceCompanyId === request.targetCompanyId;

  const [sourceService, targetService] = await Promise.all([
    models.ServiceManagement.findOne({
      _id: toMongoIdentifier(serviceId),
      companyId: request.sourceCompanyId,
    }).lean(),
    models.ServiceManagement.findOne({
      _id: toMongoIdentifier(targetServiceId),
      companyId: request.targetCompanyId,
    }).lean(),
  ]);

  if (!sourceService) throw new Error('Servicio origen no existe.');
  if (!targetService) throw new Error('Servicio destino no existe.');
  if (sameCompanyMigration && serviceId === targetServiceId) {
    throw new Error('Servicio origen y destino son el mismo.');
  }

  const reports = await models.ServiceManagementReport.find({
    companyId: request.sourceCompanyId,
    serviceManagementId: serviceId,
  }).lean();
  const reportIds = reports.map((report) => asText(report._id)).filter(Boolean);
  const resourceIds = collectResourceIds(serviceId, reports);
  const orderIds = collectOrderIds(sourceService, reports);

  const [
    driveItems,
    publicLinks,
    reportComments,
    deleteRequests,
    financialMovements,
    mediaDocuments,
    folderDocuments,
  ] = await Promise.all([
    models.ServiceManagementDrive.find({
      companyId: request.sourceCompanyId,
      serviceManagementId: serviceId,
    }).lean(),
    models.PublicLink.find({
      companyId: request.sourceCompanyId,
      $or: [
        { serviceManagementId: serviceId },
        ...(reportIds.length > 0 ? [{ reportIds: { $in: reportIds } }] : []),
      ],
    }).lean(),
    models.ReportComment.find({
      companyId: request.sourceCompanyId,
      $or: [
        { serviceManagementId: serviceId },
        ...(reportIds.length > 0 ? [{ reportId: { $in: reportIds } }] : []),
      ],
    }).lean(),
    models.DeleteRequest.find({
      companyId: request.sourceCompanyId,
      $or: [
        { serviceManagementId: serviceId },
        ...(reportIds.length > 0 ? [{ reportId: { $in: reportIds } }] : []),
      ],
    }).lean(),
    models.FinancialMovement.find({
      companyId: request.sourceCompanyId,
      $or: [
        { serviceManagementId: serviceId },
        { resourceType: 'service', resourceId: serviceId },
      ],
    }).lean(),
    models.Media.find({
      companyId: request.sourceCompanyId,
      resourceId: { $in: resourceIds },
      status: { $ne: 'DELETED' },
    }).lean(),
    models.Folder.find({
      companyId: request.sourceCompanyId,
      resourceId: { $in: resourceIds },
      status: { $ne: 'DELETED' },
    }).lean(),
  ]);
  const attachmentFilters = collectAttachmentMediaFilters(financialMovements);
  const attachmentMediaDocuments = attachmentFilters.resourceIds.length
    ? await models.Media.find({
        companyId: request.sourceCompanyId,
        resourceId: { $in: attachmentFilters.resourceIds },
        type: { $in: attachmentFilters.types },
        status: { $ne: 'DELETED' },
      }).lean()
    : [];
  const allMediaDocuments = Array.from(
    new Map(
      [...mediaDocuments, ...attachmentMediaDocuments].map((mediaDocument) => [
        asText(mediaDocument._id),
        mediaDocument,
      ])
    ).values()
  );

  if (!sameCompanyMigration && driveItems.length > 0) {
    throw new Error(DRIVE_BLOCKER);
  }
  if (!sameCompanyMigration) {
    const missingPairings = orderIds.filter(
      (orderId) => !getPairingTarget(request.pairings, 'order', orderId)
    );
    if (missingPairings.length > 0) {
      throw new Error(`Faltan pairings requeridos: ${missingPairings.length}`);
    }
    await validateOrderPairings({
      models,
      sourceCompanyId: request.sourceCompanyId,
      targetCompanyId: request.targetCompanyId,
      orderIds,
      pairings: request.pairings,
    });
  }

  const generatedDocumentFiles = buildGeneratedDocumentFiles(
    reports,
    request.sourceCompanyId,
    request.targetCompanyId,
    serviceId,
    targetServiceId
  );
  const files = buildMigrationFiles(
    allMediaDocuments,
    request.sourceCompanyId,
    request.targetCompanyId,
    serviceId,
    targetServiceId,
    generatedDocumentFiles
  );
  await validatePreparedFiles(request, files);
  const createdTargets = await copyPhysicalFiles(
    files,
    request.sourceCompanyId,
    request.targetCompanyId
  );

  try {
    await executeDbMigration({
      connection,
      models,
      sourceService,
      targetService,
      reports,
      mediaDocuments: allMediaDocuments,
      files,
      request,
      sourceServiceId: serviceId,
      targetServiceId,
    });
  } catch (error) {
    await rollbackCopiedFiles(request.targetCompanyId, createdTargets);
    throw error;
  }

  const cleanupWarnings = await deleteSourceFiles(files, request.sourceCompanyId);

  return {
    ok: true,
    entityType: 'service',
    migratedOrderId: serviceId,
    targetServiceId,
    sourceCompanyId: request.sourceCompanyId,
    targetCompanyId: request.targetCompanyId,
    movedCounts: {
      ...emptyCounts(),
      medias: allMediaDocuments.length,
      folders: folderDocuments.length,
      publicLinks: publicLinks.length,
      linkedReports: reports.length,
      linkedOrders: orderIds.length,
      driveItems: driveItems.length,
      reportComments: reportComments.length,
      deleteRequests: deleteRequests.length,
      financialMovements: financialMovements.length,
    },
    warnings: [
      ...cleanupWarnings,
      ...(!sameCompanyMigration && orderIds.length > 0 ? [REPORT_WARNING] : []),
      ...(asText(sourceService.clientId) &&
      asText(targetService.clientId) &&
      asText(sourceService.clientId) !== asText(targetService.clientId)
        ? [SERVICE_MIGRATION_WARNING]
        : []),
    ],
  } satisfies ServiceMigrationResult;
};

export const startServiceMigration = (
  serviceId: string,
  request: ServiceMigrationRequest
) => {
  const targetServiceId = asText(request.targetServiceId);
  const migrationKey = [
    request.sourceCompanyId,
    request.targetCompanyId,
    serviceId,
    targetServiceId,
  ].join(':');

  if (activeMigrations.has(migrationKey)) {
    throw new Error('Ya existe una migración ejecutándose para este servicio.');
  }

  activeMigrations.add(migrationKey);
  void (async () => {
    try {
      const outcome = await runMigration(serviceId, request);
      await sendTelegramAlert({
        dedupeKey: `service-migration:${migrationKey}`,
        message:
          `Migración de servicio OK: ${serviceId} -> ${targetServiceId}. ` +
          `${request.sourceCompanyId} -> ${request.targetCompanyId}. ` +
          `Advertencias: ${outcome.warnings.length}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      await sendTelegramAlert({
        dedupeKey: `service-migration:${migrationKey}`,
        message:
          `Migración de servicio FALLÓ: ${serviceId} -> ${targetServiceId}. ` +
          `${request.sourceCompanyId} -> ${request.targetCompanyId}. ${message}`,
      });
    } finally {
      activeMigrations.delete(migrationKey);
    }
  })();

  return {
    ok: true,
    entityType: 'service',
    queued: true,
    migratedOrderId: serviceId,
    targetServiceId: request.targetServiceId,
    sourceCompanyId: request.sourceCompanyId,
    targetCompanyId: request.targetCompanyId,
    movedCounts: emptyCounts(),
    warnings: [],
    message: 'Migración iniciada en lila-app. Telegram notificará el resultado.',
  } satisfies ServiceMigrationQueuedResponse;
};
