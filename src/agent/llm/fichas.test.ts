import { fichaClientes, fichaKardex, fichaPedidos, fichaProveedores } from './fichas';

describe('fichas', () => {
  it('cliente: nombre, RUC, contacto y últimos pedidos; sin cuentas bancarias', () => {
    const f = fichaClientes('cobeñas', [
      { empresa: 'Globofast', nombre: 'FERNANDO COBEÑAS', alias: 'COBEÑAS', ruc: '10412345678', contacto: 'Fernando', telefono: '987654321', email: '', direccion: 'Av. Los Incas 123', ultimosPedidos: [{ fecha: '2026-09-13', obra: 'PISTA', m3: 91 }] },
    ]);
    expect(f).toContain('👤 *FERNANDO COBEÑAS* (COBEÑAS) · Globofast');
    expect(f).toContain('RUC 10412345678');
    expect(f).toContain('Contacto: Fernando · 987654321');
    expect(f).not.toContain('Correo');
    expect(f).toContain('Últimos pedidos: 13/09 PISTA 91 m³');
    expect(fichaClientes('nadie', [])).toBe('No encontré ningún cliente que se llame «nadie» en Globofast, Constroad ni Inframaq.');
  });

  it('proveedor: rubro y contacto', () => {
    const f = fichaProveedores('licas', [{ empresa: 'Globofast', nombre: 'JULIO LICAS', alias: '', ruc: '20604332941', contacto: '', telefono: '', email: '', direccion: 'CARAPONGO', rubros: ['transporta materiales'], etiquetas: ['agregados'] }]);
    expect(f).toContain('🏗 *JULIO LICAS* · Globofast');
    expect(f).toContain('Rubro: transporta materiales, agregados');
    expect(f).toContain('Dirección: CARAPONGO');
    expect(f).not.toContain('Contacto');
  });

  it('historial: total y una línea por pedido, con aviso si hay más', () => {
    const f = fichaPedidos(
      {
        desde: '2026-09-07',
        hasta: '2026-09-13',
        pedidos: [
          { fecha: '2026-09-09', hora: '04:00', empresa: 'Globofast', cliente: 'CONSORCIO LOS PINOS', obra: 'AV. UNIVERSITARIA', m3Pedidos: 120, m3Despachados: 118, estado: 'despachado' },
          { fecha: '2026-09-11', hora: '', empresa: 'Globofast', cliente: 'CONSORCIO LOS PINOS', obra: '', m3Pedidos: 60, m3Despachados: 60, estado: 'despachado' },
        ],
        totalM3Pedidos: 180,
        totalM3Despachados: 178,
        truncado: true,
      },
      { cliente: 'consorcio los pinos' }
    );
    expect(f).toContain('📋 *2 pedido(s) de consorcio los pinos del 07/09 al 13/09* — 178 de 180 m³ despachados');
    expect(f).toContain('• 09/09 04:00 (Globofast) AV. UNIVERSITARIA: 118 de 120 m³, despachado');
    expect(f).toContain('• 11/09 (Globofast) sin obra: 60 de 60 m³, despachado');
    expect(f).toContain('te muestro los primeros 2');
    expect(fichaPedidos({ desde: '2026-09-13', hasta: '2026-09-13', pedidos: [], totalM3Pedidos: 0, totalM3Despachados: 0, truncado: false }, {})).toBe('No hay pedidos el domingo 13/09.');
  });

  it('kardex: totales, stock actual y cada movimiento con su saldo', () => {
    const f = fichaKardex('arena', [
      {
        empresa: 'Globofast', material: 'ARENA PRIMARIA', unidad: 'm³', desde: '2026-08-01', hasta: '2026-08-31',
        movimientos: [{ fecha: '2026-08-04', tipo: 'Ingreso', cantidad: 234.07, saldo: 500.1, detalle: 'JULIO LICAS' }, { fecha: '2026-08-21', tipo: 'Salida', cantidad: 96.3, saldo: 403.8, detalle: '' }],
        totalIngresos: 234.07, totalSalidas: 96.3, cantidadIngresos: 1, cantidadSalidas: 1, saldoActual: 291.65, truncado: false,
      },
    ]);
    expect(f).toContain('📦 *ARENA PRIMARIA* · Globofast · del 01/08 al 31/08');
    expect(f).toContain('1 ingreso(s) por 234.07 m³ · 1 salida(s) por 96.3 m³ · stock actual 291.65 m³');
    expect(f).toContain('• 04/08 ⬆️ 234.07 m³ (JULIO LICAS) → saldo 500.1');
    expect(f).toContain('• 21/08 ⬇️ 96.3 m³ → saldo 403.8');
    expect(f).not.toMatch(/S\/|costo|valor/i);
  });

  it('kardex: la empresa sin movimientos no se muestra si otra sí los tuvo', () => {
    const vacio = { empresa: 'Constroad', material: 'CONFITILLO', unidad: 'm³', desde: '2026-08-01', hasta: '2026-08-31', movimientos: [], totalIngresos: 0, totalSalidas: 0, cantidadIngresos: 0, cantidadSalidas: 0, saldoActual: 0, truncado: false };
    const lleno = { ...vacio, empresa: 'Globofast', movimientos: [{ fecha: '2026-08-04', tipo: 'Ingreso' as const, cantidad: 10, saldo: 10, detalle: '' }], totalIngresos: 10, cantidadIngresos: 1, saldoActual: 10 };
    expect(fichaKardex('confitillo', [vacio, lleno])).not.toContain('Constroad');
    expect(fichaKardex('confitillo', [vacio])).toContain('Sin movimientos en ese rango.');
  });

  it('las obras kilométricas se recortan', () => {
    const f = fichaPedidos(
      { desde: '2026-09-07', hasta: '2026-09-13', pedidos: [{ fecha: '2026-09-09', hora: '', empresa: 'Globofast', cliente: 'CONSORCIO LOMAS', obra: 'MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA DE LAS URB. LOMAS DE LA MOLINA VIEJA ETAPAS I Y II', m3Pedidos: 250, m3Despachados: 250, estado: 'despachado' }], totalM3Pedidos: 250, totalM3Despachados: 250, truncado: false },
      {}
    );
    expect(f).toContain('MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA DE LAS URB. L…: 250 de 250 m³');
  });
});
