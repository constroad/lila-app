import { aplicar, calcularEnvioMs, esUltimoMomento, fundir, pendientesDeEnvio, yaArranco, type AvisoProgramado, type Produccion } from './agenda';

const lima = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-05:00`).getTime();
const globo = (extra: Partial<Produccion> = {}): Produccion => ({ companyId: 'globofas-s8k', empresa: 'Globofast Solkali', cliente: 'CONSORCIO LOMAS', hora: '04:30', cubos: 137, fuente: 'chat', ts: 1, autor: 'nene', ...extra });
const constroad = (extra: Partial<Produccion> = {}): Produccion => ({ companyId: 'constroad', empresa: 'ConstRoad', cliente: 'COMAS', hora: '06:00', cubos: 90, fuente: 'chat', ts: 2, ...extra });

describe('cuándo sale', () => {
  it('lunes para jueves: miércoles 17:00', () => {
    expect(calcularEnvioMs('2026-09-17', lima('2026-09-14', '09:00'))).toBe(lima('2026-09-16', '17:00'));
  });
  it('si las 17:00 del día anterior ya pasaron, sale YA (miércoles 19:00; jueves 02:00)', () => {
    expect(calcularEnvioMs('2026-09-17', lima('2026-09-16', '19:00'))).toBe(lima('2026-09-16', '19:00'));
    expect(calcularEnvioMs('2026-09-17', lima('2026-09-17', '02:00'))).toBe(lima('2026-09-17', '02:00'));
  });
  it('último momento se reconoce por el instante de envío', () => {
    const a = (envioMs: number): AvisoProgramado => ({ id: 'x', fecha: '2026-09-17', envioMs, producciones: [], estado: 'programada', creadoMs: 0, actualizadoMs: 0 });
    expect(esUltimoMomento(a(lima('2026-09-16', '17:00')))).toBe(false);
    expect(esUltimoMomento(a(lima('2026-09-16', '19:00')))).toBe(true);
  });
  it('ya arrancó: fecha pasada, o hoy después de la hora', () => {
    expect(yaArranco('2026-09-15', '04:30', lima('2026-09-16', '01:00'))).toBe(true);
    expect(yaArranco('2026-09-16', '04:30', lima('2026-09-16', '05:00'))).toBe(true);
    expect(yaArranco('2026-09-16', '04:30', lima('2026-09-16', '03:00'))).toBe(false);
    expect(yaArranco('2026-09-16', undefined, lima('2026-09-16', '23:00'))).toBe(false);
  });
});

describe('aplicar: programar, sumar, actualizar', () => {
  const ahora = lima('2026-09-14', '09:00');
  it('un anuncio nuevo programa el día; otra empresa el mismo día se SUMA al mismo aviso, ordenada por hora', () => {
    const r1 = aplicar([], { accion: 'programar', fecha: '2026-09-17', produccion: globo() }, ahora);
    expect(r1.efectos.map((e) => e.tipo)).toEqual(['programado']);
    expect(r1.agenda[0].envioMs).toBe(lima('2026-09-16', '17:00'));
    const r2 = aplicar(r1.agenda, { accion: 'programar', fecha: '2026-09-17', produccion: constroad({ hora: '03:00' }) }, ahora + 1000);
    expect(r2.efectos.map((e) => e.tipo)).toEqual(['sumado']);
    expect(r2.agenda).toHaveLength(1);
    expect(r2.agenda[0].producciones.map((p) => p.empresa)).toEqual(['ConstRoad', 'Globofast Solkali']);
  });
  it('el mismo anuncio repetido no cambia nada; una corrección de m³ actualiza', () => {
    const r1 = aplicar([], { accion: 'programar', fecha: '2026-09-17', produccion: globo() }, ahora);
    const r2 = aplicar(r1.agenda, { accion: 'programar', fecha: '2026-09-17', produccion: globo({ ts: 5 }) }, ahora + 1);
    expect(r2.efectos.map((e) => e.tipo)).toEqual(['sin-cambio']);
    const r3 = aplicar(r2.agenda, { accion: 'programar', fecha: '2026-09-17', produccion: globo({ cubos: 150 }) }, ahora + 2);
    expect(r3.efectos[0]).toMatchObject({ tipo: 'actualizado', antes: { cubos: 137 }, produccion: { cubos: 150 } });
  });
  it('Portal manda: su hora y m³ pisan a los del chat; el chat solo completa huecos de Portal', () => {
    expect(fundir(globo({ hora: '04:30', cubos: 137 }), globo({ fuente: 'portal', hora: '05:00', cubos: 140, pedidoId: 'o1' }))).toMatchObject({ hora: '05:00', cubos: 140, fuente: 'portal', pedidoId: 'o1' });
    expect(fundir(globo({ fuente: 'portal', hora: '05:00', cubos: undefined }), globo({ hora: '04:30', cubos: 137 }))).toMatchObject({ hora: '05:00', cubos: 137, fuente: 'portal' });
  });
  /**
   * DOS PEDIDOS DEL MISMO CLIENTE EL MISMO DÍA SON DOS PRODUCCIONES. José,
   * 25/09/2026: INFRAMAQ admin recibió el MISMO par de «Actualicé el aviso»
   * cada 20 minutos (11:00, 11:20, 11:40, 12:00, 12:20…). Portal tenía dos
   * pedidos de CONSTROAD SAC para Sergio Correa el 26/09 —04:30 124 m³ y
   * 07:00 6.5 m³— y la agenda los tomaba por la MISMA producción (empresa +
   * cliente): cada pasada del detector los fundía uno sobre otro, ida y
   * vuelta, y cada vuelta era un «actualizado» que se confirmaba en el grupo.
   * Lo que los distingue es el pedido de Portal.
   */
  it('dos pedidos distintos del mismo cliente conviven y no se pisan entre pasadas', () => {
    const sergio = (extra: Partial<Produccion> = {}): Produccion =>
      constroad({ empresa: 'CONSTROAD SAC', cliente: 'Sergio Correa', fuente: 'portal', ...extra });
    const madrugada = { accion: 'programar' as const, fecha: '2026-09-26', produccion: sergio({ hora: '04:30', cubos: 124, pedidoId: 'ped-1' }) };
    const manana = { accion: 'programar' as const, fecha: '2026-09-26', produccion: sergio({ hora: '07:00', cubos: 6.5, pedidoId: 'ped-2' }) };

    const r1 = aplicar([], madrugada, ahora);
    const r2 = aplicar(r1.agenda, manana, ahora);
    expect(r2.efectos.map((e) => e.tipo)).toEqual(['sumado']);
    expect(r2.agenda[0].producciones.map((p) => `${p.hora}|${p.cubos}`)).toEqual(['04:30|124', '07:00|6.5']);

    // La pasada siguiente lee lo mismo de Portal: nada cambió.
    const r3 = aplicar(r2.agenda, madrugada, ahora + 20 * 60_000);
    const r4 = aplicar(r3.agenda, manana, ahora + 20 * 60_000);
    expect([...r3.efectos, ...r4.efectos].map((e) => e.tipo)).toEqual(['sin-cambio', 'sin-cambio']);
    expect(r4.agenda[0].producciones).toHaveLength(2);
  });

  it('el pedido de Portal completa al anuncio del chat en vez de duplicarlo', () => {
    const delChat = aplicar([], { accion: 'programar', fecha: '2026-09-26', produccion: constroad({ hora: '04:30', cubos: 124 }) }, ahora);
    const delPortal = aplicar(delChat.agenda, { accion: 'programar', fecha: '2026-09-26', produccion: constroad({ hora: '04:30', cubos: 124, fuente: 'portal', pedidoId: 'ped-1' }) }, ahora + 1000);

    // Para la gente no cambió nada (misma hora, mismos m³), pero la producción
    // se queda con el pedido: deja de pedir que creen el que ya existe.
    expect(delPortal.efectos.map((e) => e.tipo)).toEqual(['sin-cambio']);
    expect(delPortal.agenda[0].producciones).toHaveLength(1);
    expect(delPortal.agenda[0].producciones[0]).toMatchObject({ pedidoId: 'ped-1', fuente: 'portal' });
  });

  it('cancelar un pedido de Portal no se lleva al otro del mismo cliente', () => {
    const sergio = (extra: Partial<Produccion> = {}): Produccion =>
      constroad({ empresa: 'CONSTROAD SAC', cliente: 'Sergio Correa', fuente: 'portal', ...extra });
    const r1 = aplicar([], { accion: 'programar', fecha: '2026-09-26', produccion: sergio({ hora: '04:30', cubos: 124, pedidoId: 'ped-1' }) }, ahora);
    const r2 = aplicar(r1.agenda, { accion: 'programar', fecha: '2026-09-26', produccion: sergio({ hora: '07:00', cubos: 6.5, pedidoId: 'ped-2' }) }, ahora);

    const r3 = aplicar(r2.agenda, { accion: 'cancelar', fecha: '2026-09-26', companyId: 'constroad', cliente: 'Sergio Correa', pedidoId: 'ped-2', ts: ahora }, ahora);

    expect(r3.efectos.map((e) => e.tipo)).toEqual(['cancelado']);
    expect(r3.agenda[0].producciones.map((p) => p.pedidoId)).toEqual(['ped-1']);
  });

  it('misma empresa, dos clientes el mismo día: dos líneas', () => {
    const r1 = aplicar([], { accion: 'programar', fecha: '2026-09-17', produccion: globo() }, ahora);
    const r2 = aplicar(r1.agenda, { accion: 'programar', fecha: '2026-09-17', produccion: globo({ cliente: 'SANTA ROSA', hora: '08:00', cubos: 60 }) }, ahora);
    expect(r2.efectos[0].tipo).toBe('sumado');
    expect(r2.agenda[0].producciones).toHaveLength(2);
  });
});

describe('aplicar: lo que ya arrancó no se programa', () => {
  it('16/09 06:40: la producción de las 04:30 de hoy no genera aviso ni efecto', () => {
    const r = aplicar([], { accion: 'programar', fecha: '2026-09-16', produccion: globo({ fuente: 'portal', pedidoId: 'o1' }) }, lima('2026-09-16', '06:40'));
    expect(r.efectos).toEqual([]);
    expect(r.agenda).toEqual([]);
    // Pero la de mañana sí, aunque sea de madrugada.
    expect(aplicar([], { accion: 'programar', fecha: '2026-09-17', produccion: globo() }, lima('2026-09-16', '06:40')).efectos.map((e) => e.tipo)).toEqual(['programado']);
  });
});

describe('aplicar: mover y cancelar', () => {
  const ahora = lima('2026-09-15', '10:00');
  it('«ya no jueves, viernes»: se mueve (el jueves queda cancelado, el viernes programado, UN efecto de movido)', () => {
    const r1 = aplicar([], { accion: 'programar', fecha: '2026-09-17', produccion: globo() }, ahora);
    const r2 = aplicar(r1.agenda, { accion: 'programar', fecha: '2026-09-18', produccion: globo({ ts: 9 }), desdeFecha: '2026-09-17' }, ahora + 1);
    expect(r2.efectos.map((e) => e.tipo)).toEqual(['movido']);
    expect(r2.agenda.find((a) => a.fecha === '2026-09-17')?.estado).toBe('cancelada');
    expect(r2.agenda.find((a) => a.fecha === '2026-09-18')?.estado).toBe('programada');
  });
  it('sin palabra de cambio, la misma empresa y m³ en otro día: se programa Y se marca como posible movimiento', () => {
    const r1 = aplicar([], { accion: 'programar', fecha: '2026-09-17', produccion: globo() }, ahora);
    const r2 = aplicar(r1.agenda, { accion: 'programar', fecha: '2026-09-18', produccion: globo({ ts: 9 }) }, ahora + 1);
    expect(r2.efectos.map((e) => e.tipo)).toEqual(['programado', 'posible-movimiento']);
    expect(r2.agenda.filter((a) => a.estado === 'programada')).toHaveLength(2);
    // Con otros m³ no se sospecha: son dos producciones.
    const r3 = aplicar(r1.agenda, { accion: 'programar', fecha: '2026-09-18', produccion: globo({ cubos: 60 }) }, ahora + 1);
    expect(r3.efectos.map((e) => e.tipo)).toEqual(['programado']);
  });
  it('cancelar una empresa deja el día con las demás; cancelar la última cancela el día', () => {
    const r1 = aplicar([], { accion: 'programar', fecha: '2026-09-17', produccion: globo() }, ahora);
    const r2 = aplicar(r1.agenda, { accion: 'programar', fecha: '2026-09-17', produccion: constroad() }, ahora);
    const r3 = aplicar(r2.agenda, { accion: 'cancelar', fecha: '2026-09-17', companyId: 'constroad', ts: 3 }, ahora);
    expect(r3.efectos[0]).toMatchObject({ tipo: 'cancelado', produccion: { companyId: 'constroad' } });
    expect(r3.agenda[0].estado).toBe('programada');
    const r4 = aplicar(r3.agenda, { accion: 'cancelar', fecha: '2026-09-17', ts: 4 }, ahora);
    expect(r4.efectos[0]).toMatchObject({ tipo: 'cancelado' });
    expect(r4.agenda[0].estado).toBe('cancelada');
    // Cancelar lo que no existe: ningún efecto.
    expect(aplicar(r4.agenda, { accion: 'cancelar', fecha: '2026-09-20', ts: 5 }, ahora).efectos).toEqual([]);
  });
});

describe('pendientesDeEnvio', () => {
  const texto = (a: AvisoProgramado) => a.producciones.map((p) => `${p.hora} ${p.cubos}`).join(';');
  it('programada y vencida sale; enviada solo si cambió; cancelada o ya arrancada, nunca', () => {
    const base: AvisoProgramado = { id: 'a', fecha: '2026-09-17', envioMs: lima('2026-09-16', '17:00'), producciones: [globo()], estado: 'programada', creadoMs: 0, actualizadoMs: 0 };
    expect(pendientesDeEnvio([base], lima('2026-09-16', '16:59'), texto)).toEqual([]);
    expect(pendientesDeEnvio([base], lima('2026-09-16', '17:00'), texto)).toHaveLength(1);
    const enviada: AvisoProgramado = { ...base, estado: 'enviada', enviadoComo: texto(base) };
    expect(pendientesDeEnvio([enviada], lima('2026-09-16', '18:00'), texto)).toEqual([]);
    const cambiada: AvisoProgramado = { ...enviada, producciones: [globo({ cubos: 150 })] };
    expect(pendientesDeEnvio([cambiada], lima('2026-09-16', '18:00'), texto)).toHaveLength(1);
    expect(pendientesDeEnvio([{ ...base, estado: 'cancelada' }], lima('2026-09-16', '18:00'), texto)).toEqual([]);
    expect(pendientesDeEnvio([base], lima('2026-09-17', '05:00'), texto)).toEqual([]);
  });
});
