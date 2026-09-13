import { jest } from '@jest/globals';

/**
 * EL ÚNICO LUGAR QUE MANDA, y la aprobación se verifica ACÁ, no en quien llama.
 * Un «1» aprueba; el emisor vuelve a comprobar estado, destino y que no se haya
 * mandado ya. Si cualquiera falla, no sale nada y queda en el log.
 */
const sendMessage = jest.fn(async () => undefined);
const sendImageFile = jest.fn(async () => undefined);
jest.unstable_mockModule('../../services/whatsapp-direct.service.js', () => ({
  __esModule: true,
  WhatsAppDirectService: {
    sendMessage,
    sendImageFile,
    sendVideoFile: jest.fn(async () => undefined),
    sendDocument: jest.fn(async () => undefined),
    setTyping: jest.fn(async () => undefined),
  },
}));
jest.unstable_mockModule('../../database/models.js', () => ({
  __esModule: true,
  getCompanyModel: async () => ({
    findOne: () => ({ lean: async () => ({ whatsappConfig: { sender: '51949376824' } }) }),
  }),
}));
jest.unstable_mockModule('../../services/whatsapp-media.utils.js', () => ({
  __esModule: true,
  resolveFileBuffer: jest.fn(async () => ({ buffer: Buffer.from('img'), mimeType: 'image/jpeg', fileName: 'x.jpg' })),
}));
jest.unstable_mockModule('./persistencia.js', () => ({
  __esModule: true,
  guardarPropuesta: jest.fn(async () => undefined),
  guardarMensaje: jest.fn(async () => undefined),
  cargarMensajes: jest.fn(async () => []),
  cargarPropuestas: jest.fn(async () => []),
  guardarConfig: jest.fn(async () => undefined),
  cargarConfig: jest.fn(async () => null),
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
type Interruptor = typeof import('./interruptor.js');
let emisor: Subject;
let sugerencias: Sugerencias;
let interruptor: Interruptor;

beforeAll(async () => {
  emisor = await import('./emisor.js');
  sugerencias = await import('./sugerencias.js');
  interruptor = await import('./interruptor.js');
});

beforeEach(() => {
  sendMessage.mockClear();
  emisor._resetEmisor();
  sugerencias._resetPropuestas();
  interruptor._resetInterruptor();
});

const propuesta = (over: Partial<Parameters<Sugerencias['proponer']>[0]> = {}) => {
  const p = sugerencias.proponer(
    {
      tipo: 'aviso-planta',
      fecha: '2026-09-13',
      firma: 'f',
      destino: PLANTA,
      nombreDestino: 'Inframaq Planta',
      texto: 'hola planta',
      ...over,
    },
    1_000
  );
  sugerencias.anotarMensaje(p.id, `MSG-${p.id}`);
  return p;
};

const admin = { quien: 'jose', esAprobador: true };
const aprobar = (p: { id: string }) => {
  const r = sugerencias.decidir({ voto: '1', citaMsgId: `MSG-${p.id}`, ...admin }, 2_000);
  if (r.ok === false) throw new Error(r.motivo);
  return r.propuesta;
};
const descartar = (p: { id: string }) => {
  const r = sugerencias.decidir({ voto: '3', citaMsgId: `MSG-${p.id}`, ...admin }, 2_000);
  if (r.ok === false) throw new Error(r.motivo);
  return r.propuesta;
};

describe('enviarAprobado', () => {
  it('con «1» manda EXACTAMENTE el texto propuesto al destino propuesto', async () => {
    const aprobada = aprobar(propuesta());

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
    const descartada = descartar(propuesta());

    await expect(emisor.enviarAprobado(descartada, alcance)).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  /**
   * LA LISTA ES CERRADA. Aunque una propuesta apuntara a otro grupo —por un bug,
   * por un cambio de alcance entre proponer y aprobar—, el emisor la rechaza.
   * El «1» aprueba un texto, no abre una puerta.
   */
  it('un destino fuera de los dos grupos de la empresa NO se manda ni aprobado', async () => {
    const aprobada = aprobar(propuesta({ destino: '120363429917575505@g.us', nombreDestino: 'otro' }));

    await expect(emisor.enviarAprobado(aprobada, alcance)).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('una persona tampoco es destino', async () => {
    const aprobada = aprobar(propuesta({ destino: '51999111222@s.whatsapp.net', nombreDestino: 'alguien' }));

    await expect(emisor.enviarAprobado(aprobada, alcance)).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  /** Apagado por `!lila off`, ni una propuesta aprobada sale. */
  it('con el agente apagado no manda ni lo aprobado', async () => {
    const aprobada = aprobar(propuesta());
    interruptor.apagar('jose');

    await expect(emisor.enviarAprobado(aprobada, alcance)).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('una aprobación se consume: no se manda dos veces', async () => {
    const aprobada = aprobar(propuesta());

    await emisor.enviarAprobado(aprobada, alcance);
    await expect(emisor.enviarAprobado(aprobada, alcance)).resolves.toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

/**
 * LA TERCERA PUERTA: responder una consulta en el grupo que preguntó. Solo ese
 * grupo, y solo lectura. Un JID distinto —otro grupo, una persona— no pasa.
 */
describe('responderEnGrupo', () => {
  it('responde en el grupo escuchado, texto y archivos', async () => {
    const ok = await emisor.responderEnGrupo(
      ADMIN,
      { texto: 'hola', archivos: [{ tipo: 'image', url: 'https://lila/x.jpg', nombre: 'x.jpg', companyId: 'globofas-s8k' }] },
      alcance
    );

    expect(ok).toBe(true);
    expect((sendMessage.mock.calls[0] as unknown[])[1]).toBe(ADMIN);
    expect(sendImageFile).toHaveBeenCalledTimes(1);
  });

  it('NO responde en otro grupo ni a una persona, aunque se lo pidan', async () => {
    for (const destino of [PLANTA, '120363429917575505@g.us', '51999111222@s.whatsapp.net', '']) {
      await expect(emisor.responderEnGrupo(destino, { texto: 'hola' }, alcance)).resolves.toBe(false);
    }
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('apagado, tampoco responde', async () => {
    interruptor.apagar('jose');
    await expect(emisor.responderEnGrupo(ADMIN, { texto: 'hola' }, alcance)).resolves.toBe(false);
  });
});

describe('enviarAOperaciones', () => {
  it('va al grupo de operaciones, sin aprobación', async () => {
    await expect(emisor.enviarAOperaciones('propuesta')).resolves.toBe(true);
    expect((sendMessage.mock.calls[0] as unknown[])[1]).toBe('120363376500470254@g.us');
  });
});
