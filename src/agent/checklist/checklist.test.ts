import {
  CHECKLIST_PRODUCCION,
  evaluarChecklist,
  itemSatisfecho,
  normalizarTexto,
  type ChecklistItem,
  evaluarRevision,
} from './checklist';
import { conPiePropuesta, construirAvisoChecklist, construirAvisoProduccion, describirCambio, firmaAviso } from './aviso';

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
  const pedidos = [
    { empresa: 'Globofast', hora: '04:00', cubos: 91 },
    { empresa: 'Constroad', hora: '07:00', cubos: 45 },
  ];
  const dia = { fecha: '2026-09-13', pedidos, totalCubos: 136 };
  const contexto = {
    fecha: '2026-09-13',
    minutosParaArranque: 240,
    pedidos,
    totalCubos: 136,
    momento: 'inicial' as const,
    grupoEscuchado: 'INFRAMAQ admin',
  };

  /**
   * EL SILENCIO ES LA RESPUESTA CORRECTA cuando no hay nada pendiente. Un agente
   * que avisa «todo en orden» tres veces al día enseña a ignorarlo.
   */
  it('sin pendientes no manda nada', () => {
    const r = evaluarRevision([item({ seSatisfaceCon: ['listo'] })], ['listo']);

    expect(construirAvisoChecklist(r, contexto)).toBeNull();
  });

  /**
   * LO LEE UNA PERSONA EN EL CELULAR. José, 12/09: «no me dice mucho, no está
   * formateado, todo desordenado». Y el 13/09: dos empresas el mismo día son un
   * día, con el total.
   */
  it('dice qué día, quiénes producen, cuánto en total, y qué falta agrupado por quién lo revisa', () => {
    const r = evaluarRevision(CHECKLIST_PRODUCCION, ['cuadrilla lista', 'hay gasohol']);

    const aviso = construirAvisoChecklist(r, contexto)!;

    expect(aviso).toContain('📋 *Checklist de producción* — domingo 13/09');
    expect(aviso).toContain('04:00 Globofast 91 m³ · 07:00 Constroad 45 m³ · total 136 m³ · arranca en 4 h');
    // Planta primero, campo después: lo lee gente distinta.
    expect(aviso.indexOf('*Planta* — sin confirmar:')).toBeLessThan(aviso.indexOf('*Campo* — sin confirmar:'));
    expect(aviso).toContain('• ¿Hay combustible (petróleo) suficiente?');
    expect(aviso).toContain('• ¿Tenemos el tren de asfalto listo?');
    // Lo confirmado no se vuelve a preguntar, y se nombra en palabras de obra.
    expect(aviso).not.toContain('¿Se programó a la cuadrilla?');
    expect(aviso).not.toContain('¿Hay gasohol?');
    expect(aviso).toContain('Ya confirmado: gasohol, cuadrilla ✔');
  });

  /**
   * UNA PARTE POR QUIEN LA RESPONDE. José, 14/09 (20:00): «lo mezclas con campo
   * y planta, pierde el foco». Lo de planta va a planta; lo de campo, al admin.
   */
  it('por dominio: solo esa parte, con su encabezado y solo lo confirmado de esa parte', () => {
    const r = evaluarRevision(CHECKLIST_PRODUCCION, ['cuadrilla lista', 'hay gasohol']);
    const planta = construirAvisoChecklist(r, contexto, 'planta')!;
    // Tres líneas: cabecera con el día y el arranque, los pendientes por su nombre, lo confirmado.
    expect(planta.split('\n')).toEqual([
      '📋 *Planta, por confirmar* — domingo 13/09 · 04:00 Globofast 91 m³ · 07:00 Constroad 45 m³ · total 136 m³ · arranca en 4 h',
      'Por confirmar: agregados · PEN · petróleo de planta · aviso a operadores · mantenimiento o riesgos · clima',
      '✔ gasohol',
      'Confirmen aquí mismo, ítem por ítem: «agregados ok», «PEN ok».',
    ]);
    const campo = construirAvisoChecklist(r, contexto, 'obra')!;
    expect(campo).toContain('📋 *Campo, por confirmar* — domingo 13/09');
    expect(campo).toContain('tren de asfalto');
    expect(campo).not.toContain('petróleo de planta');
    expect(campo).toContain('✔ cuadrilla');
    expect(construirAvisoChecklist(r, { ...contexto, momento: 'recordatorio' }, 'planta')).toContain('⏰ *Planta, sigue sin confirmar*');
    expect(construirAvisoChecklist(r, { ...contexto, momento: 'ultima-llamada' }, 'obra')).toContain('🚨 *Campo, última llamada*');
    // Con todo lo de una parte confirmado, esa parte calla.
    const todoPlanta = evaluarRevision(CHECKLIST_PRODUCCION, CHECKLIST_PRODUCCION.filter((i) => i.domain === 'planta').flatMap((i) => i.seSatisfaceCon.slice(0, 1)));
    expect(construirAvisoChecklist(todoPlanta, contexto, 'planta')).toBeNull();
  });

  it('el recordatorio y la última llamada se anuncian como tales', () => {
    const r = evaluarRevision(CHECKLIST_PRODUCCION, []);
    expect(construirAvisoChecklist(r, { ...contexto, momento: 'recordatorio' })).toContain('⏰ *Recordatorio — sigue sin confirmar*');

    const critica = evaluarRevision(CHECKLIST_PRODUCCION, [], { soloCriticos: true });
    const ultima = construirAvisoChecklist(critica, { ...contexto, momento: 'ultima-llamada' })!;
    expect(ultima).toContain('🚨 *Última llamada — falta lo crítico*');
    // A 2 h del arranque nadie coordina una comida: solo lo crítico.
    expect(ultima).toContain('¿Se avisó a los operadores?');
    expect(ultima).not.toContain('comidas');
  });

  it('el aviso a planta lista el día entero con el total', () => {
    const aviso = construirAvisoProduccion(dia);

    expect(aviso).toContain('📢 *Producción programada — domingo 13/09*');
    // La reunión de coordinación es media hora antes del arranque (José, 14/09).
    expect(aviso).toContain('• 04:00 — *Globofast* · 91 m³ · reunión 03:30');
    expect(aviso).toContain('• 07:00 — *Constroad* · 45 m³ · reunión 06:30');
    expect(aviso).toContain('Reunión de coordinación 30 min antes de cada arranque.');
    expect(aviso).toContain('Total del día: *136 m³*');
    expect(aviso).not.toContain('@g.us');
  });

  it('con un solo pedido no hay «total del día»', () => {
    expect(construirAvisoProduccion({ fecha: '2026-09-13', pedidos: [pedidos[0]], totalCubos: 91 })).not.toContain('Total del día');
  });

  it('una actualización dice QUÉ cambió', () => {
    const antes = [{ id: 'g', ...pedidos[0] }];
    const ahora = [{ id: 'g', ...pedidos[0] }, { id: 'c', ...pedidos[1] }];
    const cambio = describirCambio(antes, ahora);

    expect(cambio).toBe('Cambio: se suma *Constroad* 45 m³ a las 07:00.');
    expect(construirAvisoProduccion(dia, { actualizacion: cambio })).toContain('🔁 *Producción de domingo 13/09 — actualización*');
    expect(describirCambio(ahora, antes)).toBe('Cambio: se cae *Constroad* (07:00).');
    expect(describirCambio(antes, [{ id: 'g', ...pedidos[0], hora: '05:00' }])).toBe('Cambio: *Globofast* pasa de 04:00 a 05:00.');
  });

  /**
   * 17/09 18:20: la orden de José entró por el chat como «ConstRoad 20:00» y
   * diez minutos después el sync con el Portal la fundió con su pedido
   * («CONSTROAD SAC», cliente HEMAJOPE, 02:30). Planta leyó «se suma
   * CONSTROAD SAC 300 m³ a las 02:30; se cae ConstRoad (20:00)»: dos
   * producciones donde había una. La misma empresa es la misma línea aunque
   * cambie cómo se escribe o se le agregue el cliente.
   */
  it('la misma empresa con otro nombre o con cliente nuevo es un cambio de hora, no una que se cae y otra que se suma', () => {
    const antes = [{ id: 'constroad|', companyId: 'constroad', empresa: 'ConstRoad', hora: '20:00', cubos: 300 }];
    const ahora = [{ id: 'constroad|corporacion hemajope sac', companyId: 'constroad', empresa: 'CONSTROAD SAC', hora: '02:30', cubos: 300, cliente: 'CORPORACION HEMAJOPE SAC' }];

    expect(describirCambio(antes, ahora)).toBe('Cambio: *CONSTROAD SAC* pasa de 20:00 a 02:30.');
    // Un aviso guardado antes de que las líneas llevaran empresa real: se empareja por nombre.
    const viejo = [{ id: 'CONSTROAD SAC|CORPORACION HEMAJOPE SAC', empresa: 'CONSTROAD SAC', hora: '02:30', cubos: 300, cliente: 'CORPORACION HEMAJOPE SAC' }];
    expect(describirCambio(viejo, [{ ...ahora[0], cubos: 320 }])).toBe('Cambio: *CONSTROAD SAC* pasa de 300 a 320 m³.');
    // Dos clientes distintos de la misma empresa sí son dos líneas.
    const dos = [...ahora, { id: 'constroad|otro', companyId: 'constroad', empresa: 'CONSTROAD SAC', hora: '08:00', cubos: 100, cliente: 'OTRO' }];
    expect(describirCambio(ahora, dos)).toBe('Cambio: se suma *CONSTROAD SAC* 100 m³ a las 08:00.');
  });

  /**
   * LA PROPUESTA DICE CÓMO APROBARLA, y es por cita: José, 13/09: «toco el
   * mensaje y le doy responder con uno». Un «1» suelto en el grupo no es de nadie.
   */
  it('la propuesta muestra EXACTAMENTE el texto que saldría, y cómo aprobarlo citando', () => {
    const texto = construirAvisoProduccion(dia);
    const propuesta = conPiePropuesta(texto, 'Inframaq Planta');

    // El texto primero, y UNA línea de cómo aprobarlo al final (14/09: la cabecera de cuatro líneas tapaba el mensaje).
    expect(propuesta.startsWith(texto)).toBe(true);
    // En WhatsApp se DESLIZA para responder, no se mantiene presionado (José, 14/09).
    expect(propuesta.endsWith('📨 Para «Inframaq Planta»: responde a este mensaje (deslízalo) con *1* para enviarlo, o *3* para descartar.')).toBe(true);
    expect(propuesta).not.toContain('presionado');
  });

  it('no filtra identificadores del sistema', () => {
    const r = evaluarRevision(CHECKLIST_PRODUCCION, []);
    const aviso = construirAvisoChecklist(r, contexto)!;

    for (const prohibido of ['[ESPEJO]', '@g.us', 'globofas-s8k', 'petroleo-planta', 'Escuchando:']) {
      expect(aviso).not.toContain(prohibido);
    }
  });
});

