import jwt from 'jsonwebtoken';
import mongoose, { Model, Schema } from 'mongoose';
import logger from '../utils/logger.js';
import { DISPATCH_IPP_READY_NOTIFICATION_DELAY_MS } from '../config/constants.js';
import { config } from '../config/environment.js';
import { getCompanyBotLabel } from '../utils/company-bot.js';
import { getDomainEventRunModel } from '../models/domain-event-run.model.js';
import { WhatsAppDirectService } from './whatsapp-direct.service.js';
import { getSharedConnection } from '../database/sharedConnection.js';
import { enqueueDomainEvent } from './domain-events.service.js';

const GROUP_ADMINISTRACION_CONSTROAD =
  process.env.NEXT_PUBLIC_GROUP_ADMINISTRACION_CONSTROAD ||
  '120363043706150862@g.us';
const GROUP_PLANT_CONSTROAD =
  process.env.NEXT_PUBLIC_GROUP_PLANT_CONSTROAD || '120363288945205546@g.us';
const DISPATCH_POST_PROCESS_LOCK_MS = 2 * 60 * 1000;
const DISPATCH_COMPLETION_RUN_KEY = 'workflow:dispatch-completion';

export type DispatchCompletionWorkflowInput = {
  baseUrl?: string;
  companyId: string;
  dispatchFinished: boolean;
  dispatchId: string;
  sender?: string;
  state: string;
  truckDispatched: boolean;
};

export type DispatchContext = {
  client: any | null;
  company: any | null;
  companyBotLabel: string;
  dispatch: any;
  operationalPendingCount: number;
  order: any | null;
  orderDispatches: any[];
  remainingOrderDispatches: number;
  sender: string;
};

type DispatchIppDocumentInput = {
  baseUrl?: string;
  companyId: string;
  dispatchId: string;
};

type DispatchAlertPayload = {
  driverLicense: string;
  driverName: string;
  driverPhoneNumber: string;
  note: string;
  obra: string;
  pending: number;
  plate: string;
  quantity: number;
};

type DispatchIppReadyNotificationInput = {
  companyId: string;
  message: string;
  sender: string;
  targets: string[];
};

type IPPDispatchRow = {
  _dispatchId?: string;
  chofer?: string;
  estado?: string;
  fecha?: string;
  guiaRemision?: string;
  horaSalida?: string;
  item?: number;
  licencia?: string;
  nroCubos?: number;
  ordenDespacho?: number;
  placa?: string;
  tempSalida?: number;
};

const looseSchema = new Schema({}, { strict: false });

function getPortalGroupTargets(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  const normalizedValue = String(value || '').trim();
  return normalizedValue ? [normalizedValue] : [];
}

async function getFlexibleModel(modelName: string, collection?: string): Promise<Model<any>> {
  const conn = await getSharedConnection();
  return (
    (conn.models[modelName] as Model<any>) ||
    conn.model(modelName, looseSchema, collection)
  );
}

function normalizeDateRangeForDispatchQueue(referenceDate: Date) {
  const peruNow = new Date(
    referenceDate.toLocaleString('en-US', { timeZone: 'America/Lima' })
  );
  const endDate = new Date(peruNow);
  endDate.setHours(24, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 2);
  startDate.setHours(0, 0, 0, 0);

  return { endDate, startDate };
}

