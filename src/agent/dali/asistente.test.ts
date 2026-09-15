import { avisosDe, destinoDeAvisos, enHorarioSegun, horarioLegible, minutosHastaManana, negocioDe, pausada, perfilDe, PERFIL_POR_DEFECTO } from './asistente';

/**
 * LO QUE SE CONFIGURA EN «ASISTENTE» (A6) llega al guion tal cual: el nombre,
 * el saludo, el horario en horas y en texto, la zona; y lo que no tiene forma
 * vuelve al defecto del piloto en vez de romper nada.
 */
describe('perfilDe', () => {
  it('sin nada guardado es el perfil del piloto', () => {
    expect(perfilDe(undefined)).toEqual(PERFIL_POR_DEFECTO);
    expect(perfilDe(null).asistente).toBe('Dali');
    expect(perfilDe(undefined).reglas).toEqual({ sinPrecios: true, sinPromesas: true, escala: true, zonaEstricta: false });
  });

  it('toma lo guardado y arregla lo que no tiene forma', () => {
    const p = perfilDe({
      asistente: '  Sofía ',
      saludo: 'x'.repeat(200),
      tono: 'formal',
      emojis: 'muchos',
      horario: { semana: { activo: true, desde: '9:00', hasta: '17:30' }, sabado: { activo: false }, domingo: 'no' },
      zona: '',
      reglas: { sinPrecios: false, escala: 'sí' },
    });
    expect(p.asistente).toBe('Sofía');
    expect(p.saludo).toHaveLength(160);
    expect(p.tono).toBe('formal');
    expect(p.emojis).toBe('pocos');
    expect(p.horario.semana).toEqual({ activo: true, desde: '08:00', hasta: '17:30' }); // «9:00» no es HH:MM
    expect(p.horario.sabado).toEqual({ activo: false, desde: '08:00', hasta: '13:00' });
    expect(p.horario.domingo).toEqual(PERFIL_POR_DEFECTO.horario.domingo);
    expect(p.zona).toBe(PERFIL_POR_DEFECTO.zona);
    expect(p.reglas).toEqual({ sinPrecios: false, sinPromesas: true, escala: true, zonaEstricta: false });
  });

  it('una franja al revés vuelve al cierre por defecto', () => {
    expect(perfilDe({ horario: { semana: { desde: '18:00', hasta: '08:00' } } }).horario.semana).toEqual({ activo: true, desde: '18:00', hasta: '18:00' });
  });

  it('hereda el saludo y el tono viejos de bot_configs si no hay perfil', () => {
    const p = perfilDe(undefined, { greeting: 'Hola, soy Dali de Constroad', tone: 'formal' });
    expect(p.saludo).toBe('Hola, soy Dali de Constroad');
    expect(p.tono).toBe('formal');
  });
});

describe('avisosDe', () => {
  it('por defecto avisa al grupo de ventas de todo', () => {
    expect(avisosDe(undefined)).toEqual({ canal: 'grupo', numeroDueno: '', casos: { leadNuevo: true, pideUrgente: true, fallo: true } });
  });

  it('deja solo dígitos en el número del dueño', () => {
    expect(avisosDe({ canal: 'dueno', numeroDueno: '+51 903 124 919', casos: { leadNuevo: false } })).toEqual({
      canal: 'dueno',
      numeroDueno: '51903124919',
      casos: { leadNuevo: false, pideUrgente: true, fallo: true },
    });
  });

  it('el destino es el grupo conectado, o el número del dueño si lo eligió (y si no tiene número, el grupo)', () => {
    expect(destinoDeAvisos({ ownerNotifyTarget: '120363@g.us' })).toEqual({ target: '120363@g.us', casos: { leadNuevo: true, pideUrgente: true, fallo: true } });
    expect(destinoDeAvisos({ ownerNotifyTarget: '120363@g.us', avisos: { canal: 'dueno', numeroDueno: '51903124919', casos: { fallo: false } } })).toEqual({
      target: '51903124919@s.whatsapp.net',
      casos: { leadNuevo: true, pideUrgente: true, fallo: false },
    });
    expect(destinoDeAvisos({ ownerNotifyTarget: '120363@g.us', avisos: { canal: 'dueno' } }).target).toBe('120363@g.us');
    expect(destinoDeAvisos(null).target).toBeUndefined();
  });
});

