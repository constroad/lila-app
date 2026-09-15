import { especificidadDeRegla, esConsulta, extraerParametros, fechaDe, hablaEnPasado, normalizarPlaca, preguntaLimpia, rutearPorReglas, sumarDias } from './catalogo';

/**
 * EL CATÁLOGO ES CERRADO Y EL RUTEO SE PUEDE LEER. Cada pregunta real de José
 * (spec Apéndice A) tiene que caer en su entrada; lo que está fuera del
 * catálogo tiene que caer en `null`, y nunca en otra entrada por parecido.
 */
describe('¿le hablan al agente?', () => {
  it('con @lila en cualquier parte, «lila» al principio, o una mención al bot', () => {
    expect(esConsulta('@lila en qué carro va la 5')).toBe(true);
    expect(esConsulta('oye @Lila, cuántos m3 van?')).toBe(true);
    expect(esConsulta('lila, quién maneja la 3')).toBe(true);
    expect(esConsulta('@51949376824 quién maneja la 3', '51949376824')).toBe(true);
    // La mención llega como JID (número o LID) en contextInfo, no en el texto.
    expect(esConsulta('@ConstRoad quién maneja la 3', '51949376824', ['51949376824@s.whatsapp.net'])).toBe(true);
    expect(esConsulta('@ConstRoad quién maneja la 3', '51949376824', ['188570740486215@lid'], ['188570740486215@lid'])).toBe(true);
  });

  /**
   * EL CASO EXACTO DEL 13/09 12:30: «@⁨lila muestramr las fotos…». WhatsApp
   * envuelve la mención en marcas bidi invisibles (U+2068/U+2069). Sin
   * sacarlas, «@lila» no coincide y el agente calla.
   */
  it('una mención con las marcas invisibles de WhatsApp se reconoce y se limpia', () => {
    const conMarcas = '@\u2068lila\u2069 muestramr las fotos y videos de la unidad 4 de la produccion de hoy';
    expect(esConsulta(conMarcas)).toBe(true);
    expect(preguntaLimpia(conMarcas)).toBe('muestramr las fotos y videos de la unidad 4 de la produccion de hoy');
    expect(rutearPorReglas(preguntaLimpia(conMarcas))).toBe('unit_media');
    expect(extraerParametros(preguntaLimpia(conMarcas)).unitNumber).toBe(4);
  });

  it('no con cualquier cosa que contenga «lila», ni una mención a otro', () => {
    expect(esConsulta('la lila está floreciendo')).toBe(false);
    expect(esConsulta('hablé con lila ayer')).toBe(false);
    expect(esConsulta('email@lila.com')).toBe(false);
    expect(esConsulta('@Juan mirá esto', '51949376824', ['51999111222@s.whatsapp.net'])).toBe(false);
  });

  it('la pregunta queda limpia también con «lila» inicial y menciones', () => {
    expect(preguntaLimpia('lila, quién maneja la 3')).toBe('quien maneja la 3');
    expect(preguntaLimpia('@51949376824 quién maneja la 3', '51949376824')).toBe('quien maneja la 3');
  });

  it('la pregunta queda limpia para rutear', () => {
    expect(preguntaLimpia('@lila en qué carro va la 5')).toBe('en que carro va la 5');
    expect(preguntaLimpia('@51949376824 quién maneja la 3', '51949376824')).toBe('quien maneja la 3');
  });
});