function formatPeruDate(value?: string | Date): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const peruDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Lima' }));
  const year = peruDate.getFullYear();
  const month = String(peruDate.getMonth() + 1).padStart(2, '0');
  const day = String(peruDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildIppHeaderDate(value: Date): string {
  return formatPeruDate(value);
}

function getPeruDayKey(value?: string | Date): string {
  return formatPeruDate(value);
}

function parseOrdenDespacho(note?: string): number | undefined {
  if (!note) return undefined;
  const match = note.match(/unidad\s*(\d+)/i);
  if (!match) return undefined;
  const parsedValue = Number(match[1]);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function toNumber(value: unknown): number {
  const parsedValue = Number(value ?? 0);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function normalizeSender(sender?: string): string {
  return String(sender || '').replace(/\D/g, '').trim();
}

function normalizeBaseUrl(baseUrl?: string): string {
  const trimmed = String(baseUrl || '').trim();
  return trimmed.replace(/\/+$/, '');
}

function createInternalAuthToken(companyId: string, userId: string) {
  return jwt.sign({ companyId, role: 'admin', userId }, config.security.jwtSecret, {
    expiresIn: '5m',
  });
}

function parseBaseUrl(baseUrl?: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function isQueuedWhatsAppResult(
  value: unknown
): value is { queued: true } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'queued' in value &&
    (value as { queued?: unknown }).queued === true
  );
}

function toMinutes(value?: string): number | null {
  if (!value) return null;
  const parts = value.split(':').map((item) => Number(item));
  if (parts.length < 2 || parts.some((item) => Number.isNaN(item))) {
    return null;
  }
  return parts[0] * 60 + parts[1];
}

function formatMinutes(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function resolvePlantProgressUnitLabel(params: {
  dispatch: any;
  dispatches: any[];
}): string {
  if (typeof params.dispatch?.note === 'string' && params.dispatch.note.trim()) {
    return params.dispatch.note.trim();
  }

  const targetDayKey = getPeruDayKey(params.dispatch?.date);
  const numberingScope = targetDayKey
    ? params.dispatches.filter(
        (dispatchItem) => getPeruDayKey(dispatchItem.date) === targetDayKey
      )
    : params.dispatches;
  const dispatchedCount = numberingScope.filter(
    (dispatchItem) =>
      String(dispatchItem?._id || '') !== String(params.dispatch?._id || '') &&
      dispatchItem?.state === 'despachado'
  ).length;

  return `Unidad ${dispatchedCount + 1}`;
}

function buildDispatchClientAlertMessage(
  botLabel: string,
  payload: DispatchAlertPayload
): string {
  return `${botLabel}

- 🎯 ${payload.note}, ${payload.quantity}m3 *despachado*
- 🚛 Placa: ${payload.plate}
- 👔 Chofer: ${payload.driverName}
- 🪪 Licencia: ${payload.driverLicense}
- 📱 Telf: ${payload.driverPhoneNumber}
- 🛣️ Obra : ${payload.obra}
- ⏰ Unidades Pendientes: ${payload.pending}
`;
}

function buildDispatchClientFinalMessage(botLabel: string, obra: string): string {
  return `${botLabel}: 
  
✅ Fin de producción!
🛣️ Obra: ${obra}`;
}

function buildDispatchIppReadyMessage(botLabel: string, obra: string): string {
  return `${botLabel}

📄 El informe IPP de producción de planta ya está listo en el portal del cliente.
🛣️ Obra: ${obra}`;
}

function buildDispatchPlantProgressMessage(
  botLabel: string,
  unitLabel: string,
  pendingTrucks: number
): string {
  return `${botLabel}
- 🚛 ${unitLabel} *despachado*
- ⏰ Unidades Pendientes: ${pendingTrucks}`;
}

function buildDispatchPlantEndMessage(botLabel: string): string {
  return `${botLabel}

✅ Fin de la producción

Tareas:
- Coordinar limpieza de planta por areas (tolvas, faja, polines, etc)
- @Dario, revisar la poza
- @Max, Informe total desperdicio y mediciones tanques
- @Laboratorio, informe de % de agregados usados
- @Wilson, actualizar tanques

- 🚨 @Todos Comunicar algun incidente`;
}

function getClientAlertTargets(params: {
  context: DispatchContext;
  dispatch: any;
}) {
  return params.dispatch?.placeholders?.sendDispatchMessage === false
    ? [GROUP_ADMINISTRACION_CONSTROAD]
    : getPortalGroupTargets(params.context.client?.notifications?.whatsAppAlerts);
}

function mergeIppDispatchRows(
  existingRows: IPPDispatchRow[],
  incomingRows: IPPDispatchRow[]
): IPPDispatchRow[] {
  const manualRows = existingRows.filter((row) => !row?._dispatchId);
  const existingRowsByDispatchId = new Map(
    existingRows
      .filter((row) => row?._dispatchId)
      .map((row) => [String(row._dispatchId), row])
  );
  const incomingIds = new Set(incomingRows.map((row) => String(row._dispatchId)));
  const orphanedRows = existingRows.filter(
    (row) => row?._dispatchId && !incomingIds.has(String(row._dispatchId))
  );
  const mergedRows = incomingRows.map((row) => {
    const currentRow = row._dispatchId
      ? existingRowsByDispatchId.get(String(row._dispatchId))
      : undefined;

    return {
      ...row,
      estado: (currentRow?.estado || row.estado || 'CONFORME').toString().toUpperCase(),
      guiaRemision: currentRow?.guiaRemision || row.guiaRemision,
    };
  });

  return [...manualRows, ...orphanedRows, ...mergedRows];
}

function sortIppDispatchRows(rows: IPPDispatchRow[]): IPPDispatchRow[] {
  return [...rows].sort((left, right) => {
    const leftOrder = typeof left.ordenDespacho === 'number' ? left.ordenDespacho : null;
    const rightOrder = typeof right.ordenDespacho === 'number' ? right.ordenDespacho : null;

    if (leftOrder !== null || rightOrder !== null) {
      if (leftOrder === null) return 1;
      if (rightOrder === null) return -1;
      return leftOrder - rightOrder;
    }

    const leftMinutes = toMinutes(left.horaSalida) ?? Number.MAX_SAFE_INTEGER;
    const rightMinutes = toMinutes(right.horaSalida) ?? Number.MAX_SAFE_INTEGER;
    return leftMinutes - rightMinutes;
  });
}

function buildResumenProduccion(rows: IPPDispatchRow[]) {
  const activeRows = rows.filter(
    (row) => row?._dispatchId || row?.placa || row?.guiaRemision
  );
  const totalDespachos = activeRows.length;
  const totalCubos = activeRows.reduce(
    (accumulator, row) => accumulator + toNumber(row.nroCubos),
    0
  );
  const vehiculosUtilizados = new Set(
    activeRows
      .map((row) => String(row.placa || '').trim())
      .filter(Boolean)
  ).size;
  const timeValues = activeRows
    .map((row) => toMinutes(row.horaSalida))
    .filter((value): value is number => value !== null);
  const horarioProduccion =
    timeValues.length > 0
      ? `${formatMinutes(Math.min(...timeValues))} - ${formatMinutes(
          Math.max(...timeValues)
        )}`
      : '';
  const states = activeRows.map((row) =>
    String(row.estado || '').trim().toUpperCase()
  );
  const tempValues = activeRows
    .map((row) => Number(row.tempSalida))
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    despachosConformes: states.filter((state) => state === 'CONFORME').length,
    despachosObservados: states.filter((state) => state === 'OBSERVADO').length,
    despachosRechazados: states.filter((state) => state === 'RECHAZADO').length,
    horarioProduccion,
    tempSalidaPromedio:
      tempValues.length > 0
        ? Number(
            (
              tempValues.reduce((accumulator, value) => accumulator + value, 0) /
              tempValues.length
            ).toFixed(1)
          )
        : 0,
    totalCubos,
    totalDespachos,
    vehiculosUtilizados,
  };
}

function normalizeProductionReportPlantSettings(
  value?: Record<string, unknown> | null
): Record<string, string> {
  return {
    capacidad: String(value?.capacidad || '').trim(),
    operadorEmpresa: String(value?.operadorEmpresa || '').trim(),
    operadorJefe: String(value?.operadorJefe || '').trim(),
    operadorRuc: String(value?.operadorRuc || '').trim(),
    planta: String(value?.planta || '').trim(),
    tipoModelo: String(value?.tipoModelo || '').trim(),
    ubicacion: String(value?.ubicacion || '').trim(),
  };
}

function mergeIppSchemaDataWithDispatchRows(params: {
  currentSchemaData?: Record<string, any>;
  incomingRows: IPPDispatchRow[];
  orderId: string;
  plantSettings?: Record<string, unknown> | null;
}): Record<string, any> {
  const currentRows = Array.isArray(params.currentSchemaData?.registroDespachos)
    ? params.currentSchemaData?.registroDespachos
    : [];
  const mergedRows = sortIppDispatchRows(
    mergeIppDispatchRows(currentRows, params.incomingRows)
  ).map((row, index) => ({
    ...row,
    item: index + 1,
  }));
  const currentPlantData = params.currentSchemaData?.datosPlanta || {};
  const normalizedPlantSettings = normalizeProductionReportPlantSettings(
    params.plantSettings
  );

  return {
    ...(params.currentSchemaData || {}),
    __ippOrderId: params.orderId,
    datosPlanta: {
      ...normalizedPlantSettings,
      ...Object.fromEntries(
        Object.entries(currentPlantData).filter(
          ([, value]) => value !== undefined && value !== null && String(value).trim() !== ''
        )
      ),
    },
    firmas: params.currentSchemaData?.firmas || {
      controlCalidad: {
        cargo: 'Ing. Control de Calidad',
        cip: '',
        empresa: '',
        nombre: '',
      },
      jefePlanta: {
        cargo: 'Jefe de Producción de Planta',
        cip: '',
        empresa: '',
        nombre: '',
      },
      laboratorista: {
        cargo: 'Jefe de Laboratorio de Planta',
        cip: '',
        empresa: '',
        nombre: '',
      },
    },
    observaciones: params.currentSchemaData?.observaciones || '',
    panelFotograficoLaboratorio:
      params.currentSchemaData?.panelFotograficoLaboratorio || { fotos: [] },
    panelFotograficoPlanta:
      params.currentSchemaData?.panelFotograficoPlanta || { fotos: [] },
    registroDespachos: mergedRows,
    resumenProduccion: buildResumenProduccion(mergedRows),
  };
}

function mapDispatchToIppRow(dispatch: any): IPPDispatchRow {
  return {
    _dispatchId: String(dispatch._id || ''),
    chofer: String(dispatch.driverName || '').trim(),
    estado: 'CONFORME',
    fecha: formatPeruDate(dispatch.date),
    guiaRemision:
      String(
        dispatch.guiaRemision ||
          dispatch.nroValeGuia ||
          dispatch.guia ||
          dispatch.nroVale ||
          ''
      ).trim(),
    horaSalida: String(dispatch.hour || '').trim(),
    licencia: String(dispatch.driverLicense || '').trim(),
    nroCubos: toNumber(dispatch.quantity),
    ordenDespacho: parseOrdenDespacho(dispatch.note),
    placa: String(dispatch.plate || '').trim(),
    tempSalida: toNumber(dispatch.placeholders?.tempSalida),
  };
}

async function sendMessageToTargets(params: {
  companyId: string;
  message: string;
  sender: string;
  targets: string[];
}) {
  let deliveredToAllTargets = true;

  for (const target of params.targets) {
    const sendResult = await WhatsAppDirectService.sendMessage(
      params.sender,
      target,
      params.message,
      {
        companyId: params.companyId,
        queueOnFail: true,
      }
    );

    if (isQueuedWhatsAppResult(sendResult)) {
      deliveredToAllTargets = false;
    }
  }

  return deliveredToAllTargets;
}

async function enqueueIppReadyNotification(params: {
  companyBotLabel: string;
  companyId: string;
  dispatch: any;
  order: any | null;
  sender: string;
  targets: string[];
}) {
  if (!params.sender || params.targets.length === 0 || !params.order?._id) {
    return;
  }

  await enqueueDomainEvent({
    sourceEventId: `dispatch.completed:${String(params.dispatch?._id || '')}:ipp-ready-notification`,
    companyId: params.companyId,
    aggregateId: String(params.order._id),
    aggregateType: 'order',
    eventType: 'dispatch.ipp-report.ready-notification.requested',
    availableAt: new Date(Date.now() + DISPATCH_IPP_READY_NOTIFICATION_DELAY_MS),
    payload: {
      message: buildDispatchIppReadyMessage(
        params.companyBotLabel,
        String(params.dispatch?.obra || params.order?.obra || '').trim() || 'No especificada'
      ),
      sender: params.sender,
      targets: params.targets,
    },
  });
}

function assertSuccessfulResponse(response: Response, action: string) {
  if (!response.ok) {
    throw new Error(`${action} failed with status ${response.status}`);
  }
}

async function markRunFlags(params: {
  companyId: string;
  dispatchId: string;
  patch: Record<string, unknown>;
}) {
  const EventRunModel = await getDomainEventRunModel();
  await EventRunModel.updateOne(
    {
      companyId: params.companyId,
      eventId: params.dispatchId,
      runKey: DISPATCH_COMPLETION_RUN_KEY,
    },
    { $set: params.patch }
  );
}

async function acquireRun(companyId: string, dispatchId: string) {
  const EventRunModel = await getDomainEventRunModel();
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + DISPATCH_POST_PROCESS_LOCK_MS);

  try {
    const run = await EventRunModel.findOneAndUpdate(
      {
        companyId,
        eventId: dispatchId,
        runKey: DISPATCH_COMPLETION_RUN_KEY,
        $or: [
          { status: { $ne: 'running' } },
          { lockExpiresAt: { $exists: false } },
          { lockExpiresAt: { $lt: now } },
        ],
      },
      {
        $setOnInsert: {
          attempts: 0,
          clientAlertSent: false,
          clientFinalAlertSent: false,
          configUpdated: false,
          eventType: 'dispatch.completed',
          ippDocumentReady: false,
          ippSynced: false,
          plantFinishedAlertSent: false,
          plantProgressAlertSent: false,
          runKey: DISPATCH_COMPLETION_RUN_KEY,
          runType: 'workflow',
        },
        $set: {
          lastError: '',
          lockExpiresAt,
          status: 'running',
        },
        $inc: { attempts: 1 },
      },
      {
        new: true,
        upsert: true,
      }
    ).lean();

    return run;
  } catch (error: any) {
    if (error?.code === 11000) {
      return null;
    }
    throw error;
  }
}

async function releaseRun(params: {
  companyId: string;
  dispatchId: string;
  error?: unknown;
}) {
  const EventRunModel = await getDomainEventRunModel();
  await EventRunModel.updateOne(
    {
      companyId: params.companyId,
      eventId: params.dispatchId,
      runKey: DISPATCH_COMPLETION_RUN_KEY,
    },
    {
      $set: {
        lastError:
          params.error instanceof Error
            ? params.error.message
            : params.error
              ? String(params.error)
              : '',
        lockExpiresAt: null,
        status: params.error ? 'failed' : 'completed',
      },
    }
  );
}

async function queueDispatchCompletionRun(input: DispatchCompletionWorkflowInput) {
  const EventRunModel = await getDomainEventRunModel();

  await EventRunModel.updateOne(
    {
      companyId: input.companyId,
      eventId: input.dispatchId,
      runKey: DISPATCH_COMPLETION_RUN_KEY,
    },
    {
      $setOnInsert: {
        attempts: 0,
        clientAlertSent: false,
        clientFinalAlertSent: false,
        configUpdated: false,
        eventType: 'dispatch.completed',
        ippDocumentReady: false,
        ippSynced: false,
        plantFinishedAlertSent: false,
        plantProgressAlertSent: false,
        runKey: DISPATCH_COMPLETION_RUN_KEY,
        runType: 'workflow',
      },
      $set: {
        lastError: '',
        lockExpiresAt: null,
        status: 'queued',
      },
    },
    { upsert: true }
  );
}

export async function buildDispatchCompletionContext(
  input: DispatchCompletionWorkflowInput
): Promise<DispatchContext> {
  const DispatchModel = await getFlexibleModel('Dispatch', 'dispatches');
  const OrderModel = await getFlexibleModel('Order', 'orders');
  const ClientModel = await getFlexibleModel('Client', 'clients');
  const CompanyModel = await getFlexibleModel('Company', 'companies');

  const dispatchObjectId = mongoose.Types.ObjectId.isValid(input.dispatchId)
    ? new mongoose.Types.ObjectId(input.dispatchId)
    : input.dispatchId;
  const dispatch = await DispatchModel.findOne({
    _id: dispatchObjectId,
    companyId: input.companyId,
  }).lean();

  if (!dispatch) {
    throw new Error('Dispatch not found');
  }

  const [order, client, company] = await Promise.all([
    dispatch.orderId
      ? OrderModel.findOne({ _id: dispatch.orderId, companyId: input.companyId }).lean()
      : Promise.resolve(null),
    dispatch.clientId
      ? ClientModel.findOne({ _id: dispatch.clientId, companyId: input.companyId }).lean()
      : Promise.resolve(null),
    CompanyModel.findOne({ companyId: input.companyId, isActive: true }).lean(),
  ]);

  const orderDispatches = dispatch.orderId
    ? await DispatchModel.find({
        companyId: input.companyId,
        orderId: dispatch.orderId,
        state: { $ne: 'eliminado' },
      }).lean()
    : [];
  const remainingOrderDispatches = orderDispatches.filter(
    (dispatchItem) =>
      dispatchItem.state === 'pendiente' || dispatchItem.state === 'progreso'
  ).length;

  const { endDate, startDate } = normalizeDateRangeForDispatchQueue(new Date());
  const operationalPendingCount = await DispatchModel.countDocuments({
    companyId: input.companyId,
    date: {
      $gte: startDate,
      $lt: endDate,
    },
    state: { $in: ['pendiente', 'progreso'] },
  });

  return {
    client,
    company,
    companyBotLabel: getCompanyBotLabel(
      company?.slug || company?.name || input.companyId
    ),
    dispatch,
    operationalPendingCount,
    order,
    orderDispatches,
    remainingOrderDispatches,
    sender:
      normalizeSender(input.sender) ||
      normalizeSender(String(company?.whatsappConfig?.sender || '')),
  };
}

async function updateDispatchConfigs(params: {
  companyId: string;
  dispatch: any;
  enabled: boolean;
  run: any;
  trackRun?: boolean;
}) {
  if (!params.enabled || params.run?.configUpdated === true) {
    return;
  }

  const ConfigModel = await getFlexibleModel('Config', 'configs');
  const configs = await ConfigModel.find({
    companyId: params.companyId,
    type: 'maintenance',
    unit: 'm3',
  }).lean();

  for (const config of configs) {
    await ConfigModel.updateOne(
      { _id: config._id, companyId: params.companyId },
      {
        $set: {
          currentValue: toNumber(config.currentValue) + toNumber(params.dispatch.quantity),
        },
      }
    );
  }

  if (params.trackRun === true) {
    await markRunFlags({
      companyId: params.companyId,
      dispatchId: String(params.dispatch._id || ''),
      patch: { configUpdated: true },
    });
  }
}

async function syncIppDispatchReport(params: {
  companyId: string;
  dispatch: any;
  order: any | null;
  run: any;
  trackRun?: boolean;
}) {
  if (!params.order?._id || params.run?.ippSynced === true) {
    return;
  }

  const authToken = createInternalAuthToken(params.companyId, 'dispatch-ipp-sync');
  const response = await fetch(
    `${config.portal.baseUrl}/api/dispatch/${String(params.dispatch?._id || '')}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'x-company-id': params.companyId,
      },
      body: JSON.stringify({
        orderId: String(params.order._id),
      }),
    }
  );
  assertSuccessfulResponse(response, 'Portal IPP sync');

  if (params.trackRun === true) {
    await markRunFlags({
      companyId: params.companyId,
      dispatchId: String(params.dispatch._id || ''),
      patch: { ippSynced: true },
    });
  }
}

async function resolveIppReportForOrder(params: {
  companyId: string;
  orderId: string;
}) {
  const ServiceManagementModel = await getFlexibleModel(
    'ServiceManagement',
    'servicemanagements'
  );
  const ReportModel = await getFlexibleModel(
    'ServiceManagementReport',
    'servicemanagementreports'
  );

  const linkedServices = await ServiceManagementModel.find({
    companyId: params.companyId,
    orderIds: params.orderId,
  })
    .sort({ createdAt: -1 })
    .lean();
  const service = linkedServices[0];
  if (!service?._id) {
    return { report: null, service: null };
  }

  const reports = await ReportModel.find({
    companyId: params.companyId,
    serviceManagementId: String(service._id),
    type: 'IPP',
  })
    .sort({ createdAt: 1 })
    .lean();

  const report =
    reports.find((reportItem) =>
      Array.isArray(reportItem.orderIds) &&
      reportItem.orderIds.map((value: unknown) => String(value)).includes(params.orderId)
    ) ||
    null;

  return { report, service };
}

async function generateIppReportPdf(params: {
  baseUrl?: string;
  companyId: string;
  reportId: string;
}) {
  const publicBaseUrl = parseBaseUrl(params.baseUrl);
  const response = await fetch(`http://127.0.0.1:${config.port}/api/documents/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${createInternalAuthToken(params.companyId, 'dispatch-ipp-generator')}`,
      'Content-Type': 'application/json',
      ...(publicBaseUrl
        ? {
            'x-forwarded-host': publicBaseUrl.host,
            'x-forwarded-proto': publicBaseUrl.protocol.replace(':', ''),
          }
        : {}),
    },
    body: JSON.stringify({
      format: 'pdf',
      reportId: params.reportId,
    }),
  });

  if (!response.ok) {
    throw new Error(`IPP PDF generation failed with status ${response.status}`);
  }

  const payload = await response.json();
  const data = payload?.data || {};
  const pdfUrlAbsolute = String(data.pdfUrlAbsolute || '').trim();
  const pdfSizeBytes = Number(data.pdfSizeBytes || 0);

  if (!pdfUrlAbsolute || !Number.isFinite(pdfSizeBytes) || pdfSizeBytes <= 0) {
    throw new Error('IPP PDF generation returned an invalid payload');
  }

  return {
    pdfSizeBytes,
    pdfUrlAbsolute,
  };
}

