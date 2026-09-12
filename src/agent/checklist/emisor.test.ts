import { jest } from '@jest/globals';

/**
 * EL ÚNICO LUGAR QUE MANDA, y la aprobación se verifica ACÁ, no en quien llama.
 * Un «1» aprueba; el emisor vuelve a comprobar estado, destino y que no se haya
 * mandado ya. Si cualquiera falla, no sale nada y queda en el log.
 */
const sendMessage = jest.fn(async () => undefined);
jest.unstable_mockModule('../../services/whatsapp-direct.service.js', () => ({
  __esModule: true,
  WhatsAppDirectService: { sendMessage },
}));
jest.unstable_mockModule('../../database/models.js', () => ({
  __esModule: true,
  getCompanyModel: async () => ({
    findOne: () => ({ lean: async () => ({ whatsappConfig: { sender: '51949376824' } }) }),
  }),
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const ADMIN = '120363279615230332@g.us';
const PLANTA = '120363288945205546@g.us';
const alcance = {
  grupoEscuchado: ADMIN,
  nombreGrupo: 'INFRAMAQ admin',
  grupoPlanta: PLANTA,
  nombreGrupoPlanta: 'Inframaq Planta',
};

type Subject = typeof import('./emisor.js');
type Sugerencias = typeof import('./sugerencias.js');
let emisor: Subject;
let sugerencias: Sugerencias;

beforeAll(async () => {
  emisor = await import('./emisor.js');
  sugerencias = await import('./sugerencias.js');
});

beforeEach(() => {
  sendMessage.mockClear();
  emisor._resetEmisor();
  sugerencias._resetPropuestas();
});

const propuesta = (over: Partial<Parameters<Sugerencias['proponer']>[0]> = {}) =>
  sugerencias.proponer(
    {
      tipo: 'aviso-planta',
      pedidoId: 'p1',
      firma: 'f',
      destino: PLANTA,
      nombreDestino: 'Inframaq Planta',
      texto: 'hola planta',
      ...over,
    },
    1_000
  );

describe('enviarAprobado', () => {
  it('con «1» manda EXACTAMENTE el texto propuesto al destino propuesto', async () => {
    propuesta();
    const aprobada = sugerencias.decidir('1', 'jose', 2_000)!;

    await expect(emisor.enviarAprobado(aprobada, alcance)).resolves.toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0].slice(0, 3)).toEqual(['51949376824', PLANTA, 'hola planta']);
  });

  it('sin aprobación no manda', async () => {
    const pendiente = propuesta();

    await expect(emisor.enviarAprobado(pendiente, alcance)).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('descartada no manda', async () => {
    propuesta();
    const descartada = sugerencias.decidir('3', 'jose', 2_000)!;

    await expect(emisor.enviarAprobado(descartada, alcance)).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  /**
   * LA LISTA ES CERRADA. Aunque una propuesta apuntara a otro grupo —por un bug,
   * por un cambio de alcance entre proponer y aprobar—, el emisor la rechaza.
   * El «1» aprueba un texto, no abre una puerta.
   */
  it('un destino fuera de los dos grupos de la empresa NO se manda ni aprobado', async () => {
    propuesta({ destino: '120363429917575505@g.us', nombreDestino: 'otro' });
    const aprobada = sugerencias.decidir('1', 'jose', 2_000)!;

    await expect(emisor.enviarAprobado(aprobada, alcance)).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('una persona tampoco es destino', async () => {
    propuesta({ destino: '51999111222@s.whatsapp.net', nombreDestino: 'alguien' });
    const aprobada = sugerencias.decidir('1', 'jose', 2_000)!;

    await expect(emisor.enviarAprobado(aprobada, alcance)).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('una aprobación se consume: no se manda dos veces', async () => {
    propuesta();
    const aprobada = sugerencias.decidir('1', 'jose', 2_000)!;

    await emisor.enviarAprobado(aprobada, alcance);
    await expect(emisor.enviarAprobado(aprobada, alcance)).resolves.toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('enviarAOperaciones', () => {
  it('va al grupo de operaciones, sin aprobación', async () => {
    await expect(emisor.enviarAOperaciones('propuesta')).resolves.toBe(true);
    expect(sendMessage.mock.calls[0][1]).toBe('120363376500470254@g.us');
  });
});
