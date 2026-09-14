import { fechaLegible } from '../checklist/tiempo.js';
import type { TablaSpec } from '../consultas/imagen.js';
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

/**
 * EL TEXTO SE LEE EN UN CELULAR: ~36 caracteres por línea antes de partirse.
 * Una línea por dato, el número primero, la empresa corta («Globofast», no
 * «Globofast Solkali»), y la obra —que es lo más largo— al final o en la
 * imagen. Más de `FILAS_PARA_IMAGEN` filas van en imagen (José, 14/09: 24
 * pedidos en texto «no es legible, está todo desordenado»).
 */
export const FILAS_PARA_IMAGEN = 6;
export const etiquetaEmpresa = (nombre: string): string => {
  const t = String(nombre || '').toLowerCase();
  if (t.includes('globofas')) return 'Globofast';
  if (t.includes('constroad')) return 'Constroad';
  if (t.includes('inframaq')) return 'Inframaq';
  return String(nombre || '');
};

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

const encabezadoPedidos = (h: Historial, filtro: { empresa?: string; cliente?: string }, hoy: string): string => {
  const de = [filtro.cliente ? `de ${filtro.cliente}` : '', filtro.empresa ? `· ${etiquetaEmpresa(filtro.empresa)}` : ''].filter(Boolean).join(' ');
  const todosPorVenir = Boolean(hoy) && h.pedidos.every((p) => p.fecha > hoy);
  return todosPorVenir
    ? `📋 *${h.pedidos.length} pedido(s) programado(s)* ${de ? `${de} ` : ''}${rango(h.desde, h.hasta)} — ${n(h.totalM3Pedidos)} m³`
    : `📋 *${h.pedidos.length} pedido(s)* ${de ? `${de} ` : ''}${rango(h.desde, h.hasta)}\n${n(h.totalM3Despachados)} de ${n(h.totalM3Pedidos)} m³ despachados`;
};

export const fichaPedidos = (h: Historial, filtro: { empresa?: string; cliente?: string }, hoy = ''): string => {
  const de = [filtro.cliente ? `de ${filtro.cliente}` : '', filtro.empresa ? `en ${etiquetaEmpresa(filtro.empresa)}` : ''].filter(Boolean).join(' ');
  if (h.pedidos.length === 0) {
    // El agente ve Portal, no el chat: si en el grupo dijeron que habrá
    // producción y acá no aparece, es que el pedido no está cargado.
    const porVenir = Boolean(hoy) && h.hasta >= hoy;
    return `No hay pedidos ${de ? `${de} ` : ''}${rango(h.desde, h.hasta)} en Portal.${porVenir ? ' Si hay producción programada, todavía no está cargada.' : ''}`;
  }
  // Lo programado se cuenta en m³ pedidos; lo que ya pasó, en despachados sobre pedidos.
  const porVenir = (p: { fecha: string }) => Boolean(hoy) && p.fecha > hoy;
  const lineas = [encabezadoPedidos(h, filtro, hoy)];
  for (const p of h.pedidos) {
    const cantidad = porVenir(p) ? `${n(p.m3Pedidos)} m³${p.hora ? '' : ' · sin hora'}` : `${n(p.m3Despachados)}/${n(p.m3Pedidos)} m³`;
    const quien = filtro.cliente ? recortar(p.obra || 'sin obra', 18) : recortar(p.cliente, 18);
    lineas.push(`• ${corta(p.fecha)}${p.hora ? ` ${p.hora}` : ''} · ${cantidad} · ${quien}${filtro.empresa ? '' : ` (${etiquetaEmpresa(p.empresa)})`}`);
  }
  if (h.truncado) lineas.push(`… y más: te muestro los primeros ${h.pedidos.length}. Acota las fechas o el cliente.`);
  return lineas.join('\n');
};

