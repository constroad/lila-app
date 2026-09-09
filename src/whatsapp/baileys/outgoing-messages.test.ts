import {
  OUTGOING_MAX,
  OUTGOING_TTL_MS,
  _resetOutgoing,
  findOutgoingMessage,
  outgoingSize,
  pruneOutgoing,
  recordOutgoingMessage,
} from './outgoing-messages';

/**
 * La memoria corta que permite reenviar un mensaje que el destinatario no pudo
 * descifrar.
 *
 * Incidente 09/09/2026: los choferes de globofas veían «Esperando este mensaje»
 * en los vales y las ubicaciones. WhatsApp pedía el reenvío automáticamente y
 * lila no tenía con qué responder, así que el placeholder quedaba para siempre.
 */

beforeEach(() => _resetOutgoing());

it('devuelve el mensaje que se pide reenviar', () => {
  recordOutgoingMessage('51903124919', 'ABC123', { conversation: 'vale' });

  expect(findOutgoingMessage('51903124919', 'ABC123')).toEqual({ conversation: 'vale' });
});

it('un id que no existe devuelve undefined, no revienta', () => {
  expect(findOutgoingMessage('51903124919', 'NO-EXISTE')).toBeUndefined();
  expect(findOutgoingMessage('51903124919', '')).toBeUndefined();
  expect(findOutgoingMessage('51903124919', null)).toBeUndefined();
});

/**
 * Un id de OTRA sesión no puede devolver contenido: sería mandarle a un
 * destinatario un mensaje cifrado con la sesión equivocada.
 */
it('no cruza sesiones', () => {
  recordOutgoingMessage('51903124919', 'ABC123', { conversation: 'de globofas' });

  expect(findOutgoingMessage('51949376824', 'ABC123')).toBeUndefined();
  expect(findOutgoingMessage('51903124919', 'ABC123')).toEqual({ conversation: 'de globofas' });
});

it('lo vencido no se reenvía: un retry tardío no resucita un mensaje de ayer', () => {
  const ahora = 1_000_000;
  recordOutgoingMessage('51903124919', 'ABC123', { conversation: 'viejo' }, ahora);

  expect(findOutgoingMessage('51903124919', 'ABC123', ahora + OUTGOING_TTL_MS - 1)).toBeDefined();
  expect(findOutgoingMessage('51903124919', 'ABC123', ahora + OUTGOING_TTL_MS + 1)).toBeUndefined();
});

describe('memoria acotada — la mini tiene 8 GB compartidos con producción', () => {
  it('nunca guarda más que el tope', () => {
    for (let i = 0; i < OUTGOING_MAX + 50; i += 1) {
      recordOutgoingMessage('51903124919', `ID-${i}`, { conversation: `m${i}` });
    }

    expect(outgoingSize()).toBe(OUTGOING_MAX);
    // Se desaloja el más viejo, no el más nuevo: los retries llegan enseguida.
    expect(findOutgoingMessage('51903124919', 'ID-0')).toBeUndefined();
    expect(findOutgoingMessage('51903124919', `ID-${OUTGOING_MAX + 49}`)).toBeDefined();
  });

  it('el barrido descarta lo vencido', () => {
    const ahora = 1_000_000;
    recordOutgoingMessage('51903124919', 'VIEJO', { conversation: 'a' }, ahora);
    recordOutgoingMessage('51903124919', 'NUEVO', { conversation: 'b' }, ahora + OUTGOING_TTL_MS);

    pruneOutgoing(ahora + OUTGOING_TTL_MS + 1);

    expect(findOutgoingMessage('51903124919', 'VIEJO')).toBeUndefined();
    expect(findOutgoingMessage('51903124919', 'NUEVO', ahora + OUTGOING_TTL_MS + 1)).toBeDefined();
  });

  it('reenviar el mismo id lo refresca en vez de duplicarlo', () => {
    recordOutgoingMessage('51903124919', 'ABC123', { conversation: 'v1' }, 1_000);
    recordOutgoingMessage('51903124919', 'ABC123', { conversation: 'v2' }, 2_000);

    expect(outgoingSize()).toBe(1);
    expect(findOutgoingMessage('51903124919', 'ABC123', 2_000)).toEqual({ conversation: 'v2' });
  });
});

/**
 * SE LLAMA DESDE EL CAMINO DE ENVÍO. Un fallo acá jamás puede tumbar un vale que
 * ya salió bien, así que nada de lo que reciba puede hacerlo lanzar.
 */
describe('no rompe el envío pase lo que pase', () => {
  it('argumentos basura se ignoran en silencio', () => {
    expect(() => recordOutgoingMessage('', 'ABC', { a: 1 })).not.toThrow();
    expect(() => recordOutgoingMessage('51903124919', '', { a: 1 })).not.toThrow();
    expect(() => recordOutgoingMessage('51903124919', 'ABC', null)).not.toThrow();
    expect(() => recordOutgoingMessage('51903124919', 'ABC', undefined)).not.toThrow();
    expect(outgoingSize()).toBe(0);
  });

  it('sin mensaje guardado no se inventa nada', () => {
    recordOutgoingMessage('51903124919', 'ABC', undefined);
    expect(findOutgoingMessage('51903124919', 'ABC')).toBeUndefined();
  });
});
