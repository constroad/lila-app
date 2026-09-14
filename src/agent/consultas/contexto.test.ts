import { VIGENCIA_HILO_MS, _resetContexto, fusionar, pareceContinuacion, recordarConsulta, ultimaConsulta } from './contexto';

/**
 * EL HILO. José, 13/09/2026: «no quiero que la mejores solo para este caso
 * puntual sino en general». Lo general: «¿y la 3?» después de «quién maneja
 * la 2» es la misma pregunta con un dato cambiado.
 */
beforeEach(() => _resetContexto());

describe('qué es una continuación', () => {
  it.each(['¿y la 3?', 'y la última?', 'y mañana?', '¿y en Ate?', 'la placa AML838', 'el martes', 'y de constroad?', '4'])('«%s» sí', (t) => {
    expect(pareceContinuacion(t)).toBe(true);
  });

  it.each(['gracias', 'buenos días a todos', 'vamos a las 5 a la obra con la cuadrilla completa', 'ok', 'listo'])('«%s» no', (t) => {
    expect(pareceContinuacion(t)).toBe(false);
  });
});

describe('fusionar', () => {
  const D = ['Lurigancho', 'Ate'];
  const E = ['globofast', 'constroad'];

  it('el dato nuevo reemplaza al viejo del mismo tipo', () => {
    expect(fusionar('y la ultima?', 'quien maneja la 2', D, E)).toBe('y la ultima? quien maneja');
    expect(fusionar('y la 3?', 'quien maneja la 2', D, E)).toBe('y la 3? quien maneja');
    expect(fusionar('y mañana?', 'clima en lurigancho hoy', D, E)).toBe('y manana? clima en lurigancho');
    expect(fusionar('y en Ate?', 'clima manana en lurigancho', D, E)).toBe('y en ate? clima manana en');
    expect(fusionar('y de constroad?', 'el enlace de globofast', D, E)).toBe('y de constroad? el enlace de');
  });

  it('lo que la nueva no trae, se conserva de la anterior', () => {
    // «y la 3» no dice día: sigue siendo mañana.
    expect(fusionar('y la 3?', 'quien maneja la 2 manana', D, E)).toBe('y la 3? quien maneja manana');
  });
});

describe('memoria por persona y grupo, tres minutos', () => {
  it('recuerda y olvida', () => {
    recordarConsulta({ quien: 'jose', grupo: 'g', clave: 'unit_driver', pregunta: 'quien maneja la 2' }, 0);
    expect(ultimaConsulta('jose', 'g', 1_000)?.clave).toBe('unit_driver');
    expect(ultimaConsulta('otro', 'g', 1_000)).toBeNull();
    expect(ultimaConsulta('jose', 'otro', 1_000)).toBeNull();
    expect(ultimaConsulta('jose', 'g', VIGENCIA_HILO_MS + 1)).toBeNull();
  });
});

describe('rangos y meses en el hilo', () => {
  it('«¿y en agosto?» reemplaza «este mes»; «¿y la semana pasada?» reemplaza «en agosto»', () => {
    expect(pareceContinuacion('¿y en agosto?')).toBe(true);
    expect(pareceContinuacion('y el mes pasado?')).toBe(true);
    expect(fusionar('¿y en agosto?', 'ingresos de arena en globofast este mes')).toBe('¿y en agosto? ingresos de arena en globofast');
    expect(fusionar('y la semana pasada?', 'los pedidos de cobeñas en agosto')).toBe('y la semana pasada? los pedidos de cobenas');
    expect(fusionar('y el martes pasado', 'los pedidos del martes')).toBe('y el martes pasado los pedidos del');
  });
});
