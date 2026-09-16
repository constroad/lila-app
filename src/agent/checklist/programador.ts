/**
 * EL PROGRAMADOR DE AVISOS A PLANTA (spec §14): cablea la agenda.
 *
 *   mensaje del grupo ──► intérprete (modelo; reglas de respaldo) ──► hechos
 *   pedidos de Portal ──────────────────────────────────────────► hechos
 *   hechos ──► agenda (pura) ──► efectos ──► confirmación en INFRAMAQ admin
 *   cada minuto ──► lo que toca mandar ──► planta (aviso / actualización)
 *
 * Todo lo que decide está en `agenda.ts` (puro, con tests); acá hay IO:
 * Mongo, WhatsApp, el modelo, el reloj.
 */
import logger from '../../utils/logger.js';
import { AGENTE_ACTIVO, type AlcanceAgente } from './alcance.js';
import { enviarAOperaciones, mandarA, responderEnGrupo } from './emisor.js';
import { agenteApagado } from './interruptor.js';
import { cargarAvisos, guardarAviso } from './persistencia.js';
import { construirAvisoProduccion, describirCambio, horaMenos, MINUTOS_REUNION_ANTES } from './aviso.js';
import { diaPeruano, fechaLegible } from './tiempo.js';
import type { MensajeGrupo } from './mensajes.js';
import type { PedidoDelDia } from './dia.js';
import { aplicar, esUltimoMomento, pendientesDeEnvio, type AvisoProgramado, type Efecto, type Hecho, type Produccion } from './agenda.js';
import { interpretarAnuncio, type Anuncio } from '../llm/anuncios.js';
import { mencionesDe } from './menciones.js';
import { alias as aliasDeAutor } from './autores.js';

let agenda: AvisoProgramado[] = [];
let cargada = false;

/** Al arrancar: la agenda vuelve de Mongo (avisos de hoy en adelante, y los de ayer por si hay que actualizar). */
export const hidratarAgenda = async (ahoraMs = Date.now()): Promise<number> => {
  const desde = diaPeruano(ahoraMs - 24 * 3_600_000);
  agenda = await cargarAvisos(desde);
  cargada = true;
  return agenda.length;
};

/** Solo para tests. */
export const _agenda = (): AvisoProgramado[] => agenda;
export const _resetAgenda = (): void => {
  agenda = [];
  cargada = true;
};

const persistir = (tocados: AvisoProgramado[]): void => {
  for (const a of tocados) void guardarAviso(a);
};

const tocadosDe = (efectos: Efecto[]): AvisoProgramado[] => {
  const set = new Set<AvisoProgramado>();
  for (const e of efectos) {
    if ('aviso' in e) set.add(e.aviso);
    if (e.tipo === 'movido') {
      set.add(e.desde);
      set.add(e.hasta);
    }
    if (e.tipo === 'posible-movimiento') set.add(e.otro);
  }
  return [...set];
};

const aplicarHechos = (hechos: Hecho[], ahoraMs: number): Efecto[] => {
  const efectos: Efecto[] = [];
  for (const h of hechos) {
    const r = aplicar(agenda, h, ahoraMs);
    agenda = r.agenda;
    efectos.push(...r.efectos);
  }
  persistir(tocadosDe(efectos));
  return efectos;
};

// ─── El texto que sale a planta ────────────────────────────────────────────

/** Las líneas del aviso; `id` (empresa|cliente) es con lo que `describirCambio` empareja antes y después. */
const comoPedidos = (a: AvisoProgramado) =>
  a.producciones.map((p) => ({ id: `${p.empresa}|${p.cliente ?? ''}`, empresa: p.empresa || 'por confirmar', hora: p.hora ?? 'hora por confirmar', cubos: p.cubos ?? 0, cliente: p.cliente }));

export const textoParaPlanta = (a: AvisoProgramado): string => {
  const pedidos = comoPedidos(a);
  const total = pedidos.reduce((s, p) => s + p.cubos, 0);
  const cambio = a.estado === 'enviada' && a.enviadoComo ? describirCambio(JSON.parse(a.enviadoComo) as never, pedidos as never) || 'Actualización.' : undefined;
  const base = construirAvisoProduccion({ fecha: a.fecha, pedidos, totalCubos: total }, { actualizacion: cambio });
  return a.estado === 'programada' && esUltimoMomento(a) ? `⚠️ *Aviso de último momento*\n${base}` : base;
};

