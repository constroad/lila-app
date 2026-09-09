import {
  CHECKLIST_PRODUCCION,
  evaluarChecklist,
  itemSatisfecho,
  normalizarTexto,
  type ChecklistItem,
} from './checklist';
import { construirAvisoChecklist } from './aviso';

/**
 * El checklist del día de producción.
 *
 * NACE DE UN CASO REAL (José, 07/09/2026): el pedido para las 4am se creó a
 * medianoche, se habló de eso todo el día en el grupo, y NADIE avisó a planta.
 * El valor no es la IA: es notar que un hecho que debería existir no existe.
 */

const arranque = (hora: string, dia = '2026-09-10') =>
  new Date(`${dia}T${hora}:00.000-05:00`).getTime();

const item = (over: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id: 'x',
  pregunta: '¿Ya?',
  domain: 'planta',
  phase: 'antes',
  venceMinutosAntes: 6 * 60,
  seSatisfaceCon: ['listo'],
  ...over,
});

describe('reconocer una confirmación escrita en el grupo', () => {
  it('ignora tildes y mayúsculas, que es como se escribe en un chat', () => {
    expect(normalizarTexto('  Ya COMPRÉ   el Petróleo ')).toBe('ya compre el petroleo');
  });

  it('da por resuelto lo que alguien confirmó, aunque lo diga dentro de una frase', () => {
    const combustible = CHECKLIST_PRODUCCION.find((i) => i.id === 'combustible')!;

    expect(itemSatisfecho(combustible, ['ok gente, ya hay petróleo en planta'])).toBe(true);
    expect(itemSatisfecho(combustible, ['mañana vemos lo del petróleo'])).toBe(false);
  });

  /**
   * ESTE ES EL LÍMITE CONOCIDO Y ES A PROPÓSITO. Las palabras clave no entienden
   * una respuesta que no las contiene. La fase de espejo existe para MEDIR con
   * qué frecuencia pasa esto sobre mensajes reales — y ese número es lo que
   * decide si hace falta un modelo, en vez de suponerlo.
   */
  it('no entiende una confirmación parafraseada: eso es lo que hay que medir', () => {
    const combustible = CHECKLIST_PRODUCCION.find((i) => i.id === 'combustible')!;
    expect(itemSatisfecho(combustible, ['ya mandé a Juan a cargar el tanque'])).toBe(false);
  });
});

describe('qué se avisa y qué no', () => {
  it('EL CASO DE JOSÉ: faltan 4 h, nadie avisó a planta → pendiente', () => {
    const e = evaluarChecklist({
      items: CHECKLIST_PRODUCCION,
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('00:00'),
      mensajes: ['mañana tenemos que despachar 200 cubos', 'ok'],
    });

    expect(e.pendientes.map((p) => p.item.id)).toContain('aviso-planta');
    expect(e.minutosParaArranque).toBe(240);
  });

  /**
   * NO AVISAR TAMBIÉN ES UNA DECISIÓN. Un ítem que todavía tiene tiempo no se
   * pregunta: preguntar temprano y seguido es exactamente cómo un agente se
   * gana que lo silencien.
   */
  it('lo que todavía tiene tiempo NO se avisa', () => {
    const e = evaluarChecklist({
      items: [item({ id: 'tarde', venceMinutosAntes: 60 })],
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('00:00'), // faltan 240 min, vence a los 60
      mensajes: [],
    });

    expect(e.pendientes).toHaveLength(0);
    expect(e.enTiempo.map((x) => x.item.id)).toEqual(['tarde']);
  });

  it('lo confirmado sale de pendientes aunque esté vencido', () => {
    const e = evaluarChecklist({
      items: [item({ id: 'combustible', seSatisfaceCon: ['petroleo listo'] })],
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('03:00'),
      mensajes: ['Petróleo listo jefe'],
    });

    expect(e.pendientes).toHaveLength(0);
    expect(e.resueltos.map((x) => x.item.id)).toEqual(['combustible']);
  });

  it('con la producción ya arrancada sigue contando lo que faltó', () => {
    const e = evaluarChecklist({
      items: CHECKLIST_PRODUCCION,
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('05:30'),
      mensajes: [],
    });

    expect(e.minutosParaArranque).toBe(-90);
    expect(e.pendientes).toHaveLength(CHECKLIST_PRODUCCION.length);
  });

  /**
   * Los milisegundos no tienen zona horaria. Es a propósito: `new Date(fecha).getDay()`
   * y familia son el bug #1 del catálogo, y acá no se construye ninguna fecha.
   */
  it('el cálculo no depende de la zona del proceso', () => {
    const e = evaluarChecklist({
      items: [item()],
      arranqueMs: 1_000_000_000_000,
      ahoraMs: 1_000_000_000_000 - 3 * 60 * 60_000,
      mensajes: [],
    });
    expect(e.minutosParaArranque).toBe(180);
  });
});

describe('el aviso al grupo de operaciones', () => {
  const contexto = {
    empresa: 'INFRAMAQ',
    fecha: '2026-09-10',
    horaArranque: '04:00',
    grupoEscuchado: 'inframaq · admin',
  };

  /**
   * EL SILENCIO ES LA RESPUESTA CORRECTA cuando no hay nada pendiente. Un agente
   * que avisa «todo en orden» tres veces al día enseña a ignorarlo.
   */
  it('sin pendientes no manda nada', () => {
    const e = evaluarChecklist({
      items: [item({ seSatisfaceCon: ['listo'] })],
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('03:00'),
      mensajes: ['listo'],
    });

    expect(construirAvisoChecklist(e, contexto)).toBeNull();
  });

  it('el aviso dice qué falta, cuánto tiempo queda y que es un espejo', () => {
    const e = evaluarChecklist({
      items: CHECKLIST_PRODUCCION,
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('00:00'),
      mensajes: ['ya avisé a planta'],
    });

    const aviso = construirAvisoChecklist(e, contexto)!;

    expect(aviso).toContain('[ESPEJO]');
    expect(aviso).toContain('INFRAMAQ · 2026-09-10 · inicio 04:00 (arranca en 4 h)');
    expect(aviso).toContain('¿Ya está la cuadrilla y el tren?');
    expect(aviso).toContain('¿Ya compraron petróleo y agua?');
    // Lo confirmado no se vuelve a preguntar.
    expect(aviso).not.toContain('¿Ya avisaron a planta');
    expect(aviso).toContain('Ya confirmado: aviso-planta');
    expect(aviso).toContain('No se envió a nadie más.');
  });

  it('si ya arrancó, lo dice en pasado', () => {
    const e = evaluarChecklist({
      items: [item({ pregunta: '¿Ya?' })],
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('05:00'),
      mensajes: [],
    });

    expect(construirAvisoChecklist(e, contexto)).toContain('arrancó hace 1 h');
  });
});
