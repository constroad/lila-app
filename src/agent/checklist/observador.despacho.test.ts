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
const avisarEnGrupo = jest.fn(async () => undefined);
jest.unstable_mockModule('./emisor.js', () => ({
  __esModule: true,
  avisarEnGrupo,
  enviarAOperaciones: jest.fn(async () => undefined),
  enviarAprobado: jest.fn(async () => true),
}));
jest.unstable_mockModule('./aprobadores.js', () => ({
  __esModule: true,
  cargarAprobadores: jest.fn(async () => undefined),
  esAdmin: jest.fn(async () => true),
  esAprobador: jest.fn(async (jid: string) => jid === '173066143440987@lid'),
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
type Sugerencias = typeof import('./sugerencias.js');
let observador: Subject;
let sugerencias: Sugerencias;
beforeAll(async () => {
  observador = await import('./observador.js');
  sugerencias = await import('./sugerencias.js');
});
beforeEach(() => {
  atenderConsulta.mockClear();
  atenderEleccion.mockClear();
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
    expect(atenderConsulta).not.toHaveBeenCalled();
  });

  /** 15/09, 10:30: Globofast citó el checklist para decirle a alguien «enlaza al grupo de certificados» y Lila contestó con la tabla de certificados. */
  it('citar un mensaje del agente sin etiquetarlo NO es una consulta', async () => {
    atenderEleccion.mockImplementation(async () => false);
    await observador.atenderComoConsulta(mensaje('Enlaza al grupo de certificados', { stanzaId: 'c1', participant: '244534046892225@lid' }), 'Enlaza al grupo de certificados', QUIEN, ADMIN, alcance, { votosSueltos: false });
    expect(atenderConsulta).not.toHaveBeenCalled();
    await observador.atenderComoConsulta(mensaje('¿y la 3?', { stanzaId: 'c1', participant: '244534046892225@lid' }), '¿y la 3?', QUIEN, ADMIN, alcance, { votosSueltos: false });
    expect(atenderConsulta).not.toHaveBeenCalled();
    atenderEleccion.mockImplementation(async (texto: string) => /^\s*[123]\s*$/.test(texto));
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

/** «2» u «ok» citando una propuesta pendiente: la persona quiso votar y no sabe cómo (José, 15/09: «valida que respondan con un número válido»). */
describe('un voto que no es 1 ni 3', () => {
  beforeEach(() => avisarEnGrupo.mockClear());
  it('reconoce el intento', () => {
    for (const t of ['2', '0', 'ok', 'sí', 'Si', 'dale', 'aprobado', '1.']) expect(observador.pareceIntentoDeVoto(t)).toBe(true);
    for (const t of ['enlaza al grupo de certificados', 'sí, está confirmado', '¿y la 3?', '']) expect(observador.pareceIntentoDeVoto(t)).toBe(false);
  });
  it('a un aprobador se le dice que vale 1 o 3; sin propuesta pendiente citada, nada', async () => {
    const propuesta = sugerencias.proponer({ tipo: 'aviso-planta', fecha: '2026-09-16', firma: 'f1', destino: 'p@g.us', nombreDestino: 'Inframaq Planta', texto: 'x' }, Date.now());
    sugerencias.anotarMensaje(propuesta.id, 'msg-propuesta');
    expect(await observador.explicarVotoInvalido('2', 'msg-propuesta', '173066143440987@lid', ADMIN, alcance)).toBe(true);
    expect(avisarEnGrupo).toHaveBeenCalledWith(ADMIN, 'Para «Inframaq Planta» vale *1* (enviar) o *3* (descartar), respondiendo a la propuesta.', alcance);
    expect(await observador.explicarVotoInvalido('2', 'otro-mensaje', '173066143440987@lid', ADMIN, alcance)).toBe(false);
    expect(await observador.explicarVotoInvalido('2', 'msg-propuesta', '188570740486215@lid', ADMIN, alcance)).toBe(false); // no aprueba: silencio
    expect(await observador.explicarVotoInvalido('1', 'msg-propuesta', '173066143440987@lid', ADMIN, alcance)).toBe(false); // «1» es un voto de verdad
    expect(avisarEnGrupo).toHaveBeenCalledTimes(1);
  });
});
