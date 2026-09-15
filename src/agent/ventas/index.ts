import logger from '../../utils/logger.js';
import type { AgentInboundMessage, ReplyInput } from '../runtime/agent.types.js';
import {
  cargarConversacion,
  conversacionDeCliente,
  guardarLeadEnConversacion,
  guardarMensajeDueno,
  pausarConversacion,
  reanudarConversacion,
  sumarTokens,
  ultimosMensajes,
} from '../runtime/conversation.store.js';
import { crearProveedorAnthropic } from './anthropic.provider.js';
import { crearProveedorOpenAiCompat } from './openai-compat.provider.js';
import { crearProveedorQwen } from './qwen.provider.js';
import { modeloDescargado } from '../llm/modelo.js';
import { extraerConQwen } from './extraccion.js';
import { leadDe, paraGuardar, paso, validarExtraccion, type EstadoGuiado } from './guiado.js';
import { guionDe } from './guion.asfalto.js';
import { clientePorTelefono } from './cliente.js';
import { HERRAMIENTAS_VENTAS, type DatosLead } from './herramientas.js';
import type { ProveedorLlm } from './llm.types.js';
import { bloquesSistema, type NegocioAsfalto } from './prompt.asfalto.js';
import { enHorarioSegun, negocioDe, perfilDe, type HorarioAtencion } from '../dali/asistente.js';
import { correrTurno, historialATurnos } from './runtime.js';

/**
 * EL AGENTE DE VENTAS —DALI— (WHATSAPP-AGENT-VERTICALS F2+F3), vertical asfalto,
 * primero para CONSTROAD. José, 14/09/2026: «construyamos el agente vertical
 * que va a atender primero a constroad los mensajes que lleguen de publicidad
 * o de gente que ya es mi cliente, y luego escalaremos».
 *
 * AISLADO del agente de operaciones (`checklist/`, `consultas/`, `llm/`): no
 * comparte código con él. Lo que usa del runtime F1 es la persistencia y el
 * router de entrantes, que nacieron para esto.
 *
 * Cómo se apaga: `WHATSAPP_AGENT_ENABLED` (env, ya existía) y
 * `bot_configs.enabled` por empresa; y la allowlist `testNumbers` mientras se
 * prueba. Cómo lo toma una persona: escribiendo desde el WhatsApp del negocio
 * en esa conversación (el bot calla `handoffPauseMinutes`), o `!bot off`.
 */

const PAUSA_POR_DEFECTO_MIN = 30;
/** Ráfagas: se espera un momento y se contesta a todo lo que llegó junto. */
const ESPERA_RAFAGA_MS = 3_000;

/**
 * El proveedor lo decide qué hay: `ANTHROPIC_API_KEY` (Haiku 4.5, la opción
 * v1 del spec); si no, `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` (Groq,
 * DeepSeek, OpenRouter); si no, **Qwen local**, el mismo modelo del agente de
 * operaciones (José, 14/09: «hagámoslo con Qwen, que ya lo tenemos»). Sin
 * ninguno, el agente no contesta y lo dice una vez en el log.
 */
let proveedor: ProveedorLlm | null | undefined;
export const proveedorLlm = (): ProveedorLlm | null => {
  if (proveedor === undefined) {
    proveedor = crearProveedorAnthropic();
    const baseUrl = String(process.env.LLM_BASE_URL || '').trim();
    const apiKey = String(process.env.LLM_API_KEY || '').trim();
    const modelo = String(process.env.LLM_MODEL || '').trim();
    if (!proveedor && baseUrl && apiKey && modelo) proveedor = crearProveedorOpenAiCompat({ baseUrl, apiKey, modelo });
    if (!proveedor && modeloDescargado()) proveedor = crearProveedorQwen();
    if (!proveedor) logger.warn('[dali] sin clave de LLM ni modelo local: el agente de ventas no contesta');
    else logger.info(`[dali] proveedor de LLM: ${proveedor.nombre}`);
  }
  return proveedor;
};

