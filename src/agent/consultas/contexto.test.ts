import {
  unidadHeredada, VIGENCIA_HILO_MS, _resetContexto, fusionar, pareceContinuacion, pareceParaElAgente, recordarConsulta, ultimaConsulta } from './contexto';

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

describe('pareceParaElAgente', () => {
  it.each([
    'Hay prpgramacion de despachos eata semana?',
    'cuánto líquido tengo',
    'ok y cuanto liquido tengo?',
    'muéstrame las guías de hoy',
    'dame el teléfono de cobeñas',
    'qué pedidos hay el miércoles',
    'me pasas el enlace del pedido',
  ])('«%s» es una pregunta para el agente', (t) => {
    expect(pareceParaElAgente(t)).toBe(true);
  });

  it.each(['gracias', 'ok', 'ya está la cuadrilla', 'listo, salió la 4', 'buenos días a todos', 'mañana llega el petróleo a las 6'])('«%s» no lo es', (t) => {
    expect(pareceParaElAgente(t)).toBe(false);
  });
});

describe('«¿y cajamarquilla?»', () => {
  it('un «y» con una o dos palabras es una continuación aunque la palabra no sea de una lista', () => {
    expect(pareceContinuacion('Y cajamarquilla?')).toBe(true);
    expect(pareceContinuacion('y en huachipa')).toBe(true);
    expect(pareceContinuacion('y qué tal si mejor lo vemos mañana temprano')).toBe(false);
    expect(fusionar('y cajamarquilla?', 'como estara el clima en la molina para manana', ['La Molina', 'cajamarquilla'])).toBe('y cajamarquilla? como estara el clima en para manana');
  });
});

describe('esOrdenDeAvisoAPlanta — «manda el aviso a planta» es una orden, no una consulta', () => {
  it('verbo de mandar + planta + algo que mandar', async () => {
    const { esOrdenDeAvisoAPlanta } = await import('./index');
    for (const si of ['manda el aviso a planta', 'envía el mensaje al grupo de planta con los pedidos de mañana', 'avísale a planta de la producción de mañana', 'pon en planta la programación de mañana', 'manda a planta el recordatorio de hoy']) {
      expect(esOrdenDeAvisoAPlanta(si)).toBe(true);
    }
    for (const no of ['qué unidad está en planta', 'clima para planta mañana', 'cuánto falta para terminar la producción en planta', 'manda las fotos de la unidad 4', 'hay producción en planta mañana?']) {
      expect(esOrdenDeAvisoAPlanta(no)).toBe(false);
    }
  });
});

describe('temaSinDato — lo que no se registra se dice de frente', () => {
  it('la temperatura del cemento asfáltico no está en la base', async () => {
    const { temaSinDato } = await import('./catalogo');
    expect(temaSinDato('acaba de llegar una tancada de cemento asfáltico, a qué temperatura llegó y a qué hora estaría idónea para producir?')).toContain('temperatura');
    expect(temaSinDato('cuántos grados tiene el PEN')).toContain('no se registra');
    expect(temaSinDato('cuántos agregados llegaron hoy')).toBeNull();
    expect(temaSinDato('clima en Ate mañana')).toBeNull();
  });
});

describe('unidadHeredada — «ese volquete» dentro del hilo', () => {
  it('hereda placa, si no número, si no ordinal; sin nada, null', () => {
    expect(unidadHeredada({ plate: 'A1Y825', unitNumber: 9 })).toEqual({ plate: 'A1Y825' });
    expect(unidadHeredada({ unitNumber: 9 })).toEqual({ unitNumber: 9 });
    expect(unidadHeredada({ ordinal: 'ultima' })).toEqual({ ordinal: 'ultima' });
    expect(unidadHeredada({})).toBeNull();
    expect(unidadHeredada(null)).toBeNull();
  });
});