describe('horario', () => {
  const h = PERFIL_POR_DEFECTO.horario;

  it('sabe si está abierto según el día y la hora', () => {
    expect(enHorarioSegun(h, 1, 8)).toBe(true); // lunes 08:00
    expect(enHorarioSegun(h, 5, 17, 59)).toBe(true);
    expect(enHorarioSegun(h, 5, 18)).toBe(false); // cierra a las 18
    expect(enHorarioSegun(h, 6, 12, 30)).toBe(true); // sábado hasta 13
    expect(enHorarioSegun(h, 6, 13)).toBe(false);
    expect(enHorarioSegun(h, 0, 10)).toBe(false); // domingo cerrado
    expect(enHorarioSegun({ ...h, domingo: { activo: true, desde: '09:00', hasta: '12:00' } }, 0, 10)).toBe(true);
  });

  it('se lee como lo dice el guion', () => {
    expect(horarioLegible(h)).toBe('lunes a viernes de 8:00 a 18:00 y sábados de 8:00 a 13:00');
    expect(horarioLegible({ ...h, sabado: { ...h.sabado, activo: false } })).toBe('lunes a viernes de 8:00 a 18:00');
    expect(horarioLegible({ semana: { activo: true, desde: '07:30', hasta: '17:00' }, sabado: { activo: false, desde: '08:00', hasta: '13:00' }, domingo: { activo: true, desde: '09:00', hasta: '12:00' } })).toBe(
      'lunes a viernes de 7:30 a 17:00 y domingos de 9:00 a 12:00'
    );
  });
});

describe('negocioDe', () => {
  it('sin perfil es CONSTROAD tal cual', () => {
    expect(negocioDe(null)).toEqual({
      nombre: 'CONSTROAD',
      asistente: 'Dali',
      horario: 'lunes a viernes de 8:00 a 18:00 y sábados de 8:00 a 13:00',
      zona: 'Lima y alrededores (planta en Cajamarquilla, Lurigancho)',
      tono: 'cercano',
      emojis: 'pocos',
      reglas: { sinPrecios: true, sinPromesas: true, escala: true, zonaEstricta: false },
    });
  });

  it('con perfil, el guion habla como se configuró', () => {
    const n = negocioDe({ perfil: { asistente: 'Sofía', saludo: '¡Hola! Soy Sofía, de Asfaltos del Sur.', fueraDeHorario: 'Ahora estamos cerrados, pero te atiendo igual.', horario: { sabado: { activo: false } }, zona: 'Arequipa', emojis: 'ninguno' } }, 'Asfaltos del Sur');
    expect(n).toEqual({
      nombre: 'Asfaltos del Sur',
      asistente: 'Sofía',
      horario: 'lunes a viernes de 8:00 a 18:00',
      zona: 'Arequipa',
      saludo: '¡Hola! Soy Sofía, de Asfaltos del Sur.',
      fueraDeHorario: 'Ahora estamos cerrados, pero te atiendo igual.',
      tono: 'cercano',
      emojis: 'ninguno',
      reglas: { sinPrecios: true, sinPromesas: true, escala: true, zonaEstricta: false },
    });
  });
});

describe('pausa', () => {
  const ahora = Date.parse('2026-09-15T15:00:00.000Z'); // 10:00 en Lima

  it('está pausada solo mientras pausedUntil sea futuro', () => {
    expect(pausada({ pausedUntil: new Date(ahora + 60_000) }, ahora)).toBe(true);
    expect(pausada({ pausedUntil: new Date(ahora - 1) }, ahora)).toBe(false);
    expect(pausada({}, ahora)).toBe(false);
    expect(pausada(null, ahora)).toBe(false);
  });

  it('«hasta mañana» son los minutos hasta las 08:00 de Lima del día siguiente', () => {
    expect(minutosHastaManana(ahora)).toBe(22 * 60);
    expect(minutosHastaManana(Date.parse('2026-09-16T04:30:00.000Z'))).toBe(8 * 60 + 30); // 23:30 del 15 en Lima
  });
});
