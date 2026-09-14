import { jest } from '@jest/globals';
import { VIGENCIA_PREGUNTA_MS, _resetPendientes, nombraUnidad, preguntar, responderPendiente, textoPregunta } from './pendientes';

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

  /**
   * EL CASO DEL 13/09 13:50: el agente preguntó «¿qué unidad?», José contestó
   * «La unidad 4», y el agente dijo «eso no lo puedo responder». La respuesta
   * a una pregunta del agente completa la pregunta original.
   */
  it('una pregunta de unidad se contesta con «la unidad 4», una placa o «la última»', async () => {
    const continuar = jest.fn(async (_i: number, texto?: string) => `respondí con ${texto}`);
    preguntar({ quien: 'jose', grupo: 'g', opciones: [], tipo: 'unidad', continuar }, 0);

    // Un mensaje que no nombra ninguna unidad no la consume.
    expect(responderPendiente('jose', 'g', 'gracias', 1_000)).toBeNull();
    const r = responderPendiente('jose', 'g', 'La unidad 4', 2_000);
    expect(r?.texto).toBe('La unidad 4');
    expect(await r?.pregunta.continuar(r.indice, r.texto)).toBe('respondí con La unidad 4');
    // Ya se consumió.
    expect(responderPendiente('jose', 'g', 'AML838', 3_000)).toBeNull();
  });

  /** «¿Te referís a X?» — un «sí» confirma; un «no» la cierra sin hacer nada. */
  it('una pregunta de confirmación se contesta con sí (o se descarta con no)', async () => {
    const continuar = jest.fn(async () => 'hecho');
    preguntar({ quien: 'jose', grupo: 'g', opciones: [], tipo: 'confirmar', continuar }, 0);
    expect(responderPendiente('jose', 'g', 'mmm', 1_000)).toBeNull();
    expect(responderPendiente('jose', 'g', 'Sí', 2_000)?.indice).toBe(0);
    expect(responderPendiente('jose', 'g', 'sí', 3_000)).toBeNull(); // consumida

    preguntar({ quien: 'jose', grupo: 'g', opciones: [], tipo: 'confirmar', continuar }, 0);
    expect(responderPendiente('jose', 'g', 'no', 1_000)).toBeNull();
    expect(responderPendiente('jose', 'g', 'sí', 2_000)).toBeNull(); // el «no» la cerró
  });

  it('nombraUnidad: número, placa u ordinal', () => {
    expect(nombraUnidad('la unidad 4')).toBe(true);
    expect(nombraUnidad('AML 838')).toBe(true);
    expect(nombraUnidad('la última')).toBe(true);
    expect(nombraUnidad('gracias')).toBe(false);
  });

  it('a los diez minutos vence', () => {
    preguntar({ quien: 'jose', grupo: 'g', opciones: ['A'], continuar: cont }, 0);
    expect(responderPendiente('jose', 'g', '1', VIGENCIA_PREGUNTA_MS + 1)).toBeNull();
  });

  it('la pregunta se numera y dice cómo responder', () => {
    expect(textoPregunta('¿Cuál?', ['04:00 — Globofast', '07:00 — Constroad'])).toBe(
      '¿Cuál?\n1. 04:00 — Globofast\n2. 07:00 — Constroad\n\nResponde con el número.'
    );
  });
});