/** La hora de Lima en texto y si el negocio está abierto según su horario (A6). */
const ahoraLima = (horario: HorarioAtencion): { texto: string; enHorario: boolean; abiertoTexto: string } => {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(ahora);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const dow = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Lima' })).getDay();
  const enHorario = enHorarioSegun(horario, dow, Number(get('hour')), Number(get('minute')));
  return { texto: `${get('weekday')} ${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`, enHorario, abiertoTexto: enHorario ? 'abierto ahora' : 'cerrado ahora' };
};

// Una conversación a la vez por cliente: las respuestas salen en orden.
const colas = new Map<string, Promise<unknown>>();
const enCola = <T>(clave: string, tarea: () => Promise<T>): Promise<T> => {
  const anterior = colas.get(clave) ?? Promise.resolve();
  const turno = anterior.then(tarea, tarea);
  colas.set(clave, turno.catch(() => undefined));
  return turno;
};

const telefonoLegible = (t: string): string => `+${t.replace(/(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4')}`;

/** Lo que sabe el bot del lead, más los detalles del guion (espesor, base, imprimación…) cuando los hay. */
type LeadParaAviso = DatosLead & { campos?: Array<[string, string]> };

const textoLead = (lead: LeadParaAviso, telefono: string, negocio: NegocioAsfalto, nombreCliente?: string): string => {
  const NOMBRES: Record<string, string> = { venta: 'Venta de mezcla', colocacion: 'Colocación / asfaltado', transporte: 'Transporte', fabricacion: 'Fabricación (derivar a ingeniero)', otro: 'Otro' };
  const servicio = NOMBRES[lead.servicio ?? 'otro'] ?? lead.servicio;
  return [
    `🧲 *${lead.listo ? 'Lead listo para cotizar' : 'Nuevo lead'} — ${negocio.nombre}*`,
    `👤 ${lead.nombre || nombreCliente || 'sin nombre'}${lead.empresa ? ` · ${lead.empresa}` : ''} · ${telefonoLegible(telefono)}`,
    `🏗 ${servicio}${lead.detalle ? ` — ${lead.detalle}` : ''}`,
    [lead.cantidad ? `📐 ${lead.cantidad}` : '', lead.distrito ? `📍 ${lead.distrito}` : '', lead.fecha ? `📅 ${lead.fecha}` : ''].filter(Boolean).join(' · '),
    lead.campos?.length ? `🧾 ${lead.campos.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`).join(' · ')}` : '',
    `Para tomarlo, responde al cliente desde el WhatsApp de ${negocio.nombre}: el bot se calla 30 min en esa conversación.`,
  ]
    .filter(Boolean)
    .join('\n');
};

export interface DepsVentas {
  notificar(target: string, texto: string): Promise<void>;
}

/** A quién avisar de qué: lo elegido en A6 («Avisos»), o todo si no se eligió. */
const avisaDe = (botConfig: ReplyInput['botConfig'], caso: 'leadNuevo' | 'pideUrgente' | 'fallo'): string | null =>
  botConfig.ownerNotifyTarget && (botConfig.notifyOn?.[caso] ?? true) ? String(botConfig.ownerNotifyTarget) : null;

/**
 * La respuesta del agente a un mensaje entrante ya persistido. `null` = callar
 * (una persona tiene la conversación).
 */
export const responderVentas = async (input: ReplyInput, deps: DepsVentas): Promise<string | null> => {
  const { companyId, conversationId, botConfig, message, customerPhone } = input;
  const llm = proveedorLlm();
  if (!llm) return null;
  return enCola(conversationId, async () => {
    await new Promise((r) => setTimeout(r, ESPERA_RAFAGA_MS));
    const conversacion = await cargarConversacion(conversationId);
    if (!conversacion) return null;
    if (conversacion.status === 'human') {
      if (conversacion.pausedUntil && conversacion.pausedUntil.getTime() > Date.now()) return null;
      await reanudarConversacion(conversationId);
    }
    if (conversacion.status === 'closed') return null;
    const mensajes = await ultimosMensajes(conversationId);
    // Si un turno anterior de la misma ráfaga ya contestó a todo, no hay nada que decir.
    const ultimo = mensajes[mensajes.length - 1];
    if (!ultimo || ultimo.role !== 'customer') return null;

    const cliente = await clientePorTelefono(companyId, customerPhone).catch(() => null);
    // Cómo se presenta y cuándo atiende: lo configurado en «Asistente» (A6) o el piloto.
    const negocio = negocioDe({ perfil: botConfig.profile, negocio: botConfig.business, greeting: botConfig.greeting }, botConfig.companyName);
    const hora = ahoraLima(perfilDe(botConfig.profile).horario);
    // CON EL MODELO LOCAL, EL FLUJO GUIADO: el código lleva la conversación y
    // Qwen solo extrae (`guiado.ts` cuenta por qué). Con un modelo grande, el
    // turno conversacional de abajo.
    if (llm.nombre === 'qwen-local') {
      return turnoGuiado({ conversationId, botConfig, negocio, customerPhone, mensajes, cliente, enHorario: hora.enHorario, conversacion }, deps);
    }
    const sistema = bloquesSistema(negocio, { ahoraTexto: hora.texto, enHorario: hora.enHorario, cliente, telefono: customerPhone, lead: conversacion.lead ?? null });
    const ultimaBot = [...mensajes].reverse().find((m) => m.role === 'bot')?.text;
    let lead: DatosLead = { ...(conversacion.lead as DatosLead | undefined) };
    let escalado = false;
    const resultado = await correrTurno({
      proveedor: llm,
      sistema,
      historial: historialATurnos(mensajes),
      herramientas: HERRAMIENTAS_VENTAS,
      ultimaRespuestaBot: ultimaBot,
      contexto: {
        guardarLead: async (datos) => {
          lead = { ...lead, ...Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== undefined && v !== '')) };
          // Se avisa al dueño cuando el lead está listo, o cuando ya hay con qué
          // trabajar (servicio y ubicación o cantidad); una vez por conversación y día.
          const conQue = Boolean(lead.servicio && (lead.distrito || lead.cantidad));
          const avisadoHoy = conversacion.leadNotifiedAt && Date.now() - conversacion.leadNotifiedAt.getTime() < 24 * 3_600_000;
          const destinoLead = avisaDe(botConfig, 'leadNuevo');
          const notificar = Boolean(destinoLead) && (lead.listo || conQue) && (!avisadoHoy || Boolean(lead.listo && !conversacion.lead?.listo));
          await guardarLeadEnConversacion(conversationId, lead as Record<string, unknown>, notificar);
          if (notificar && destinoLead) {
            await deps.notificar(destinoLead, textoLead(lead, customerPhone, negocio, cliente?.nombre ?? conversacion.customerName));
            conversacion.leadNotifiedAt = new Date();
            conversacion.lead = lead as Record<string, unknown>;
          }
          return { notificado: notificar };
        },
        escalar: async (motivo) => {
          escalado = true;
          await pausarConversacion(conversationId, botConfig.handoffPauseMinutes ?? PAUSA_POR_DEFECTO_MIN, 'escalada');
          const destino = avisaDe(botConfig, 'pideUrgente');
          if (destino) {
            const ultimos = mensajes.filter((m) => m.role === 'customer').slice(-2).map((m) => `«${String(m.text || '').slice(0, 120)}»`).join(' / ');
            await deps.notificar(destino, `🙋 *Cliente pide atención — ${negocio.nombre}*\n👤 ${cliente?.nombre ?? conversacion.customerName ?? 'sin nombre'} · ${telefonoLegible(customerPhone)}\nMotivo: ${motivo}\nÚltimos mensajes: ${ultimos}\nEl bot se calla 30 min: responde desde el WhatsApp de ${negocio.nombre}.`);
          }
        },
        horario: () => ({ texto: negocio.horario, abierto: hora.enHorario }),
      },
    });
    void sumarTokens(conversationId, resultado.uso.entrada, resultado.uso.salida).catch(() => undefined);
    if (resultado.degradado && !escalado) {
      await pausarConversacion(conversationId, botConfig.handoffPauseMinutes ?? PAUSA_POR_DEFECTO_MIN, 'escalada');
      const destino = avisaDe(botConfig, 'fallo');
      if (destino) {
        await deps.notificar(destino, `⚠️ *El bot no pudo contestar — ${negocio.nombre}*\n${telefonoLegible(customerPhone)}: «${String(message.text).slice(0, 160)}»\nLe dije que un asesor responde. Toma la conversación desde el WhatsApp de ${negocio.nombre}.`);
      }
    }
    logger.info(
      `[dali] ${customerPhone}${cliente ? ` (${cliente.nombre})` : ''}: ${resultado.herramientasUsadas.length ? `herramientas ${resultado.herramientasUsadas.join(',')} · ` : ''}${resultado.uso.entrada}/${resultado.uso.salida} tokens${resultado.uso.cacheLeida ? ` (cache ${resultado.uso.cacheLeida})` : ''}${resultado.degradado ? ' · DEGRADADO' : ''}`
    );
    return resultado.texto;
  });
};

/** Guarda el estado y avisa al dueño si hay con qué (servicio y lugar o cantidad), una vez por día, y otra vez al quedar listo. */
const notificarLead = async (
  lead: LeadParaAviso,
  guardar: Record<string, unknown>,
  ctx: { conversationId: string; botConfig: ReplyInput['botConfig']; negocio: NegocioAsfalto; customerPhone: string; conversacion: { leadNotifiedAt?: Date; lead?: Record<string, unknown> }; nombreCliente?: string },
  deps: DepsVentas
): Promise<boolean> => {
  const conQue = Boolean(lead.servicio && (lead.distrito || lead.cantidad));
  const avisadoHoy = ctx.conversacion.leadNotifiedAt && Date.now() - ctx.conversacion.leadNotifiedAt.getTime() < 24 * 3_600_000;
  const destino = avisaDe(ctx.botConfig, 'leadNuevo');
  const notificar = Boolean(destino) && (lead.listo || conQue) && (!avisadoHoy || Boolean(lead.listo && !ctx.conversacion.lead?.listo));
  await guardarLeadEnConversacion(ctx.conversationId, guardar, notificar);
  if (notificar && destino) {
    await deps.notificar(destino, textoLead(lead, ctx.customerPhone, ctx.negocio, ctx.nombreCliente));
    ctx.conversacion.leadNotifiedAt = new Date();
    ctx.conversacion.lead = guardar;
  }
  return notificar;
};

const turnoGuiado = async (
  ctx: {
    conversationId: string;
    botConfig: ReplyInput['botConfig'];
    negocio: NegocioAsfalto;
    customerPhone: string;
    mensajes: Array<{ role: string; text?: string }>;
    cliente: { nombre: string; empresa?: string } | null;
    enHorario: boolean;
    conversacion: { leadNotifiedAt?: Date; lead?: Record<string, unknown>; customerName?: string };
  },
  deps: DepsVentas
): Promise<string> => {
  const estado = (ctx.conversacion.lead ?? {}) as EstadoGuiado;
  // El guion de la empresa (`bot_configs.guion`) o el default del vertical.
  const guion = guionDe(ctx.botConfig.guion);
  // Todo lo que el cliente dijo desde la última respuesta del bot (la ráfaga).
  let desde = ctx.mensajes.length;
  while (desde > 0 && ctx.mensajes[desde - 1].role === 'customer') desde--;
  const texto = ctx.mensajes.slice(desde).map((m) => String(m.text || '')).join('\n');
  const ultimaBot = [...ctx.mensajes].reverse().find((m) => m.role === 'bot')?.text;
  const inicio = Date.now();
  const extraido = validarExtraccion(await extraerConQwen(texto, { ultimaPreguntaBot: ultimaBot, resumenEnviado: Boolean(estado.resumenEnviado) }), texto, guion);
  const p = paso(estado, extraido, ctx.negocio, ctx.cliente, ctx.enHorario, texto, guion);
  const lead = leadDe(guion, p.estado);
  const guardar = paraGuardar(guion, p.estado);
  if (p.guardar) await notificarLead(lead, guardar, { ...ctx, nombreCliente: ctx.cliente?.nombre ?? ctx.conversacion.customerName }, deps);
  else await guardarLeadEnConversacion(ctx.conversationId, guardar, false);
  const quien = lead.nombre ?? ctx.cliente?.nombre ?? ctx.conversacion.customerName;
  const destinoNota = avisaDe(ctx.botConfig, 'leadNuevo');
  if (p.notaNueva && destinoNota) {
    await deps.notificar(destinoNota, `➕ *${quien ?? telefonoLegible(ctx.customerPhone)} agregó:* «${p.notaNueva}»`);
  }
  if (p.escalar) {
    await pausarConversacion(ctx.conversationId, ctx.botConfig.handoffPauseMinutes ?? PAUSA_POR_DEFECTO_MIN, 'escalada');
    const destinoEscalada = avisaDe(ctx.botConfig, 'pideUrgente');
    if (destinoEscalada) {
      await deps.notificar(destinoEscalada, `🙋 *Cliente pide atención — ${ctx.negocio.nombre}*\n👤 ${quien ?? 'sin nombre'} · ${telefonoLegible(ctx.customerPhone)}\nMotivo: ${p.escalar}\nÚltimo mensaje: «${texto.slice(0, 160)}»\nEl bot se calla 30 min: responde desde el WhatsApp de ${ctx.negocio.nombre}.`);
    }
  }
  const respondido = Object.entries(p.estado.respuestas ?? {}).map(([k, v]) => `${k}=${v}`).join(' ');
  logger.info(
    `[dali] ${ctx.customerPhone}${ctx.cliente ? ` (${ctx.cliente.nombre})` : ''}: guiado · extraído ${JSON.stringify(Object.fromEntries(Object.entries(extraido).filter(([, v]) => v && v !== '')))} · ${p.estado.servicio ?? 'sin servicio'}${respondido ? ` · ${respondido}` : ''} · pregunta ${p.estado.ultimoCampo ?? (p.estado.resumenEnviado ? 'resumen' : p.estado.cerrado ? 'cerrado' : 'servicio')} · ${((Date.now() - inicio) / 1000).toFixed(1)} s${p.escalar ? ` · ESCALA (${p.escalar})` : ''}`
  );
  return p.texto;
};

/** F3: el dueño escribió desde el número del negocio. */
export const atenderMensajeDelDueno = async (message: AgentInboundMessage, companyId: string | null, botConfig: { handoffPauseMinutes?: number } | null, deps: DepsVentas & { setBotEnabled(companyId: string, enabled: boolean): Promise<void> }): Promise<void> => {
  if (!companyId) return;
  const texto = message.text.trim();
  const comando = texto.toLowerCase().replace(/\s+/g, ' ');
  if (comando === '!bot off' || comando === '!bot on') {
    await deps.setBotEnabled(companyId, comando === '!bot on');
    await deps.notificar(message.remoteJid, comando === '!bot on' ? '🤖 Bot de ventas encendido.' : '🤖 Bot de ventas apagado. Escribe !bot on para prenderlo.');
    return;
  }
  const conversacion = await conversacionDeCliente(companyId, message.remoteJid);
  if (!conversacion) return;
  const minutos = comando === '!pausa' ? 24 * 60 : botConfig?.handoffPauseMinutes ?? PAUSA_POR_DEFECTO_MIN;
  await pausarConversacion(conversacion.id, minutos, 'owner');
  if (comando !== '!pausa') await guardarMensajeDueno(companyId, conversacion.id, texto);
  logger.info(`[dali] el dueño tomó la conversación con ${message.remoteJid}: bot en pausa ${minutos} min`);
};