/** La misma lista, en tabla: fecha, m³, cliente, obra, estado — por empresa. */
export const tablaPedidos = (h: Historial, filtro: { empresa?: string; cliente?: string }, hoy = ''): TablaSpec => {
  const porVenir = (p: { fecha: string }) => Boolean(hoy) && p.fecha > hoy;
  const porEmpresa = new Map<string, typeof h.pedidos>();
  for (const p of h.pedidos) porEmpresa.set(p.empresa, [...(porEmpresa.get(p.empresa) ?? []), p]);
  return {
    titulo: filtro.cliente ? `Pedidos de ${recortar(filtro.cliente, 30)}` : 'Pedidos',
    subtitulo: `${rango(h.desde, h.hasta)} · ${h.pedidos.length} pedido(s) · ${n(h.totalM3Despachados)} de ${n(h.totalM3Pedidos)} m³ despachados`,
    columnas: [
      { titulo: 'Fecha', ancho: 110 },
      { titulo: 'Hora', ancho: 80 },
      { titulo: 'm³', ancho: 130, alinear: 'fin' },
      { titulo: 'Cliente', ancho: 300, max: 26 },
      { titulo: 'Obra', ancho: 300, max: 26 },
      { titulo: 'Estado', ancho: 96, max: 12 },
    ],
    secciones: [...porEmpresa].map(([empresa, lista]) => ({
      encabezado: etiquetaEmpresa(empresa),
      detalle: `${lista.length} pedido(s) · ${n(lista.reduce((s, p) => s + p.m3Despachados, 0))} de ${n(lista.reduce((s, p) => s + p.m3Pedidos, 0))} m³`,
      filas: lista.map((p) => [corta(p.fecha), p.hora || '—', porVenir(p) ? `${n(p.m3Pedidos)}` : `${n(p.m3Despachados)} / ${n(p.m3Pedidos)}`, p.cliente, p.obra || 'sin obra', porVenir(p) ? (p.hora ? 'programado' : 'sin hora') : p.estado]),
    })),
    pie: h.truncado ? `Se muestran los primeros ${h.pedidos.length}. Acota las fechas o el cliente para ver el resto.` : undefined,
  };
};

/** Si alguna empresa tuvo movimientos, las que no tuvieron no se muestran (como el stock: un bloque en cero no informa). */
export const kardexConMovimientos = (lista: KardexDeMaterial[]): KardexDeMaterial[] => {
  const con = lista.filter((k) => k.movimientos.length > 0);
  return con.length ? con : lista;
};

const resumenKardex = (k: KardexDeMaterial): string =>
  `⬆️ ${k.cantidadIngresos} ingresos · ${n(k.totalIngresos)} ${k.unidad}\n⬇️ ${k.cantidadSalidas} salidas · ${n(k.totalSalidas)} ${k.unidad}\n📦 stock actual ${n(k.saldoActual)} ${k.unidad}`;

export const fichaKardex = (material: string, lista: KardexDeMaterial[]): string => {
  if (lista.length === 0) return `No encontré un material que se llame «${material}» en ${EMPRESAS_TEXTO}.`;
  const bloques = kardexConMovimientos(lista).map((k) => {
    const lineas = [`📦 *${k.material}* · ${etiquetaEmpresa(k.empresa)}`, rango(k.desde, k.hasta), resumenKardex(k)];
    if (k.movimientos.length === 0) lineas.push('Sin movimientos en ese rango.');
    for (const m of k.movimientos) {
      lineas.push(`• ${corta(m.fecha)} ${m.tipo === 'Ingreso' ? '⬆️' : '⬇️'} ${n(m.cantidad)} → ${n(m.saldo)}${m.detalle ? ` · ${recortar(m.detalle, 16)}` : ''}`);
    }
    if (k.truncado) lineas.push(`… y más: te muestro los primeros ${k.movimientos.length}. Acota las fechas.`);
    return lineas.join('\n');
  });
  return bloques.join('\n\n');
};

