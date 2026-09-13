import { AYUDA, acotarArchivos, elegirPedido, estimarFin, responder, unidadPor } from './responder';
import type { VistaDelDia } from './vista';
import { CHECKLIST_PRODUCCION } from '../checklist/checklist';

/**
 * LAS RESPUESTAS SALEN DEL READ MODEL Y DE NADA MÁS. Si un dato no está en la
 * vista, no puede aparecer en el texto: teléfono y licencia del conductor no
 * existen acá (spec §6.2), y por eso ningún test puede siquiera pedirlos.
 */
const lima = (h: string) => new Date(`2026-09-13T${h}:00.000-05:00`).getTime();

const vista: VistaDelDia = {
  fecha: '2026-09-13',
  computedAt: 0,
  orders: [
    {
      orderId: 'o1',
      companyId: 'globofas-s8k',
      companySlug: 'globofast',
      cliente: 'FERNANDO COBEÑAS',
      obra: 'PROYECTOS VARIOS',
      cantidadCubos: 91,
      m3Dispatched: 75,
      hora: '04:00',
      units: [
        { dispatchId: 'd1', unitNumber: 1, plate: 'AZJ 910', driverName: 'HOOVER QUISPE MUÑOZ', state: 'despachado', quantity: 25, departedAt: lima('05:32'), picturesCount: 2 },
        { dispatchId: 'd2', unitNumber: 2, plate: 'BBE 942', driverName: 'LUCIO QUISPE DIAZ', state: 'despachado', quantity: 25, departedAt: lima('05:59'), picturesCount: 0 },
        { dispatchId: 'd3', unitNumber: 3, plate: 'ALC 812', driverName: 'PEDRO CANCHO MONTEZ', state: 'despachado', quantity: 25, departedAt: lima('06:26'), arrivalAt: lima('07:10'), picturesCount: 0 },
        { dispatchId: 'd4', unitNumber: 4, plate: 'XYZ 123', driverName: 'JUAN PEREZ', state: 'progreso', quantity: 16, picturesCount: 0 },
      ],
    },
  ],
};
const hoy = { day: 'today' as const };

