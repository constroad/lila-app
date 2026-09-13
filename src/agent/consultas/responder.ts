import type { ClaveConsulta, Parametros } from './catalogo.js';
import type { VistaDelDia, UnidadDelDia } from './vista.js';
import { fechaLegible } from '../checklist/tiempo.js';
import type { Revision } from '../checklist/checklist.js';

/**
 * De una clave del catálogo y el read model a un texto. Puro: nada de acá toca
 * la base, y nada de acá puede decir algo que no esté en la vista.
 *
 * Lo lee una persona en el celular: corto, con negritas de WhatsApp, y sin
 * disculpas largas cuando no hay dato — «no tengo eso» y listo.
 */

const hora = (ms?: number): string =>
  ms
    ? new Date(ms).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';

const unidades = (vista: VistaDelDia): Array<UnidadDelDia & { pedido: string }> =>
  vista.orders.flatMap((o) => o.units.map((u) => ({ ...u, pedido: o.cliente || o.companyId })));

const unidad = (vista: VistaDelDia, n?: number) => (n ? unidades(vista).find((u) => u.unitNumber === n) : undefined);

const sinPedidos = (vista: VistaDelDia): string | null =>
  vista.orders.length === 0 ? `No hay pedidos para ${fechaLegible(vista.fecha)}.` : null;

export interface ContextoRespuesta {
  vista: VistaDelDia;
  params: Parametros;
  /** Estado del checklist del día, si el agente lo tiene. */
  revision?: Revision | null;
}