/** Lo que se compara para saber si una actualización cambia algo: las líneas, no la hora del envío. */
const firmaEnviada = (a: AvisoProgramado): string => JSON.stringify(comoPedidos(a));

// ─── La confirmación en INFRAMAQ admin ─────────────────────────────────────

const lineaProduccion = (p: Produccion, fecha: string): string => {
  const reunion = p.hora ? horaMenos(p.hora, MINUTOS_REUNION_ANTES) : '';
  return `• ${fechaLegible(fecha)} · ${p.hora ?? 'hora por confirmar'} ${p.empresa || 'empresa por confirmar'}${p.cliente ? ` (${p.cliente})` : ''} · ${p.cubos ? `${p.cubos} m³` : 'm³ por confirmar'}${reunion ? ` · reunión ${reunion}` : ''}`;
};

const cuandoSale = (a: AvisoProgramado, ahoraMs: number): string => {
  if (a.estado === 'enviada') return 'ya salió; mando la actualización ahora';
  if (a.envioMs <= ahoraMs + 60_000) return 'sale ahora (último momento)';
  const d = new Date(a.envioMs);
  const hora = d.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });
  return `para el ${fechaLegible(diaPeruano(a.envioMs))} a las ${hora}`;
};

export const textoConfirmacion = (efectos: Efecto[], nombrePlanta: string, ahoraMs: number, faltanEnPortal: (a: AvisoProgramado) => Produccion[]): string | null => {
  const lineas: string[] = [];
  const pendientesPortal = new Set<string>();
  for (const e of efectos) {
    if (e.tipo === 'sin-cambio') continue;
    if (e.tipo === 'programado') lineas.push(`✅ Programé el aviso a «${nombrePlanta}» ${cuandoSale(e.aviso, ahoraMs)}:`, lineaProduccion(e.produccion, e.aviso.fecha));
    if (e.tipo === 'sumado') lineas.push(`✅ Sumé al aviso de ${fechaLegible(e.aviso.fecha)} (${cuandoSale(e.aviso, ahoraMs)}):`, lineaProduccion(e.produccion, e.aviso.fecha));
    if (e.tipo === 'actualizado') lineas.push(`🔁 Actualicé el aviso de ${fechaLegible(e.aviso.fecha)} (${cuandoSale(e.aviso, ahoraMs)}):`, lineaProduccion(e.produccion, e.aviso.fecha));
    if (e.tipo === 'movido') lineas.push(`🔁 Moví la producción de ${e.produccion.empresa} del ${fechaLegible(e.desde.fecha)} al ${fechaLegible(e.hasta.fecha)} (aviso ${cuandoSale(e.hasta, ahoraMs)})${e.desde.estado === 'cancelada' && e.desde.msgIdPlanta ? '; a planta le aviso que el ' + fechaLegible(e.desde.fecha) + ' ya no va' : ''}.`);
    if (e.tipo === 'cancelado') lineas.push(e.produccion ? `❌ Quité a ${e.produccion.empresa} del aviso de ${fechaLegible(e.aviso.fecha)}.` : `❌ Cancelé el aviso de ${fechaLegible(e.aviso.fecha)}${e.aviso.msgIdPlanta ? '; a planta le aviso que ya no va' : ''}.`);
    if (e.tipo === 'posible-movimiento') lineas.push(`⚠️ Ojo: ${e.produccion.empresa} también está programado el ${fechaLegible(e.otro.fecha)}${e.produccion.cubos ? ` (${e.produccion.cubos} m³)` : ''}. Si se movió, responde a este mensaje con *se movió*; si son dos producciones, no hagas nada.`);
    if ('aviso' in e && e.tipo !== 'cancelado') for (const p of faltanEnPortal(e.aviso)) pendientesPortal.add(`${p.empresa} (${fechaLegible(e.aviso.fecha)})`);
    if (e.tipo === 'movido') for (const p of faltanEnPortal(e.hasta)) pendientesPortal.add(`${p.empresa} (${fechaLegible(e.hasta.fecha)})`);
  }
  if (!lineas.length) return null;
  if (pendientesPortal.size) lineas.push(`No olviden crear el pedido en Portal: ${[...pendientesPortal].join(', ')}.`);
  else if (efectos.some((e) => e.tipo === 'programado' || e.tipo === 'sumado')) lineas.push('El pedido ya está en Portal ✓.');
  lineas.push('_(Responde 3 a este mensaje si no va.)_');
  return lineas.join('\n');
};

