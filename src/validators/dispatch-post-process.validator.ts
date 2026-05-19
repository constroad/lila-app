import type { DispatchPostProcessInput } from '../types/dispatch-post-process.js';

type ValidationResult =
  | { ok: true; data: DispatchPostProcessInput }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOrderCompletion(value: unknown): DispatchPostProcessInput['orderCompletion'] {
  if (!isRecord(value)) return undefined;

  const rows = Array.isArray(value.rows)
    ? value.rows
        .filter(isRecord)
        .map((row) => ({
          date: typeof row.date === 'string' ? row.date : '',
          driverName: typeof row.driverName === 'string' ? row.driverName : '',
          hour: typeof row.hour === 'string' ? row.hour : '',
          note: typeof row.note === 'string' ? row.note : '',
          plate: typeof row.plate === 'string' ? row.plate : '',
          quantity: typeof row.quantity === 'number' ? row.quantity : 0,
        }))
    : [];

  return {
    clientName: typeof value.clientName === 'string' ? value.clientName : '',
    date: typeof value.date === 'string' ? value.date : '',
    locationUrl: typeof value.locationUrl === 'string' ? value.locationUrl : '',
    obra: typeof value.obra === 'string' ? value.obra : '',
    orderId: typeof value.orderId === 'string' ? value.orderId : '',
    rows,
    totalM3: typeof value.totalM3 === 'number' ? value.totalM3 : 0,
    totalUnits: typeof value.totalUnits === 'number' ? value.totalUnits : rows.length,
  };
}

function normalizeIppReportPayload(value: unknown): DispatchPostProcessInput['ippReportPayload'] {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.companyId !== 'string') {
    return undefined;
  }

  return {
    type: value.type,
    companyId: value.companyId,
    serviceManagementId:
      typeof value.serviceManagementId === 'string' ? value.serviceManagementId : undefined,
    schemaData: isRecord(value.schemaData) ? value.schemaData : {},
    schemaOverrides: isRecord(value.schemaOverrides) ? value.schemaOverrides : {},
    customSections: Array.isArray(value.customSections) ? value.customSections : [],
    annexes: Array.isArray(value.annexes) ? value.annexes : [],
    folioConfig: value.folioConfig,
  };
}

export function validatePostProcessInput(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body must be an object' };
  }

  const payload = body as Record<string, unknown>;
  if (typeof payload.dispatchId !== 'string' || payload.dispatchId.trim() === '') {
    return { ok: false, error: 'dispatchId is required' };
  }
  if (typeof payload.companyId !== 'string' || payload.companyId.trim() === '') {
    return { ok: false, error: 'companyId is required' };
  }
  if (typeof payload.state !== 'string' || payload.state.trim() === '') {
    return { ok: false, error: 'state is required' };
  }

  return {
    ok: true,
    data: {
      dispatchId: payload.dispatchId,
      companyId: payload.companyId,
      orderId: typeof payload.orderId === 'string' ? payload.orderId : undefined,
      clientId: typeof payload.clientId === 'string' ? payload.clientId : undefined,
      state: payload.state,
      note: typeof payload.note === 'string' ? payload.note : undefined,
      quantity: typeof payload.quantity === 'number' ? payload.quantity : undefined,
      plate: typeof payload.plate === 'string' ? payload.plate : undefined,
      driverName:
        typeof payload.driverName === 'string' ? payload.driverName : undefined,
      driverLicense:
        typeof payload.driverLicense === 'string'
          ? payload.driverLicense
          : undefined,
      driverPhoneNumber:
        typeof payload.driverPhoneNumber === 'string'
          ? payload.driverPhoneNumber
          : undefined,
      obra: typeof payload.obra === 'string' ? payload.obra : undefined,
      truckDispatched: payload.truckDispatched === true,
      dispatchFinished: payload.dispatchFinished === true,
      allDispatched: payload.allDispatched === true,
      pendingCount: typeof payload.pendingCount === 'number' ? payload.pendingCount : 0,
      dispatchedCount:
        typeof payload.dispatchedCount === 'number' ? payload.dispatchedCount : 0,
      clientPendingCount:
        typeof payload.clientPendingCount === 'number'
          ? payload.clientPendingCount
          : 0,
      clientDispatchedCount:
        typeof payload.clientDispatchedCount === 'number'
          ? payload.clientDispatchedCount
          : 0,
      sender: typeof payload.sender === 'string' ? payload.sender : '',
      plantGroupTarget:
        typeof payload.plantGroupTarget === 'string'
          ? payload.plantGroupTarget
          : '',
      clientTargets: Array.isArray(payload.clientTargets)
        ? payload.clientTargets.filter(
            (target): target is string =>
              typeof target === 'string' && target.trim() !== ''
          )
        : [],
      sendDispatchMessage: payload.sendDispatchMessage !== false,
      adminGroupTarget:
        typeof payload.adminGroupTarget === 'string'
          ? payload.adminGroupTarget
          : '',
      ippReportPayload: normalizeIppReportPayload(payload.ippReportPayload),
      orderCompletion: normalizeOrderCompletion(payload.orderCompletion),
    },
  };
}
