import { SIN_AGREGADOS, consumosDeLaObra, contenidoDeTanque, liquidoDe, materialesPorEmpresa, textoConsumos, textoMateriales, textoTanques } from './planta';

/**
 * Los textos de planta, sin base. Lo que se prueba es que digan lo MISMO que
 * los reportes del cron de Portal (fluids-report, materials-stock-report): el
 * agente y el reporte de las 10:00 no pueden contradecirse.
 */
describe('tanques', () => {
  it('PEN en m³ producibles, petróleo en cm, gasohol total; mismos umbrales que el cron', () => {
    const t = textoTanques([
      { nombre: 'INFRA PEN 1', contenido: 'pen', galones: 573.56, m3Producibles: 22.94, nivelCm: 38, capacidad: 2000, stock: 600, reorden: 200 },
      { nombre: 'INFRA PEN 2', contenido: 'pen', galones: 295.34, m3Producibles: 11.81, nivelCm: 29.5, capacidad: 2000, stock: 600, reorden: 200 },
      { nombre: 'INFRA HIGHWAY', contenido: 'petroleo', galones: 66.65, m3Producibles: 0, nivelCm: 29.5, capacidad: 2000, stock: 600, reorden: 200 },
      { nombre: 'GRUPO WILSON', contenido: 'petroleo', galones: 35.37, m3Producibles: 0, nivelCm: 57, capacidad: 2000, stock: 600, reorden: 200 },
      { nombre: 'INFRA GASOHOL', contenido: 'gasohol', galones: 1008.66, m3Producibles: 403.46, nivelCm: 157, capacidad: 2000, stock: 600, reorden: 200 },
    ]);
    expect(t).toContain('*- INFRA PEN 1:* 23 m³ prod. (573.6 gl, 38 cm)');
    expect(t).toContain('*- INFRA PEN 2:* 12 m³ prod.');
    expect(t).toContain('*- HIGHWAY:* 29.5 cm (66.7 gl) (⚠️ PEDIR PETRÓLEO)');
    expect(t).toContain('*- GRUPO WILSON:* 57 cm (35.4 gl)');
    expect(t).not.toContain('GRUPO WILSON:* 57 cm (35.4 gl) (⚠️');
    expect(t).toContain('*- GASOHOL:* 403 m³ (1,008.7 gl)');
  });

  it('sin PEN ni gasohol lo dice como el cron: SIN STOCK', () => {
    const t = textoTanques([{ nombre: 'GRUPO WILSON', contenido: 'petroleo', galones: 35, m3Producibles: 0, nivelCm: 57, capacidad: 2000, stock: 600, reorden: 200 }]);
    expect(t).toContain('*- PEN:* 0 m³ ⚠️ SIN STOCK');
    expect(t).toContain('*- GASOHOL:* 0 m³ (⚠️ SIN STOCK)');
  });

  it('gasohol bajo 50 m³ pide gasohol', () => {
    const t = textoTanques([{ nombre: 'INFRA GASOHOL', contenido: 'gasohol', galones: 100, m3Producibles: 40, nivelCm: 20, capacidad: 2000, stock: 600, reorden: 200 }]);
    expect(t).toContain('*- GASOHOL:* 40 m³ (100 gl) (⚠️ PEDIR GASOHOL)');
  });
});

describe('consumos', () => {
  it('por producción: pedido, m³, total y cada tanque con su gl/m³', () => {
    const t = textoConsumos(
      [{ fecha: '2026-09-13', pedidos: ['FERNANDO COBEÑAS'], m3: 91, totalGalones: 52.36, porTanque: [{ tanque: 'CUMMINS PROD.', galones: 34.36, glPorM3: 0.3776 }, { tanque: 'GRUPO WILSON', galones: 18, glPorM3: 0.1978 }] }],
      '2026-09-13'
    );
    expect(t).toContain('🛢 *Consumos de domingo 13/09*');
    expect(t).toContain('*FERNANDO COBEÑAS* — 91 m³, 52.4 gl en total');
    expect(t).toContain('• CUMMINS PROD.: 34.4 gl · 0.378 gl/m³');
  });

  it('sin consumo registrado, lo dice y dice dónde se registra', () => {
    expect(textoConsumos([], '2026-09-14')).toContain('No hay consumo registrado para lunes 14/09');
  });

  it('el título va pegado al contenido: una línea en blanco, no tres', () => {
    const t = textoConsumos([{ fecha: '2026-09-13', pedidos: ['FERNANDO COBEÑAS'], m3: 91, totalGalones: 18, porTanque: [{ tanque: 'GRUPO WILSON', galones: 18, glPorM3: 0.1978 }] }], '2026-09-13');
    expect(t).not.toMatch(/\n\n\n/);
    expect(t.startsWith('🛢 *Consumos de domingo 13/09*\n\n*FERNANDO COBEÑAS*')).toBe(true);
  });
});

