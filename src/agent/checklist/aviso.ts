import type { ChecklistDomain, Revision } from './checklist.js';
import { fechaLegible } from './tiempo.js';

/**
 * El texto del aviso que va al grupo de operaciones.
 *
 * LO LEE UNA PERSONA EN EL CELULAR, y eso decide todo lo de abajo. La primera
 * versión (12/09/2026) decía «[ESPEJO]», «globofas-s8k», un JID de veinte
 * dígitos convertido en link, y un pie de dos renglones explicando qué era el
 * modo espejo. José: «no me dice mucho, no está formateado, todo desordenado».
 * Tenía razón: era un volcado de estado, no un mensaje.
 *
 * Qué tiene que responder, en este orden y de un vistazo:
 *   1. de quién y cuándo es la producción («Globofast, domingo 04:00, 91 m³»);
 *   2. qué falta, en palabras de obra, y desde cuándo está vencido;
 *   3. qué haría el agente con eso.
 *
 * Formato de WhatsApp: `*negrita*` y `_cursiva_`. Sin identificadores del
 * sistema — ni slugs, ni JIDs, ni nombres de fase. El nombre de la empresa y el
 * del grupo llegan resueltos; acá no se traduce nada.
 *
 * MODO ESPEJO (fase 1): todo esto sale al grupo de error-tracking, NUNCA al grupo
 * que escucha. Un agente que se equivoca delante de la gente que trabaja pierde
 * la confianza y lo silencian. Primero se mide cuántas veces habría acertado;
 * después se le da voz. Por eso el aviso cierra diciendo qué HABRÍA hecho.
 */

const duracion = (minutos: number): string => {
  const abs = Math.abs(minutos);
  if (abs < 60) return `${abs} min`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};



/**
 * `null` cuando no hay nada vencido: **el silencio es la respuesta correcta**.
 * Un agente que avisa «todo en orden» tres veces al día enseña a ignorarlo.
 */
export interface ContextoRevision {
  fecha: string;
  /** Primer arranque del día, para decir «arranca en…». */
  minutosParaArranque: number;
  /** Las empresas que producen ese día, para el encabezado. */
  pedidos: PedidoParaAviso[];
  totalCubos: number;
  momento: 'inicial' | 'recordatorio' | 'ultima-llamada';
  grupoEscuchado: string;
}

const ENCABEZADO: Record<ContextoRevision['momento'], string> = {
  inicial: '📋 *Checklist de producción*',
  recordatorio: '⏰ *Recordatorio — sigue sin confirmar*',
  'ultima-llamada': '🚨 *Última llamada — falta lo crítico*',
};

/**
 * La revisión del checklist para el grupo de admin, agrupada por quién la
 * revisa. `null` cuando no hay nada pendiente: **el silencio es la respuesta
 * correcta**.
 */
export const construirAvisoChecklist = (
  revision: Revision,
  contexto: ContextoRevision
): string | null => {
  if (revision.pendientes.length === 0) return null;

  const faltan = contexto.minutosParaArranque;
  const cuando = faltan >= 0 ? `Arranca en ${duracion(faltan)}` : `Arrancó hace ${duracion(faltan)}`;
  const quienes = contexto.pedidos.map((p) => `${p.hora} ${p.empresa} ${p.cubos} m³`).join(' · ');

  const lineas = [
    `${ENCABEZADO[contexto.momento]} — ${fechaLegible(contexto.fecha)}`,
    quienes + (contexto.pedidos.length > 1 ? ` · total ${contexto.totalCubos} m³` : ''),
    cuando,
  ];

  // Por dominio, porque lo lee gente distinta: planta primero, campo después.
  const TITULO: Record<ChecklistDomain, string> = { planta: 'Planta', obra: 'Campo' };
  for (const dominio of ['planta', 'obra'] as ChecklistDomain[]) {
    const pendientes = revision.pendientes.filter((i) => i.domain === dominio);
    if (pendientes.length === 0) continue;
    lineas.push('', `*${TITULO[dominio]}* — sin confirmar:`);
    lineas.push(...pendientes.map((i) => `• ${i.pregunta}`));
  }

  if (revision.resueltos.length > 0) {
    lineas.push('', `Ya confirmado: ${revision.resueltos.map((r) => r.titulo).join(', ')} ✔`);
  }

  return lineas.join('\n');
};

export interface PedidoParaAviso {
  empresa: string;
  hora: string;
  cubos: number;
  cliente?: string;
}

