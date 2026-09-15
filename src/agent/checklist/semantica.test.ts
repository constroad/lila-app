import { CHECKLIST_PRODUCCION } from './checklist';
import { _resetSemantica, clasificar, evaluarRevisionSemantica, UMBRAL_SIMILITUD, type Embed } from './semantica';

/**
 * EL CLASIFICADOR, PROBADO SIN EL MODELO. Descargar 120 MB en CI no es un
 * test; lo que se prueba acá es la lógica: centroides, argmax, umbral, y que
 * sin modelo sea exactamente el matcher literal.
 *
 * El embed de mentira asigna a cada texto un vector según qué ítem «suena»:
 * suficiente para verificar la mecánica, y honesto sobre qué NO se está
 * probando (la calidad del modelo real, medida aparte: 17/19).
 */
const EJES: Record<string, number> = { gasohol: 0, cuadrilla: 1, comidas: 2 };
const embedFalso: Embed = async (textos) =>
  textos.map((t) => {
    const v = [0, 0, 0, 0];
    const n = t.toLowerCase();
    if (n.includes('gasohol')) v[EJES.gasohol] = 1;
    else if (n.includes('cuadrilla') || n.includes('gente') || n.includes('personal')) v[EJES.cuadrilla] = 1;
    else if (n.includes('comida') || n.includes('almuerzo')) v[EJES.comidas] = 1;
    else v[3] = 1; // ruido: ortogonal a todo
    // Una paráfrasis «parecida pero no igual»: 0.9 en su eje, algo en el ruido.
    if (n.includes('la gente ya')) { v[EJES.cuadrilla] = 0.9; v[3] = 0.44; }
    return v;
  });

const item = (id: string) => CHECKLIST_PRODUCCION.find((i) => i.id === id)!;

beforeEach(() => _resetSemantica());

describe('clasificar', () => {
  it('cada cláusula va al ítem más cercano, si pasa el umbral', async () => {
    const c = await clasificar([item('gasohol'), item('cuadrilla'), item('comidas')], ['la gente ya está confirmada', 'buenos días a todos'], embedFalso);

    expect(c).toHaveLength(1);
    expect(c[0].itemId).toBe('cuadrilla');
    expect(c[0].similitud).toBeGreaterThanOrEqual(UMBRAL_SIMILITUD);
  });

  it('argmax, no el primero que pase el umbral', async () => {
    // «comida» es el tercero de la lista: si se tomara el primero que pasa, o
    // el orden de declaración, saldría otro.
    const c = await clasificar([item('gasohol'), item('cuadrilla'), item('comidas')], ['ya coordinamos los almuerzos'], embedFalso);

    expect(c.map((x) => x.itemId)).toEqual(['comidas']);
  });

  it('sin cláusulas o sin ítems no hace nada', async () => {
    expect(await clasificar([item('gasohol')], [], embedFalso)).toEqual([]);
    expect(await clasificar([], ['hay gasohol'], embedFalso)).toEqual([]);
  });
});

describe('evaluarRevisionSemantica', () => {
  it('une lo literal con lo semántico', async () => {
    const r = await evaluarRevisionSemantica(
      [item('gasohol'), item('cuadrilla'), item('comidas')],
      ['hay gasohol', 'la gente ya está confirmada'],
      { embed: embedFalso }
    );

    // «hay gasohol» es semilla literal; «la gente ya está confirmada» no es
    // semilla de nada: solo lo entiende la semántica.
    expect(r.resueltos.map((i) => i.id).sort()).toEqual(['cuadrilla', 'gasohol']);
    expect(r.pendientes.map((i) => i.id)).toEqual(['comidas']);
    expect(r.semanticas.map((c) => c.itemId)).toContain('cuadrilla');
  });

  it('sin modelo es exactamente el matcher literal', async () => {
    const r = await evaluarRevisionSemantica(
      [item('gasohol'), item('cuadrilla')],
      ['hay gasohol', 'la gente ya está confirmada'],
      { embed: null }
    );

    expect(r.resueltos.map((i) => i.id)).toEqual(['gasohol']);
    expect(r.pendientes.map((i) => i.id)).toEqual(['cuadrilla']);
    expect(r.semanticas).toEqual([]);
  });

  it('una cláusula negada solo confirma, y solo literalmente, un ítem que se confirma negando', async () => {
    // Un embed que a TODO le da el mismo vector: si las negadas pasaran por él,
    // cerrarían cualquier cosa. No pasan.
    const embedTodoIgual: Embed = async (textos) => textos.map(() => [1, 0]);
    const r = await evaluarRevisionSemantica(
      [item('riesgos'), item('cuadrilla')],
      [],
      { embed: embedTodoIgual, negadas: ['no hay riesgos', 'no esta la cuadrilla'] }
    );

    // «no hay riesgos» es semilla literal de riesgos → cierra. «no está la
    // cuadrilla» no cierra cuadrilla: no es negable, y las negadas no van al modelo.
    expect(r.resueltos.map((i) => i.id)).toEqual(['riesgos']);
    expect(r.pendientes.map((i) => i.id)).toEqual(['cuadrilla']);
    expect(r.semanticas).toEqual([]);
  });

  it('en la última llamada solo mira lo crítico', async () => {
    const r = await evaluarRevisionSemantica(CHECKLIST_PRODUCCION, [], { embed: embedFalso, soloCriticos: true });

    expect(r.pendientes.every((i) => i.critico)).toBe(true);
    expect(r.pendientes.map((i) => i.id)).toEqual(['agregados', 'pen', 'petroleo-planta', 'operadores', 'clima']);
  });
});
