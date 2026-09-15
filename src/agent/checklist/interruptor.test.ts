import {
  _resetInterruptor,
  agenteApagado,
  apagar,
  comandoInterruptor,
  encender,
  estadoInterruptor,
  hidratarInterruptor,
} from './interruptor';

/**
 * EL INTERRUPTOR. Desde que el agente puede escribirle a la gente que trabaja,
 * apagarlo tiene que ser un mensaje desde el celular, no un deploy.
 */
beforeEach(() => _resetInterruptor());

describe('el comando', () => {
  it('reconoce !lila off y !lila on, sin importar mayúsculas ni espacios', () => {
    expect(comandoInterruptor('!lila off')).toBe('off');
    expect(comandoInterruptor('  !LILA   ON ')).toBe('on');
  });

  it('y las formas en que la gente lo escribe (14/09: «@lila off» y «!@lila off» no apagaban nada)', () => {
    for (const off of ['@lila off', '!@lila off', 'lila off', '@lila apágate', '@lila apagar', '@Lila OFF.']) expect(comandoInterruptor(off)).toBe('off');
    for (const on of ['@lila on', 'lila on', '@lila enciéndete', '@lila prender']) expect(comandoInterruptor(on)).toBe('on');
    for (const estado of ['@lila estás encendida?', '@lila estas encendido?', 'lila estado', '@lila estás apagada?']) expect(comandoInterruptor(estado)).toBe('estado');
  });

  it('no reconoce nada parecido: tiene que ser el mensaje entero', () => {
    for (const otro of ['!lila off ya', '!lilaoff', '', 'off', 'apaga la lila', '@lila off el pedido de hoy', 'hola lila']) {
      expect(comandoInterruptor(otro)).toBeNull();
    }
  });
});

describe('el estado', () => {
  it('arranca prendido', () => {
    expect(agenteApagado()).toBe(false);
  });

  it('apagar y prender dejan registro de quién y cuándo', () => {
    expect(apagar('jose', 1_000)).toEqual({ apagado: true, por: 'jose', ms: 1_000 });
    expect(agenteApagado()).toBe(true);
    expect(encender('jose', 2_000)).toEqual({ apagado: false, por: 'jose', ms: 2_000 });
    expect(agenteApagado()).toBe(false);
  });

  /** Un deploy no prende lo que alguien apagó. */
  it('rehidrata lo guardado, y basura no lo toca', () => {
    hidratarInterruptor({ apagado: true, por: 'jose', ms: 5 });
    expect(estadoInterruptor()).toEqual({ apagado: true, por: 'jose', ms: 5 });

    hidratarInterruptor(null);
    hidratarInterruptor({ apagado: 'si' as unknown as boolean });
    expect(agenteApagado()).toBe(true);
  });
});
