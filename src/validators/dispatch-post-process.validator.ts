import type { DispatchPostProcessInput } from '../types/dispatch-post-process.js';

type ValidationResult =
  | { ok: true; data: DispatchPostProcessInput }
  | { ok: false; error: string };

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
    },
  };
}