describe('ruteo por reglas', () => {
  it.each([
    ['en qué carro van los despachos en planta', 'plant_current_unit'],
    ['qué unidad está cargando', 'plant_current_unit'],
    ['ya salieron todos los volquetes?', 'plant_current_unit'],
    ['en qué carro va la colocación en campo', 'site_current_unit'],
    ['cuántos carros están en ruta', 'site_current_unit'],
    ['muéstrame las fotos de campo de la unidad 5', 'unit_media'],
    ['muéstrame la foto y video de la unidad de placa AZJ 910', 'unit_media'],
    ['generame el enlace del pedido de hoy de globofast', 'order_link'],
    ['pasame el link del cliente', 'order_link'],
    ['muéstrame las guías generadas para la producción de hoy', 'guias_day'],
    ['pasame los vales de hoy', 'guias_day'],
    ['cuántos m3 van', 'day_progress'],
    ['cuántos cubos faltan', 'day_progress'],
    ['cómo va la producción', 'day_progress'],
    ['a qué hora salió la 5', 'unit_departure'],
    ['cuánto falta para que llegue la 5', 'unit_eta'],
    ['quién maneja la 5', 'unit_driver'],
    ['qué placa tiene la 3', 'unit_driver'],
    // 15/09 16:50: «sabes cuánto cubica ese volquete?» → pedía fotos otra vez.
    ['sabes cuánto cubica ese volquete?', 'unit_capacity'],
    ['cuál es el cubicaje del volquete 9', 'unit_capacity'],
    ['cuántos m3 le entran a la A1Y 825', 'unit_capacity'],
    ['capacidad de la unidad 3', 'unit_capacity'],
    ['qué pedidos hay mañana', 'orders_day'],
    ['hay producción mañana?', 'orders_day'],
    ['cómo va el checklist', 'checklist_status'],
    ['qué falta confirmar', 'checklist_status'],
    ['ya se generaron los informes?', 'reports_status'],
    ['tenemos hecho el informe de imprimación, área adicional etc?', 'reports_status'],
    ['cuánto falta para terminar la producción en planta', 'plant_finish'],
    ['cuánto falta para terminar el control de pista', 'site_finish'],
    ['a qué hora acabamos hoy en planta', 'plant_finish'],
    ['falta mucho para que termine la obra?', 'site_finish'],
    // 15/09 12:26: fue al modelo y eligió «informes» (el PDF) por decir «control de pista».
    ['cuantos carros ya se descargaron en campo en el control dr pista?', 'site_finish'],
    ['cuántos carros faltan por colocar en obra', 'site_finish'],
    ['cuántos carros faltan por colocar en pista', 'site_finish'],
    ['cuántos llegaron a obra', 'site_finish'],
    ['cuántas unidades ya se colocaron', 'site_finish'],
    ['cuánto falta por colocar', 'site_finish'],
    ['cómo vamos con la producción', 'day_progress'],
    ['cuántos galones tenemos en los tanques', 'tank_levels'],
    ['muéstrame el resumen de líquidos', 'tank_levels'],
    ['resumen de liquidos pen gashol etc', 'tank_levels'],
    ['muéstrame un resumen de agregados', 'aggregates_stock'],
    ['resumen de hoy', 'dispatch_summary'],
    ['cuánto pen queda', 'tank_levels'],
    ['consumos de la producción de hoy', 'production_consume'],
    ['cuánto gasohol se usó hoy', 'production_consume'],
    ['cuánto agregado tengo en stock', 'aggregates_stock'],
    ['cómo está el clima en Lurigancho', 'weather'],
    ['va a llover mañana en Ate?', 'weather'],
    ['hay riesgo de lluvia hoy', 'weather'],
    ['muéstrame el resumen de despachos de hoy', 'dispatch_summary'],
    // «Programado» y «producciones» son pedidos (14/09: «hay programación de
    // despachos esta semana?» no caía en nada); el rango lo resuelve después el índice.
    ['hay programación de despachos esta semana?', 'orders_day'],
    // Por palabra, no por subcadena: «pen» no vive dentro de «propensos» (14/09: iba a los tanques).
    ['qué distritos están propensos a lluvia esta semana', 'weather_districts'],
    ['en qué distritos va a llover mañana', 'weather_districts'],
    ['cómo estará el clima para planta esta semana', 'weather'],
    ['y el clima en la molina y cajamarquilla en planta para asfaltar mañana?', 'weather'],
    ['hay algo programado para mañana?', 'orders_day'],
    ['qué producciones hay esta semana', 'orders_day'],
    ['@lila ayuda', 'help'],
    ['qué puedes hacer?', 'help'],
  ])('«%s» → %s', (pregunta, clave) => {
    expect(rutearPorReglas(pregunta)).toBe(clave);
  });

  /**
   * Fuera del catálogo: precios, deuda, pagos, órdenes al bot. Y gana sobre las
   * reglas: «cuánto cuesta el m3» tiene «m3» y aun así es null.
   */
  it.each([
    'cuánto nos debe Minera XYZ',
    'cuánto cuesta el m3',
    'ya pagaron el pedido de la 5?',
    'mandá el vale de la 5 al 999',
    'cuál es el teléfono del chofer de la 3',
    'qué opinás del gobierno',
    'hola',
  ])(
    '«%s» → null',
    (pregunta) => {
      expect(rutearPorReglas(pregunta)).toBeNull();
    }
  );
});

