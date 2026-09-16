import { embudoDe, leadsPorServicio, medianaDeToma, porDiaDe, rangoDe, resumenDe, variacion } from './reportes';

/**
 * REPORTES (A19): los períodos van por semanas de lunes a domingo en Lima
 * (o los últimos 30 días), cada número sale de las conversaciones y los
 * leads de ese período, y todo se compara con el período anterior del mismo
 * largo. Nada se inventa: sin datos, ceros y «sin período anterior».
 */
const ahora = Date.parse('2026-09-16T01:00:00Z'); // martes 15/09/2026, 20:00 en Lima

describe('rangoDe', () => {
  it('esta semana: del lunes (Lima) a ahora; la pasada: lunes a domingo; 30 días: hasta ahora', () => {
    const semana = rangoDe('semana', ahora);
    expect(semana.desde.toISOString()).toBe('2026-09-14T05:00:00.000Z'); // lunes 14/09 00:00 Lima
    expect(semana.hasta.getTime()).toBe(ahora);
    expect(semana.anterior.desde.toISOString()).toBe('2026-09-07T05:00:00.000Z');
    expect(semana.anterior.hasta.toISOString()).toBe('2026-09-14T05:00:00.000Z');
    expect(semana.dias).toBe(7);

    const pasada = rangoDe('semana-pasada', ahora);
    expect(pasada.desde.toISOString()).toBe('2026-09-07T05:00:00.000Z');
    expect(pasada.hasta.toISOString()).toBe('2026-09-14T05:00:00.000Z');
    expect(pasada.anterior.desde.toISOString()).toBe('2026-08-31T05:00:00.000Z');

    const mes = rangoDe('30-dias', ahora);
    expect(mes.desde.toISOString()).toBe('2026-08-17T05:00:00.000Z'); // 30 días atrás, a las 00:00 Lima
    expect(mes.dias).toBe(30);
  });
});

const conv = (id: string, creado: string, extra: Partial<{ lead: Record<string, unknown>; escalatedAt: string; lastCustomerMessageAt: string }> = {}) => ({
  id,
  createdAt: new Date(creado),
  lastCustomerMessageAt: new Date(extra.lastCustomerMessageAt ?? creado),
  escalatedAt: extra.escalatedAt ? new Date(extra.escalatedAt) : undefined,
  lead: extra.lead,
});

describe('resumenDe y embudoDe', () => {
  const rango = rangoDe('semana', ahora);
  const conversaciones = [
    conv('c1', '2026-09-14T14:00:00Z', { lead: { servicio: 'colocacion', listo: true } }),
    conv('c2', '2026-09-15T14:00:00Z', { lead: { servicio: 'venta' } }),
    conv('c3', '2026-09-15T15:00:00Z', { escalatedAt: '2026-09-15T15:10:00Z' }),
    conv('c4', '2026-09-10T14:00:00Z', { lastCustomerMessageAt: '2026-09-15T16:00:00Z', lead: { servicio: 'colocacion', listo: true } }), // vieja pero activa esta semana
  ];
  const leads = [
    { conversationId: 'c1', estado: 'cotizado' as const },
    { conversationId: 'c4', estado: 'ganado' as const },
  ];

  it('cuenta conversaciones con actividad, leads con servicio, listos y atendidos por una persona', () => {
    expect(resumenDe(conversaciones, leads)).toEqual({ conversaciones: 4, leads: 3, confirmados: 2, atendidos: 1 });
  });

  it('el embudo baja de iniciadas a ganados, con el porcentaje sobre el inicio', () => {
    expect(embudoDe(conversaciones, leads)).toEqual([
      { paso: 'iniciadas', titulo: 'Conversaciones iniciadas', valor: 4, pct: 100 },
      { paso: 'servicio', titulo: 'Servicio identificado', valor: 3, pct: 75 },
      { paso: 'datos', titulo: 'Datos completos', valor: 2, pct: 50 },
      { paso: 'cotizados', titulo: 'Cotizados', valor: 2, pct: 50 },
      { paso: 'ganados', titulo: 'Ganados', valor: 1, pct: 25 },
    ]);
  });

  it('por día: todos los días del rango, en Lima, aunque no haya nada; por servicio: con nombre y porcentaje', () => {
    const dias = porDiaDe(conversaciones, rango);
    expect(dias.map((d) => `${d.fecha}:${d.conversaciones}`)).toEqual([
      '2026-09-14:1',
      '2026-09-15:2',
      '2026-09-16:0',
      '2026-09-17:0',
      '2026-09-18:0',
      '2026-09-19:0',
      '2026-09-20:0',
    ]);
    expect(dias[0].etiqueta).toBe('lun');
    expect(leadsPorServicio(conversaciones, { colocacion: 'asfaltado (colocación)' })).toEqual([
      { servicio: 'colocacion', nombre: 'asfaltado (colocación)', leads: 2, pct: 67 },
      { servicio: 'venta', nombre: 'venta', leads: 1, pct: 33 },
    ]);
  });
});

describe('variacion y toma humana', () => {
  it('la variación es contra el período anterior; sin anterior, null', () => {
    expect(variacion(161, 152)).toBe(6);
    expect(variacion(3, 0)).toBeNull();
  });

  it('la mediana de minutos entre la escalada y el primer mensaje del dueño en esa conversación', () => {
    const mensajes = [
      { conversationId: 'c3', role: 'owner', createdAt: new Date('2026-09-15T15:34:00Z') },
      { conversationId: 'c3', role: 'customer', createdAt: new Date('2026-09-15T15:00:00Z') },
      { conversationId: 'c9', role: 'owner', createdAt: new Date('2026-09-15T15:05:00Z') },
    ];
    const escaladas = [
      { id: 'c3', escalatedAt: new Date('2026-09-15T15:10:00Z') },
      { id: 'c9', escalatedAt: new Date('2026-09-15T15:00:00Z') },
      { id: 'c8', escalatedAt: new Date('2026-09-15T15:00:00Z') }, // nadie contestó
    ];
    expect(medianaDeToma(escaladas, mensajes)).toBe(24);
    expect(medianaDeToma([], mensajes)).toBeNull();
  });
});
