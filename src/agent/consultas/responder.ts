import { normalizarPlaca, type ClaveConsulta, type Parametros } from './catalogo.js';
import type { VistaDelDia, UnidadDelDia, PedidoDelDiaVista } from './vista.js';
import { fechaLegible } from '../checklist/tiempo.js';
import type { Revision } from '../checklist/checklist.js';
import type { Archivo, EstadoInforme } from './archivos.js';

/** Una respuesta puede ser texto, texto + archivos, o una pregunta con opciones. */
export interface Respuesta {
  texto: string;
  archivos?: Archivo[];
  /** Si hay que preguntar antes: las opciones y qué hacer con la elegida. */
  pregunta?: { opciones: string[]; continuar: (indice: number) => Promise<Respuesta> };
}

export const LIMITES = { imagenes: 5, videos: 2, documentos: 6 };

/** Recorta al presupuesto por respuesta y dice cuántos quedaron afuera. */
export const acotarArchivos = (archivos: Archivo[]): { enviar: Archivo[]; omitidos: number } => {
  const enviar: Archivo[] = [];
  const cuenta = { image: 0, video: 0, document: 0 };
  const tope = { image: LIMITES.imagenes, video: LIMITES.videos, document: LIMITES.documentos };
  for (const a of archivos) {
    if (cuenta[a.tipo] < tope[a.tipo]) {
      enviar.push(a);
      cuenta[a.tipo] += 1;
    }
  }
  return { enviar, omitidos: archivos.length - enviar.length };
};

/** El pedido de la pregunta: por empresa si la nombran; si hay varios, `null` y que pregunten. */
export const elegirPedido = (
  vista: VistaDelDia,
  params: Parametros
): { pedido: PedidoDelDiaVista | null; candidatos: PedidoDelDiaVista[] } => {
  const candidatos = params.companyId ? vista.orders.filter((o) => o.companyId === params.companyId) : vista.orders;
  return { pedido: candidatos.length === 1 ? candidatos[0] : null, candidatos };
};

export const etiquetaPedido = (o: PedidoDelDiaVista): string =>
  `${o.hora || '—'} — ${o.cliente || o.companySlug} · ${o.obra || 'sin obra'} · ${o.cantidadCubos} m³`;

/** La unidad por placa, por número, o por orden («la última que salió», «la primera»). */
export const unidadPor = (vista: VistaDelDia, params: Parametros) => {
  const todas = vista.orders.flatMap((o) => o.units.map((u) => ({ ...u, pedido: o })));
  if (params.plate) return todas.find((u) => normalizarPlaca(u.plate) === params.plate);
  if (params.unitNumber) return todas.find((u) => u.unitNumber === params.unitNumber);
  if (params.ordinal) {
    // «Última» y «primera» son por hora de SALIDA: es lo que la gente quiere
    // saber («a qué hora salió la última»). Sin salidas, por número.
    const salidas = todas.filter((u) => u.departedAt).sort((a, b) => (a.departedAt ?? 0) - (b.departedAt ?? 0));
    const lista = salidas.length ? salidas : [...todas].sort((a, b) => a.unitNumber - b.unitNumber);
    return params.ordinal === 'ultima' ? lista[lista.length - 1] : lista[0];
  }
  return undefined;
};

/** ¿La pregunta identifica una unidad de alguna forma? */
export const identificaUnidad = (params: Parametros): boolean =>
  Boolean(params.plate || params.unitNumber || params.ordinal);

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

/**
 * Cuando falta la unidad se PREGUNTA, y la respuesta de la persona —«la 4»,
 * «AML838», «la última»— completa la pregunta original: ver `pendientes` y el
 * manejo en index.ts. José, 13/09: «le contesté 'la unidad 4' y me dijo que
 * no lo puede responder». Un humano no olvida lo que acaba de preguntar.
 */
export const PREGUNTA_UNIDAD = '¿De cuál unidad? Dime el número, la placa o «la última».';

const describeUnidad = (params: Parametros): string =>
  params.plate ? `la placa ${params.plate}` : params.unitNumber ? `la unidad ${params.unitNumber}` : params.ordinal === 'ultima' ? 'la última unidad' : 'la primera unidad';

const sinPedidos = (vista: VistaDelDia): string | null =>
  vista.orders.length === 0 ? `No tengo pedidos cargados para ${fechaLegible(vista.fecha)}. Si hay producción, todavía no está en Portal.` : null;

