import {
  debeEscuchar,
  destinoPermitido,
  grupoDestino,
  grupoEscuchado,
  puedeEnviarA,
} from './alcance';

/**
 * EL ALCANCE ES UNA LISTA BLANCA DE UNO.
 *
 * José, 09/09/2026: «solo y únicamente debe escuchar inframaq admin y responder
 * a errors tracking. Nada a ningún otro grupo o chat individual.»
 *
 * Un agente que habla en el grupo equivocado pierde la confianza de una sola vez.
 * Estos tests son la garantía de que eso no puede pasar por un descuido.
 */
const ADMIN = '120363288945205546@g.us';
const OPS = '120363376500470254@g.us';

const env = { ...process.env };
beforeEach(() => {
  process.env.AGENTE_CHECKLIST = 'on';
  process.env.AGENTE_GRUPO_ESCUCHA = ADMIN;
  process.env.AGENTE_GRUPO_DESTINO = OPS;
});
afterEach(() => {
  process.env = { ...env };
});

describe('escuchar', () => {
  it('solo el grupo configurado', () => {
    expect(debeEscuchar(ADMIN)).toBe(true);
  });

  it('ningún otro grupo, ni parecido', () => {
    expect(debeEscuchar(OPS)).toBe(false);
    expect(debeEscuchar('120363429917575505@g.us')).toBe(false);
    // Sufijos y prefijos: un `includes` habría dejado pasar estos dos.
    expect(debeEscuchar(`x${ADMIN}`)).toBe(false);
    expect(debeEscuchar(ADMIN.replace('@g.us', '1@g.us'))).toBe(false);
  });

  it('ningún chat individual', () => {
    expect(debeEscuchar('51999111222@s.whatsapp.net')).toBe(false);
    expect(debeEscuchar('')).toBe(false);
  });
});

describe('enviar', () => {
  it('solo al grupo de operaciones', () => {
    expect(puedeEnviarA(OPS)).toBe(true);
    expect(destinoPermitido()).toBe(OPS);
  });

  /**
   * NI SIQUIERA AL GRUPO QUE ESCUCHA. En fase de espejo el agente observa y
   * reporta; no le habla a la gente que trabaja.
   */
  it('NO al grupo que escucha', () => {
    expect(puedeEnviarA(ADMIN)).toBe(false);
  });

  it('NO a una persona, aunque esté configurada como destino', () => {
    process.env.AGENTE_GRUPO_DESTINO = '51999111222@s.whatsapp.net';
    expect(puedeEnviarA('51999111222@s.whatsapp.net')).toBe(false);
    expect(destinoPermitido()).toBeNull();
  });
});

/**
 * SIN CONFIGURAR, APAGADO. Un agente apagado es un estado correcto; uno que
 * escucha «todo» porque falta una variable, no lo es nunca.
 */
describe('falla en la dirección segura', () => {
  it('sin el interruptor no escucha ni envía', () => {
    process.env.AGENTE_CHECKLIST = '';
    expect(debeEscuchar(ADMIN)).toBe(false);
    expect(puedeEnviarA(OPS)).toBe(false);
    expect(destinoPermitido()).toBeNull();
  });

  it('sin grupos configurados no escucha ni envía', () => {
    process.env.AGENTE_GRUPO_ESCUCHA = '';
    process.env.AGENTE_GRUPO_DESTINO = '';
    expect(grupoEscuchado()).toBe('');
    expect(grupoDestino()).toBe('');
    expect(debeEscuchar(ADMIN)).toBe(false);
    expect(puedeEnviarA(OPS)).toBe(false);
  });

  it('un valor cualquiera en el interruptor tampoco lo prende', () => {
    for (const valor of ['true', '1', 'si', 'yes', 'ON ']) {
      process.env.AGENTE_CHECKLIST = valor;
      const esperado = valor.trim().toLowerCase() === 'on';
      expect(debeEscuchar(ADMIN)).toBe(esperado);
    }
  });
});
