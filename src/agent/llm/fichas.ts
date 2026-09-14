import { fechaLegible } from '../checklist/tiempo.js';
import type { ClienteFicha, Historial, IngresosDeAgregados, KardexDeMaterial, PedidoSinCertificado, ProveedorFicha } from './datos.js';

/**
 * LAS FICHAS: la respuesta determinista de cada herramienta de datos. Todo lo
 * que la base devolvió, en el orden de siempre, en tuteo. Es lo que la persona
 * recibe SIEMPRE; la frase del modelo (`redaccion.ts`), si la hay, va encima.
 * Así el modelo puede fallar, tardar o decir poco, y la respuesta igual está
 * completa.
 */

const n = (v: number): string => v.toLocaleString('es-PE', { maximumFractionDigits: 2 });
/** Las obras se llaman «CREACIÓN DEL SERVICIO DE MOVILIDAD URBANA EN LAS VÍAS INTERNAS DE…»: en una línea no entran. */
const recortar = (s: string, max = 60): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const corta = (f: string): string => (f ? fechaLegible(f).replace(/^\S+ /, '') : '—');
const EMPRESAS_TEXTO = 'Globofast, Constroad ni Inframaq';

export const fichaClientes = (nombre: string, lista: ClienteFicha[]): string => {
  if (lista.length === 0) return `No encontré ningún cliente que se llame «${nombre}» en ${EMPRESAS_TEXTO}.`;
  const bloques = lista.map((c) => {
    const lineas = [`👤 *${c.nombre}*${c.alias && c.alias !== c.nombre ? ` (${c.alias})` : ''} · ${c.empresa}`];
    if (c.ruc) lineas.push(`RUC ${c.ruc}`);
    if (c.contacto || c.telefono) lineas.push(`Contacto: ${[c.contacto, c.telefono].filter(Boolean).join(' · ')}`);
    if (c.email) lineas.push(`Correo: ${c.email}`);
    if (c.direccion) lineas.push(`Dirección: ${c.direccion}`);
    lineas.push(
      c.ultimosPedidos.length
        ? `Últimos pedidos: ${c.ultimosPedidos.map((p) => `${corta(p.fecha)} ${p.obra || 'sin obra'} ${n(p.m3)} m³`).join('; ')}`
        : 'Sin pedidos registrados.'
    );
    return lineas.join('\n');
  });
  return bloques.join('\n\n');
};

export const fichaProveedores = (nombre: string, lista: ProveedorFicha[]): string => {
  if (lista.length === 0) return `No encontré ningún proveedor que se llame «${nombre}» en ${EMPRESAS_TEXTO}.`;
  const bloques = lista.map((p) => {
    const lineas = [`🏗 *${p.nombre}*${p.alias && p.alias !== p.nombre ? ` (${p.alias})` : ''} · ${p.empresa}`];
    if (p.ruc) lineas.push(`RUC ${p.ruc}`);
    if (p.rubros.length || p.etiquetas.length) lineas.push(`Rubro: ${[...p.rubros, ...p.etiquetas].join(', ')}`);
    if (p.contacto || p.telefono) lineas.push(`Contacto: ${[p.contacto, p.telefono].filter(Boolean).join(' · ')}`);
    if (p.email) lineas.push(`Correo: ${p.email}`);
    if (p.direccion) lineas.push(`Dirección: ${p.direccion}`);
    return lineas.join('\n');
  });
  return bloques.join('\n\n');
};

const rango = (desde: string, hasta: string): string => (desde === hasta ? `el ${fechaLegible(desde)}` : `del ${corta(desde)} al ${corta(hasta)}`);

export const fichaPedidos = (h: Historial, filtro: { empresa?: string; cliente?: string }, hoy = ''): string => {
  const de = [filtro.cliente ? `de ${filtro.cliente}` : '', filtro.empresa ? `en ${filtro.empresa}` : ''].filter(Boolean).join(' ');
  if (h.pedidos.length === 0) {
    // El agente ve Portal, no el chat: si en el grupo dijeron que habrá
    // producción y acá no aparece, es que el pedido no está cargado.
    const porVenir = Boolean(hoy) && h.hasta >= hoy;
    return `No hay pedidos ${de ? `${de} ` : ''}${rango(h.desde, h.hasta)} en Portal.${porVenir ? ' Si hay producción programada, todavía no está cargada.' : ''}`;
  }
  // Lo programado se cuenta en m³ pedidos; lo que ya pasó, en despachados sobre pedidos.
  const porVenir = (p: { fecha: string }) => Boolean(hoy) && p.fecha > hoy;
  const todosPorVenir = h.pedidos.every(porVenir);
  const lineas = [
    todosPorVenir
      ? `📋 *${h.pedidos.length} pedido(s) programado(s) ${de ? `${de} ` : ''}${rango(h.desde, h.hasta)}* — ${n(h.totalM3Pedidos)} m³`
      : `📋 *${h.pedidos.length} pedido(s) ${de ? `${de} ` : ''}${rango(h.desde, h.hasta)}* — ${n(h.totalM3Despachados)} de ${n(h.totalM3Pedidos)} m³ despachados`,
  ];
  for (const p of h.pedidos) {
    const quien = [filtro.cliente ? '' : p.cliente, filtro.empresa ? '' : `(${p.empresa})`].filter(Boolean).join(' ');
    const cantidad = porVenir(p) ? `${n(p.m3Pedidos)} m³, ${p.hora ? 'programado' : 'sin hora de inicio'}` : `${n(p.m3Despachados)} de ${n(p.m3Pedidos)} m³, ${p.estado}`;
    lineas.push(`• ${corta(p.fecha)}${p.hora ? ` ${p.hora}` : ''} ${quien ? `${recortar(quien, 45)} ` : ''}${recortar(p.obra || 'sin obra')}: ${cantidad}`);
  }
  if (h.truncado) lineas.push(`… y más: te muestro los primeros ${h.pedidos.length}. Acota las fechas o el cliente.`);
  return lineas.join('\n');
};

