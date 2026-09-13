import { VIGENCIA_PREGUNTA_MS, _resetPendientes, preguntar, responderPendiente, textoPregunta } from './pendientes';

/**
 * «¿Cuál de los dos?» → «2». La respuesta es de ESA persona, en ESE grupo, y
 * dentro de diez minutos; un número suelto de otra persona no contesta nada.
 */
beforeEach(() => _resetPendientes());

const cont = async (i: number) => `elegiste ${i}`;

describe('preguntas pendientes', () => {
  it('la persona contesta con el número y se consume la pregunta', async () => {
    preguntar({ quien: 'jose', grupo: 'g', opciones: ['A', 'B'], continuar: cont }, 0);

    const r = responderPendiente('jose', 'g', '2', 1_000);
    expect(r?.indice).toBe(1);
    expect(await r?.pregunta.continuar(r.indice)).toBe('elegiste 1');
    expect(responderPendiente('jose', 'g', '2', 2_000)).toBeNull();
  });

  it('otra persona, otro grupo, o un número fuera de rango, no contestan', () => {
    preguntar({ quien: 'jose', grupo: 'g', opciones: ['A', 'B'], continuar: cont }, 0);

    expect(responderPendiente('contador', 'g', '1', 1_000)).toBeNull();
    expect(responderPendiente('jose', 'otro', '1', 1_000)).toBeNull();
    expect(responderPendiente('jose', 'g', '3', 1_000)).toBeNull();
    expect(responderPendiente('jose', 'g', 'si', 1_000)).toBeNull();
    // Sigue pendiente para la respuesta correcta.
    expect(responderPendiente('jose', 'g', '1', 1_000)?.indice).toBe(0);
  });

  it('a los diez minutos vence', () => {
    preguntar({ quien: 'jose', grupo: 'g', opciones: ['A'], continuar: cont }, 0);
    expect(responderPendiente('jose', 'g', '1', VIGENCIA_PREGUNTA_MS + 1)).toBeNull();
  });

  it('la pregunta se numera y dice cómo responder', () => {
    expect(textoPregunta('¿Cuál?', ['04:00 — Globofast', '07:00 — Constroad'])).toBe(
      '¿Cuál?\n1. 04:00 — Globofast\n2. 07:00 — Constroad\n\nRespondé con el número.'
    );
  });
});