const sinPedidoEnPortal = (a: AvisoProgramado): Produccion[] => a.producciones.filter((p) => !p.pedidoId);

// ─── Entrada 1: un mensaje del grupo ───────────────────────────────────────

const hechosDeAnuncio = (anuncio: Anuncio, m: MensajeGrupo): Hecho[] => {
  const hechos: Hecho[] = [];
  for (const p of anuncio.producciones) {
    if (!p.fecha) continue;
    const produccion: Produccion = { companyId: p.companyId ?? '', empresa: p.empresa, cliente: p.cliente, hora: p.hora, cubos: p.cubos, fuente: 'chat', ts: m.ts, autor: m.autor };
    if (anuncio.accion === 'cancelar') hechos.push({ accion: 'cancelar', fecha: p.fecha, companyId: p.companyId, cliente: p.cliente, ts: m.ts });
    else hechos.push({ accion: 'programar', fecha: p.fecha, produccion, desdeFecha: anuncio.accion === 'mover' ? anuncio.desdeFecha : undefined });
  }
  return hechos;
};

/** Sin modelo: el lector por reglas solo sabe programar. */
const anuncioPorReglas = (m: MensajeGrupo): Anuncio => ({
  accion: 'programar',
  producciones: mencionesDe(m)
    .filter((x) => x.fechaConocida && x.desde === x.hasta)
    .map((x) => ({ companyId: x.companyId, empresa: x.companyId === 'globofas-s8k' ? 'Globofast Solkali' : x.companyId === 'constroad' ? 'ConstRoad' : '', cliente: x.cliente, fecha: x.desde, hora: x.hora, cubos: x.cubos })),
});

/**
 * Un mensaje del grupo escuchado que puede ser un anuncio. Best-effort y
 * fire-and-forget desde el observador: nunca bloquea la escucha.
 */
export const atenderPosibleAnuncio = async (m: MensajeGrupo, alcance: AlcanceAgente, ahoraMs = Date.now()): Promise<void> => {
  if (!AGENTE_ACTIVO || agenteApagado() || m.esPropio) return;
  if (!cargada) await hidratarAgenda(ahoraMs);
  // Barato antes que caro: sin una palabra de producción ni una fecha, no se molesta al modelo.
  if (!/\b(produccion|producción|producciones|pedido|pedidos|despacho|despachos|asfalt|m3|m³|cubos|se suspende|se cancela|se mueve|se pasa|reprogram|ya no)\b/i.test(m.texto)) return;
  const autor = aliasDeAutor(m.autor);
  const anuncio = (await interpretarAnuncio(m.texto, m.ts, autor ?? undefined)) ?? anuncioPorReglas(m);
  if (anuncio.accion === 'ninguna' || !anuncio.producciones.length) return;
  const sinFecha = anuncio.producciones.filter((p) => !p.fecha);
  const hechos = hechosDeAnuncio(anuncio, m);
  const efectos = aplicarHechos(hechos, ahoraMs);
  const texto = textoConfirmacion(efectos, alcance.nombreGrupoPlanta || 'planta', ahoraMs, sinPedidoEnPortal);
  const avisos: string[] = [];
  if (sinFecha.length) avisos.push('¿Para qué día es? Sin fecha no programo el aviso a planta. Y no olviden crear el pedido en Portal.');
  if (!alcance.grupoPlanta && efectos.some((e) => e.tipo !== 'sin-cambio')) avisos.push('(No tengo resuelto el grupo de planta: el aviso quedó programado pero no va a poder salir.)');
  const mensaje = [texto, ...avisos].filter(Boolean).join('\n');
  if (!mensaje) return;
  logger.info(`[agente] anuncio de ${m.autor}: ${efectos.map((e) => e.tipo).join(',') || 'nada'} ← «${m.texto.slice(0, 60)}»`);
  const msgId = await responderEnGrupo(alcance.grupoEscuchado, { texto: mensaje }, alcance, m.autor, { devolverId: true });
  if (typeof msgId === 'string') {
    for (const a of tocadosDe(efectos)) {
      a.confirmaciones = [...(a.confirmaciones ?? []), msgId].slice(-10);
      void guardarAviso(a);
    }
  }
  // Lo que ya toca (último momento) sale sin esperar al tick.
  await enviarPendientes(alcance, ahoraMs);
};

