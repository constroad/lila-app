import { esConsulta, extraerParametros, normalizarPlaca, preguntaLimpia, rutearPorReglas } from './catalogo';

/**
 * EL CATÁLOGO ES CERRADO Y EL RUTEO SE PUEDE LEER. Cada pregunta real de José
 * (spec Apéndice A) tiene que caer en su entrada; lo que está fuera del
 * catálogo tiene que caer en `null`, y nunca en otra entrada por parecido.
 */
describe('¿le hablan al agente?', () => {
  it('con @lila en cualquier parte, o mencionando al número del bot', () => {
    expect(esConsulta('@lila en qué carro va la 5')).toBe(true);
    expect(esConsulta('oye @Lila, cuántos m3 van?')).toBe(true);
    expect(esConsulta('@51949376824 quién maneja la 3', '51949376824')).toBe(true);
  });

  it('no con cualquier cosa que contenga «lila»', () => {
    expect(esConsulta('la lila está floreciendo')).toBe(false);
    expect(esConsulta('lila-app se cayó')).toBe(false);
    expect(esConsulta('email@lila.com')).toBe(false);
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
    ['cómo vamos con la producción', 'day_progress'],
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
    'qué opinás del clima',
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
  ])('«%s» → unidad %s', (pregunta, unidad) => {
    expect(extraerParametros(pregunta).unitNumber).toBe(unidad);
  });

  it('la placa se reconoce con y sin espacio o guion, y no se confunde con una unidad', () => {
    expect(extraerParametros('fotos de la placa AZJ 910')).toMatchObject({ plate: 'AZJ910', unitNumber: undefined });
    expect(extraerParametros('video de la aml838')).toMatchObject({ plate: 'AML838' });
    expect(extraerParametros('la BBE-942 ya salió?')).toMatchObject({ plate: 'BBE942' });
    expect(normalizarPlaca(' bbe 942 ')).toBe('BBE942');
  });

  it('la empresa nombrada se reconoce por cómo la llama la gente', () => {
    expect(extraerParametros('el enlace del pedido de hoy de globofast').companyId).toBe('globofas-s8k');
    expect(extraerParametros('las guías de constroad').companyId).toBe('constroad');
    expect(extraerParametros('las guías de hoy').companyId).toBeUndefined();
  });

  it('hoy por defecto, mañana si lo dice', () => {
    expect(extraerParametros('qué pedidos hay').day).toBe('today');
    expect(extraerParametros('qué pedidos hay mañana').day).toBe('tomorrow');
  });
});