export const tablaKardex = (material: string, lista: KardexDeMaterial[]): TablaSpec => {
  const con = kardexConMovimientos(lista);
  return {
    titulo: `Kardex — ${recortar(material.toUpperCase(), 30)}`,
    subtitulo: con.length ? `${rango(con[0].desde, con[0].hasta)} · ${con.length} material(es)` : '',
    columnas: [
      { titulo: 'Fecha', ancho: 110 },
      { titulo: 'Tipo', ancho: 110 },
      { titulo: 'Cantidad', ancho: 150, alinear: 'fin' },
      { titulo: 'Saldo', ancho: 150, alinear: 'fin' },
      { titulo: 'Detalle', ancho: 496, max: 44 },
    ],
    secciones: con.map((k) => ({
      encabezado: `${k.material} · ${etiquetaEmpresa(k.empresa)}`,
      detalle: `⬆ ${n(k.totalIngresos)} · ⬇ ${n(k.totalSalidas)} · stock ${n(k.saldoActual)} ${k.unidad}`,
      filas: k.movimientos.map((m) => [corta(m.fecha), m.tipo, `${n(m.cantidad)} ${k.unidad}`, n(m.saldo), m.detalle]),
    })),
    pie: con.some((k) => k.truncado) ? 'Se muestran los primeros movimientos. Acota las fechas para ver el resto.' : undefined,
  };
};

/** Lo que llegó, por proveedor (y por material dentro de cada uno), con lo que falta confirmar. */
const cuandoIngresos = (r: IngresosDeAgregados, hoy: string): string =>
  r.desde === r.hasta ? (r.desde === hoy ? 'hoy' : `el ${fechaLegible(r.desde)}`) : `del ${corta(r.desde)} al ${corta(r.hasta)}`;

export const fichaIngresos = (r: IngresosDeAgregados, hoy = ''): string => {
  const cuando = cuandoIngresos(r, hoy);
  if (r.proveedores.length === 0) return `No hay camiones de agregados registrados ${cuando} en la recepción de insumos.`;
  const lineas = [`🚚 *Ingresos de agregados ${cuando}*`, `${r.totalIngresos} camión(es) · ${n(r.total)} ${r.unidad}${r.pendientes ? ` · ${r.pendientes} por confirmar` : ''}`];
  for (const p of r.proveedores) {
    lineas.push('', `*${recortar(p.proveedor, 24)}* · ${etiquetaEmpresa(p.empresa)} · ${n(p.total)} ${p.unidad}${p.transportista ? `\n(transporta ${recortar(p.transportista, 22)})` : ''}`);
    for (const m of p.materiales) {
      lineas.push(`• ${n(m.cantidad)} ${m.unidad} ${recortar(m.material, 22)}${m.ingresos > 1 ? ` ×${m.ingresos}` : ''}${m.pendientes ? ` ⏳${m.pendientes === m.ingresos ? '' : m.pendientes}` : ''}`);
    }
  }
  if (r.pendientes) lineas.push('', '⏳ = por confirmar (todavía no pasó al kardex)');
  return lineas.join('\n');
};

export const tablaIngresos = (r: IngresosDeAgregados, hoy = ''): TablaSpec => ({
  titulo: 'Ingresos de agregados',
  subtitulo: `${cuandoIngresos(r, hoy)} · ${r.totalIngresos} camión(es) · ${n(r.total)} ${r.unidad}${r.pendientes ? ` · ${r.pendientes} por confirmar` : ''}`,
  columnas: [
    { titulo: 'Material', ancho: 520, max: 44 },
    { titulo: 'm³', ancho: 150, alinear: 'fin' },
    { titulo: 'Camiones', ancho: 150, alinear: 'fin' },
    { titulo: 'Estado', ancho: 196, max: 20 },
  ],
  secciones: r.proveedores.map((p) => ({
    encabezado: `${p.proveedor}${p.transportista ? ` (transporta ${p.transportista})` : ''}`,
    detalle: `${etiquetaEmpresa(p.empresa)} · ${n(p.total)} ${p.unidad}`,
    filas: p.materiales.map((m) => [m.material, n(m.cantidad), String(m.ingresos), m.pendientes ? (m.pendientes === m.ingresos ? 'por confirmar' : `${m.pendientes} por confirmar`) : 'confirmado']),
  })),
});

type Certificados = { pedidos: PedidoSinCertificado[]; truncado: boolean; total: number };
type Rango = { desde: string; hasta: string };

const cuandoCertificados = (rango: Rango): string => (rango.desde === rango.hasta ? `el ${fechaLegible(rango.desde)}` : `del ${corta(rango.desde)} al ${corta(rango.hasta)}`);
const porClienteDe = (pedidos: PedidoSinCertificado[]): Array<[string, PedidoSinCertificado[]]> => {
  const m = new Map<string, PedidoSinCertificado[]>();
  for (const p of pedidos) m.set(p.cliente, [...(m.get(p.cliente) ?? []), p]);
  return [...m].sort((a, b) => b[1].length - a[1].length);
};