export const responder = (clave: ClaveConsulta | null, ctx: ContextoRespuesta): string => {
  const { vista, params } = ctx;
  const dia = fechaLegible(vista.fecha);

  if (!clave) return 'Eso no lo puedo responder. Puedo decirte: qué carro está en planta o en campo, cuántos m³ van, a qué hora salió una unidad, quién la maneja, qué pedidos hay, y cómo va el checklist.';

  const vacio = sinPedidos(vista);
  if (vacio && clave !== 'orders_day') return vacio;

  switch (clave) {
    case 'orders_day': {
      if (vacio) return vacio;
      const lineas = vista.orders.map(
        (o) => `• ${o.hora || '—'} — *${o.cliente || o.companyId}* · ${o.obra || 'sin obra'} · ${o.cantidadCubos} m³ (${o.m3Dispatched} despachados)`
      );
      return [`📋 *Pedidos de ${dia}*`, ...lineas].join('\n');
    }

    case 'day_progress': {
      const total = vista.orders.reduce((s, o) => s + o.cantidadCubos, 0);
      const van = vista.orders.reduce((s, o) => s + o.m3Dispatched, 0);
      const porPedido = vista.orders.map((o) => `• ${o.cliente || o.companyId}: ${o.m3Dispatched} de ${o.cantidadCubos} m³`);
      return [`📊 *Avance de ${dia}*: *${van} de ${total} m³* despachados, faltan ${Math.max(total - van, 0)}.`, ...porPedido].join('\n');
    }

    case 'plant_current_unit': {
      const todas = unidades(vista);
      const cargando = todas.filter((u) => u.state === 'progreso');
      const salidas = todas.filter((u) => u.state === 'despachado' && u.departedAt).sort((a, b) => (b.departedAt ?? 0) - (a.departedAt ?? 0));
      const partes: string[] = [];
      if (cargando.length) partes.push(`🏭 Cargando: ${cargando.map((u) => `*unidad ${u.unitNumber}* (${u.plate || 'sin placa'})`).join(', ')}.`);
      if (salidas[0]) partes.push(`Última en salir: *unidad ${salidas[0].unitNumber}* a las ${hora(salidas[0].departedAt)}. Van ${salidas.length} despachadas.`);
      if (!partes.length) partes.push(`Todavía no salió ninguna unidad ${dia === fechaLegible(vista.fecha) ? 'hoy' : dia}.`);
      return partes.join('\n');
    }

    case 'site_current_unit': {
      const todas = unidades(vista);
      const enRuta = todas.filter((u) => u.state === 'despachado' && !u.arrivalAt);
      const llegadas = todas.filter((u) => u.arrivalAt).sort((a, b) => (b.arrivalAt ?? 0) - (a.arrivalAt ?? 0));
      const partes: string[] = [];
      if (llegadas[0]) partes.push(`🛣 Última en llegar a campo: *unidad ${llegadas[0].unitNumber}* a las ${hora(llegadas[0].arrivalAt)}.`);
      if (enRuta.length) partes.push(`En ruta: ${enRuta.map((u) => `*${u.unitNumber}*`).join(', ')}.`);
      if (!partes.length) partes.push('No hay unidades en ruta ni llegadas registradas.');
      return partes.join('\n');
    }

    case 'unit_departure': {
      if (!params.unitNumber) return '¿Qué unidad? Decime el número, por ejemplo «@lila a qué hora salió la 5».';
      const u = unidad(vista, params.unitNumber);
      if (!u) return `No encuentro la unidad ${params.unitNumber} en los pedidos de ${dia}.`;
      if (u.state === 'despachado' && u.departedAt) return `🚚 La *unidad ${u.unitNumber}* (${u.plate || 'sin placa'}) salió a las *${hora(u.departedAt)}* con ${u.quantity} m³.`;
      if (u.state === 'progreso') return `La *unidad ${u.unitNumber}* está cargando; todavía no salió.`;
      return `La *unidad ${u.unitNumber}* todavía no salió.`;
    }

    case 'unit_driver': {
      if (!params.unitNumber) return '¿Qué unidad? Decime el número, por ejemplo «@lila quién maneja la 5».';
      const u = unidad(vista, params.unitNumber);
      if (!u) return `No encuentro la unidad ${params.unitNumber} en los pedidos de ${dia}.`;
      // Nombre y placa, nada más: teléfono y licencia no existen en la vista (spec §6.2).
      return `👤 La *unidad ${u.unitNumber}* la maneja *${u.driverName || 'sin conductor asignado'}*, placa ${u.plate || 'sin placa'}.`;
    }

    case 'unit_eta': {
      if (!params.unitNumber) return '¿Qué unidad? Decime el número.';
      const u = unidad(vista, params.unitNumber);
      if (!u) return `No encuentro la unidad ${params.unitNumber} en los pedidos de ${dia}.`;
      if (u.arrivalAt) return `La *unidad ${u.unitNumber}* ya llegó a campo a las ${hora(u.arrivalAt)}.`;
      if (u.departedAt) return `La *unidad ${u.unitNumber}* salió a las ${hora(u.departedAt)}. Todavía no calculo tiempos de llegada por acá.`;
      return `La *unidad ${u.unitNumber}* todavía no salió.`;
    }

    case 'unit_photos': {
      if (!params.unitNumber) return '¿De qué unidad? Decime el número.';
      const u = unidad(vista, params.unitNumber);
      if (!u) return `No encuentro la unidad ${params.unitNumber} en los pedidos de ${dia}.`;
      return u.picturesCount
        ? `📷 La *unidad ${u.unitNumber}* tiene ${u.picturesCount} foto(s) en Portal. Todavía no las mando por acá.`
        : `La *unidad ${u.unitNumber}* no tiene fotos registradas.`;
    }

    case 'checklist_status': {
      const r = ctx.revision;
      if (!r) return `No tengo el checklist de ${dia} armado todavía.`;
      const partes = [`✅ Confirmado: ${r.resueltos.length ? r.resueltos.map((i) => i.titulo).join(', ') : 'nada aún'}.`];
      partes.push(r.pendientes.length ? `❔ Sin confirmar: ${r.pendientes.map((i) => i.titulo).join(', ')}.` : '🎉 No falta nada.');
      return [`📋 *Checklist de ${dia}*`, ...partes].join('\n');
    }

    case 'reports_status':
      return 'Los informes y certificados todavía no los consulto por acá. Se ven en Portal.';
  }
};
