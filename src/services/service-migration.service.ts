import { getSharedConnection } from '../database/sharedConnection.js';
import { getMigrationCopyJobSnapshot } from '../api/controllers/drive.controller.js';
import { sendTelegramAlert } from './telegram-alert.service.js';
import logger from '../utils/logger.js';
import {
  buildGeneratedDocumentFiles,
  DRIVE_BLOCKER,
  ORDER_LINKED_FILES_BLOCKER,
  ORDER_SUBTREE_BLOCKER,
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

const notifyMigrationResult = async (dedupeKey: string, message: string) => {
  try {
    await sendTelegramAlert({ dedupeKey, message });
  } catch (error) {
    logger.error('[service-migration] telegram notify failed', {
      dedupeKey,
      error,
    });
  }
};

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

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const rawUpdateMany = async (
  model: ReturnType<typeof getModels>[keyof ReturnType<typeof getModels>],
  filter: Record<string, unknown>,
  updateOperation: Record<string, unknown>,
  session?: any
) => {
  await model.collection.updateMany(filter, updateOperation, session ? { session } : undefined);
};

const rawUpdateOne = async (
  model: ReturnType<typeof getModels>[keyof ReturnType<typeof getModels>],
  filter: Record<string, unknown>,
  updateOperation: Record<string, unknown>,
  session?: any
) => {
  await model.collection.updateOne(filter, updateOperation, session ? { session } : undefined);
};

const getRequiredPairing = (
  request: ServiceMigrationRequest,
  kind: string,
  sourceId: string
) => {
  const targetId = getPairingTarget(request.pairings, kind, sourceId);
  if (!targetId) throw new Error(`Falta pairing ${kind}: ${sourceId}`);
  return targetId;
};

const collectOrderMaterialIds = (
  orderDocument: Record<string, unknown>,
  kardexDocuments: Record<string, unknown>[]
) => {
  const materialIds = new Set<string>();
  kardexDocuments.forEach((kardexDocument) => {
    const materialId = asText(kardexDocument.materialId);
    if (materialId) materialIds.add(materialId);
  });
  const productionKardex = orderDocument.productionKardex as Record<string, unknown> | undefined;
  const materials = Array.isArray(productionKardex?.materials)
    ? productionKardex.materials
    : [];
  materials.forEach((materialDocument) => {
    if (!materialDocument || typeof materialDocument !== 'object') return;
    const materialId = asText((materialDocument as Record<string, unknown>).materialId);
    if (materialId) materialIds.add(materialId);
  });
  return Array.from(materialIds);
};

const replaceProductionMaterials = (
  orderDocument: Record<string, unknown>,
  request: ServiceMigrationRequest
) => {
  const productionKardex = orderDocument.productionKardex as Record<string, unknown> | undefined;
  const materials = Array.isArray(productionKardex?.materials)
    ? productionKardex.materials
    : [];
  return materials.map((materialDocument) => {
    if (!materialDocument || typeof materialDocument !== 'object') return materialDocument;
    const materialFields = materialDocument as Record<string, unknown>;
    const targetId = getPairingTarget(request.pairings, 'material', asText(materialFields.materialId));
    return targetId ? { ...materialFields, materialId: targetId } : materialFields;
  });
};

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

const replaceDeepText = (
  value: unknown,
  transform: (currentValue: string) => string
): unknown => {
  if (typeof value === 'string') return transform(value);
  if (Array.isArray(value)) return value.map((entry) => replaceDeepText(entry, transform));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([fieldName, fieldValue]) => [
        fieldName,
        replaceDeepText(fieldValue, transform),
      ])
    );
  }
  return value;
};

