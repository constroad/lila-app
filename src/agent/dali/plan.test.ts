import { cicloDe, semanasDe, variacionPct } from './plan';

/**
 * PLAN Y USO (A17): el ciclo es el mes calendario en Lima; las ocho semanas
 * van de lunes a domingo (Lima) y terminan en la semana en curso, con ceros
 * donde no hubo conversaciones; la variación compara la semana actual con la
 * anterior.
 */
describe('cicloDe', () => {
  it('el ciclo es el mes en curso en Lima: del 1 al último día, cierre a las 23:59, y se renueva el 1 del mes siguiente', () => {
    // 15/09/2026 20:00 Lima (= 16/09 01:00 UTC): sigue siendo setiembre en Lima.
    const ciclo = cicloDe(Date.parse('2026-09-16T01:00:00Z'));
    expect(ciclo).toEqual({ desde: '2026-09-01', hasta: '2026-09-30', renuevaEl: '2026-10-01', diasRestantes: 15, periodo: '2026-09' });
  });

  it('en diciembre se renueva en enero del año siguiente', () => {
    expect(cicloDe(Date.parse('2026-12-31T12:00:00Z'))).toMatchObject({ hasta: '2026-12-31', renuevaEl: '2027-01-01', diasRestantes: 0 });
  });
});

describe('semanasDe', () => {
  it('ocho semanas de lunes a domingo (Lima) hasta la actual, con cero donde no hubo nada y la última marcada', () => {
    // Martes 15/09/2026 en Lima: la semana en curso empieza el lunes 14/09.
    const semanas = semanasDe({ '2026-09-14': 3, '2026-09-07': 12, '2026-07-27': 5 }, Date.parse('2026-09-16T01:00:00Z'));
    expect(semanas).toHaveLength(8);
    expect(semanas.map((s) => s.desde)).toEqual(['2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14']);
    expect(semanas.map((s) => s.conversaciones)).toEqual([5, 0, 0, 0, 0, 0, 12, 3]);
    expect(semanas.map((s) => s.etiqueta)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']);
    expect(semanas[7].actual).toBe(true);
    expect(semanas[6].actual).toBe(false);
  });
});

describe('variacionPct', () => {
  it('la semana actual contra la anterior, redondeada; sin anterior no hay variación', () => {
    expect(variacionPct(161, 152)).toBe(6);
    expect(variacionPct(88, 110)).toBe(-20);
    expect(variacionPct(5, 0)).toBeNull();
  });
});
