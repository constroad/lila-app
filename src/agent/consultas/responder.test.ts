import { responder } from './responder';
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
      cliente: 'FERNANDO COBEÑAS',
      obra: 'PROYECTOS VARIOS',
      cantidadCubos: 91,
      m3Dispatched: 75,
      hora: '04:00',
      units: [
        { unitNumber: 1, plate: 'AZJ 910', driverName: 'HOOVER QUISPE MUÑOZ', state: 'despachado', quantity: 25, departedAt: lima('05:32'), picturesCount: 2 },
        { unitNumber: 2, plate: 'BBE 942', driverName: 'LUCIO QUISPE DIAZ', state: 'despachado', quantity: 25, departedAt: lima('05:59'), picturesCount: 0 },
        { unitNumber: 3, plate: 'ALC 812', driverName: 'PEDRO CANCHO MONTEZ', state: 'despachado', quantity: 25, departedAt: lima('06:26'), arrivalAt: lima('07:10'), picturesCount: 0 },
        { unitNumber: 4, plate: 'XYZ 123', driverName: 'JUAN PEREZ', state: 'progreso', quantity: 16, picturesCount: 0 },
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

  it('fotos: cuenta, no manda', () => {
    expect(responder('unit_photos', { vista, params: { ...hoy, unitNumber: 1 } })).toContain('tiene 2 foto(s)');
  });
});