const rewriteOrderMediaLocations = async (params: {
  models: ReturnType<typeof getModels>;
  mediaDocuments: Record<string, unknown>[];
  files: Array<{ mediaId: string; targetPath: string }>;
  sourceCompanyId: string;
  targetCompanyId: string;
  session: any;
}) => {
  const filesByMediaId = new Map(params.files.map((file) => [file.mediaId, file]));
  for (const mediaDocument of params.mediaDocuments) {
    const mediaId = asText(mediaDocument._id);
    if (!mediaId) continue;
    const migrationFile = filesByMediaId.get(mediaId);
    const transform = (value: string) =>
      replaceCompanyPath(value, params.sourceCompanyId, params.targetCompanyId);
    const metadata = mediaDocument.metadata as Record<string, unknown> | undefined;
    const rewrittenMetadata = replaceDeepText(metadata, transform) as Record<string, unknown> | undefined;
    const targetPublicUrl = migrationFile?.targetPath
      ? `/files/${migrationFile.targetPath}`
      : transform(asText(mediaDocument.url));
    const targetDirectory = migrationFile?.targetPath
      ? migrationFile.targetPath.split('/').filter(Boolean).slice(0, -1).join('/')
      : asText(rewrittenMetadata?.lilaAppPath);
    const targetLilaPath = targetDirectory.replace(
      new RegExp(`^companies/${escapeRegex(params.targetCompanyId)}/`),
      ''
    );

    await rawUpdateOne(
      params.models.Media,
      { _id: toMongoIdentifier(mediaId), companyId: params.targetCompanyId },
      {
        $set: {
          url: transform(asText(mediaDocument.url)) || targetPublicUrl,
          thumbnailUrl: transform(asText(mediaDocument.thumbnailUrl)) || targetPublicUrl,
          metadata: {
            ...(rewrittenMetadata ?? {}),
            ...(migrationFile
              ? {
                  lilaAppUrl: targetPublicUrl,
                  thumbnailUrl: transform(asText(mediaDocument.thumbnailUrl)) || targetPublicUrl,
                  lilaAppPath: targetLilaPath,
                  lilaAppFilePath: migrationFile.targetPath,
                }
              : {}),
          },
        },
      },
      params.session
    );
  }
};

const validateOrderMigrationPairings = (params: {
  orderDocument: Record<string, unknown>;
  dispatches: Record<string, unknown>[];
  kardexEntries: Record<string, unknown>[];
  linkedServices: Record<string, unknown>[];
  request: ServiceMigrationRequest;
}) => {
  const clientId = asText(params.orderDocument.clienteId);
  const designId = asText(params.orderDocument.tipoMAC);
  if (clientId) getRequiredPairing(params.request, 'client', clientId);
  if (designId) getRequiredPairing(params.request, 'asphaltDesign', designId);

  const transportIds = Array.from(
    new Set(params.dispatches.map((dispatch) => asText(dispatch.transportId)).filter(Boolean))
  );
  transportIds.forEach((transportId) =>
    getRequiredPairing(params.request, 'transport', transportId)
  );

  collectOrderMaterialIds(params.orderDocument, params.kardexEntries).forEach((materialId) =>
    getRequiredPairing(params.request, 'material', materialId)
  );

  params.linkedServices.forEach((serviceDocument) =>
    getRequiredPairing(params.request, 'serviceManagement', asText(serviceDocument._id))
  );
};