export interface ContextoRespuesta {
  vista: VistaDelDia;
  params: Parametros;
  /** Estado del checklist del día, si el agente lo tiene. */
  revision?: Revision | null;
  /** Informes del día, para `reports_status` y `site_finish`. */
  informes?: EstadoInforme[] | null;
  /** «Ahora», para estimaciones. */
  ahoraMs?: number;
}

/**
 * Cuándo terminaría, al ritmo de hoy: el intervalo promedio entre salidas por
 * las unidades que faltan. Es una ESTIMACIÓN y se dice como tal. Con menos de
 * dos salidas no hay ritmo, y no se inventa.
 */
export const estimarFin = (
  salidasMs: number[],
  unidadesRestantes: number,
  ahoraMs: number
): { ritmoMin: number; finMs: number } | null => {
  const s = [...salidasMs].sort((a, b) => a - b);
  if (s.length < 2 || unidadesRestantes <= 0) return null;
  const ritmoMs = (s[s.length - 1] - s[0]) / (s.length - 1);
  if (!Number.isFinite(ritmoMs) || ritmoMs <= 0) return null;
  const base = Math.max(s[s.length - 1], ahoraMs);
  return { ritmoMin: Math.round(ritmoMs / 60_000), finMs: base + ritmoMs * unidadesRestantes };
};

const ESTADO_INFORME = { completed: '✅', draft: '✏️', ninguno: '❌' } as const;
const textoInforme = (i: EstadoInforme): string =>
  `${i.status === 'completed' ? ESTADO_INFORME.completed : i.status === 'draft' ? ESTADO_INFORME.draft : ESTADO_INFORME.ninguno} ${i.label}` +
  (i.status === 'completed' ? ' (completado)' : i.status === 'draft' ? ' (borrador)' : ' (no hay)');

/**
 * LA AYUDA, por tema y un ejemplo por línea. José, 14/09: «me parece un poco
 * desordenado». Lo transversal (fechas, seguir el hilo, propuestas, apagado) va
 * al final, una vez, y no repartido entre los temas.
 */
export const AYUDA = [
  '🤖 *Lila — lo que puedes preguntarme*',
  'Escribe «@lila …» o «lila …» y pregunta con tus palabras. Por ejemplo:',
  '',
  '🚛 *Despachos y unidades*',
  '• qué pedidos hay hoy',
  '• resumen de despachos de ayer _(imagen)_',
  '• cuántos m³ van',
  '• en qué carro van en planta · qué unidad está en campo',
  '• a qué hora salió la 3 · quién maneja la 4 · cuánto falta para que llegue la 2',
  '• fotos y video de la unidad de placa AML838',
  '',
  '🏭 *Planta*',
  '• cuánto falta para terminar la producción',
  '• cuánto falta para terminar el control de pista',
  '• resumen de líquidos / galones en los tanques _(imagen)_',
  '• consumos de la producción de hoy',
  '• stock de agregados _(imagen)_',
  '',
  '📄 *Documentos*',
  '• el enlace del pedido de hoy de globofast',
  '• las guías generadas para la producción de hoy',
  '• el informe de imprimación / área adicional',
  '• cómo va el checklist',
  '',
  '🌦 *Clima*',
  '• cómo está el clima en Lurigancho',
  '• va a llover el martes en Ate',
  '• clima de la semana en Comas · clima el 20 de septiembre _(hasta 16 días)_',
  '',
  '🗂 *Clientes, proveedores e historial*',
  '• el teléfono / RUC / dirección del cliente Cobeñas',
  '• quién nos vende petróleo · datos del proveedor Julio Licas',
  '• qué le despachamos a Consorcio Los Pinos la semana pasada',
  '• cuántos pedidos tuvo Constroad en agosto',
  '• ingresos de arena en Globofast este mes _(kardex)_',
  '',
  '📅 *Fechas*: hoy, ayer, mañana, el martes, el martes pasado, 15/09, la semana pasada, en agosto.',
  '💬 *Sigue el hilo* sin volver a etiquetarme: «¿y la 3?», «¿y mañana?», «¿y en Ate?». Si hay más de una producción, te pregunto cuál: responde con el número.',
  '',
  '⚙️ *Propuestas* (aviso a planta, checklist): llegan a error tracking; mantén presionado el mensaje → *Responder* → *1* para enviarlo, *3* para descartar.',
  '🔌 `!lila off` apaga el agente (sigue escuchando, no manda nada); `!lila on` lo prende. Solo administradores.',
  '',
  'No respondo precios, pagos, deudas ni datos personales de conductores.',
].join('\n');