/** El encabezado y el conteo por cliente: sirve de texto corto y de caption de la imagen. */
export const resumenCertificados = (r: Certificados, rango: Rango, empresa?: string): string => {
  const de = empresa ? ` de ${etiquetaEmpresa(empresa)}` : '';
  const cuando = cuandoCertificados(rango);
  if (r.total === 0) return `No hay pedidos despachados${de} ${cuando}.`;
  if (r.pedidos.length === 0) return `Los ${r.total} pedidos despachados${de} ${cuando} tienen su certificado cargado.`;
  const lineas = [`📄 *${r.pedidos.length}${r.truncado ? '+' : ''} de ${r.total} pedidos despachados${de}*`, `${cuando}, sin certificado cargado`];
  const porCliente = porClienteDe(r.pedidos);
  if (porCliente.length > 1) lineas.push('', ...porCliente.map(([cliente, lista]) => `• ${lista.length} · ${recortar(cliente, 26)}`));
  const exigen = r.pedidos.filter((p) => p.exige).length;
  if (exigen) lineas.push('', `⚠️ ${exigen} marcado(s) en Portal como que lo exigen.`);
  return lineas.join('\n');
};

/** Pedidos despachados sin certificado, por cliente cuando hay más de uno; ⚠️ los que Portal marca como que lo exigen. */
export const fichaCertificados = (r: Certificados, rango: Rango, empresa?: string): string => {
  if (r.pedidos.length === 0) return resumenCertificados(r, rango, empresa);
  const de = empresa ? ` de ${etiquetaEmpresa(empresa)}` : '';
  const lineas = [`📄 *${r.pedidos.length}${r.truncado ? '+' : ''} de ${r.total} pedidos despachados${de}*`, `${cuandoCertificados(rango)}, sin certificado cargado`];
  const linea = (p: PedidoSinCertificado) => `• ${corta(p.fecha)} · ${n(p.m3)} m³ · ${recortar(p.obra || 'sin obra', 16)}${p.exige ? ' ⚠️' : ''}`;
  for (const [cliente, lista] of porClienteDe(r.pedidos)) {
    lineas.push('', `*${recortar(cliente, 28)}* · ${etiquetaEmpresa(lista[0].empresa)}${lista.length > 1 ? ` · ${lista.length}` : ''}`, ...lista.map(linea));
  }
  if (r.pedidos.some((p) => p.exige)) lineas.push('', '⚠️ = marcado en Portal como que lo exige');
  if (r.truncado) lineas.push('… y más. Acota las fechas o la empresa para ver el resto.');
  return lineas.join('\n');
};

export const tablaCertificados = (r: Certificados, rango: Rango, empresa?: string): TablaSpec => ({
  titulo: 'Pedidos sin certificado cargado',
  subtitulo: `${cuandoCertificados(rango)}${empresa ? ` · ${etiquetaEmpresa(empresa)}` : ''} · ${r.pedidos.length}${r.truncado ? '+' : ''} de ${r.total} despachados`,
  columnas: [
    { titulo: 'Fecha', ancho: 110 },
    { titulo: 'm³', ancho: 120, alinear: 'fin' },
    { titulo: 'Obra', ancho: 470, max: 40 },
    { titulo: 'Empresa', ancho: 150, max: 14 },
    { titulo: 'Exige', ancho: 166, max: 12 },
  ],
  secciones: porClienteDe(r.pedidos).map(([cliente, lista]) => ({
    encabezado: cliente,
    detalle: `${lista.length} pedido(s) · ${n(lista.reduce((s, p) => s + p.m3, 0))} m³`,
    filas: lista.map((p) => [corta(p.fecha), n(p.m3), p.obra || 'sin obra', etiquetaEmpresa(p.empresa), p.exige ? '⚠️ sí' : '']),
  })),
  pie: r.truncado ? 'Se muestran los primeros. Acota las fechas o la empresa para ver el resto.' : undefined,
});