/** «3» citando una confirmación: cancela ese aviso. «se movió» citándola: mueve. */
export const atenderRespuestaAConfirmacion = async (texto: string, citaMsgId: string, alcance: AlcanceAgente, ahoraMs = Date.now()): Promise<boolean> => {
  if (!citaMsgId) return false;
  const aviso = agenda.find((a) => (a.confirmaciones ?? []).includes(citaMsgId) && a.estado !== 'cancelada');
  if (!aviso) return false;
  const t = texto.trim().toLowerCase();
  if (t === '3') {
    const efectos = aplicarHechos([{ accion: 'cancelar', fecha: aviso.fecha, ts: ahoraMs }], ahoraMs);
    await responderEnGrupo(alcance.grupoEscuchado, { texto: `🗑 Cancelado el aviso de ${fechaLegible(aviso.fecha)}${aviso.msgIdPlanta ? '; a planta le aviso que ya no va' : ''}.` }, alcance);
    await enviarCancelaciones(efectos, alcance);
    return true;
  }
  if (/se movi[oó]/.test(t)) {
    // La producción sospechosa: la del aviso más nuevo con el mismo autor de la cita. Se cancela la del otro día.
    const otros = agenda.filter((o) => o.id !== aviso.id && o.estado !== 'cancelada' && o.producciones.some((p) => aviso.producciones.some((q) => q.companyId === p.companyId)));
    const hechos: Hecho[] = otros.map((o) => ({ accion: 'cancelar', fecha: o.fecha, companyId: aviso.producciones[0]?.companyId, ts: ahoraMs }));
    const efectos = aplicarHechos(hechos, ahoraMs);
    await responderEnGrupo(alcance.grupoEscuchado, { texto: `🔁 Listo: queda solo el ${fechaLegible(aviso.fecha)}.` }, alcance);
    await enviarCancelaciones(efectos, alcance);
    return true;
  }
  return false;
};

// ─── Entrada 2: los pedidos de Portal ──────────────────────────────────────

/** En cada pasada del detector: los pedidos con hora entran a la agenda (Portal manda); los que desaparecieron, se cancelan. */
export const sincronizarConPortal = async (pedidos: PedidoDelDia[], alcance: AlcanceAgente, ahoraMs = Date.now()): Promise<void> => {
  if (!cargada) await hidratarAgenda(ahoraMs);
  const hechos: Hecho[] = pedidos.map((p) => ({
    accion: 'programar',
    fecha: diaPeruano(p.arranqueMs),
    produccion: { companyId: p.companyId, empresa: p.empresa, cliente: p.cliente || undefined, hora: p.hora, cubos: p.cubos, fuente: 'portal', pedidoId: p.id, ts: ahoraMs },
  }));
  const ids = new Set(pedidos.map((p) => p.id));
  for (const a of agenda) {
    if (a.estado === 'cancelada' || a.fecha < diaPeruano(ahoraMs)) continue;
    // Solo lo que Portal tenía dentro de la ventana que mira el detector (2 días): fuera de ella no se sabe.
    for (const p of a.producciones) {
      if (p.pedidoId && !ids.has(p.pedidoId) && a.fecha <= diaPeruano(ahoraMs + 47 * 3_600_000)) {
        hechos.push({ accion: 'cancelar', fecha: a.fecha, companyId: p.companyId, cliente: p.cliente, ts: ahoraMs });
      }
    }
  }
  const efectos = aplicarHechos(hechos, ahoraMs);
  const relevantes = efectos.filter((e) => e.tipo !== 'sin-cambio' && e.tipo !== 'posible-movimiento');
  if (relevantes.length) {
    const texto = textoConfirmacion(relevantes, alcance.nombreGrupoPlanta || 'planta', ahoraMs, sinPedidoEnPortal);
    if (texto) await responderEnGrupo(alcance.grupoEscuchado, { texto: `📋 Desde Portal:\n${texto}` }, alcance);
    await enviarCancelaciones(efectos, alcance);
  }
  await enviarPendientes(alcance, ahoraMs);
};

// ─── Salida: a planta ──────────────────────────────────────────────────────

