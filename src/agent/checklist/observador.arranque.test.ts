import { esperarAlcance } from './observador';

/**
 * EL HUECO DEL ARRANQUE. Las sesiones conectan de a una y la de inframaq —la
 * que resuelve el grupo por nombre— es la última. Un mensaje que llega en ese
 * hueco tiene que ESPERAR al alcance, no perderse (14/09, 11:25: pregunta sin
 * respuesta 18 s después del deploy).
 */
const vacio = { grupoEscuchado: '', nombreGrupo: '', grupoPlanta: '', nombreGrupoPlanta: '' };
const lleno = { grupoEscuchado: '120363279615230332@g.us', nombreGrupo: 'INFRAMAQ admin', grupoPlanta: '', nombreGrupoPlanta: '' };

describe('esperarAlcance', () => {
  it('reintenta hasta que el alcance aparece', async () => {
    let llamadas = 0;
    const dormidas: number[] = [];
    const alcance = await esperarAlcance(async () => (++llamadas >= 3 ? lleno : vacio), { esperaMs: 2_000, dormir: async (ms) => void dormidas.push(ms) });
    expect(alcance).toBe(lleno);
    expect(llamadas).toBe(3);
    expect(dormidas).toEqual([2_000, 2_000]);
  });

  it('con alcance a la primera no espera nada', async () => {
    const dormidas: number[] = [];
    await esperarAlcance(async () => lleno, { dormir: async (ms) => void dormidas.push(ms) });
    expect(dormidas).toEqual([]);
  });

  it('se rinde tras los intentos y devuelve vacío', async () => {
    let llamadas = 0;
    const alcance = await esperarAlcance(async () => (++llamadas, vacio), { intentos: 4, dormir: async () => undefined });
    expect(alcance.grupoEscuchado).toBe('');
    expect(llamadas).toBe(5);
  });
});
