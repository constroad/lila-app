import { jest } from '@jest/globals';

/**
 * EL ORDEN EN QUE SE ATIENDE LO QUE LE DICEN AL AGENTE. 15/09, 09:12: tras
 * «¿lo genero? 1/2/3», «@ConstRoad 3» se tomó por una consulta nueva (volvió a
 * preguntar) y «3» citando la pregunta se tomó por un voto («cita desconocida:
 * se ignora»). La respuesta a una pregunta pendiente va PRIMERO, con o sin
 * etiqueta, con o sin cita; una consulta larga etiquetada sigue siendo consulta.
 */
const atenderConsulta = jest.fn(async () => undefined);
const atenderEleccion = jest.fn(async (texto: string) => /^\s*[123]\s*$/.test(texto));
const atenderContinuacion = jest.fn(async () => true);
jest.unstable_mockModule('../consultas/index.js', () => ({
  __esModule: true,
  esConsulta: (texto: string, bot: string, mencionados: string[]) => /@lila\b/i.test(texto) || texto.includes(`@${bot}`) || mencionados.includes('244534046892225@lid'),
  atenderConsulta,
  atenderEleccion,
  atenderContinuacion,
}));
jest.unstable_mockModule('../../database/models.js', () => ({
  __esModule: true,
  getCompanyModel: async () => ({ findOne: () => ({ lean: async () => ({ whatsappConfig: { sender: '51949376824' } }) }) }),
}));
jest.unstable_mockModule('../../services/whatsapp-direct.service.js', () => ({
  __esModule: true,
  WhatsAppDirectService: { selfJids: () => ['51949376824@s.whatsapp.net', '244534046892225@lid'], sendMessage: jest.fn(), setTyping: jest.fn() },
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
const QUIEN = '173066143440987@lid';

type Subject = typeof import('./observador.js');
let observador: Subject;
beforeAll(async () => {
  observador = await import('./observador.js');
});
beforeEach(() => {
  atenderConsulta.mockClear();
  atenderEleccion.mockClear();
  atenderContinuacion.mockClear();
});

const mensaje = (texto: string, contextInfo: Record<string, unknown> = {}) =>
  ({ key: { remoteJid: ADMIN, participant: QUIEN, id: 'm1' }, message: { extendedTextMessage: { text: texto, contextInfo } } }) as never;

describe('atenderComoConsulta', () => {
  it('«@bot 3» con una pregunta pendiente es la respuesta, no una consulta nueva', async () => {
    await observador.atenderComoConsulta(mensaje('@244534046892225 3', { mentionedJid: ['244534046892225@lid'] }), '@244534046892225 3', QUIEN, ADMIN, alcance, { votosSueltos: false });
    expect(atenderEleccion).toHaveBeenCalledWith('3', QUIEN, ADMIN, alcance);
    expect(atenderConsulta).not.toHaveBeenCalled();
  });

  it('«3» citando la pregunta del agente también es la respuesta', async () => {
    await observador.atenderComoConsulta(mensaje('3', { stanzaId: 'q1', participant: '244534046892225@lid' }), '3', QUIEN, ADMIN, alcance, { votosSueltos: false });
    expect(atenderEleccion).toHaveBeenCalledWith('3', QUIEN, ADMIN, alcance);
    expect(atenderContinuacion).not.toHaveBeenCalled();
  });

  it('una consulta larga etiquetada sigue siendo consulta aunque haya pregunta pendiente', async () => {
    await observador.atenderComoConsulta(mensaje('@lila qué pedidos hay hoy de globofast'), '@lila qué pedidos hay hoy de globofast', QUIEN, ADMIN, alcance, { votosSueltos: false });
    expect(atenderEleccion).not.toHaveBeenCalled();
    expect(atenderConsulta).toHaveBeenCalledTimes(1);
  });

  it('un mensaje corto que no contesta nada pendiente y va etiquetado es consulta', async () => {
    atenderEleccion.mockImplementationOnce(async () => false);
    await observador.atenderComoConsulta(mensaje('@lila ayuda'), '@lila ayuda', QUIEN, ADMIN, alcance, { votosSueltos: false });
    expect(atenderEleccion).toHaveBeenCalledTimes(1);
    expect(atenderConsulta).toHaveBeenCalledTimes(1);
  });

  it('un mensaje para otra persona no se toca', async () => {
    await observador.atenderComoConsulta(mensaje('3', { stanzaId: 'q1', participant: '188570740486215@lid' }), '3', QUIEN, ADMIN, alcance, { votosSueltos: false });
    expect(atenderEleccion).not.toHaveBeenCalled();
    expect(atenderConsulta).not.toHaveBeenCalled();
  });

  it('sin etiqueta y sin cita, un «sí» largo va a la elección de siempre (al final)', async () => {
    atenderEleccion.mockImplementation(async () => false);
    await observador.atenderComoConsulta(mensaje('buenos días a todos, cómo están'), 'buenos días a todos, cómo están', QUIEN, ADMIN, alcance, { votosSueltos: false });
    expect(atenderEleccion).toHaveBeenCalledTimes(1); // solo la de siempre, no la corta
    expect(atenderConsulta).not.toHaveBeenCalled();
    atenderEleccion.mockImplementation(async (texto: string) => /^\s*[123]\s*$/.test(texto));
  });
});
