import { cuandoDe, detectarMenciones, fechasEn, mencionesDe, textoAvisoPrevio, textoRecordatorioPedido } from './menciones';

/**
 * Lo que la gente DICE en INFRAMAQ admin sobre producciones por venir. Todo
 * relativo al momento del mensaje: lunes 14/09/2026, 10:00 Lima. Los dos
 * primeros textos son los anuncios reales de ese día.
 */
const lunes = new Date('2026-09-14T15:00:00Z').getTime();
const msg = (texto: string, over: Partial<{ esPropio: boolean; ts: number }> = {}) => ({ texto, autor: '173066@lid', ts: lunes, esPropio: false, ...over });

const ANUNCIO_DOS_DIAS = [
  'Buenos dias tenemos producción en INFRAMAQ 2 dias :',
  'MARTES 15-09',
  ' H.de producion.  04:30 am',
  'M3: 250.00 APROX.  E: 2 " ',
  'MIERCOLES 16-09',
  ' H.de producion.  04:30 am',
  'M3: 274.00 APROX.  E: 2 " ',
  'Cliente : CONSORCIO LOMAS',
  'Ubicación: MOLINA',
].join('\n');

describe('fechasEn', () => {
  it('lee «jueves 17», «MARTES 15-09», «17/09», «17 de setiembre», «mañana», «hoy»', () => {
    const f = (t: string) => fechasEn(t, '2026-09-14').map((x) => x.fecha);
    expect(f('jueves 17 tengo produccion')).toEqual(['2026-09-17']);
    expect(f('martes 15-09 y miercoles 16-09')).toEqual(['2026-09-15', '2026-09-16']);
    expect(f('el 17/09 producimos')).toEqual(['2026-09-17']);
    expect(f('el 17 de setiembre')).toEqual(['2026-09-17']);
    expect(f('manana y pasado manana')).toEqual(['2026-09-15', '2026-09-16']);
    expect(f('hoy hay produccion')).toEqual(['2026-09-14']);
    expect(f('el jueves')).toEqual(['2026-09-17']); // el próximo
    expect(f('el lunes')).toEqual(['2026-09-14']); // hoy es lunes: hoy
    expect(f('jueves 24')).toEqual(['2026-09-24']); // el jueves que cae 24
  });

  it('no confunde «03-09-2026 4.2x220» (planilla) ni «04:30» con fechas', () => {
    expect(fechasEn('03-09-2026 4.2x220 = 924', '2026-09-14')).toEqual([]);
    expect(fechasEn('a las 04:30 am', '2026-09-14')).toEqual([]);
  });
});