describe('responder', () => {
  it('fuera del catálogo: una respuesta fija que dice qué SÍ puede', () => {
    expect(responder(null, { vista, params: hoy })).toContain('Eso no lo puedo responder');
  });

  it('planta: qué carga y cuál fue la última en salir', () => {
    const r = responder('plant_current_unit', { vista, params: hoy });
    expect(r).toContain('Cargando: *unidad 4* (XYZ 123)');
    expect(r).toContain('Última en salir: *unidad 3* a las 06:26');
    expect(r).toContain('Van 3 despachadas');
  });

  it('campo: última en llegar y las que van en ruta', () => {
    const r = responder('site_current_unit', { vista, params: hoy });
    expect(r).toContain('Última en llegar a campo: *unidad 3* a las 07:10');
    expect(r).toContain('En ruta: *1*, *2*');
  });

  it('avance: despachado contra pedido', () => {
    expect(responder('day_progress', { vista, params: hoy })).toContain('*75 de 91 m³* despachados, faltan 16');
  });

  it('salida de una unidad, en hora de Lima', () => {
    expect(responder('unit_departure', { vista, params: { ...hoy, unitNumber: 1 } })).toContain('salió a las *05:32*');
    expect(responder('unit_departure', { vista, params: { ...hoy, unitNumber: 4 } })).toContain('está cargando');
    expect(responder('unit_departure', { vista, params: { ...hoy, unitNumber: 9 } })).toContain('No encuentro la unidad 9');
    expect(responder('unit_departure', { vista, params: hoy })).toContain('¿Qué unidad?');
  });

  it('conductor: nombre y placa, y NADA más', () => {
    const r = responder('unit_driver', { vista, params: { ...hoy, unitNumber: 2 } });
    expect(r).toContain('*LUCIO QUISPE DIAZ*');
    expect(r).toContain('BBE 942');
    expect(r).not.toMatch(/\d{9}/); // ningún teléfono
  });

  it('pedidos del día', () => {
    const r = responder('orders_day', { vista, params: hoy });
    expect(r).toContain('📋 *Pedidos de domingo 13/09*');
    expect(r).toContain('04:00 — *FERNANDO COBEÑAS* · PROYECTOS VARIOS · 91 m³ (75 despachados)');
  });

  it('sin pedidos, lo dice y no inventa unidades', () => {
    const vacia: VistaDelDia = { fecha: '2026-09-14', computedAt: 0, orders: [] };
    expect(responder('plant_current_unit', { vista: vacia, params: hoy })).toBe('No hay pedidos para lunes 14/09.');
  });

  it('checklist: confirmado y sin confirmar en palabras de obra', () => {
    const revision = { resueltos: CHECKLIST_PRODUCCION.slice(0, 2), pendientes: CHECKLIST_PRODUCCION.slice(2, 4) };
    const r = responder('checklist_status', { vista, params: hoy, revision });
    expect(r).toContain('✅ Confirmado: agregados, petróleo de planta.');
    expect(r).toContain('❔ Sin confirmar: gasohol, aviso a operadores.');
  });

  /**
   * EL CASO DEL 13/09 13:50: «a qué hora salió la última unidad despachada
   * hoy» → el agente pidió un número. La última es la de salida más tardía.
   */
  it('«la última» es la de salida más tardía; «la primera», la más temprana', () => {
    expect(unidadPor(vista, { ...hoy, ordinal: 'ultima' })?.unitNumber).toBe(3); // 06:26; la 4 está cargando, sin salida
    expect(unidadPor(vista, { ...hoy, ordinal: 'primera' })?.unitNumber).toBe(1);
    expect(responder('unit_departure', { vista, params: { ...hoy, ordinal: 'ultima' } })).toContain('*unidad 3* (ALC 812) salió a las *06:26*');
  });

  it('sin unidad, pregunta cuál (y acepta número, placa o «la última»)', () => {
    expect(responder('unit_departure', { vista, params: hoy })).toBe('¿Qué unidad? Decime el número, la placa, o «la última».');
  });

  it('media: la unidad se encuentra por placa o por número', () => {
    expect(unidadPor(vista, { ...hoy, plate: 'BBE942' })?.unitNumber).toBe(2);
    expect(unidadPor(vista, { ...hoy, unitNumber: 3 })?.plate).toBe('ALC 812');
    expect(unidadPor(vista, { ...hoy, plate: 'ZZZ999' })).toBeUndefined();
    expect(responder('unit_media', { vista, params: { ...hoy, plate: 'AZJ910' } })).toContain('*Unidad 1* (AZJ 910)');
    expect(responder('unit_media', { vista, params: hoy })).toContain('¿Qué unidad?');
  });

  /** El presupuesto por respuesta: fotos, videos y documentos por separado. */
  it('los archivos se acotan por tipo, y se dice cuántos quedaron afuera', () => {
    const muchos = [
      ...Array.from({ length: 7 }, (_, i) => ({ tipo: 'image' as const, url: `i${i}`, nombre: `f${i}`, fechaMs: i, mime: 'image/jpeg', companyId: 'globofas-s8k' })),
      ...Array.from({ length: 3 }, (_, i) => ({ tipo: 'video' as const, url: `v${i}`, nombre: `v${i}`, fechaMs: i, mime: 'video/mp4', companyId: 'globofas-s8k' })),
    ];
    const { enviar, omitidos } = acotarArchivos(muchos);
    expect(enviar.filter((a) => a.tipo === 'image')).toHaveLength(5);
    expect(enviar.filter((a) => a.tipo === 'video')).toHaveLength(2);
    expect(omitidos).toBe(3);
  });

  it('elegir pedido: uno solo sigue; varios preguntan; la empresa nombrada filtra', () => {
    expect(elegirPedido(vista, hoy).pedido?.orderId).toBe('o1');
    const dos: VistaDelDia = { ...vista, orders: [vista.orders[0], { ...vista.orders[0], orderId: 'o2', companyId: 'constroad', companySlug: 'constroad', cliente: 'CARCELI' }] };
    expect(elegirPedido(dos, hoy).pedido).toBeNull();
    expect(elegirPedido(dos, hoy).candidatos).toHaveLength(2);
    expect(elegirPedido(dos, { ...hoy, companyId: 'constroad' }).pedido?.orderId).toBe('o2');
  });
});