export const fichaKardex = (material: string, lista: KardexDeMaterial[]): string => {
  if (lista.length === 0) return `No encontré un material que se llame «${material}» en ${EMPRESAS_TEXTO}.`;
  // Si alguna empresa tuvo movimientos, las que no tuvieron no se muestran (la
  // misma regla que el stock de agregados: un bloque en cero no informa nada).
  const conMovimientos = lista.filter((k) => k.movimientos.length > 0);
  const bloques = (conMovimientos.length ? conMovimientos : lista).map((k) => {
    const lineas = [
      `📦 *${k.material}* · ${k.empresa} · ${rango(k.desde, k.hasta)}`,
      `${k.cantidadIngresos} ingreso(s) por ${n(k.totalIngresos)} ${k.unidad} · ${k.cantidadSalidas} salida(s) por ${n(k.totalSalidas)} ${k.unidad} · stock actual ${n(k.saldoActual)} ${k.unidad}`,
    ];
    if (k.movimientos.length === 0) lineas.push('Sin movimientos en ese rango.');
    for (const m of k.movimientos) {
      lineas.push(`• ${corta(m.fecha)} ${m.tipo === 'Ingreso' ? '⬆️' : '⬇️'} ${n(m.cantidad)} ${k.unidad}${m.detalle ? ` (${recortar(m.detalle, 40)})` : ''} → saldo ${n(m.saldo)}`);
    }
    if (k.truncado) lineas.push(`… y más: te muestro los primeros ${k.movimientos.length}. Acota las fechas.`);
    return lineas.join('\n');
  });
  return bloques.join('\n\n');
};

/** Lo que llegó, por proveedor (y por material dentro de cada uno), con lo que falta confirmar. */
export const fichaIngresos = (r: IngresosDeAgregados, hoy = ''): string => {
  const cuando = r.desde === r.hasta ? (r.desde === hoy ? 'hoy' : `el ${fechaLegible(r.desde)}`) : `del ${corta(r.desde)} al ${corta(r.hasta)}`;
  if (r.proveedores.length === 0) return `No hay camiones de agregados registrados ${cuando} en la recepción de insumos.`;
  const lineas = [`🚚 *Ingresos de agregados ${cuando}*: ${r.totalIngresos} camión(es), ${n(r.total)} ${r.unidad}${r.pendientes ? ` · ${r.pendientes} por confirmar` : ''}`];
  for (const p of r.proveedores) {
    lineas.push(`*${p.proveedor}*${p.transportista ? ` (transporta ${p.transportista})` : ''} · ${p.empresa} — ${n(p.total)} ${p.unidad}`);
    for (const m of p.materiales) {
      lineas.push(`• ${m.material}: ${n(m.cantidad)} ${m.unidad}${m.ingresos > 1 ? ` en ${m.ingresos} camiones` : ''}${m.pendientes ? ` (${m.pendientes === m.ingresos ? 'por confirmar' : `${m.pendientes} por confirmar`})` : ''}`);
    }
  }
  return lineas.join('\n');
};

/** Pedidos sin certificado, por cliente cuando hay más de uno. */
export const fichaCertificados = (r: { pedidos: PedidoSinCertificado[]; truncado: boolean }, empresa?: string): string => {
  const de = empresa ? ` de ${empresa}` : '';
  if (r.pedidos.length === 0) return `No hay pedidos${de} con certificado pendiente: todos los que lo exigen ya lo tienen cargado.`;
  const lineas = [`📄 *${r.pedidos.length}${r.truncado ? '+' : ''} pedido(s)${de} sin certificado cargado*`];
  const porCliente = new Map<string, PedidoSinCertificado[]>();
  for (const p of r.pedidos) porCliente.set(p.cliente, [...(porCliente.get(p.cliente) ?? []), p]);
  const linea = (p: PedidoSinCertificado) => `• ${corta(p.fecha)} ${recortar(p.obra || 'sin obra', 40)} ${n(p.m3)} m³${p.nota ? ` — ${recortar(p.nota, 40)}` : ''}`;
  if (porCliente.size === 1) {
    const [[cliente, lista]] = [...porCliente];
    lineas.push(`*${cliente}* · ${lista[0].empresa}`, ...lista.map(linea));
  } else {
    for (const [cliente, lista] of [...porCliente].sort((a, b) => b[1].length - a[1].length)) {
      lineas.push(`*${recortar(cliente, 45)}* · ${lista[0].empresa} — ${lista.length}`, ...lista.map(linea));
    }
  }
  if (r.truncado) lineas.push('… y más. Acota por empresa para ver el resto.');
  return lineas.join('\n');
};