/**
 * EL AVISO A PLANTA, POR DÍA: que hay producción, de quiénes, a qué horas y
 * cuánto en total. Es el hecho que faltó el 07/09 y va al grupo de planta.
 *
 * Con dos empresas el mismo día —Globofast a las 04:00, Constroad a las 07:00—
 * la planta recibe UN mensaje con las dos y el total, no dos sueltos (José,
 * 13/09/2026). Si el día cambia después, sale como ACTUALIZACIÓN diciendo qué
 * cambió, no como un aviso nuevo que parezca otro día.
 */
export const construirAvisoProduccion = (
  dia: { fecha: string; pedidos: PedidoParaAviso[]; totalCubos: number },
  opciones: { actualizacion?: string } = {}
): string => {
  const titulo = opciones.actualizacion
    ? `🔁 *Producción de ${fechaLegible(dia.fecha)} — actualización*`
    : `📢 *Producción programada — ${fechaLegible(dia.fecha)}*`;
  const lineas = [titulo];
  if (opciones.actualizacion) lineas.push(opciones.actualizacion);
  lineas.push('');
  for (const p of dia.pedidos) {
    lineas.push(
      `• ${p.hora} — *${p.empresa}*${p.cliente ? ` (${p.cliente})` : ''} · ${p.cubos} m³`
    );
  }
  if (dia.pedidos.length > 1) lineas.push('', `Total del día: *${dia.totalCubos} m³*`);
  lineas.push('', 'Por favor confirmar que planta está enterada y coordinada.');
  return lineas.join('\n');
};

/**
 * Qué cambió entre dos versiones del día, en palabras: «se suma Constroad
 * 45 m³ a las 07:00», «se cae Globofast», «Globofast pasa de 04:00 a 05:00».
 */
export const describirCambio = (
  antes: PedidoParaAviso[] & { id?: string }[],
  ahora: PedidoParaAviso[] & { id?: string }[]
): string => {
  const porId = (lista: Array<PedidoParaAviso & { id?: string }>) =>
    new Map(lista.map((p) => [p.id ?? `${p.empresa}|${p.hora}`, p]));
  const a = porId(antes);
  const b = porId(ahora);
  const frases: string[] = [];
  for (const [id, p] of b) {
    const previo = a.get(id);
    if (!previo) frases.push(`se suma *${p.empresa}* ${p.cubos} m³ a las ${p.hora}`);
    else if (previo.hora !== p.hora) frases.push(`*${p.empresa}* pasa de ${previo.hora} a ${p.hora}`);
    else if (previo.cubos !== p.cubos) frases.push(`*${p.empresa}* pasa de ${previo.cubos} a ${p.cubos} m³`);
  }
  for (const [id, p] of a) if (!b.has(id)) frases.push(`se cae *${p.empresa}* (${p.hora})`);
  return frases.length ? `Cambio: ${frases.join('; ')}.` : '';
};

/**
 * Cómo se ve una propuesta en el grupo de operaciones: el mensaje tal cual
 * saldría, y arriba a dónde iría y cómo se aprueba. La persona ve EXACTAMENTE
 * lo que se va a mandar; nada se reescribe entre el «1» y el envío.
 */
export const conPiePropuesta = (texto: string, nombreDestino: string): string =>
  [
    `📨 *Propuesta para «${nombreDestino}»*`,
    'Para mandarlo: mantené presionado este mensaje → *Responder* → *1*',
    'Para descartar: igual, con *3*',
    '',
    texto,
  ].join('\n');

/**
 * LA FIRMA DEL AVISO, para no repetirlo.
 *
 * NO es el hash del texto. El texto lleva «arranca en 11 h 20 min», que cambia
 * cada minuto, así que dos avisos iguales nunca eran «iguales»: el 12/09 salió
 * el mismo aviso a las 16:20 y a las 16:40, y habría seguido cada 20 minutos
 * hasta agotar el tope diario. Lo que define un aviso es QUÉ falta para QUÉ
 * pedido; solo cuando eso cambia —vence otro ítem, o se confirma uno— hay algo
 * nuevo que decir.
 */
export const firmaAviso = (
  fecha: string,
  momento: ContextoRevision['momento'],
  revision: Revision
): string =>
  `${fecha}|${momento}|${revision.pendientes
    .map((i) => i.id)
    .sort()
    .join(',')}`;
