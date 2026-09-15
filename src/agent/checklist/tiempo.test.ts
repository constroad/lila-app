import { fechaLegible } from './tiempo';

/** El año se muestra solo cuando no es el de hoy: «sábado 04/09» escondía que era 2027 (15/09). */
describe('fechaLegible con año', () => {
  const ahora = new Date('2026-09-15T12:00:00.000-05:00').getTime();
  it('sin año en el año en curso, con año fuera de él', () => {
    expect(fechaLegible('2026-09-04', ahora)).toBe('viernes 04/09');
    expect(fechaLegible('2027-09-04', ahora)).toBe('sábado 04/09/2027');
    expect(fechaLegible('2025-12-20', ahora)).toBe('sábado 20/12/2025');
    expect(fechaLegible('', ahora)).toBe('');
  });
});
