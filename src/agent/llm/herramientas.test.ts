import { HERRAMIENTAS, normalizarArgumentos, rangoDe } from './herramientas';

/**
 * DEL MODELO SOLO SE ACEPTA LO QUE LA PREGUNTA RESPALDA. Estos casos son los
 * inventos reales que devolvió Qwen2.5-1.5B el 14/09/2026 («placa: 123456789»,
 * «nombre: Lila», «empresa: Planta de Asfalto Lima») y lo que sí debe pasar.
 */
const lunes = new Date('2026-09-14T14:00:00Z').getTime(); // lunes 14/09, 09:00 Lima

describe('normalizarArgumentos', () => {
  it('la unidad y la placa tienen que estar escritas en la pregunta', () => {
    expect(normalizarArgumentos('unit_driver', [{ campo: 'unidad', valor: '4' }], 'quién maneja la 4', lunes)).toEqual({ unitNumber: 4 });
    expect(normalizarArgumentos('unit_driver', [{ campo: 'unidad', valor: '7' }], 'quién maneja la 4', lunes)).toEqual({});
    expect(normalizarArgumentos('unit_media', [{ campo: 'placa', valor: 'aml838' }], 'fotos de la placa AML 838', lunes)).toEqual({ plate: 'AML838' });
    expect(normalizarArgumentos('unit_media', [{ campo: 'placa', valor: '123456789' }], 'fotos de la placa AML 838', lunes)).toEqual({});
  });

  it('«placa: 4» es la unidad 4 mal etiquetada', () => {
    expect(normalizarArgumentos('unit_driver', [{ campo: 'placa', valor: '4' }], 'quién maneja la 4', lunes)).toEqual({ unitNumber: 4 });
  });

  it('la empresa se reconoce por su alias, y solo si está en la pregunta', () => {
    expect(normalizarArgumentos('pedidos', [{ campo: 'empresa', valor: 'globofast' }], 'cuántos pedidos tuvo globofast', lunes)).toMatchObject({ companyId: 'globofas-s8k' });
    expect(normalizarArgumentos('pedidos', [{ campo: 'empresa', valor: 'Planta de Asfalto Lima' }], 'cuántos pedidos hubo', lunes)).toEqual({});
    expect(normalizarArgumentos('pedidos', [{ campo: 'empresa', valor: 'constroad' }], 'cuántos pedidos hubo', lunes)).toEqual({});
  });

  it('«nombre: constroad» en una herramienta con empresa es la empresa', () => {
    expect(normalizarArgumentos('pedidos', [{ campo: 'nombre', valor: 'constroad' }], 'cuántos pedidos tuvo constroad en julio', lunes)).toMatchObject({ companyId: 'constroad' });
    expect(normalizarArgumentos('pedidos', [{ campo: 'nombre', valor: 'constroad' }], 'cuántos pedidos tuvo constroad en julio', lunes).nombre).toBeUndefined();
  });

  it('el nombre vale si alguna de sus palabras está en la pregunta', () => {
    expect(normalizarArgumentos('clientes', [{ campo: 'nombre', valor: 'Cobeñas' }], 'cuál es el teléfono del cliente cobeñas', lunes)).toEqual({ nombre: 'Cobeñas' });
    expect(normalizarArgumentos('clientes', [{ campo: 'nombre', valor: 'Lila' }], 'cuál es el teléfono del cliente cobeñas', lunes)).toEqual({});
    expect(normalizarArgumentos('kardex', [{ campo: 'nombre', valor: 'arena' }], 'ingresos de arena en agosto', lunes).nombre).toBe('arena');
  });

  it('el distrito tiene que ser uno conocido y estar en la pregunta', () => {
    expect(normalizarArgumentos('weather', [{ campo: 'distrito', valor: 'ate' }], 'va a llover en ate', lunes)).toMatchObject({ distrito: 'Ate' });
    expect(normalizarArgumentos('weather', [{ campo: 'distrito', valor: 'Lima' }], 'va a llover en ate', lunes).distrito).toBeUndefined();
  });

  it('las fechas que el código entiende las pone el código, aunque el modelo diga otra', () => {
    expect(normalizarArgumentos('weather', [{ campo: 'fecha', valor: '2026-09-14' }], 'va a llover el jueves en ate', lunes).fecha).toBe('2026-09-17');
    expect(normalizarArgumentos('dispatch_summary', [{ campo: 'fecha', valor: '2026-09-14' }], 'resumen de despachos de ayer', lunes).fecha).toBe('2026-09-13');
    expect(normalizarArgumentos('orders_day', [], 'qué pedidos hay hoy', lunes).fecha).toBe('2026-09-14');
    expect(normalizarArgumentos('orders_day', [], 'qué pedidos hay mañana', lunes).fecha).toBe('2026-09-15');
  });

  it('las fechas que el código NO entiende las aporta el modelo, si son válidas y cercanas', () => {
    const r = normalizarArgumentos('pedidos', [{ campo: 'desde', valor: '2026-09-07' }, { campo: 'hasta', valor: '2026-09-13' }], 'qué le despachamos a cobeñas la semana pasada', lunes);
    expect(r).toMatchObject({ desde: '2026-09-07', hasta: '2026-09-13' });
    // Un valor que no es fecha se descarta; «la semana pasada» la resuelve el código igual.
    expect(normalizarArgumentos('pedidos', [{ campo: 'desde', valor: 'la semana pasada' }], 'los pedidos de la semana pasada', lunes)).toEqual({ desde: '2026-09-07', hasta: '2026-09-13' });
    expect(normalizarArgumentos('pedidos', [{ campo: 'desde', valor: 'hace poco' }], 'los pedidos de hace poco', lunes).desde).toBeUndefined();
    expect(normalizarArgumentos('pedidos', [{ campo: 'desde', valor: '2031-01-01' }], 'los pedidos', lunes).desde).toBeUndefined();
    expect(normalizarArgumentos('pedidos', [{ campo: 'desde', valor: '2026-02-30' }], 'los pedidos', lunes).desde).toBeUndefined();
  });

  it('un rango a medias se completa, y al revés se endereza; «ayer» manda', () => {
    expect(normalizarArgumentos('pedidos', [{ campo: 'desde', valor: '2026-09-01' }], 'los pedidos desde el 1', lunes)).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-01' });
    expect(normalizarArgumentos('pedidos', [{ campo: 'desde', valor: '2026-09-10' }, { campo: 'hasta', valor: '2026-09-01' }], 'los pedidos del 10 al 1', lunes)).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-10' });
    // Sin un número ni un mes en la pregunta, una fecha del modelo es un invento.
    expect(normalizarArgumentos('pedidos', [{ campo: 'desde', valor: '2026-09-10' }], 'los pedidos', lunes).desde).toBeUndefined();
    expect(normalizarArgumentos('weather', [{ campo: 'fecha', valor: '2026-09-01' }], 'cómo estará el clima para planta esta semana', lunes).fecha).toBeUndefined();
    expect(normalizarArgumentos('kardex', [{ campo: 'desde', valor: '2026-09-01' }, { campo: 'nombre', valor: 'arena' }], 'salidas de arena de ayer', lunes)).toMatchObject({ desde: '2026-09-13', hasta: '2026-09-13' });
  });

  it('«empresa: consorcio los pinos» es el cliente, no una empresa del piloto', () => {
    const r = normalizarArgumentos('pedidos', [{ campo: 'empresa', valor: 'consorcio los pinos' }, { campo: 'desde', valor: '2026-08-01' }, { campo: 'hasta', valor: '2026-08-31' }], 'qué le despachamos a consorcio los pinos en agosto', lunes);
    expect(r).toEqual({ nombre: 'consorcio los pinos', desde: '2026-08-01', hasta: '2026-08-31' });
    expect(normalizarArgumentos('pedidos', [{ campo: 'empresa', valor: 'Planta Lima' }], 'los pedidos de cobeñas', lunes).nombre).toBeUndefined();
  });

  it('los rangos que el código entiende mandan sobre los del modelo («este mes» no es todo el año)', () => {
    expect(normalizarArgumentos('pedidos', [{ campo: 'nombre', valor: 'cobeñas' }, { campo: 'desde', valor: '2026-01-01' }, { campo: 'hasta', valor: '2026-12-31' }], 'los pedidos de cobeñas de este mes', lunes)).toEqual({ nombre: 'cobeñas', desde: '2026-09-01', hasta: '2026-09-30' });
  });

  it('un argumento que la herramienta no acepta se ignora', () => {
    expect(normalizarArgumentos('tank_levels', [{ campo: 'unidad', valor: '4' }, { campo: 'nombre', valor: 'pen' }], 'cuánto pen hay en el tanque 4', lunes)).toEqual({});
    expect(normalizarArgumentos('help', [{ campo: 'loquesea', valor: 'x' }], 'ayuda', lunes)).toEqual({});
  });

  it('todas las herramientas declaran argumentos conocidos', () => {
    const campos = new Set(['fecha', 'desde', 'hasta', 'unidad', 'placa', 'empresa', 'distrito', 'nombre']);
    for (const h of HERRAMIENTAS) for (const a of h.argumentos) expect(campos.has(a)).toBe(true);
    expect(HERRAMIENTAS.map((h) => h.id)).toEqual(expect.arrayContaining(['clientes', 'proveedores', 'pedidos', 'kardex', 'orders_day', 'weather', 'help']));
  });
});

