import {
  GRUPO_ESCUCHA_PILOTO,
  debeEscuchar,
  esJidDeGrupo,
  destinoPermitido,
  grupoDestino,
  puedeEnviarA,
  resolverAlcance,
} from './alcance';
import { GROUP_ERRORS_TRACKING } from '../../constants/whatsapp.constants';
import { normalizarTexto } from './checklist';

/**
 * EL ALCANCE ES UNA LISTA BLANCA DE UNO.
 *
 * José, 09/09/2026: «solo y únicamente debe escuchar inframaq admin y responder
 * a errors tracking. Nada a ningún otro grupo o chat individual.»
 *
 * Un agente que habla en el grupo equivocado pierde la confianza de una sola vez.
 * Estos tests son la garantía de que eso no puede pasar por un descuido.
 */
const ADMIN_INFRAMAQ = '120363288945205546@g.us';
const alcance = { grupoEscuchado: ADMIN_INFRAMAQ };

describe('de dónde sale cada grupo', () => {
  /**
   * NO sale de `whatsappConfig.adminGroupId`: en inframaq ese campo apunta hoy al
   * grupo de PLANTA (José, 09/09/2026). Colgarse de él haría que el agente
   * escuchara el grupo equivocado, y que un cambio de configuración de otra
   * persona moviera el alcance del agente sin que nadie lo note.
   */
  it('el escuchado se resuelve por NOMBRE contra los grupos de la sesión', async () => {
    const resuelto = await resolverAlcance(async (nombre) => {
      expect(nombre).toBe(GRUPO_ESCUCHA_PILOTO);
      return ADMIN_INFRAMAQ;
    });

    expect(resuelto.grupoEscuchado).toBe(ADMIN_INFRAMAQ);
  });

  it('si la constante ya es un JID, no se resuelve nada', async () => {
    const resolver = jest.fn();
    // `esJidDeGrupo` corta antes: un JID no necesita traducción.
    expect(esJidDeGrupo(ADMIN_INFRAMAQ)).toBe(true);
    expect(esJidDeGrupo('Inframaq Admin')).toBe(false);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('si el nombre no existe en la sesión no escucha nada', async () => {
    expect((await resolverAlcance(async () => '')).grupoEscuchado).toBe('');
    // Y tampoco acepta cualquier cosa que no sea un JID de grupo.
    expect((await resolverAlcance(async () => 'Inframaq Admin')).grupoEscuchado).toBe('');
    expect((await resolverAlcance(async () => '51999@s.whatsapp.net')).grupoEscuchado).toBe('');
  });

  it('si la resolución falla no escucha nada, no revienta', async () => {
    const resuelto = await resolverAlcance(async () => {
      throw new Error('sesión caída');
    });
    expect(resuelto.grupoEscuchado).toBe('');
  });

  /**
   * El nombre real del grupo en WhatsApp es «INFRAMAQ admin» (verificado en el
   * store de la sesión 51949376824). La constante dice «Inframaq Admin» y
   * coincide porque la comparación normaliza — este test fija que eso siga
   * siendo cierto, en vez de depender de la suerte.
   */
  it('la constante coincide con el nombre real del grupo, sin importar capitalización', () => {
    expect(normalizarTexto(GRUPO_ESCUCHA_PILOTO)).toBe(normalizarTexto('INFRAMAQ admin'));
  });

  /** El destino es NUESTRO grupo de operaciones: constante, no config de tenant. */
  it('el destino es el grupo de operaciones que ya existía', () => {
    expect(grupoDestino()).toBe(GROUP_ERRORS_TRACKING);
  });
});

describe('escuchar', () => {
  it('solo el grupo resuelto', () => {
    expect(debeEscuchar(ADMIN_INFRAMAQ, alcance)).toBe(true);
  });

  it('ningún otro grupo, ni parecido', () => {
    expect(debeEscuchar(GROUP_ERRORS_TRACKING, alcance)).toBe(false);
    expect(debeEscuchar('120363429917575505@g.us', alcance)).toBe(false);
    // Sufijos y prefijos: un `includes` habría dejado pasar estos dos.
    expect(debeEscuchar(`x${ADMIN_INFRAMAQ}`, alcance)).toBe(false);
    expect(debeEscuchar(ADMIN_INFRAMAQ.replace('@g.us', '1@g.us'), alcance)).toBe(false);
  });

  it('ningún chat individual', () => {
    expect(debeEscuchar('51999111222@s.whatsapp.net', alcance)).toBe(false);
    expect(debeEscuchar('', alcance)).toBe(false);
  });

  it('sin grupo resuelto no escucha ni al que sería el suyo', () => {
    expect(debeEscuchar(ADMIN_INFRAMAQ, { grupoEscuchado: '' })).toBe(false);
  });
});

describe('enviar', () => {
  it('solo al grupo de operaciones', () => {
    expect(puedeEnviarA(GROUP_ERRORS_TRACKING)).toBe(true);
    expect(destinoPermitido()).toBe(GROUP_ERRORS_TRACKING);
  });

  /**
   * NI SIQUIERA AL GRUPO QUE ESCUCHA. En fase de espejo el agente observa y
   * reporta; no le habla a la gente que trabaja.
   */
  it('NO al grupo que escucha', () => {
    expect(puedeEnviarA(ADMIN_INFRAMAQ)).toBe(false);
  });

  it('NO a una persona', () => {
    expect(puedeEnviarA('51999111222@s.whatsapp.net')).toBe(false);
    expect(puedeEnviarA('')).toBe(false);
  });
});