/**
 * LA FIRMA NO ES EL TEXTO. El 12/09 el mismo aviso salió a las 16:20 y a las
 * 16:40 porque el texto lleva «arranca en…». Lo que define un aviso es QUÉ falta
 * para QUÉ día en QUÉ horario.
 */
describe('la firma del aviso', () => {
  it('no cambia con el paso del tiempo si falta lo mismo', () => {
    const r = evaluarRevision(CHECKLIST_PRODUCCION, []);
    expect(firmaAviso('2026-09-13', 'inicial', r)).toBe(firmaAviso('2026-09-13', 'inicial', r));
  });

  it('cambia cuando se confirma uno', () => {
    expect(firmaAviso('2026-09-13', 'inicial', evaluarRevision(CHECKLIST_PRODUCCION, []))).not.toBe(
      firmaAviso('2026-09-13', 'inicial', evaluarRevision(CHECKLIST_PRODUCCION, ['hay gasohol']))
    );
  });

  it('cambia con el horario y con el día', () => {
    const r = evaluarRevision(CHECKLIST_PRODUCCION, []);
    expect(firmaAviso('2026-09-13', 'inicial', r)).not.toBe(firmaAviso('2026-09-13', 'recordatorio', r));
    expect(firmaAviso('2026-09-13', 'inicial', r)).not.toBe(firmaAviso('2026-09-14', 'inicial', r));
  });
});

describe('confirmar por el nombre del ítem (Globofast, 14/09: «¿cómo se confirma?»)', () => {
  it('«cuadrilla ok», «tren de asfalto listo», «comidas en campo coordinadas» confirman; «cuadrilla?» no', async () => {
    const { itemSatisfecho, CHECKLIST_PRODUCCION } = await import('./checklist');
    const de = (titulo: string) => CHECKLIST_PRODUCCION.find((i) => i.titulo === titulo)!;
    expect(itemSatisfecho(de('cuadrilla'), ['cuadrilla ok'])).toBe(true);
    expect(itemSatisfecho(de('tren de asfalto'), ['Tren de asfalto listo 👍'])).toBe(true);
    expect(itemSatisfecho(de('comidas en campo'), ['comidas en campo coordinadas'])).toBe(true);
    expect(itemSatisfecho(de('imprimación / riego de liga'), ['imprimación / riego de liga ok'])).toBe(true);
    expect(itemSatisfecho(de('cuadrilla'), ['cuadrilla?', 'y la cuadrilla'])).toBe(false);
  });
});