async function upsertIppReportMedia(params: {
  companyId: string;
  orderId: string;
  report: any;
  pdfSizeBytes: number;
  pdfUrlAbsolute: string;
  serviceId: string;
}) {
  const authToken = createInternalAuthToken(params.companyId, 'dispatch-ipp-media-sync');
  const requestHeaders = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    'x-company-id': params.companyId,
  };
  const mediaQuery = new URLSearchParams({
    reportId: String(params.report._id || ''),
    resourceId: params.orderId,
    type: 'SERVICE_REPORT',
  });
  const existingResponse = await fetch(
    `${config.portal.baseUrl}/api/media?${mediaQuery.toString()}`,
    {
      headers: requestHeaders,
      method: 'GET',
    }
  );

  const reportTitle =
    String(params.report.title || '').trim() || 'Producción de planta';
  const reportDate = String(params.report.executionDate || params.report.date || '').trim();
  const fileName = `${reportTitle}${reportDate ? ` - ${reportDate.slice(0, 10)}` : ''}.pdf`;
  const metadata = {
    orderId: params.orderId,
    reportDate,
    reportId: String(params.report._id || ''),
    reportTitle,
    reportType: 'IPP',
    serviceId: params.serviceId,
    thumbnailStatus: 'pending',
  };

  if (existingResponse.ok) {
    const existingPayload = await existingResponse.json();
    const existingMedia = Array.isArray(existingPayload?.data)
      ? existingPayload.data[0]
      : undefined;

    if (existingMedia?._id) {
      const updateResponse = await fetch(
        `${config.portal.baseUrl}/api/media/${existingMedia._id}`,
        {
          method: 'PUT',
          headers: requestHeaders,
          body: JSON.stringify({
            date: new Date().toISOString(),
            metadata: {
              ...(existingMedia.metadata || {}),
              ...metadata,
              fileSize: params.pdfSizeBytes,
            },
            name: fileName,
            thumbnailUrl: existingMedia.thumbnailUrl || '',
            url: params.pdfUrlAbsolute,
          }),
        }
      );
      assertSuccessfulResponse(updateResponse, 'IPP media update');
      return;
    }
  }

  const registerResponse = await fetch(`${config.portal.baseUrl}/api/drive/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileSize: params.pdfSizeBytes,
      lilaAppPath: 'service/reports',
      metadata,
      mimeType: 'application/pdf',
      name: fileName,
      resourceId: params.orderId,
      thumbnailStatus: 'pending',
      type: 'SERVICE_REPORT',
      url: params.pdfUrlAbsolute,
    }),
  });
  assertSuccessfulResponse(registerResponse, 'IPP media register');
}

async function ensureIppReportDocumentReady(params: {
  baseUrl?: string;
  companyId: string;
  order: any | null;
}) {
  const orderId = String(params.order?._id || '').trim();
  if (!orderId) {
    return;
  }

  const { report, service } = await resolveIppReportForOrder({
    companyId: params.companyId,
    orderId,
  });
  if (!report?._id || !service?._id) {
    throw new Error('IPP report not found for completed order');
  }

  const generated = await generateIppReportPdf({
    baseUrl: params.baseUrl,
    companyId: params.companyId,
    reportId: String(report._id),
  });

  await upsertIppReportMedia({
    companyId: params.companyId,
    orderId,
    pdfSizeBytes: generated.pdfSizeBytes,
    pdfUrlAbsolute: generated.pdfUrlAbsolute,
    report,
    serviceId: String(service._id),
  });
}

async function sendCompletionAlerts(params: {
  companyId: string;
  dispatch: any;
  context: DispatchContext;
  run: any;
  trackRun?: boolean;
}) {
  if (!params.context.sender) {
    return;
  }

  const clientTargets = getClientAlertTargets({
    context: params.context,
    dispatch: params.dispatch,
  });
  const dispatchAlertPayload: DispatchAlertPayload = {
    driverLicense: String(params.dispatch.driverLicense || '').trim(),
    driverName: String(params.dispatch.driverName || '').trim(),
    driverPhoneNumber: String(params.dispatch.driverPhoneNumber || '').trim(),
    note: String(params.dispatch.note || resolvePlantProgressUnitLabel({
      dispatch: params.dispatch,
      dispatches: params.context.orderDispatches,
    })).trim(),
    obra: String(params.dispatch.obra || params.context.order?.obra || '').trim() || 'No especificada',
    pending: params.context.remainingOrderDispatches,
    plate: String(params.dispatch.plate || '').trim(),
    quantity: toNumber(params.dispatch.quantity),
  };

  if (!params.run?.clientAlertSent && clientTargets.length > 0) {
    const delivered = await sendMessageToTargets({
      companyId: params.companyId,
      message: buildDispatchClientAlertMessage(
        params.context.companyBotLabel,
        dispatchAlertPayload
      ),
      sender: params.context.sender,
      targets: clientTargets,
    });
    if (params.trackRun === true && delivered) {
      await markRunFlags({
        companyId: params.companyId,
        dispatchId: String(params.dispatch._id || ''),
        patch: { clientAlertSent: true },
      });
    }
  }

  if (
    !params.run?.clientFinalAlertSent &&
    clientTargets.length > 0 &&
    params.context.remainingOrderDispatches === 0
  ) {
    const delivered = await sendMessageToTargets({
      companyId: params.companyId,
      message: buildDispatchClientFinalMessage(
        params.context.companyBotLabel,
        dispatchAlertPayload.obra
      ),
      sender: params.context.sender,
      targets: clientTargets,
    });
    if (params.trackRun === true && delivered) {
      await markRunFlags({
        companyId: params.companyId,
        dispatchId: String(params.dispatch._id || ''),
        patch: { clientFinalAlertSent: true },
      });
    }
  }

  if (!params.run?.plantProgressAlertSent && GROUP_PLANT_CONSTROAD) {
    const delivered = await sendMessageToTargets({
      companyId: params.companyId,
      message: buildDispatchPlantProgressMessage(
        params.context.companyBotLabel,
        resolvePlantProgressUnitLabel({
          dispatch: params.dispatch,
          dispatches: params.context.orderDispatches,
        }),
        params.context.operationalPendingCount
      ),
      sender: params.context.sender,
      targets: [GROUP_PLANT_CONSTROAD],
    });
    if (params.trackRun === true && delivered) {
      await markRunFlags({
        companyId: params.companyId,
        dispatchId: String(params.dispatch._id || ''),
        patch: { plantProgressAlertSent: true },
      });
    }
  }

  if (
    !params.run?.plantFinishedAlertSent &&
    GROUP_PLANT_CONSTROAD &&
    params.context.operationalPendingCount === 0
  ) {
    const delivered = await sendMessageToTargets({
      companyId: params.companyId,
      message: buildDispatchPlantEndMessage(params.context.companyBotLabel),
      sender: params.context.sender,
      targets: [GROUP_PLANT_CONSTROAD],
    });
    if (params.trackRun === true && delivered) {
      await markRunFlags({
        companyId: params.companyId,
        dispatchId: String(params.dispatch._id || ''),
        patch: { plantFinishedAlertSent: true },
      });
    }
  }
}

export async function runDispatchConfigUpdate(params: {
  context: DispatchContext;
  input: DispatchCompletionWorkflowInput;
  run?: any;
  trackRun?: boolean;
}) {
  await updateDispatchConfigs({
    companyId: params.input.companyId,
    dispatch: params.context.dispatch,
    enabled:
      params.input.truckDispatched === true &&
      params.input.state === 'despachado',
    run: params.run,
    trackRun: params.trackRun,
  });
}

export async function runDispatchIppSync(params: {
  context: DispatchContext;
  input: DispatchCompletionWorkflowInput;
  run?: any;
  trackRun?: boolean;
}) {
  if (params.input.state !== 'despachado') {
    return;
  }

  await syncIppDispatchReport({
    companyId: params.input.companyId,
    dispatch: params.context.dispatch,
    order: params.context.order,
    run: params.run,
    trackRun: params.trackRun,
  });
}

export async function runDispatchIppDocumentReady(params: {
  context: DispatchContext;
  input: DispatchCompletionWorkflowInput;
  run?: any;
  trackRun?: boolean;
}) {
  if (params.input.state !== 'despachado') {
    return;
  }
  if (params.context.remainingOrderDispatches !== 0 || !params.context.order?._id) {
    return;
  }
  if (params.run?.ippDocumentReady === true) {
    return;
  }

  await ensureIppReportDocumentReady({
    baseUrl: params.input.baseUrl,
    companyId: params.input.companyId,
    order: params.context.order,
  });

  const clientTargets = getClientAlertTargets({
    context: params.context,
    dispatch: params.context.dispatch,
  });
  if (params.context.sender && clientTargets.length > 0) {
    await enqueueIppReadyNotification({
      companyBotLabel: params.context.companyBotLabel,
      companyId: params.input.companyId,
      dispatch: params.context.dispatch,
      order: params.context.order,
      sender: params.context.sender,
      targets: clientTargets,
    });
  }

  if (params.trackRun === true) {
    await markRunFlags({
      companyId: params.input.companyId,
      dispatchId: params.input.dispatchId,
      patch: { ippDocumentReady: true },
    });
  }
}

export async function runDispatchCompletionNotifications(params: {
  context: DispatchContext;
  input: DispatchCompletionWorkflowInput;
  run?: any;
  trackRun?: boolean;
}) {
  if (params.input.state !== 'despachado') {
    return;
  }

  await sendCompletionAlerts({
    companyId: params.input.companyId,
    dispatch: params.context.dispatch,
    context: params.context,
    run: params.run,
    trackRun: params.trackRun,
  });
}

export function validateDispatchIppReadyNotificationInput(
  input: Partial<DispatchIppReadyNotificationInput>
): DispatchIppReadyNotificationInput {
  const companyId = String(input.companyId || '').trim();
  const message = String(input.message || '').trim();
  const sender = normalizeSender(input.sender);
  const targets = Array.isArray(input.targets)
    ? input.targets.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  if (!companyId) {
    throw new Error('companyId is required');
  }
  if (!message) {
    throw new Error('message is required');
  }
  if (!sender) {
    throw new Error('sender is required');
  }
  if (targets.length === 0) {
    throw new Error('targets are required');
  }

  return {
    companyId,
    message,
    sender,
    targets,
  };
}

export async function runDispatchIppReadyNotification(
  input: DispatchIppReadyNotificationInput
) {
  await sendMessageToTargets({
    companyId: input.companyId,
    message: input.message,
    sender: input.sender,
    targets: input.targets,
  });
}

export function validateDispatchCompletionWorkflowInput(
  input: Partial<DispatchCompletionWorkflowInput>
): DispatchCompletionWorkflowInput {
  const baseUrl = normalizeBaseUrl(input.baseUrl) || undefined;
  const companyId = String(input.companyId || '').trim();
  const dispatchId = String(input.dispatchId || '').trim();
  const sender = normalizeSender(input.sender);
  const state = String(input.state || '').trim();

  if (!companyId) {
    throw new Error('companyId is required');
  }
  if (!dispatchId) {
    throw new Error('dispatchId is required');
  }
  if (!state) {
    throw new Error('state is required');
  }

  return {
    baseUrl,
    companyId,
    dispatchFinished: input.dispatchFinished === true,
    dispatchId,
    sender,
    state,
    truckDispatched: input.truckDispatched === true,
  };
}

export function enqueueDispatchCompletionWorkflow(
  input: DispatchCompletionWorkflowInput,
  deps?: {
    persistRun?: (payload: DispatchCompletionWorkflowInput) => Promise<void>;
    runWorkflow?: (payload: DispatchCompletionWorkflowInput) => Promise<void>;
    schedule?: (runner: () => void) => void;
  }
) {
  const persistRun = deps?.persistRun || queueDispatchCompletionRun;
  const runWorkflow = deps?.runWorkflow || generateDispatchCompletionWorkflow;
  const schedule =
    deps?.schedule ||
    ((runner: () => void) => {
      setImmediate(runner);
    });

  schedule(() => {
    void persistRun(input)
      .then(() => runWorkflow(input))
      .catch((error) => {
        logger.error('dispatch_completion.background.failed', {
          companyId: input.companyId,
          dispatchId: input.dispatchId,
          error,
        });
      });
  });

  return {
    accepted: true,
    companyId: input.companyId,
    dispatchId: input.dispatchId,
  };
}

export async function generateDispatchCompletionWorkflow(
  input: DispatchCompletionWorkflowInput
) {
  const run = await acquireRun(input.companyId, input.dispatchId);
  if (!run) {
    return;
  }

  try {
    const context = await buildDispatchCompletionContext(input);

    await runDispatchConfigUpdate({
      context,
      input,
      run,
      trackRun: true,
    });
    await runDispatchIppSync({
      context,
      input,
      run,
      trackRun: true,
    });
    await runDispatchIppDocumentReady({
      context,
      input,
      run,
      trackRun: true,
    });
    await runDispatchCompletionNotifications({
      context,
      input,
      run,
      trackRun: true,
    });

    await releaseRun({
      companyId: input.companyId,
      dispatchId: input.dispatchId,
    });
  } catch (error) {
    await releaseRun({
      companyId: input.companyId,
      dispatchId: input.dispatchId,
      error,
    });
    throw error;
  }
}

export {
  buildDispatchClientAlertMessage,
  buildDispatchPlantEndMessage,
  buildDispatchPlantProgressMessage,
  buildDispatchIppReadyMessage,
  mergeIppSchemaDataWithDispatchRows,
  resolvePlantProgressUnitLabel,
};