const enviarCancelaciones = async (efectos: Efecto[], alcance: AlcanceAgente): Promise<void> => {
  if (!alcance.grupoPlanta) return;
  for (const e of efectos) {
    if (e.tipo === 'cancelado' && e.aviso.msgIdPlanta) {
      const texto = e.produccion ? `❌ *${e.produccion.empresa}* ya no produce el ${fechaLegible(e.aviso.fecha)}.` : `❌ *Producción del ${fechaLegible(e.aviso.fecha)} cancelada.*`;
      await mandarA(alcance.grupoPlanta, texto);
    }
    if (e.tipo === 'movido' && e.desde.msgIdPlanta) {
      await mandarA(alcance.grupoPlanta, `🔁 *${e.produccion.empresa}* se pasa del ${fechaLegible(e.desde.fecha)} al ${fechaLegible(e.hasta.fecha)}.`);
    }
  }
};

/** Cada minuto (y tras cada anuncio): lo que toca, sale. */
export const enviarPendientes = async (alcance: AlcanceAgente, ahoraMs = Date.now()): Promise<number> => {
  if (!AGENTE_ACTIVO || agenteApagado() || !alcance.grupoPlanta) return 0;
  if (!cargada) await hidratarAgenda(ahoraMs);
  let enviados = 0;
  for (const a of pendientesDeEnvio(agenda, ahoraMs, firmaEnviada)) {
    const texto = textoParaPlanta(a);
    const msgId = await mandarA(alcance.grupoPlanta, texto);
    const era = a.estado;
    a.estado = 'enviada';
    a.enviadoComo = firmaEnviada(a);
    a.textoPublicado = texto;
    if (msgId) a.msgIdPlanta = msgId;
    a.actualizadoMs = ahoraMs;
    void guardarAviso(a);
    enviados += 1;
    logger.info(`[agente] aviso ${a.id} (${a.fecha}) ${era === 'enviada' ? 'actualizado' : 'enviado'} a «${alcance.nombreGrupoPlanta}»${msgId ? '' : ' (encolado)'}`);
    // Salió a planta y el pedido sigue sin existir: se dice UNA vez en admin.
    const sinPedido = sinPedidoEnPortal(a);
    if (sinPedido.length && !a.recordadoSinPedido) {
      a.recordadoSinPedido = true;
      void guardarAviso(a);
      await enviarAOperacionesOAdmin(alcance, `📨 Mandé el aviso del ${fechaLegible(a.fecha)} a «${alcance.nombreGrupoPlanta}». El pedido de ${sinPedido.map((p) => p.empresa).join(', ')} sigue sin crearse en Portal.`);
    }
  }
  return enviados;
};

const enviarAOperacionesOAdmin = async (alcance: AlcanceAgente, texto: string): Promise<void> => {
  if (alcance.grupoEscuchado) await responderEnGrupo(alcance.grupoEscuchado, { texto }, alcance);
  else await enviarAOperaciones(texto);
};

/** «@lila manda el aviso a planta (de mañana)»: fuerza el envío del día, ya. */
export const forzarEnvio = async (fecha: string, alcance: AlcanceAgente, ahoraMs = Date.now()): Promise<string> => {
  if (!cargada) await hidratarAgenda(ahoraMs);
  const a = agenda.find((x) => x.fecha === fecha && x.estado !== 'cancelada');
  if (!a) return `No tengo nada programado para el ${fechaLegible(fecha)}: sin pedido ni anuncio no hay aviso que mandar.`;
  if (a.estado === 'enviada' && firmaEnviada(a) === a.enviadoComo) return `Ese aviso ya salió a «${alcance.nombreGrupoPlanta}». Si cambió algo, dime qué.`;
  a.envioMs = ahoraMs;
  const n = await enviarPendientes(alcance, ahoraMs);
  return n ? '' : 'No pude mandarlo ahora; lo vuelvo a intentar en un minuto.';
};

export const startProgramadorTicker = (alcanceDe: () => Promise<AlcanceAgente>, intervalMs = 60_000): (() => void) => {
  const timer = setInterval(() => {
    void alcanceDe()
      .then((alcance) => enviarPendientes(alcance))
      .catch((error) => logger.warn(`[agente] el tick de avisos falló: ${error instanceof Error ? error.message : String(error)}`));
  }, intervalMs);
  logger.info(`[agente] programador de avisos a planta: tick cada ${intervalMs / 1000} s`);
  return () => clearInterval(timer);
};