describe('mencionesDe', () => {
  it('«📣 Jueves 17 tengo produccion de 137m3, 2 pulgadas»', () => {
    const [m] = mencionesDe(msg('📣📣📣 Jueves 17 tengo produccion de 137m3, 2 pulgadas'));
    expect(m).toMatchObject({ desde: '2026-09-17', hasta: '2026-09-17', fechaConocida: true, cubos: 137 });
    expect(m.companyId).toBeUndefined();
  });

  it('el anuncio de dos días: dos menciones, cada una con sus m³ y su hora; «en INFRAMAQ» es la planta', () => {
    const lista = mencionesDe(msg(ANUNCIO_DOS_DIAS));
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ desde: '2026-09-15', cubos: 250, hora: '04:30', cliente: 'CONSORCIO LOMAS' });
    expect(lista[1]).toMatchObject({ desde: '2026-09-16', cubos: 274, hora: '04:30', cliente: 'CONSORCIO LOMAS' });
    expect(lista[0].companyId).toBeUndefined();
  });

  it('«mañana» dicho el lunes es martes; «esta semana» es la semana entera; la empresa por su alias', () => {
    expect(mencionesDe(msg('mañana producimos para constroad'))[0]).toMatchObject({ desde: '2026-09-15', hasta: '2026-09-15', companyId: 'constroad' });
    expect(mencionesDe(msg('esta semana habrá pedidos de globofast'))[0]).toMatchObject({ desde: '2026-09-14', hasta: '2026-09-20', companyId: 'globofas-s8k', fechaConocida: true });
  });

  it('«habrá producción» sin cuándo cubre los próximos días, y lo dice', () => {
    const [m] = mencionesDe(msg('habrá producción para constroad, confirmen cuadrilla'));
    expect(m).toMatchObject({ desde: '2026-09-14', hasta: '2026-09-21', fechaConocida: false });
    expect(cuandoDe(m)).toBe('en los próximos días');
  });

  it('lo que ya pasó, las preguntas, lo propio y lo que no habla de producción no son anuncios', () => {
    expect(mencionesDe(msg('ayer terminó la producción de globofast'))).toEqual([]);
    expect(mencionesDe(msg('la producción del martes salió bien, 250 m3'))).toEqual([]);
    expect(mencionesDe(msg('¿qué pedidos hay mañana?'))).toEqual([]);
    expect(mencionesDe(msg('De quien es la producción?'))).toEqual([]);
    expect(mencionesDe(msg('@lila qué producción hay el jueves'))).toEqual([]);
    expect(mencionesDe(msg('el jueves hay producción', { esPropio: true }))).toEqual([]);
    expect(mencionesDe(msg('buenos días, ya llegó el petróleo'))).toEqual([]);
    expect(mencionesDe(msg('cuadrilla lista para mañana'))).toEqual([]);
    expect(mencionesDe(msg('*03-09-2026 4.2x220. =924+ Recorrido 0.5 = 110'))).toEqual([]);
  });

  it('una producción hablada por tres personas es una sola mención; en el hilo, fecha + empresa alcanzan', () => {
    const lista = detectarMenciones([
      msg('el jueves hay producción para globofast'),
      msg('ok, jueves globofast, cuadrilla lista', { ts: lunes + 60_000 }),
      msg('confirmado jueves producción globofast 200 m3', { ts: lunes + 120_000 }),
      msg('y el viernes constroad', { ts: lunes + 180_000 }),
    ]);
    expect(lista.map((m) => `${m.desde} ${m.companyId}`)).toEqual(['2026-09-17 globofas-s8k', '2026-09-18 constroad']);
    expect(lista[0].cubos).toBe(200);
    expect(detectarMenciones([msg('y el viernes constroad')])).toEqual([]);
  });

  it('el mismo anuncio repetido dos veces (14/09, 10:23 y 10:24) son dos menciones, no cuatro', () => {
    expect(detectarMenciones([msg(ANUNCIO_DOS_DIAS), msg(ANUNCIO_DOS_DIAS, { ts: lunes + 60_000 })])).toHaveLength(2);
  });
});

describe('textos', () => {
  const lista = mencionesDe(msg(ANUNCIO_DOS_DIAS));
  const [jueves] = mencionesDe(msg('📣📣📣 Jueves 17 tengo produccion de 137m3, 2 pulgadas'));
  it('el aviso previo a planta lista todo lo mencionado y dice que falta el pedido', () => {
    const t = textoAvisoPrevio([...lista, jueves]);
    expect(t).toContain('🗓 *Posibles producciones mencionadas en INFRAMAQ admin*');
    expect(t).toContain('• el martes 15/09 — CONSORCIO LOMAS, ~250 m³, desde las 04:30');
    expect(t).toContain('• el miércoles 16/09 — CONSORCIO LOMAS, ~274 m³, desde las 04:30');
    expect(t).toContain('• el jueves 17/09 — ~137 m³');
    expect(t).toContain('Los pedidos todavía no están en Portal');
    expect(textoAvisoPrevio([jueves])).toContain('🗓 *Posible producción mencionada en INFRAMAQ admin*');
  });
  it('el recordatorio a admin pide los pedidos con hora, o solo la hora', () => {
    expect(textoRecordatorioPedido(lista)).toContain('📝 Mencionaron producción pero el pedido no está en Portal:\n• el martes 15/09');
    expect(textoRecordatorioPedido(lista)).toContain('cárguenlos *con hora de inicio*');
    const soloHora = textoRecordatorioPedido([], [jueves]);
    expect(soloHora).toContain('📝 Estos pedidos están en Portal *sin hora de inicio*:\n• el jueves 17/09 — ~137 m³');
    expect(soloHora).toContain('pónganles la hora de inicio');
  });
});
