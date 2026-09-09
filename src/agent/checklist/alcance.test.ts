import {
  COMPANY_PILOTO,
  debeEscuchar,
  destinoPermitido,
  grupoDestino,
  puedeEnviarA,
  resolverAlcance,
} from './alcance';
import { GROUP_ERRORS_TRACKING } from '../../constants/whatsapp.constants';

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
   * El grupo escuchado es de un TENANT y sale de su config, no del código: el
   * 03/09/2026 los JID de tenant clavados produjeron 75 intentos de mandar datos
   * de una empresa al WhatsApp de otra.
   */
  it('el escuchado sale del adminGroupId de la empresa piloto', async () => {
    const resuelto = await resolverAlcance(async (id) => {
      expect(id).toBe(COMPANY_PILOTO);
      return { whatsappConfig: { adminGroupId: ADMIN_INFRAMAQ } };
    });

    expect(resuelto.grupoEscuchado).toBe(ADMIN_INFRAMAQ);
  });

  it('sin adminGroupId configurado no escucha nada', async () => {
    expect((await resolverAlcance(async () => ({ whatsappConfig: {} }))).grupoEscuchado).toBe('');
    expect((await resolverAlcance(async () => null)).grupoEscuchado).toBe('');
  });

  it('si la consulta falla no escucha nada, no revienta', async () => {
    const resuelto = await resolverAlcance(async () => {
      throw new Error('mongo caído');
    });
    expect(resuelto.grupoEscuchado).toBe('');
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