const runOrderMigration = async (
  orderId: string,
  request: ServiceMigrationRequest
): Promise<ServiceMigrationResult> => {
  if (request.confirmationText !== orderId) throw new Error('Confirmación inválida.');
  if (request.sourceCompanyId === request.targetCompanyId) {
    throw new Error('Origen y destino son iguales.');
  }

  const connection = await getSharedConnection();
  const models = getModels(connection);
  const orderDocument = await models.Order.findOne({
    _id: toMongoIdentifier(orderId),
    companyId: request.sourceCompanyId,
  }).lean();
  if (!orderDocument) throw new Error('Pedido no existe.');

  const [
    dispatches,
    mediaDocuments,
    folderDocuments,
    certificates,
    kardexEntries,
    consumes,
    publicLinks,
    linkedServices,
    financialMovements,
  ] = await Promise.all([
    models.Dispatch.find({ companyId: request.sourceCompanyId, orderId }).lean(),
    models.Media.find({
      companyId: request.sourceCompanyId,
      resourceId: orderId,
      status: { $ne: 'DELETED' },
    }).lean(),
    models.Folder.find({
      companyId: request.sourceCompanyId,
      resourceId: orderId,
      status: { $ne: 'DELETED' },
    }).lean(),
    models.Certificate.find({ companyId: request.sourceCompanyId, orderId }).lean(),
    models.Kardex.find({ companyId: request.sourceCompanyId, orderId }).lean(),
    models.Consume.find({ companyId: request.sourceCompanyId, 'orders.orderId': orderId }).lean(),
    models.PublicLink.find({
      companyId: request.sourceCompanyId,
      resourceType: 'order',
      resourceId: orderId,
    }).lean(),
    models.ServiceManagement.find({ companyId: request.sourceCompanyId, orderIds: orderId }).lean(),
    models.FinancialMovement.find({
      companyId: request.sourceCompanyId,
      $or: [{ orderId }, { resourceType: 'order', resourceId: orderId }],
    }).lean(),
  ]);

  const linkedReports = linkedServices.length > 0
    ? await models.ServiceManagementReport.find({
        companyId: request.sourceCompanyId,
        serviceManagementId: { $in: linkedServices.map((service) => asText(service._id)) },
        orderIds: orderId,
      }).lean()
    : [];

  if (linkedReports.length > 0) throw new Error('El pedido tiene informes ligados. Migra el servicio completo primero.');
  if (consumes.length > 0) throw new Error('El pedido tiene consumos ligados. Requiere revisión operativa.');
  if (kardexEntries.length > 0) throw new Error('El pedido tiene kardex ligado. Requiere revisión de inventario.');

  validateOrderMigrationPairings({
    orderDocument,
    dispatches,
    kardexEntries,
    linkedServices,
    request,
  });

  const attachmentFilters = collectAttachmentMediaFilters(financialMovements);
  const attachmentMediaDocuments = attachmentFilters.resourceIds.length > 0
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
  const files = buildMigrationFiles(
    allMediaDocuments,
    request.sourceCompanyId,
    request.targetCompanyId,
    '',
    ''
  );
  const createdTargets = await copyPhysicalFiles(
    files,
    request.sourceCompanyId,
    request.targetCompanyId
  );
  const session = await connection.startSession();

  try {
    await session.withTransaction(async () => {
      const clientId = asText(orderDocument.clienteId);
      const designId = asText(orderDocument.tipoMAC);
      const targetClientId = clientId
        ? getRequiredPairing(request, 'client', clientId)
        : '';
      const targetDesignId = designId
        ? getRequiredPairing(request, 'asphaltDesign', designId)
        : '';
      const orderSet: Record<string, unknown> = {
        companyId: request.targetCompanyId,
        ...(targetClientId ? { clienteId: targetClientId } : {}),
        ...(targetDesignId ? { tipoMAC: targetDesignId } : {}),
      };
      const productionMaterials = replaceProductionMaterials(orderDocument, request);
      if (productionMaterials.length > 0) {
        orderSet['productionKardex.materials'] = productionMaterials;
      }

      await rawUpdateMany(models.Order, { _id: toMongoIdentifier(orderId) }, { $set: orderSet }, session);
      await rawUpdateMany(
        models.Dispatch,
        { companyId: request.sourceCompanyId, orderId },
        {
          $set: {
            companyId: request.targetCompanyId,
            ...(targetClientId ? { clientId: targetClientId } : {}),
          },
        },
        session
      );
      for (const pairing of request.pairings.filter((item) => item.kind === 'transport')) {
        await rawUpdateMany(
          models.Dispatch,
          {
            companyId: request.targetCompanyId,
            orderId,
            transportId: pairing.sourceId,
          },
          { $set: { transportId: pairing.targetId } },
          session
        );
      }

      await rawUpdateMany(
        models.Certificate,
        { companyId: request.sourceCompanyId, orderId },
        { $set: { companyId: request.targetCompanyId } },
        session
      );
      await rawUpdateMany(
        models.Folder,
        { companyId: request.sourceCompanyId, resourceId: orderId },
        { $set: { companyId: request.targetCompanyId } },
        session
      );
      await rawUpdateMany(
        models.Media,
        {
          companyId: request.sourceCompanyId,
          resourceId: {
            $in: [
              orderId,
              ...attachmentFilters.resourceIds,
            ],
          },
        },
        { $set: { companyId: request.targetCompanyId } },
        session
      );
      await rawUpdateMany(
        models.FinancialMovement,
        {
          companyId: request.sourceCompanyId,
          $or: [{ orderId }, { resourceType: 'order', resourceId: orderId }],
        },
        { $set: { companyId: request.targetCompanyId } },
        session
      );
      await rawUpdateMany(
        models.PublicLink,
        { companyId: request.sourceCompanyId, resourceType: 'order', resourceId: orderId },
        { $set: { expiresAt: new Date(), title: 'Migrado a otra empresa' } },
        session
      );
      await rawUpdateMany(
        models.ServiceManagement,
        { companyId: request.sourceCompanyId, orderIds: orderId },
        { $pull: { orderIds: { $eq: orderId } } },
        session
      );
      for (const pairing of request.pairings.filter((item) => item.kind === 'serviceManagement')) {
        await rawUpdateOne(
          models.ServiceManagement,
          { _id: toMongoIdentifier(pairing.targetId), companyId: request.targetCompanyId },
          { $addToSet: { orderIds: orderId } },
          session
        );
      }
      await rewriteOrderMediaLocations({
        models,
        mediaDocuments: allMediaDocuments,
        files,
        sourceCompanyId: request.sourceCompanyId,
        targetCompanyId: request.targetCompanyId,
        session,
      });
    });
  } catch (error) {
    await rollbackCopiedFiles(request.targetCompanyId, createdTargets);
    throw error;
  } finally {
    await session.endSession();
  }

  const cleanupWarnings = await deleteSourceFiles(files, request.sourceCompanyId);
  return {
    ok: true,
    entityType: 'order',
    migratedOrderId: orderId,
    sourceCompanyId: request.sourceCompanyId,
    targetCompanyId: request.targetCompanyId,
    movedCounts: {
      ...emptyCounts(),
      dispatches: dispatches.length,
      medias: allMediaDocuments.length,
      folders: folderDocuments.length,
      certificates: certificates.length,
      kardexEntries: kardexEntries.length,
      consumes: consumes.length,
      publicLinks: publicLinks.length,
      serviceLinks: linkedServices.length,
      linkedReports: linkedReports.length,
      financialMovements: financialMovements.length,
    },
    warnings: [
      ...cleanupWarnings,
      ...(publicLinks.length > 0
        ? ['Los enlaces públicos existentes vencieron para evitar acceso con la empresa anterior.']
        : []),
    ],
  };
};

