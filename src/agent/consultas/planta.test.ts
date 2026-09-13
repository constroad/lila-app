import { textoConsumos, textoMateriales, textoTanques } from './planta';

/**
 * Los textos de planta, sin base. Lo que se prueba es que digan lo MISMO que
 * los reportes del cron de Portal (fluids-report, materials-stock-report): el
 * agente y el reporte de las 10:00 no pueden contradecirse.
 */
describe('tanques', () => {
  it('PEN en m³ producibles, petróleo en cm, gasohol total; mismos umbrales que el cron', () => {
    const t = textoTanques([
      { nombre: 'INFRA PEN 1', contenido: 'pen', galones: 573.56, m3Producibles: 22.94, nivelCm: 38 },
      { nombre: 'INFRA PEN 2', contenido: 'pen', galones: 295.34, m3Producibles: 11.81, nivelCm: 29.5 },
      { nombre: 'INFRA HIGHWAY', contenido: 'petroleo', galones: 66.65, m3Producibles: 0, nivelCm: 29.5 },
      { nombre: 'GRUPO WILSON', contenido: 'petroleo', galones: 35.37, m3Producibles: 0, nivelCm: 57 },
      { nombre: 'INFRA GASOHOL', contenido: 'gasohol', galones: 1008.66, m3Producibles: 403.46, nivelCm: 157 },
    ]);
    expect(t).toContain('*- INFRA PEN 1:* 23 m³ prod. (573.6 gl, 38 cm)');
    expect(t).toContain('*- INFRA PEN 2:* 12 m³ prod.');
    expect(t).toContain('*- HIGHWAY:* 29.5 cm (66.7 gl) (⚠️ PEDIR PETRÓLEO)');
    expect(t).toContain('*- GRUPO WILSON:* 57 cm (35.4 gl)');
    expect(t).not.toContain('GRUPO WILSON:* 57 cm (35.4 gl) (⚠️');
    expect(t).toContain('*- GASOHOL:* 403 m³ (1,008.7 gl)');
  });

  it('sin PEN ni gasohol lo dice como el cron: SIN STOCK', () => {
    const t = textoTanques([{ nombre: 'GRUPO WILSON', contenido: 'petroleo', galones: 35, m3Producibles: 0, nivelCm: 57 }]);
    expect(t).toContain('*- PEN:* 0 m³ ⚠️ SIN STOCK');
    expect(t).toContain('*- GASOHOL:* 0 m³ (⚠️ SIN STOCK)');
  });

  it('gasohol bajo 50 m³ pide gasohol', () => {
    const t = textoTanques([{ nombre: 'INFRA GASOHOL', contenido: 'gasohol', galones: 100, m3Producibles: 40, nivelCm: 20 }]);
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
});

describe('agregados', () => {
  it('por empresa, con REPONER por punto de reorden y el total, como el cron', () => {
    const t = textoMateriales([
      { empresa: 'Globofast', nombre: 'ARENA PRIMARIA', cantidad: 291.65, unidad: 'm³', reponer: true },
      { empresa: 'Globofast', nombre: 'ARENA SECUNDARIA', cantidad: 632.63, unidad: 'm³', reponer: false },
      { empresa: 'Globofast', nombre: 'GRAVA 5/7', cantidad: 2.87, unidad: 'm³', reponer: true },
    ]);
    expect(t).toContain('📦 *Stock de agregados — Globofast*');
    expect(t).toContain('*- ARENA PRIMARIA:* 291.65 m³ (⚠️ REPONER)');
    expect(t).toContain('*- ARENA SECUNDARIA:* 632.63 m³');
    expect(t).not.toContain('632.63 m³ (⚠️');
    expect(t).toContain('*- Total:* 927.15 m³');
  });

  it('todo en cero NO es un stock: es un kardex que no se lleva', () => {
    const t = textoMateriales([
      { empresa: 'Inframaq', nombre: 'ARENA 1', cantidad: 0, unidad: 'm³', reponer: false },
      { empresa: 'Inframaq', nombre: 'PIEDRA 1', cantidad: 0, unidad: 'm³', reponer: false },
    ]);
    expect(t).toContain('Todo figura en 0: el kardex no tiene movimientos registrados');
    expect(t).not.toContain('Total');
  });
});