/**
 * GANA LA REGLA MÁS ESPECÍFICA. «cuánto falta para terminar la producción en
 * planta» contiene «planta» (regla de una palabra de `plant_current_unit`) y
 * también «falta terminar planta» (tres palabras de `plant_finish`). La de tres
 * dice más; el orden del catálogo no decide.
 */
describe('especificidad', () => {
  it('una regla de tres palabras le gana a una de una', () => {
    expect(rutearPorReglas('cuánto falta para terminar la producción en planta')).toBe('plant_finish');
    expect(rutearPorReglas('en qué carro van en planta')).toBe('plant_current_unit');
  });
});

describe('parámetros', () => {
  it.each([
    ['a qué hora salió la 5', 5],
    ['quién maneja la unidad 12', 12],
    ['fotos del carro #3', 3],
    ['el volquete 7 ya llegó', 7],
    ['cuántos m3 van', undefined],
    // 25 m3 no es una unidad, y 05:32 tampoco.
    ['ya salieron 25 m3', undefined],
    // Los números de una fecha tampoco (15/09: «la última unidad que salió el 4 de setiembre» daba la unidad 4).
    ['fotos de la última unidad que salió el 4 de setiembre', undefined],
    ['quién manejó la unidad 5 el 3 de setiembre', 5],
    ['qué empresa tuvo producción el 03 y 04 de setiembre', undefined],
    ['la salida de la 7 el 4/9', 7],
    ['consumos del 03/09/26', undefined],
  ])('«%s» → unidad %s', (pregunta, unidad) => {
    expect(extraerParametros(pregunta).unitNumber).toBe(unidad);
  });

  it('con la fecha tapada, «la última» sigue siendo la última', () => {
    expect(extraerParametros('fotos de la última unidad que salió el 4 de setiembre')).toMatchObject({ ordinal: 'ultima', unitNumber: undefined });
  });

  /** Pedir el enlace es `order_link` aunque nombre producción, mañana o informes (las pestañas). */
  it('el enlace del pedido gana a las palabras de las pestañas y del día', () => {
    expect(rutearPorReglas('genera el enlace del pedido de constroad de mañana solo producción')).toBe('order_link');
    expect(rutearPorReglas('pásame el link del pedido de cobeñas con colocación e informes')).toBe('order_link');
    expect(rutearPorReglas('el enlace del pedido de hoy con informes')).toBe('order_link');
  });

  /** «Qué informes de campo se hicieron» caía en «campo» → unidad en campo (15/09). */
  it('los informes de campo son informes, no la unidad en campo', () => {
    expect(rutearPorReglas('qué informes de campo se hicieron el 4 de setiembre')).toBe('reports_status');
    expect(rutearPorReglas('ya se generaron los informes de obra')).toBe('reports_status');
    expect(rutearPorReglas('qué unidad está en campo')).toBe('site_current_unit');
  });

  it('la placa se reconoce con y sin espacio o guion, y no se confunde con una unidad', () => {
    expect(extraerParametros('fotos de la placa AZJ 910')).toMatchObject({ plate: 'AZJ910', unitNumber: undefined });
    expect(extraerParametros('video de la aml838')).toMatchObject({ plate: 'AML838' });
    expect(extraerParametros('la BBE-942 ya salió?')).toMatchObject({ plate: 'BBE942' });
    // 15/09 16:48: «del A1Y 825 dame el vídeo» → «¿De cuál unidad?». Las placas
    // nuevas llevan un dígito en el bloque de letras (A1Y-825, C2A-772, T2T-809).
    expect(extraerParametros('del A1Y 825 dame el vídeo de cómo salió hoy de planta')).toMatchObject({ plate: 'A1Y825', unitNumber: undefined });
    expect(extraerParametros('cuánto cubica el T2T-809')).toMatchObject({ plate: 'T2T809' });
    // Y no cualquier cosa con tres dígitos: «m3 250» no es placa.
    expect(extraerParametros('van 250 m3 hoy').plate).toBeUndefined();
    expect(extraerParametros('los 275 de hoy ya salieron?').plate).toBeUndefined();
    expect(normalizarPlaca(' bbe 942 ')).toBe('BBE942');
  });

  it('la empresa nombrada se reconoce por cómo la llama la gente', () => {
    expect(extraerParametros('el enlace del pedido de hoy de globofast').companyId).toBe('globofas-s8k');
    expect(extraerParametros('las guías de constroad').companyId).toBe('constroad');
    expect(extraerParametros('las guías de hoy').companyId).toBeUndefined();
  });

  /**
   * FECHAS CON NOMBRE. «el martes» es el PRÓXIMO martes; «15 de septiembre» y
   * «15/09» sin año son la vez más cercana a hoy; «pasado mañana» son dos días.
   * Todo relativo a un «ahora» fijo: domingo 13/09/2026 a las 13:00 Lima.
   */
  it('entiende días de la semana, fechas y «pasado mañana»', () => {
    const ahora = new Date('2026-09-13T18:00:00Z').getTime(); // domingo 13/09, 13:00 Lima
    expect(fechaDe('va a llover el martes', ahora)).toBe('2026-09-15');
    expect(fechaDe('clima el domingo', ahora)).toBe('2026-09-20'); // hoy es domingo: el próximo
    expect(fechaDe('clima pasado mañana', ahora)).toBe('2026-09-15');
    expect(fechaDe('clima el 20 de septiembre', ahora)).toBe('2026-09-20');
    expect(fechaDe('clima el 20/09', ahora)).toBe('2026-09-20');
    expect(fechaDe('clima el 5 de enero', ahora)).toBe('2027-01-05'); // el que viene está más cerca que el que pasó
    expect(fechaDe('clima hoy', ahora)).toBeUndefined();
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01');
  });

  /**
   * EL AÑO DE UN DÍA SIN AÑO. El 15/09 Nene preguntó «qué empresa tuvo
   * producción el 03 y 04 de setiembre» y el 04/09, por ya haber pasado, saltó
   * a 2027: «no hay pedidos el sábado 04/09», con tres pedidos en Portal. Un
   * día que acaba de pasar es el de este año; hacia atrás (historial o pregunta
   * en pasado) nunca es el del año que viene.
   */
  it('un día ya pasado es el de este año, no el del año que viene', () => {
    const ahora = new Date('2026-09-15T10:58:00Z').getTime(); // martes 15/09, 05:58 Lima
    expect(fechaDe('qué empresa tuvo producción el 04 de setiembre', ahora)).toBe('2026-09-04');
    expect(fechaDe('qué pedidos hay el 04 de setiembre', ahora)).toBe('2026-09-04'); // sin verbo en pasado, igual: es el más cercano
    expect(fechaDe('qué se despachó el 4/9', ahora)).toBe('2026-09-04');
    expect(fechaDe('cuántos m3 se despacharon el 20 de diciembre', ahora)).toBe('2025-12-20'); // en pasado y a tres meses: el del año pasado
    expect(fechaDe('los pedidos del 20 de diciembre', ahora, { historial: true })).toBe('2025-12-20');
    expect(fechaDe('los pedidos del 20 de setiembre', ahora, { historial: true })).toBe('2026-09-20'); // programado, dentro de dos meses
    expect(fechaDe('qué hay programado el 20 de diciembre', ahora)).toBe('2026-12-20');
    expect(fechaDe('el pedido del 3 de enero', new Date('2026-12-28T14:00:00Z').getTime())).toBe('2027-01-03'); // en diciembre, enero es el que viene
    expect(hablaEnPasado('qué empresa tuvo producción el 03 y 04')).toBe(true);
    expect(hablaEnPasado('el despacho de mañana')).toBe(false);
  });

  /**
   * «AYER» faltaba y se tomaba por hoy: el 14/09 José pidió «el resumen de
   * despachos de ayer» y el agente contestó «no tengo pedidos para el lunes
   * 14» — los del domingo 13 estaban. Y hacia atrás cruza el mes.
   */
  it('entiende «ayer» y «anteayer»', () => {
    const ahora = new Date('2026-09-14T14:00:00Z').getTime(); // lunes 14/09, 09:00 Lima
    expect(fechaDe('el resumen de despachos de ayer', ahora)).toBe('2026-09-13');
    expect(fechaDe('los pedidos de anteayer', ahora)).toBe('2026-09-12');
    expect(fechaDe('qué se despachó antes de ayer', ahora)).toBe('2026-09-12');
    expect(fechaDe('los pedidos de ayer', new Date('2026-10-01T14:00:00Z').getTime())).toBe('2026-09-30');
    // «el martes pasado» es el último martes que ya fue; «el martes», el próximo.
    expect(fechaDe('los pedidos del martes pasado', ahora)).toBe('2026-09-08');
    expect(fechaDe('los pedidos del lunes pasado', ahora)).toBe('2026-09-07'); // hoy es lunes: el anterior
    expect(fechaDe('los pedidos del martes', ahora)).toBe('2026-09-15');
    expect(extraerParametros('resumen de despachos de ayer', ahora).fecha).toBe('2026-09-13');
  });

  /** «la última unidad despachada» no pide un número: se resuelve sola. */
  it('entiende «la última» y «la primera»', () => {
    expect(extraerParametros('a qué hora salió la última unidad despachada hoy').ordinal).toBe('ultima');
    expect(extraerParametros('quién maneja el último carro').ordinal).toBe('ultima');
    expect(extraerParametros('la que acaba de salir').ordinal).toBe('ultima');
    expect(extraerParametros('a qué hora salió la primera').ordinal).toBe('primera');
    expect(extraerParametros('a qué hora salió la 3').ordinal).toBeUndefined();
  });

  it('«la semana» y «los próximos días» son un rango', () => {
    expect(extraerParametros('clima de la semana en ate').rango).toBe('semana');
    expect(extraerParametros('cómo estará el clima los próximos días').rango).toBe('semana');
    expect(extraerParametros('clima hoy').rango).toBeUndefined();
  });

  it('hoy por defecto, mañana si lo dice', () => {
    expect(extraerParametros('qué pedidos hay').day).toBe('today');
    expect(extraerParametros('qué pedidos hay mañana').day).toBe('tomorrow');
  });
});

describe('especificidadDeRegla', () => {
  it('cuenta las palabras de la mejor regla que casa', () => {
    expect(especificidadDeRegla('y el clima en la molina y cajamarquilla en planta para asfaltar mañana?')).toBe(2); // clima + planta
    expect(especificidadDeRegla('cuántos m3 van')).toBe(1);
    expect(especificidadDeRegla('hola qué tal')).toBe(0);
  });
});
