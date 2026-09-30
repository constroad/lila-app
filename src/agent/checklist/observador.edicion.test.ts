import { jest } from '@jest/globals';

/**
 * UN MENSAJE EDITADO ES LO QUE LA PERSONA QUISO DECIR. 30/09, 08:06: Globofast
 * escribió «@ConstRoad pásame el despacho de producción de hoy» y lo editó en
 * seguida a «…pásame el LINK del despacho…». La edición llega por
 * `messages.update` (Baileys la saca del `protocolMessage`), no por
 * `messages.upsert`, y nadie la escuchaba: Lila contestó el texto viejo con el
 * avance del día y hubo que pedirle «el link» otra vez.
 */
const atenderConsulta = jest.fn(async () => undefined);
const atenderEleccion = jest.fn(async () => false);
jest.unstable_mockModule('../consultas/index.js', () => ({
  __esModule: true,
  esConsulta: (texto: string, bot: string, mencionados: string[]) => /@lila\b/i.test(texto) || texto.includes(`@${bot}`) || mencionados.includes('244534046892225@lid'),
  atenderConsulta,
  atenderEleccion,
}));
jest.unstable_mockModule('../../database/models.js', () => ({
  __esModule: true,
  getCompanyModel: async () => ({ findOne: () => ({ lean: async () => ({ whatsappConfig: { sender: '51949376824' } }) }) }),
}));
jest.unstable_mockModule('../../services/whatsapp-direct.service.js', () => ({
  __esModule: true,
  WhatsAppDirectService: { selfJids: () => ['51949376824@s.whatsapp.net', '244534046892225@lid'], sendMessage: jest.fn(), setTyping: jest.fn() },
}));
jest.unstable_mockModule('./emisor.js', () => ({
  __esModule: true,
  avisarEnGrupo: jest.fn(async () => undefined),
  enviarAOperaciones: jest.fn(async () => undefined),
  enviarAprobado: jest.fn(async () => true),
}));
jest.unstable_mockModule('./aprobadores.js', () => ({
  __esModule: true,
  cargarAprobadores: jest.fn(async () => undefined),
  esAdmin: jest.fn(async () => true),
  esAprobador: jest.fn(async () => true),
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
const alcance = { grupoEscuchado: ADMIN, nombreGrupo: 'INFRAMAQ admin', grupoPlanta: '', nombreGrupoPlanta: '' };
const GLOBOFAST = '227049671282807@lid';
const AHORA = Date.parse('2026-09-30T08:06:30-05:00');

type Subject = typeof import('./observador.js');
let observador: Subject;
beforeAll(async () => {
  observador = await import('./observador.js');
});
beforeEach(() => {
  atenderConsulta.mockClear();
  atenderEleccion.mockClear();
});

/** Lo que Baileys 6.7.18 emite en `messages.update` para una edición (`process-message.js`, MESSAGE_EDIT). */
const edicion = (texto: string, { id = 'orig-1', quien = GLOBOFAST, grupo = ADMIN, tsMs = AHORA, mencion = true } = {}) => ({
  key: { remoteJid: grupo, participant: quien, id, fromMe: false },
  update: {
    message: { editedMessage: { message: { extendedTextMessage: { text: texto, contextInfo: mencion ? { mentionedJid: ['244534046892225@lid'] } : {} } } } },
    messageTimestamp: Math.floor(tsMs / 1000),
  },
});

describe('leerEdicion', () => {
  it('saca el texto nuevo, el grupo, quién y el id del mensaje ORIGINAL', () => {
    expect(observador.leerEdicion(edicion('@244534046892225 pásame el link del despacho de producción de hoy'), AHORA)).toMatchObject({
      remoteJid: ADMIN,
      id: 'orig-1',
      quien: GLOBOFAST,
      texto: '@244534046892225 pásame el link del despacho de producción de hoy',
    });
  });

  it('no es una edición: un acuse de lectura, un estado, un chat 1:1', () => {
    expect(observador.leerEdicion({ key: { remoteJid: ADMIN, id: 'x' }, update: { status: 4 } } as never, AHORA)).toBeNull();
    expect(observador.leerEdicion(edicion('hola', { grupo: '51902049935@s.whatsapp.net' }), AHORA)).toBeNull();
  });

  it('una edición vieja (llega al reconectar tras un deploy) ya no se contesta', () => {
    expect(observador.leerEdicion(edicion('@lila qué pedidos hay', { tsMs: AHORA - 6 * 60_000 }), AHORA)).toBeNull();
    expect(observador.leerEdicion(edicion('@lila qué pedidos hay', { tsMs: AHORA - 60_000 }), AHORA)).not.toBeNull();
  });
});

describe('cambioDeFondo', () => {
  it('cambiar palabras es un cambio; tildes, mayúsculas, signos o la mención, no', () => {
    expect(observador.cambioDeFondo('@244534046892225 pásame el despacho de producción de hoy', '@244534046892225 pásame el link del despacho de producción de hoy')).toBe(true);
    expect(observador.cambioDeFondo('@lila pasame el despacho de produccion de hoy', '@lila Pásame el despacho de producción de hoy!!')).toBe(false);
    expect(observador.cambioDeFondo(undefined, '@lila qué pedidos hay')).toBe(true);
  });
});

describe('observarEdiciones', () => {
  const soloAlcance = async () => alcance;

  it('una edición que le habla a Lila se atiende como consulta con el texto NUEVO', async () => {
    await observador.observarEdiciones('51949376824', [edicion('@244534046892225 pásame el link del despacho de producción de hoy', { id: 'e1', tsMs: Date.now() })], soloAlcance);
    await new Promise((r) => setImmediate(r));
    expect(atenderConsulta).toHaveBeenCalledWith('@244534046892225 pásame el link del despacho de producción de hoy', GLOBOFAST, ADMIN, alcance, '51949376824');
  });

  it('la misma edición por la segunda sesión del grupo no se atiende dos veces', async () => {
    const e = edicion('@lila qué pedidos hay mañana', { id: 'e2', tsMs: Date.now() });
    await observador.observarEdiciones('51949376824', [e], soloAlcance);
    await observador.observarEdiciones('51902049935', [e], soloAlcance);
    await new Promise((r) => setImmediate(r));
    expect(atenderConsulta).toHaveBeenCalledTimes(1);
  });

  it('una edición sin etiqueta a Lila no es consulta; la de otro grupo no se escucha', async () => {
    await observador.observarEdiciones('51949376824', [edicion('mañana salimos a las 5', { id: 'e3', tsMs: Date.now(), mencion: false })], soloAlcance);
    await observador.observarEdiciones('51949376824', [edicion('@lila qué pedidos hay', { id: 'e4', tsMs: Date.now(), grupo: '120363000000000000@g.us' })], soloAlcance);
    await new Promise((r) => setImmediate(r));
    expect(atenderConsulta).not.toHaveBeenCalled();
  });

  it('lo que edita el propio agente no es una consulta', async () => {
    await observador.observarEdiciones('51949376824', [edicion('@lila qué pedidos hay', { id: 'e5', tsMs: Date.now(), quien: '244534046892225@lid' })], soloAlcance);
    await new Promise((r) => setImmediate(r));
    expect(atenderConsulta).not.toHaveBeenCalled();
  });
});
