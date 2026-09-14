import { ESQUEMA_SELECCION, esClaveDeCatalogo, interpretarSeleccion, promptSeleccion } from './seleccion';

const lunes = new Date('2026-09-14T14:00:00Z').getTime(); // lunes 14/09, 09:00 Lima

describe('el prompt de selección', () => {
  it('lleva todas las herramientas, la fecha de hoy y ejemplos con fechas reales', () => {
    const p = promptSeleccion('2026-09-14');
    expect(p).toContain('Hoy es lunes 2026-09-14');
    for (const id of ['orders_day', 'unit_driver', 'tank_levels', 'weather', 'clientes', 'proveedores', 'pedidos', 'kardex', 'ninguna']) expect(p).toContain(`- ${id}:`);
    expect(p).toContain('"la semana pasada" = desde 2026-09-07 hasta 2026-09-13');
    expect(p).toContain('"en agosto" = desde 2026-08-01 hasta 2026-08-31');
    expect(p).toContain('{"campo":"fecha","valor":"2026-09-13"}'); // «de ayer»
    expect(p).toContain('{"campo":"fecha","valor":"2026-09-17"}'); // «el jueves»
  });

  it('cruzando el año, el mes anterior es diciembre del año pasado', () => {
    const p = promptSeleccion('2027-01-05');
    expect(p).toContain('"en diciembre" = desde 2026-12-01 hasta 2026-12-31');
  });

  it('el esquema solo permite herramientas y campos de la lista', () => {
    expect(ESQUEMA_SELECCION.properties.herramienta.enum).toContain('kardex');
    expect(ESQUEMA_SELECCION.properties.herramienta.enum).toContain('ninguna');
    expect(ESQUEMA_SELECCION.properties.argumentos.items.properties.campo.enum).toEqual(['fecha', 'desde', 'hasta', 'unidad', 'placa', 'empresa', 'distrito', 'nombre']);
  });
});

describe('interpretarSeleccion', () => {
  it('una herramienta con argumentos respaldados por la pregunta', () => {
    const r = interpretarSeleccion(
      '{"herramienta":"pedidos","argumentos":[{"campo":"nombre","valor":"consorcio los pinos"},{"campo":"desde","valor":"2026-09-07"},{"campo":"hasta","valor":"2026-09-13"}]}',
      'qué le despachamos a consorcio los pinos la semana pasada',
      lunes
    );
    expect(r).toEqual({ herramienta: 'pedidos', argumentos: { nombre: 'consorcio los pinos', desde: '2026-09-07', hasta: '2026-09-13' } });
  });

  it('«ninguna», una herramienta inventada o un JSON roto → null', () => {
    expect(interpretarSeleccion('{"herramienta":"ninguna","argumentos":[]}', 'gracias', lunes)).toBeNull();
    expect(interpretarSeleccion('{"herramienta":"borrar_todo","argumentos":[]}', 'borra todo', lunes)).toBeNull();
    expect(interpretarSeleccion('{"herramienta":', 'x', lunes)).toBeNull();
  });

  it('distingue el catálogo de siempre de las herramientas de datos', () => {
    expect(esClaveDeCatalogo('unit_driver')).toBe(true);
    expect(esClaveDeCatalogo('clientes')).toBe(false);
  });
});