export const responder = (clave: ClaveConsulta | null, ctx: ContextoRespuesta): string => {
  const { vista, params } = ctx;
  const dia = fechaLegible(vista.fecha);

  if (!clave) return 'Eso no lo tengo. Puedo ayudarte con lo de planta y campo, unidades, pedidos, tanques, agregados, informes y clima — escribe «lila ayuda» para ver la lista.';
  // La ayuda no depende de que haya pedidos (14/09: un día sin producción,
  // «@lila ayuda» contestaba «no tengo pedidos cargados»).
  if (clave === 'help') return AYUDA;

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
      if (!identificaUnidad(params)) return PREGUNTA_UNIDAD;
      const u = unidadPor(vista, params);
      if (!u) return `No encuentro ${describeUnidad(params)} en los pedidos de ${dia}.`;
      if (u.state === 'despachado' && u.departedAt) return `🚚 La *unidad ${u.unitNumber}* (${u.plate || 'sin placa'}) salió a las *${hora(u.departedAt)}* con ${u.quantity} m³.`;
      if (u.state === 'progreso') return `La *unidad ${u.unitNumber}* está cargando; todavía no salió.`;
      return `La *unidad ${u.unitNumber}* todavía no salió.`;
    }

    case 'unit_driver': {
      if (!identificaUnidad(params)) return PREGUNTA_UNIDAD;
      const u = unidadPor(vista, params);
      if (!u) return `No encuentro ${describeUnidad(params)} en los pedidos de ${dia}.`;
      // Nombre y placa, nada más: teléfono y licencia no existen en la vista (spec §6.2).
      return `👤 La *unidad ${u.unitNumber}* la maneja *${u.driverName || 'sin conductor asignado'}*, placa ${u.plate || 'sin placa'}.`;
    }

    case 'unit_eta': {
      if (!identificaUnidad(params)) return PREGUNTA_UNIDAD;
      const u = unidadPor(vista, params);
      if (!u) return `No encuentro ${describeUnidad(params)} en los pedidos de ${dia}.`;
      if (u.arrivalAt) return `La *unidad ${u.unitNumber}* ya llegó a campo a las ${hora(u.arrivalAt)}.`;
      if (u.departedAt) return `La *unidad ${u.unitNumber}* salió a las ${hora(u.departedAt)}. Todavía no calculo tiempos de llegada por acá.`;
      return `La *unidad ${u.unitNumber}* todavía no salió.`;
    }

    case 'unit_media': {
      const u = unidadPor(vista, params);
      if (!identificaUnidad(params)) return PREGUNTA_UNIDAD;
      if (!u) return `No encuentro ${describeUnidad(params)} en los pedidos de ${dia}.`;
      // Los archivos los agrega quien tiene acceso a ellos (index.ts); acá solo el encabezado.
      return `📷 *Unidad ${u.unitNumber}* (${u.plate || 'sin placa'}) — ${u.pedido.cliente || u.pedido.companySlug}`;
    }

    case 'order_link':
    case 'guias_day':
    case 'tank_levels':
    case 'production_consume':
    case 'aggregates_stock':
    case 'weather':
      // Los resuelve index.ts con sus propias lecturas. Acá, solo si no hay pedidos.
      return vacio ?? '';

    case 'dispatch_summary': {
      // El resumen que el cliente ve en su enlace, pero acá, para la gente de
      // planta: cada unidad con hora, placa, chofer, m³ y estado.
      const bloques = vista.orders.map((o) => {
        const lineas = [`🚛 *${o.cliente || o.companySlug}* · ${o.obra || 'sin obra'} · ${o.m3Dispatched} de ${o.cantidadCubos} m³ · ${o.units.length} unidad(es)`];
        for (const u of o.units) {
          const estado =
            u.state === 'despachado'
              ? `✅ salió ${hora(u.departedAt)}${u.arrivalAt ? `, llegó ${hora(u.arrivalAt)}` : ''}`
              : u.state === 'progreso'
                ? '🏭 cargando'
                : '⏳ pendiente';
          lineas.push(`${u.unitNumber}. ${u.plate || 'sin placa'} · ${u.driverName || 'sin conductor'} · ${u.quantity} m³ · ${estado}`);
        }
        return lineas.join('\n');
      });
      return [`📋 *Despachos de ${dia}*`, '', ...bloques].join('\n\n');
    }

    case 'checklist_status': {
      const r = ctx.revision;
      if (!r) return `No tengo el checklist de ${dia} armado todavía.`;
      const partes = [`✅ Confirmado: ${r.resueltos.length ? r.resueltos.map((i) => i.titulo).join(', ') : 'nada aún'}.`];
      partes.push(r.pendientes.length ? `❔ Sin confirmar: ${r.pendientes.map((i) => i.titulo).join(', ')}.` : '🎉 No falta nada.');
      return [`📋 *Checklist de ${dia}*`, ...partes].join('\n');
    }

    case 'help':
      return AYUDA;

    case 'plant_finish': {
      const todas = unidades(vista);
      const total = vista.orders.reduce((s, o) => s + o.cantidadCubos, 0);
      const van = vista.orders.reduce((s, o) => s + o.m3Dispatched, 0);
      const salidas = todas.filter((u) => u.state === 'despachado' && u.departedAt).map((u) => u.departedAt as number);
      const restantes = todas.filter((u) => u.state !== 'despachado');
      if (restantes.length === 0 && van >= total) {
        const ultima = salidas.length ? hora(Math.max(...salidas)) : '—';
        return `🏭 *Planta terminó ${dia}*: ${van} m³ en ${todas.length} unidades; la última salió a las ${ultima}.`;
      }
      const est = estimarFin(salidas, restantes.length, ctx.ahoraMs ?? Date.now());
      const partes = [
        `🏭 *Planta, ${dia}*: van *${van} de ${total} m³*, faltan ${Math.max(total - van, 0)} m³ (${restantes.length} unidad(es): ${restantes.map((u) => u.unitNumber).join(', ') || '—'}).`,
      ];
      partes.push(est ? `Al ritmo de hoy (una cada ~${est.ritmoMin} min) terminaría *~${hora(est.finMs)}*.` : 'Todavía no hay ritmo para estimar cuándo termina.');
      return partes.join('\n');
    }

    case 'site_finish': {
      const todas = unidades(vista);
      const llegadas = todas.filter((u) => u.arrivalAt);
      const enRuta = todas.filter((u) => u.state === 'despachado' && !u.arrivalAt);
      const porSalir = todas.filter((u) => u.state !== 'despachado');
      const total = vista.orders.reduce((s, o) => s + o.cantidadCubos, 0);
      const colocados = llegadas.reduce((s, u) => s + u.quantity, 0);
      const partes = [
        `🛣 *Campo, ${dia}*: llegaron *${llegadas.length} unidad(es)* (${colocados} de ${total} m³); en ruta ${enRuta.length}; por salir de planta ${porSalir.length}.`,
      ];
      const est = estimarFin(llegadas.map((u) => u.arrivalAt as number), enRuta.length + porSalir.length, ctx.ahoraMs ?? Date.now());
      partes.push(est ? `Al ritmo de llegadas (una cada ~${est.ritmoMin} min) la última llegaría *~${hora(est.finMs)}*.` : 'Todavía no hay ritmo de llegadas para estimar.');
      const pista = ctx.informes?.find((i) => i.type === 'CTL-PIS');
      if (pista) partes.push(`Informe: ${textoInforme(pista)}.`);
      return partes.join('\n');
    }

    case 'reports_status': {
      const informes = ctx.informes ?? [];
      if (informes.length === 0) return `No tengo informes para ${dia}.`;
      const t = (ctx.params as Parametros & { pregunta?: string }).pregunta ?? '';
      // Si nombran informes, esos primero; después el resto que exista.
      const nombrados = informes.filter((i) => TIPOS_ALIAS[i.type]?.some((a) => t.includes(a)));
      const resto = informes.filter((i) => !nombrados.includes(i) && i.status !== null);
      const lineas = [...nombrados, ...resto].map(textoInforme);
      if (lineas.length === 0) return `📑 *Informes de ${dia}*: todavía no hay ninguno generado.`;
      return [`📑 *Informes de ${dia}*`, ...lineas.map((l) => `• ${l}`)].join('\n');
    }
  }
};

const TIPOS_ALIAS: Record<string, string[]> = {
  IPP: ['ipp', 'produccion de planta'],
  'CTL-PIS': ['control de pista', 'pista'],
  'CTL-IMP': ['imprimacion'],
  'SOL-IMP': ['solicitud'],
  IAA: ['area adicional', 'adicional'],
  'APR-ADI': ['aprobacion'],
  'ACT-CNF': ['acta', 'conformidad'],
  'RCP-CAM': ['recepcion'],
};
