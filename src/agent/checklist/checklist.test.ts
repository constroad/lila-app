import {
  CHECKLIST_PRODUCCION,
  evaluarChecklist,
  itemSatisfecho,
  normalizarTexto,
  type ChecklistItem,
} from './checklist';
import { conPiePropuesta, construirAvisoChecklist, construirAvisoProduccion, firmaAviso } from './aviso';

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
  titulo: 'x',
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
    const combustible = CHECKLIST_PRODUCCION.find((i) => i.id === 'petroleo-planta')!;

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
    const combustible = CHECKLIST_PRODUCCION.find((i) => i.id === 'combustible-cuadrilla')!;
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

    expect(e.pendientes.map((p) => p.item.id)).toContain('operadores');
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
    empresa: 'Globofast',
    fecha: '2026-09-13',
    horaArranque: '04:00',
    cliente: 'Minera XYZ',
    cubos: 91,
    grupoEscuchado: 'INFRAMAQ admin',
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

  /**
   * LO LEE UNA PERSONA EN EL CELULAR. La primera versión (12/09/2026) decía
   * «[ESPEJO]», «globofas-s8k» y un JID de veinte dígitos; José: «no me dice
   * mucho, no está formateado, todo desordenado». Este test fija lo que tiene
   * que decir y, sobre todo, lo que NO puede decir.
   */
  it('dice de quién y cuándo es la producción y qué falta, agrupado por quién lo revisa', () => {
    const e = evaluarChecklist({
      items: CHECKLIST_PRODUCCION,
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('00:00'),
      mensajes: ['cuadrilla lista', 'hay gasohol'],
    });

    const aviso = construirAvisoChecklist(e, contexto)!;

    expect(aviso).toContain('📋 *Checklist de producción — Globofast*');
    expect(aviso).toContain('domingo 13/09 a las 04:00 · Minera XYZ · 91 m³');
    expect(aviso).toContain('Arranca en 4 h');
    // Planta primero, campo después: lo lee gente distinta.
    expect(aviso.indexOf('*Planta* — sin confirmar:')).toBeLessThan(aviso.indexOf('*Campo* — sin confirmar:'));
    expect(aviso).toContain('• ¿Hay combustible (petróleo) suficiente?');
    expect(aviso).toContain('• ¿Se programó a la cuadrilla?'.replace('• ¿Se programó a la cuadrilla?', '• ¿Tenemos el tren de asfalto listo?'));
    // Lo confirmado no se vuelve a preguntar, y se nombra en palabras de obra.
    expect(aviso).not.toContain('¿Se programó a la cuadrilla?');
    expect(aviso).not.toContain('¿Hay gasohol?');
    expect(aviso).toContain('Ya confirmado: gasohol, cuadrilla ✔');
  });

  it('el aviso a planta dice que hay producción, de quién, cuándo y cuánto', () => {
    const aviso = construirAvisoProduccion(contexto);

    expect(aviso).toContain('📢 *Producción programada — Globofast*');
    expect(aviso).toContain('domingo 13/09 a las 04:00 · Minera XYZ · 91 m³');
    expect(aviso).not.toContain('@g.us');
  });

  it('la propuesta muestra EXACTAMENTE el texto que saldría, y cómo aprobarlo', () => {
    const texto = construirAvisoProduccion(contexto);
    const propuesta = conPiePropuesta(texto, 'Inframaq Planta');

    expect(propuesta).toContain('📨 *Propuesta para «Inframaq Planta»* — respondé *1* para mandarlo, *3* para descartar');
    expect(propuesta.endsWith(texto)).toBe(true);
  });

  it('no filtra identificadores del sistema', () => {
    const e = evaluarChecklist({
      items: CHECKLIST_PRODUCCION,
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('00:00'),
      mensajes: [],
    });

    const aviso = construirAvisoChecklist(e, contexto)!;

    for (const prohibido of ['[ESPEJO]', '@g.us', 'globofas-s8k', 'petroleo-planta', 'Escuchando:']) {
      expect(aviso).not.toContain(prohibido);
    }
  });

  it('sin cliente ni cubos, la línea de detalle no deja huecos', () => {
    const e = evaluarChecklist({
      items: [item({ pregunta: '¿Ya?' })],
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('00:00'),
      mensajes: [],
    });

    const aviso = construirAvisoChecklist(e, { ...contexto, cliente: undefined, cubos: undefined })!;

    expect(aviso).toContain('domingo 13/09 a las 04:00\n');
    expect(aviso).not.toContain('· \n');
  });

  it('si ya arrancó, lo dice en pasado', () => {
    const e = evaluarChecklist({
      items: [item({ pregunta: '¿Ya?' })],
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('05:00'),
      mensajes: [],
    });

    expect(construirAvisoChecklist(e, contexto)).toContain('Arrancó hace 1 h');
  });
});

/**
 * LA FIRMA NO ES EL TEXTO. El 12/09/2026 el mismo aviso salió a las 16:20 y a
 * las 16:40 porque el texto lleva «arranca en 11 h 20 min» y cambia cada
 * minuto: dos avisos iguales nunca eran «iguales». Lo que define un aviso es
 * QUÉ falta para QUÉ pedido.
 */
describe('la firma del aviso', () => {
  /** Evalúa a `horasAntes` horas del arranque. */
  const evaluar = (horasAntes: number, mensajes: string[] = []) =>
    evaluarChecklist({
      items: CHECKLIST_PRODUCCION,
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('04:00') - horasAntes * 3_600_000,
      mensajes,
    });

  it('no cambia con el paso del tiempo si falta lo mismo', () => {
    // A 12 h y a 11 h 40: mismo pendiente (aviso a planta), distinto «arranca
    // en». Antes eran dos avisos; ahora es uno.
    expect(firmaAviso('p1', evaluar(12))).toBe(firmaAviso('p1', evaluar(11.67)));
  });

  it('cambia cuando se confirma uno', () => {
    expect(firmaAviso('p1', evaluar(8))).not.toBe(firmaAviso('p1', evaluar(8, ['hay gasohol'])));
  });

  it('cambia cuando vence un ítem que antes tenía tiempo', () => {
    const conTiempo = evaluarChecklist({
      items: [item({ id: 'a', venceMinutosAntes: 12 * 60 }), item({ id: 'b', venceMinutosAntes: 6 * 60 })],
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('04:00') - 8 * 3_600_000,
      mensajes: [],
    });
    const vencidos = evaluarChecklist({
      items: [item({ id: 'a', venceMinutosAntes: 12 * 60 }), item({ id: 'b', venceMinutosAntes: 6 * 60 })],
      arranqueMs: arranque('04:00'),
      ahoraMs: arranque('04:00') - 5 * 3_600_000,
      mensajes: [],
    });
    expect(firmaAviso('p1', conTiempo)).not.toBe(firmaAviso('p1', vencidos));
  });

  it('es por pedido', () => {
    expect(firmaAviso('p1', evaluar(12))).not.toBe(firmaAviso('p2', evaluar(12)));
  });
});