/**
 * 30/09, 07:25, Globofast: «el consumo del cemento asfáltico del 14, 15 y 16 de
 * setiembre en la obra las lomas» → Lila mandó SOLO el 16/09 y todos los
 * tanques (petróleo de los grupos, gasohol…). Lo pedido: tres días, solo PEN,
 * solo esa obra.
 */
describe('consumos de un rango, de un líquido, de una obra', () => {
  const pen = (galones1: number, galones2: number, m3: number) => [
    { tanque: 'INFRA PEN #2', galones: galones1, glPorM3: galones1 / m3, contenido: 'pen' as const },
    { tanque: 'INFRA PEN #1', galones: galones2, glPorM3: galones2 / m3, contenido: 'pen' as const },
    { tanque: 'INFRA GASOHOL', galones: 544.8, glPorM3: 544.8 / m3, contenido: 'gasohol' as const },
    { tanque: 'GRUPO WILSON', galones: 13, glPorM3: 13 / m3, contenido: 'petroleo' as const },
  ];
  const consumo = (fecha: string, cliente: string, m3: number, g1: number, g2: number) => {
    const porTanque = pen(g1, g2, m3);
    return { fecha, pedidos: [cliente], m3, porTanque, totalGalones: porTanque.reduce((s, t) => s + t.galones, 0) };
  };
  const lista = [
    consumo('2026-09-14', 'CONSORCIO LOMAS', 200, 4000, 800),
    consumo('2026-09-16', 'CONSORCIO LOMAS', 250, 4784.3, 1196.6),
    consumo('2026-09-16', 'MUNICIPALIDAD DE COMAS', 90, 1500, 300),
  ];

  it('liquidoDe: cemento asfáltico es PEN; gasohol; petróleo; sin líquido nombrado, todos', () => {
    expect(liquidoDe('el consumo del cemento asfaltico del 14, 15 y 16 de setiembre')).toBe('pen');
    expect(liquidoDe('cuánto pen gastamos ayer')).toBe('pen');
    expect(liquidoDe('consumo de gashol de hoy')).toBe('gasohol');
    expect(liquidoDe('cuánto petróleo se usó')).toBe('petroleo');
    expect(liquidoDe('consumos de la producción de hoy')).toBeUndefined();
  });

  it('contenidoDeTanque: por el tanque de Portal si se conoce, si no por el nombre', () => {
    const porNombre = new Map([['CUMMINS PROD.', 'petroleo' as const]]);
    expect(contenidoDeTanque('CUMMINS PROD.', porNombre)).toBe('petroleo');
    expect(contenidoDeTanque('INFRA PEN #2', porNombre)).toBe('pen');
    expect(contenidoDeTanque('INFRA GASHOL', porNombre)).toBe('gasohol');
    expect(contenidoDeTanque('INFRA HIGHWAY', porNombre)).toBe('otro');
  });

  it('la obra nombrada elige sus consumos; si no coincide ninguna, quedan todos y se dice', () => {
    expect(consumosDeLaObra(lista, 'el consumo del cemento asfaltico del 14, 15 y 16 de setiembre en la obra las lomas')).toMatchObject({ obra: 'CONSORCIO LOMAS', noEncontrada: false });
    expect(consumosDeLaObra(lista, 'el consumo en la obra las lomas').lista).toHaveLength(2);
    expect(consumosDeLaObra(lista, 'consumo de pen del 14 al 16 de setiembre')).toMatchObject({ obra: undefined, noEncontrada: false });
    expect(consumosDeLaObra(lista, 'consumo de pen del 14 al 16 de setiembre').lista).toHaveLength(3);
    const otra = consumosDeLaObra(lista, 'consumo de pen en la obra santa rosa');
    expect(otra).toMatchObject({ obra: undefined, noEncontrada: true });
    expect(otra.lista).toHaveLength(3);
  });

  it('tres días, solo PEN, una obra: cada día (el que no tuvo, dicho) y el total por tanque', () => {
    const { lista: deLomas, obra } = consumosDeLaObra(lista, 'en la obra las lomas');
    const t = textoConsumos(deLomas, '2026-09-14', { hasta: '2026-09-16', liquido: 'pen', obra, hoy: '2026-09-30' });
    expect(t).toContain('🛢 *Consumo de cemento asfáltico (PEN) — lunes 14/09 al miércoles 16/09*');
    expect(t).toContain('CONSORCIO LOMAS');
    expect(t).toContain('• lunes 14/09 — 200 m³ · 4,800 gl · 24 gl/m³');
    expect(t).toContain('• martes 15/09 — sin consumo registrado');
    expect(t).toContain('• miércoles 16/09 — 250 m³ · 5,980.9 gl · 23.924 gl/m³');
    expect(t).toContain('*Total:* 450 m³ · 10,780.9 gl · 23.958 gl/m³');
    expect(t).toContain('• INFRA PEN #2: 8,784.3 gl');
    expect(t).toContain('• INFRA PEN #1: 1,996.6 gl');
    expect(t).not.toContain('GASOHOL');
    expect(t).not.toContain('WILSON');
    expect(t).not.toContain('COMAS');
    expect(t).not.toMatch(/\n\n\n/);
  });

  it('sin obra: cada consumo con su pedido', () => {
    const t = textoConsumos(lista, '2026-09-14', { hasta: '2026-09-16', liquido: 'pen', hoy: '2026-09-30' });
    expect(t).toContain('• miércoles 16/09 · CONSORCIO LOMAS — 250 m³');
    expect(t).toContain('• miércoles 16/09 · MUNICIPALIDAD DE COMAS — 90 m³');
    expect(t).toContain('*Total:* 540 m³');
  });

  it('la obra que no se encontró se dice antes de mostrar todo', () => {
    const t = textoConsumos(lista, '2026-09-14', { hasta: '2026-09-16', liquido: 'pen', obraNoEncontrada: true, hoy: '2026-09-30' });
    expect(t).toContain('No encuentro consumos de esa obra en esas fechas; estos son todos los registrados.');
  });

  it('un día, solo PEN: los tanques de PEN con su gl/m³ y el total de PEN', () => {
    const t = textoConsumos([lista[1]], '2026-09-16', { liquido: 'pen' });
    expect(t).toContain('🛢 *Consumo de cemento asfáltico (PEN) — miércoles 16/09*');
    expect(t).toContain('*CONSORCIO LOMAS* — 250 m³, 5,980.9 gl en total');
    expect(t).toContain('• INFRA PEN #2: 4,784.3 gl · 19.137 gl/m³');
    expect(t).not.toContain('GASOHOL');
  });

  it('hubo producción pero no del líquido pedido: se dice cuál no hay', () => {
    const soloPetroleo = [{ fecha: '2026-09-13', pedidos: ['FERNANDO COBEÑAS'], m3: 91, totalGalones: 18, porTanque: [{ tanque: 'GRUPO WILSON', galones: 18, glPorM3: 0.1978, contenido: 'petroleo' as const }] }];
    expect(textoConsumos(soloPetroleo, '2026-09-13', { liquido: 'pen' })).toBe('No hay consumo de cemento asfáltico (PEN) registrado para domingo 13/09. Se registra en Portal → Consumos.');
  });

  it('un rango largo lista solo los días con consumo, y los días por venir no cuentan como «sin consumo»', () => {
    const t = textoConsumos(lista, '2026-09-01', { hasta: '2026-09-30', liquido: 'pen', hoy: '2026-09-15' });
    expect(t).not.toContain('sin consumo registrado');
    const semana = textoConsumos([lista[0]], '2026-09-14', { hasta: '2026-09-20', liquido: 'pen', hoy: '2026-09-15' });
    expect(semana).toContain('• martes 15/09 — sin consumo registrado');
    expect(semana).not.toContain('miércoles 16/09 — sin consumo');
  });
});