describe('cuánto falta', () => {
  it('planta: van, faltan, qué unidades, y una estimación al ritmo de hoy', () => {
    // Salidas 05:32, 05:59, 06:26 → una cada 27 min; falta la 4. Son las 06:30,
    // más tarde que la última salida: se cuenta desde ahora → ~06:57.
    const r = responder('plant_finish', { vista, params: hoy, ahoraMs: lima('06:30') });
    expect(r).toContain('van *75 de 91 m³*, faltan 16 m³ (1 unidad(es): 4)');
    expect(r).toContain('una cada ~27 min');
    expect(r).toContain('terminaría *~06:57*');
  });

  it('planta terminada: lo dice con la última salida', () => {
    const lista: VistaDelDia = {
      ...vista,
      orders: [{ ...vista.orders[0], m3Dispatched: 91, units: vista.orders[0].units.map((u) => ({ ...u, state: 'despachado' as const, departedAt: u.departedAt ?? lima('06:51') })) }],
    };
    expect(responder('plant_finish', { vista: lista, params: hoy })).toContain('*Planta terminó domingo 13/09*: 91 m³ en 4 unidades; la última salió a las 06:51');
  });

  it('campo: llegadas, en ruta, por salir, y el informe de control de pista si existe', () => {
    const informes = [{ type: 'CTL-PIS', label: 'Control de pista', status: 'draft' as const, cantidad: 1 }];
    const r = responder('site_finish', { vista, params: hoy, informes, ahoraMs: lima('07:30') });
    expect(r).toContain('llegaron *1 unidad(es)* (25 de 91 m³); en ruta 2; por salir de planta 1');
    expect(r).toContain('Informe: ✏️ Control de pista (borrador)');
    // Con una sola llegada no hay ritmo, y no se inventa.
    expect(r).toContain('Todavía no hay ritmo de llegadas');
  });

  it('la estimación necesita al menos dos salidas y algo pendiente', () => {
    expect(estimarFin([lima('05:00')], 2, lima('06:00'))).toBeNull();
    expect(estimarFin([lima('05:00'), lima('05:30')], 0, lima('06:00'))).toBeNull();
    const e = estimarFin([lima('05:00'), lima('05:30')], 2, lima('05:40'))!;
    expect(e.ritmoMin).toBe(30);
    // Desde la última salida (05:30) o desde ahora, lo que sea más tarde: 05:40 + 2×30 = 06:40.
    expect(new Date(e.finMs).toISOString()).toBe(new Date(lima('06:40')).toISOString());
  });
});

describe('informes', () => {
  const informes = [
    { type: 'IPP', label: 'Producción de planta', status: 'completed' as const, cantidad: 1 },
    { type: 'CTL-PIS', label: 'Control de pista', status: 'draft' as const, cantidad: 1 },
    { type: 'CTL-IMP', label: 'Control de imprimación', status: null, cantidad: 0 },
    { type: 'IAA', label: 'Área adicional', status: null, cantidad: 0 },
  ];

  it('los nombrados van primero aunque no existan; el resto solo si existe', () => {
    const r = responder('reports_status', { vista, params: { ...hoy, pregunta: 'tenemos hecho el informe de imprimacion, area adicional?' } as never, informes });
    const lineas = r.split('\n').slice(1);
    expect(lineas[0]).toBe('• ❌ Control de imprimación (no hay)');
    expect(lineas[1]).toBe('• ❌ Área adicional (no hay)');
    expect(lineas).toContain('• ✅ Producción de planta (completado)');
    expect(lineas).toContain('• ✏️ Control de pista (borrador)');
  });

  it('sin ninguno generado, lo dice', () => {
    const vacios = informes.map((i) => ({ ...i, status: null, cantidad: 0 }));
    expect(responder('reports_status', { vista, params: hoy, informes: vacios })).toContain('todavía no hay ninguno generado');
  });
});

describe('ayuda', () => {
  it('lista lo que puede, cómo aprobar, y el interruptor', () => {
    expect(responder('help', { vista, params: hoy })).toBe(AYUDA);
    expect(AYUDA).toContain('!lila off');
    expect(AYUDA).toContain('Responder');
    expect(AYUDA).toContain('No respondo precios');
  });
});