const runServiceMigration = async (serviceId: string, request: ServiceMigrationRequest) => {
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
  const linkedOrderMediaDocuments = orderIds.length > 0
    ? await models.Media.find({
        companyId: request.sourceCompanyId,
        resourceId: { $in: orderIds },
        status: { $ne: 'DELETED' },
      }).lean()
    : [];
  const [
    linkedDispatches,
    linkedCertificates,
    linkedKardexEntries,
    linkedConsumes,
    linkedOrderLinks,
  ] = orderIds.length > 0
    ? await Promise.all([
        models.Dispatch.find({
          companyId: request.sourceCompanyId,
          orderId: { $in: orderIds },
        }).lean(),
        models.Certificate.find({
          companyId: request.sourceCompanyId,
          orderId: { $in: orderIds },
        }).lean(),
        models.Kardex.find({
          companyId: request.sourceCompanyId,
          orderId: { $in: orderIds },
        }).lean(),
        models.Consume.find({
          companyId: request.sourceCompanyId,
          'orders.orderId': { $in: orderIds },
        }).lean(),
        models.PublicLink.find({
          companyId: request.sourceCompanyId,
          resourceType: 'order',
          resourceId: { $in: orderIds },
        }).lean(),
      ])
    : [[], [], [], [], []];

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
  if (
    !sameCompanyMigration &&
    (
      linkedDispatches.length > 0 ||
      linkedOrderMediaDocuments.length > 0 ||
      linkedCertificates.length > 0 ||
      linkedKardexEntries.length > 0 ||
      linkedConsumes.length > 0 ||
      linkedOrderLinks.length > 0
    )
  ) {
    const onlyLinkedOrderFiles =
      linkedOrderMediaDocuments.length > 0 &&
      linkedDispatches.length === 0 &&
      linkedCertificates.length === 0 &&
      linkedKardexEntries.length === 0 &&
      linkedConsumes.length === 0 &&
      linkedOrderLinks.length === 0;
    throw new Error(
      onlyLinkedOrderFiles ? ORDER_LINKED_FILES_BLOCKER : ORDER_SUBTREE_BLOCKER
    );
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
      orderIds,
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
      dispatches: linkedDispatches.length,
      medias: allMediaDocuments.length + linkedOrderMediaDocuments.length,
      folders: folderDocuments.length,
      certificates: linkedCertificates.length,
      kardexEntries: linkedKardexEntries.length,
      consumes: linkedConsumes.length,
      publicLinks: publicLinks.length + linkedOrderLinks.length,
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
  recordId: string,
  request: ServiceMigrationRequest
) => {
  const entityType = request.entityType === 'order' ? 'order' : 'service';
  const targetServiceId = asText(request.targetServiceId);
  const migrationKey = [
    entityType,
    request.sourceCompanyId,
    request.targetCompanyId,
    recordId,
    targetServiceId,
  ].join(':');

  if (activeMigrations.has(migrationKey)) {
    throw new Error('Ya existe una migración ejecutándose para este recurso.');
  }

  activeMigrations.add(migrationKey);
  void (async () => {
    try {
      const outcome = entityType === 'order'
        ? await runOrderMigration(recordId, request)
        : await runServiceMigration(recordId, request);
      await notifyMigrationResult(
        `migration:${migrationKey}`,
        `Migración de ${entityType} OK: ${recordId}` +
          `${targetServiceId ? ` -> ${targetServiceId}` : ''}. ` +
          `${request.sourceCompanyId} -> ${request.targetCompanyId}. ` +
          `Advertencias: ${outcome.warnings.length}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      logger.error('[service-migration] background failed', {
        recordId,
        entityType,
        targetServiceId,
        sourceCompanyId: request.sourceCompanyId,
        targetCompanyId: request.targetCompanyId,
        error,
      });
      await notifyMigrationResult(
        `migration:${migrationKey}`,
        `Migración de ${entityType} FALLÓ: ${recordId}` +
          `${targetServiceId ? ` -> ${targetServiceId}` : ''}. ` +
          `${request.sourceCompanyId} -> ${request.targetCompanyId}. ${message}`
      );
    } finally {
      activeMigrations.delete(migrationKey);
    }
  })();

  return {
    ok: true,
    entityType,
    queued: true,
    migratedOrderId: recordId,
    targetServiceId: request.targetServiceId,
    sourceCompanyId: request.sourceCompanyId,
    targetCompanyId: request.targetCompanyId,
    movedCounts: emptyCounts(),
    warnings: [],
    message: 'Migración iniciada en lila-app. Telegram notificará el resultado.',
  } satisfies ServiceMigrationQueuedResponse;
};