describe('agregados', () => {
  it('por empresa, con REPONER por punto de reorden y el total, como el cron', () => {
    const t = textoMateriales([
      { empresa: 'Globofast', nombre: 'ARENA PRIMARIA', cantidad: 291.65, unidad: 'm³', reponer: true, reorden: 300 },
      { empresa: 'Globofast', nombre: 'ARENA SECUNDARIA', cantidad: 632.63, unidad: 'm³', reponer: false, reorden: 300 },
      { empresa: 'Globofast', nombre: 'GRAVA 5/7', cantidad: 2.87, unidad: 'm³', reponer: true, reorden: 300 },
    ]);
    expect(t).toContain('📦 *Stock de agregados — Globofast*');
    expect(t).toContain('*- ARENA PRIMARIA:* 291.65 m³ (⚠️ REPONER)');
    expect(t).toContain('*- ARENA SECUNDARIA:* 632.63 m³');
    expect(t).not.toContain('632.63 m³ (⚠️');
    expect(t).toContain('*- Total:* 927.15 m³');
  });

  /**
   * Una empresa con todo en cero no lleva el kardex y NO se muestra (José,
   * 14/09: «si no hay agregados no los muestres»). Antes salía un bloque
   * «Todo figura en 0» al lado del de Globofast, que no informaba nada.
   */
  it('la empresa con todo en cero no aparece; si ninguna tiene stock, se dice', () => {
    const inframaq = [
      { empresa: 'Inframaq', nombre: 'ARENA 1', cantidad: 0, unidad: 'm³', reponer: false, reorden: 0 },
      { empresa: 'Inframaq', nombre: 'PIEDRA 1', cantidad: 0, unidad: 'm³', reponer: false, reorden: 0 },
    ];
    const globofast = [{ empresa: 'Globofast', nombre: 'ARENA PRIMARIA', cantidad: 291.65, unidad: 'm³', reponer: true, reorden: 300 }];
    const t = textoMateriales([...inframaq, ...globofast]);
    expect(t).toContain('Stock de agregados — Globofast');
    expect(t).not.toContain('Inframaq');
    expect(t).not.toContain('Todo figura en 0');
    expect(materialesPorEmpresa([...inframaq, ...globofast]).map((e) => e.empresa)).toEqual(['Globofast']);
    expect(textoMateriales(inframaq)).toBe(SIN_AGREGADOS);
  });
});
