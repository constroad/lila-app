import { textoConsumos, textoMateriales, textoTanques } from './planta';

/**
 * Los textos de planta, sin base: lo que se prueba es que no inventen. En
 * particular: agregados en cero se dicen como «el kardex no se lleva», no como
 * «hay 0 m³».
 */
describe('tanques', () => {
  it('agrupa por contenido con el total, y cada tanque con su nivel', () => {
    const t = textoTanques([
      { nombre: 'INFRA PEN #1', contenido: 'PEN (asfalto)', galones: 862.84, capacidad: 8126.89, nivelCm: 38 },
      { nombre: 'INFRA PEN #2', contenido: 'PEN (asfalto)', galones: 499.64, capacidad: 5558.67, nivelCm: 29.5 },
      { nombre: 'INFRA GASOHOL', contenido: 'Gasohol', galones: 1155.91, capacidad: 2135.12, nivelCm: 157 },
    ]);
    expect(t).toContain('*PEN (asfalto)* — 1,362.5 gl');
    expect(t).toContain('• INFRA PEN #1: 862.8 gl (38 cm, de 8,126.9)');
    expect(t).toContain('*Gasohol* — 1,155.9 gl');
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
  it('todo en cero NO es un stock: es un kardex que no se lleva', () => {
    const t = textoMateriales([{ nombre: 'Arena 1', cantidad: 0, unidad: 'm3' }, { nombre: 'Piedra 1', cantidad: 0, unidad: 'm3' }]);
    expect(t).toContain('• Arena 1: 0 m3');
    expect(t).toContain('el kardex de agregados no tiene movimientos registrados');
  });

  it('con stock real no hay advertencia', () => {
    expect(textoMateriales([{ nombre: 'Arena 1', cantidad: 120, unidad: 'm3' }])).not.toContain('⚠️');
  });
});
