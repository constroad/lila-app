import { esperarAlcance, paraOtraPersona } from './observador';

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

/**
 * UN MENSAJE PARA OTRA PERSONA NO ES UNA CONTINUACIÓN. 14/09, 18:11: José le
 * contestó «¿a qué te refieres?» a Globofast (citándolo) y le habló a @nikole
 * un minuto después de preguntarle algo a Lila; los dos cayeron como «pregunta
 * dentro del hilo» y Lila contestó con el menú.
 */
describe('paraOtraPersona', () => {
  const bot = ['51949376824@s.whatsapp.net', '244534046892225@lid'];
  const con = (contextInfo: Record<string, unknown>) => ({ extendedTextMessage: { text: 'x', contextInfo } }) as never;
  it('cita a otro → es para otro; cita al agente → no', () => {
    expect(paraOtraPersona(con({ stanzaId: '1', participant: '173066143440987@lid' }), bot)).toBe(true);
    expect(paraOtraPersona(con({ stanzaId: '1', participant: '244534046892225@lid' }), bot)).toBe(false);
    expect(paraOtraPersona(con({ stanzaId: '1', participant: '51949376824:12@s.whatsapp.net' }), bot)).toBe(false);
  });
  it('menciona a otros → es para otro; menciona al agente entre otros → no', () => {
    expect(paraOtraPersona(con({ mentionedJid: ['188570740486215@lid'] }), bot)).toBe(true);
    expect(paraOtraPersona(con({ mentionedJid: ['188570740486215@lid', '244534046892225@lid'] }), bot)).toBe(false);
    expect(paraOtraPersona(con({}), bot)).toBe(false);
    expect(paraOtraPersona(undefined, bot)).toBe(false);
  });
});