describe('rangoDe', () => {
  const hoy = '2026-09-14'; // lunes
  it.each([
    ['los pedidos de hoy', { desde: '2026-09-14', hasta: '2026-09-14' }],
    ['las salidas de ayer', { desde: '2026-09-13', hasta: '2026-09-13' }],
    ['los ingresos de este mes', { desde: '2026-09-01', hasta: '2026-09-30' }],
    ['los pedidos del mes pasado', { desde: '2026-08-01', hasta: '2026-08-31' }],
    ['qué se despachó esta semana', { desde: '2026-09-14', hasta: '2026-09-20' }],
    ['qué pedidos tenemos programados esta semana', { desde: '2026-09-14', hasta: '2026-09-20' }],
    ['qué pedidos hay la semana', { desde: '2026-09-14', hasta: '2026-09-20' }],
    ['qué pedidos hay los próximos días', { desde: '2026-09-14', hasta: '2026-09-21' }],
    ['qué se despachó la semana pasada', { desde: '2026-09-07', hasta: '2026-09-13' }],
    ['los pedidos de agosto', { desde: '2026-08-01', hasta: '2026-08-31' }],
    ['los pedidos en setiembre', { desde: '2026-09-01', hasta: '2026-09-30' }],
    ['los pedidos de noviembre', { desde: '2025-11-01', hasta: '2025-11-30' }], // todavía no llegó: el del año pasado
    ['los pedidos de febrero', { desde: '2026-02-01', hasta: '2026-02-28' }],
    ['los pedidos', undefined],
  ])('«%s»', (pregunta, esperado) => {
    expect(rangoDe(pregunta, hoy)).toEqual(esperado);
  });

  it('el mes pasado cruzando el año', () => {
    expect(rangoDe('los pedidos del mes pasado', '2027-01-05')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
  });
});
