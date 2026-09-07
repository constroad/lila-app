import { normalizeGroupParticipants } from '../utils/group-participants';

/**
 * Los integrantes de un grupo, listos para mencionar.
 *
 * EL BUG QUE ESTO CIERRA (07/09/2026): `listGroups` leía `group.participant`
 * —singular, un campo que NADIE escribe— mientras el store guarda `participants`.
 * La lista salía siempre vacía, y con ella cualquier mención: un "@all" en el
 * cuerpo del mensaje se veía pero no le sonaba el teléfono a nadie. Una palabra.
 */
describe('normalizeGroupParticipants', () => {
  it('extrae el JID de la forma que entrega Baileys', () => {
    expect(
      normalizeGroupParticipants([
        { id: '51999111222@s.whatsapp.net', admin: 'admin' },
        { id: '51999333444@s.whatsapp.net', admin: null },
      ])
    ).toEqual(['51999111222@s.whatsapp.net', '51999333444@s.whatsapp.net']);
  });

  it('acepta entradas viejas ya aplanadas a string', () => {
    expect(normalizeGroupParticipants(['51999111222@s.whatsapp.net'])).toEqual([
      '51999111222@s.whatsapp.net',
    ]);
  });

  /**
   * Devolver una mezcla haría que Baileys mencione A MEDIAS sin avisar: se ve un
   * mensaje con menciones y la mitad del grupo no se entera.
   */
  it('descarta lo que no es un JID en vez de mencionar a medias', () => {
    expect(
      normalizeGroupParticipants([
        { id: '51999111222@s.whatsapp.net' },
        { id: '' },
        { admin: 'admin' },
        'sin-arroba',
        null,
        undefined,
        42,
      ])
    ).toEqual(['51999111222@s.whatsapp.net']);
  });

  it('no repite a nadie', () => {
    expect(
      normalizeGroupParticipants([
        { id: '51999111222@s.whatsapp.net' },
        '51999111222@s.whatsapp.net',
      ])
    ).toEqual(['51999111222@s.whatsapp.net']);
  });

  it('lo que no es una lista es una lista vacía, no una excepción', () => {
    expect(normalizeGroupParticipants(undefined)).toEqual([]);
    expect(normalizeGroupParticipants(null)).toEqual([]);
    expect(normalizeGroupParticipants('todos')).toEqual([]);
    expect(normalizeGroupParticipants({})).toEqual([]);
  });
});
