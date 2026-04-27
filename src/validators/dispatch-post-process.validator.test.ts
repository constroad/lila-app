export {};

const {
  validatePostProcessInput,
} = require('./dispatch-post-process.validator.js');

describe('validatePostProcessInput', () => {
  it('returns ok=false when body is null', () => {
    expect(validatePostProcessInput(null)).toEqual({
      ok: false,
      error: 'body must be an object',
    });
  });

  it('returns ok=false when dispatchId is missing', () => {
    expect(
      validatePostProcessInput({
        companyId: 'constroad',
        state: 'despachado',
      })
    ).toEqual({
      ok: false,
      error: 'dispatchId is required',
    });
  });

  it('returns ok=false when companyId is missing', () => {
    expect(
      validatePostProcessInput({
        dispatchId: 'dispatch-1',
        state: 'despachado',
      })
    ).toEqual({
      ok: false,
      error: 'companyId is required',
    });
  });

  it('returns ok=false when state is missing', () => {
    expect(
      validatePostProcessInput({
        dispatchId: 'dispatch-1',
        companyId: 'constroad',
      })
    ).toEqual({
      ok: false,
      error: 'state is required',
    });
  });

  it('returns ok=true with defaults for optional fields', () => {
    expect(
      validatePostProcessInput({
        dispatchId: 'dispatch-1',
        companyId: 'constroad',
        state: 'despachado',
      })
    ).toEqual({
      ok: true,
      data: {
        dispatchId: 'dispatch-1',
        companyId: 'constroad',
        orderId: undefined,
        clientId: undefined,
        state: 'despachado',
        note: undefined,
        quantity: undefined,
        plate: undefined,
        driverName: undefined,
        driverLicense: undefined,
        driverPhoneNumber: undefined,
        obra: undefined,
        truckDispatched: false,
        dispatchFinished: false,
        allDispatched: false,
        pendingCount: 0,
        sender: '',
        plantGroupTarget: '',
        clientTargets: [],
        sendDispatchMessage: true,
        adminGroupTarget: '',
      },
    });
  });

  it('returns ok=true with all valid fields', () => {
    expect(
      validatePostProcessInput({
        dispatchId: 'dispatch-1',
        companyId: 'constroad',
        orderId: 'order-1',
        clientId: 'client-1',
        state: 'despachado',
        note: 'Unidad 1',
        quantity: 7,
        plate: 'ABC-123',
        driverName: 'Luis',
        driverLicense: 'LIC-1',
        driverPhoneNumber: '999999999',
        obra: 'Obra Norte',
        truckDispatched: true,
        dispatchFinished: true,
        allDispatched: true,
        pendingCount: 0,
        sender: '51902049935',
        plantGroupTarget: 'plant@g.us',
        clientTargets: ['client@g.us'],
        sendDispatchMessage: false,
        adminGroupTarget: 'admin@g.us',
      })
    ).toEqual({
      ok: true,
      data: {
        dispatchId: 'dispatch-1',
        companyId: 'constroad',
        orderId: 'order-1',
        clientId: 'client-1',
        state: 'despachado',
        note: 'Unidad 1',
        quantity: 7,
        plate: 'ABC-123',
        driverName: 'Luis',
        driverLicense: 'LIC-1',
        driverPhoneNumber: '999999999',
        obra: 'Obra Norte',
        truckDispatched: true,
        dispatchFinished: true,
        allDispatched: true,
        pendingCount: 0,
        sender: '51902049935',
        plantGroupTarget: 'plant@g.us',
        clientTargets: ['client@g.us'],
        sendDispatchMessage: false,
        adminGroupTarget: 'admin@g.us',
      },
    });
  });
});
