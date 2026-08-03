export {};

/**
 * El cierre de fondo de la llegada NO puede depender del switch "Enviar vale al
 * conductor". Incidente constroad 02/08/2026: un pedido con ese switch APAGADO
 * dejo 5 unidades "en ruta" para siempre porque el job nunca se programo.
 * El as-is (ORDER-DISPATCH §6.1) promete "no depende del chofer".
 */
const scheduleAutoCloseMock = jest.fn().mockResolvedValue(true);
const hasScheduledMock = jest.fn().mockResolvedValue(false);
const axiosGet = jest.fn();

// `logger` importa `config/environment` (usa import.meta): en CJS hay que
// cortar la cadena entera, como hace dispatch-post-process.service.test.
jest.mock('../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../config/environment.js', () => ({
  config: {
    whatsapp: { sessionDir: '/tmp/lila-test/sessions' },
    portal: { baseUrl: 'https://portal.test' },
    security: { jwtSecret: 'test-secret' },
    logging: { dir: '/tmp/lila-test/logs' },
  },
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: axiosGet, post: jest.fn(), isAxiosError: jest.fn(() => false) },
}));

jest.mock('./dispatch-autoclose.service.js', () => ({
  scheduleDispatchAutoClose: scheduleAutoCloseMock,
  hasScheduledAutoClose: hasScheduledMock,
}));

jest.mock('./whatsapp-direct.service.js', () => ({
  WhatsAppDirectService: { sendMessage: jest.fn(), sendDocument: jest.fn() },
}));

jest.mock('../storage/json.store.js', () => ({
  __esModule: true,
  default: class {
    async get() { return undefined; }
    async set() {}
  },
}));

jest.mock('../utils/portal-callback.js', () => ({
  buildPortalCallbackHeaders: jest.fn(() => ({ Authorization: 'Bearer x' })),
}));

const reminder = require('./driver-arrival-reminder.service.js');

describe('scheduleDispatchArrivalAutoClose', () => {
  beforeEach(() => {
    scheduleAutoCloseMock.mockClear();
    hasScheduledMock.mockClear();
    hasScheduledMock.mockResolvedValue(false);
    axiosGet.mockReset();
    axiosGet.mockResolvedValue({ data: { data: { durationSeconds: 2400 } } });
  });

  it('programa el cierre sin telefono ni sender del chofer', async () => {
    await reminder.scheduleDispatchArrivalAutoClose({
      companyId: 'constroad',
      dispatchId: 'd-1',
    });

    expect(scheduleAutoCloseMock).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'constroad', dispatchId: 'd-1' })
    );
  });

  it('si el ETA no se puede consultar igual programa el cierre', async () => {
    axiosGet.mockRejectedValue(new Error('portal caido'));

    await reminder.scheduleDispatchArrivalAutoClose({
      companyId: 'constroad',
      dispatchId: 'd-2',
    });

    expect(scheduleAutoCloseMock).toHaveBeenCalledWith(
      expect.objectContaining({ dispatchId: 'd-2', etaSeconds: null })
    );
  });

  it('nunca lanza: programar el cierre no puede romper el vale', async () => {
    scheduleAutoCloseMock.mockRejectedValueOnce(new Error('store roto'));

    await expect(
      reminder.scheduleDispatchArrivalAutoClose({ companyId: 'c', dispatchId: 'd-3' })
    ).resolves.toBeUndefined();
  });

  it('si ya hay job no vuelve a consultar el ETA', async () => {
    hasScheduledMock.mockResolvedValue(true);

    await reminder.scheduleDispatchArrivalAutoClose({ companyId: 'c', dispatchId: 'd-4' });

    expect(axiosGet).not.toHaveBeenCalled();
    expect(scheduleAutoCloseMock).not.toHaveBeenCalled();
  });
});
