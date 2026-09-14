import { NOMBRES_DE_DISTRITOS, distritoDe, distritosDe, lugarDesconocido, textoLugarDesconocido } from './clima';

/**
 * Varios distritos en una pregunta, alias de la zona de la planta, y un lugar
 * que no está en la lista (14/09: «¿y Cajamarquilla?» → «la planta» de hoy).
 */
describe('distritosDe', () => {
  it('todos los nombrados, en orden', () => {
    expect(distritosDe('cómo estará el clima en la molina y cajamarquilla para mañana').map((d) => d.name)).toEqual(['La Molina', 'Cajamarquilla (planta)']);
    expect(distritosDe('clima en ate, comas y lurigancho').map((d) => d.name)).toEqual(['Ate', 'Comas', 'Lurigancho']);
  });

  it('«Lurigancho» no es «Lurin»', () => {
    expect(distritosDe('clima en lurigancho').map((d) => d.name)).toEqual(['Lurigancho']);
  });

  it('sin distrito, la planta; «en la planta» también', () => {
    expect(distritoDe('cómo está el clima').name).toBe('la planta');
    expect(distritoDe('clima en la planta mañana').name).toBe('la planta');
  });

  it('el hilo conoce los alias', () => {
    expect(NOMBRES_DE_DISTRITOS).toEqual(expect.arrayContaining(['Ate', 'cajamarquilla', 'la planta']));
  });
});

describe('lugarDesconocido', () => {
  it('un lugar que no está en la lista se nombra; uno conocido, no', () => {
    expect(lugarDesconocido('cómo estará el clima en huaral mañana')).toBe('huaral');
    expect(lugarDesconocido('clima en cajamarquilla')).toBeNull();
    expect(lugarDesconocido('clima en ate')).toBeNull();
    expect(lugarDesconocido('va a llover mañana?')).toBeNull();
    expect(lugarDesconocido('clima para la producción de mañana')).toBeNull();
    expect(textoLugarDesconocido('huaral')).toContain('No tengo «huaral» entre mis distritos. Conozco: ');
  });
});
