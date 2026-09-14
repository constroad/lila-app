import { fichaCertificados, fichaClientes, fichaIngresos, fichaKardex, fichaPedidos, fichaProveedores } from './fichas';

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
    expect(fichaPedidos({ desde: '2026-09-13', hasta: '2026-09-13', pedidos: [], totalM3Pedidos: 0, totalM3Despachados: 0, truncado: false }, {}, '2026-09-14')).toBe('No hay pedidos el domingo 13/09 en Portal.');
    expect(fichaPedidos({ desde: '2026-09-14', hasta: '2026-09-20', pedidos: [], totalM3Pedidos: 0, totalM3Despachados: 0, truncado: false }, {}, '2026-09-14')).toBe('No hay pedidos del 14/09 al 20/09 en Portal. Si hay producción programada, todavía no está cargada.');
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

  it('lo programado se cuenta en m³ pedidos, no en despachados', () => {
    const f = fichaPedidos(
      { desde: '2026-09-14', hasta: '2026-09-20', pedidos: [
        { fecha: '2026-09-16', hora: '04:00', empresa: 'Globofast', cliente: 'CONSORCIO LOMAS', obra: 'LA MOLINA', m3Pedidos: 250, m3Despachados: 0, estado: 'pendiente' },
        { fecha: '2026-09-18', hora: '', empresa: 'Constroad', cliente: 'RENATO', obra: 'CAÑETE', m3Pedidos: 15, m3Despachados: 0, estado: 'pendiente' },
      ], totalM3Pedidos: 265, totalM3Despachados: 0, truncado: false },
      {},
      '2026-09-14'
    );
    expect(f).toContain('📋 *2 pedido(s) programado(s) del 14/09 al 20/09* — 265 m³');
    expect(f).toContain('• 16/09 04:00 CONSORCIO LOMAS (Globofast) LA MOLINA: 250 m³, programado');
    expect(f).toContain('• 18/09 RENATO (Constroad) CAÑETE: 15 m³, sin hora de inicio');
  });

  it('las obras kilométricas se recortan', () => {
    const f = fichaPedidos(
      { desde: '2026-09-07', hasta: '2026-09-13', pedidos: [{ fecha: '2026-09-09', hora: '', empresa: 'Globofast', cliente: 'CONSORCIO LOMAS', obra: 'MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA DE LAS URB. LOMAS DE LA MOLINA VIEJA ETAPAS I Y II', m3Pedidos: 250, m3Despachados: 250, estado: 'despachado' }], totalM3Pedidos: 250, totalM3Despachados: 250, truncado: false },
      {}
    );
    expect(f).toContain('MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA DE LAS URB. L…: 250 de 250 m³');
  });
});

describe('ingresos y certificados', () => {
  it('lo que llegó, por proveedor y material, con quién lo trajo', () => {
    const f = fichaIngresos(
      {
        desde: '2026-09-14', hasta: '2026-09-14', totalIngresos: 4, total: 95, pendientes: 2, unidad: 'm³',
        proveedores: [
          { proveedor: 'NOR BUILDING', transportista: 'SAUL GIRARDO', empresa: 'Globofast', unidad: 'm³', total: 75, materiales: [{ material: 'ARENA SECUNDARIA', unidad: 'm³', cantidad: 75, ingresos: 3, pendientes: 1 }] },
          { proveedor: 'AGREXA SAC', empresa: 'Globofast', unidad: 'm³', total: 20, materiales: [{ material: 'CONFITILLO', unidad: 'm³', cantidad: 20, ingresos: 1, pendientes: 1 }] },
        ],
      },
      '2026-09-14'
    );
    expect(f).toContain('🚚 *Ingresos de agregados hoy*: 4 camión(es), 95 m³ · 2 por confirmar');
    expect(f).toContain('*NOR BUILDING* (transporta SAUL GIRARDO) · Globofast — 75 m³\n• ARENA SECUNDARIA: 75 m³ en 3 camiones (1 por confirmar)');
    expect(f).toContain('*AGREXA SAC* · Globofast — 20 m³\n• CONFITILLO: 20 m³ (por confirmar)');
    expect(fichaIngresos({ desde: '2026-09-13', hasta: '2026-09-13', proveedores: [], totalIngresos: 0, total: 0, pendientes: 0, unidad: 'm³' }, '2026-09-14')).toBe('No hay camiones de agregados registrados el domingo 13/09 en la recepción de insumos.');
  });

  it('certificados pendientes: por cliente cuando hay varios; plano con uno; ⚠️ los que lo exigen', () => {
    const rango = { desde: '2026-08-15', hasta: '2026-09-14' };
    const uno = { fecha: '2026-09-10', empresa: 'CONSTROAD SAC', cliente: 'MERIDIANA S.A.C.', obra: 'VENTANILLA- SECTOR 280', m3: 18, nota: '', exige: true };
    expect(fichaCertificados({ pedidos: [uno], truncado: false, total: 3 }, rango)).toBe('📄 *1 de 3 pedidos despachados del 15/08 al 14/09 sin certificado cargado*\n*MERIDIANA S.A.C.* · CONSTROAD SAC\n• 10/09 VENTANILLA- SECTOR 280 18 m³ ⚠️ exige certificado');
    const varios = fichaCertificados({ pedidos: [uno, { ...uno, cliente: 'RENATO', obra: 'CAÑETE', m3: 15, fecha: '2026-08-05', nota: 'falta densidad', exige: false }, { ...uno, cliente: 'RENATO', fecha: '2026-08-06', exige: false }], truncado: false, total: 5 }, rango, 'CONSTROAD SAC');
    expect(varios).toContain('📄 *3 de 5 pedidos despachados de CONSTROAD SAC del 15/08 al 14/09 sin certificado cargado*');
    expect(varios.indexOf('*RENATO* · CONSTROAD SAC — 2')).toBeLessThan(varios.indexOf('*MERIDIANA S.A.C.* · CONSTROAD SAC — 1'));
    expect(varios).toContain('• 05/08 CAÑETE 15 m³ — falta densidad');
    expect(fichaCertificados({ pedidos: [], truncado: false, total: 4 }, rango)).toBe('Los 4 pedidos despachados del 15/08 al 14/09 tienen su certificado cargado.');
    expect(fichaCertificados({ pedidos: [], truncado: false, total: 0 }, rango, 'Globofast')).toBe('No hay pedidos despachados de Globofast del 15/08 al 14/09.');
  });
});
