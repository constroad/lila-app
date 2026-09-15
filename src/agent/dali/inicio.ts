import { getBotConfigModel, getBotConversationMessageModel, getBotConversationModel } from '../../database/bot.models.js';
import { getCompanyModel } from '../../database/models.js';
import { quotaValidatorService } from '../../services/quota-validator.service.js';
import { diaPeruano } from '../checklist/tiempo.js';
import { leadDeConversacion, type LeadResumen } from './leads.js';
import { miembrosDeEmpresa } from './miembros.js';

/**
 * LO QUE VE EL DUEÑO AL ENTRAR (pantalla A1 «Inicio», spec DALI §7). Todo sale
 * de lo que el motor ya guarda: `bot_configs` (encendido), `bot_conversations`
 * (estado, escaladas, leads), `bot_conversation_messages` (tiempos de
 * respuesta) y la quota de mensajes de la empresa. Los agregados se calculan
 * acá, en funciones puras sobre listas: la base solo aporta las listas.
 */

export interface ConversacionParaInicio {
  id: string;
  customerName?: string;
  customerPhone: string;
  status: 'bot' | 'human' | 'closed';
  lastMessageAt: Date;
  lastCustomerMessageAt: Date;
  escalatedAt?: Date;
  pausedUntil?: Date;
  lead?: Record<string, unknown>;
  createdAt?: Date;
}

export interface MensajeParaInicio {
  conversationId: string;
  role: string;
  createdAt: Date;
}

export interface AtencionPendiente {
  conversationId: string;
  nombre: string;
  telefono: string;
  empresa?: string;
  motivo: 'pidio-persona' | 'sin-respuesta';
  texto: string;
  haceMin: number;
  /** «Tomar» cuando pidió hablar con alguien; «Ver» cuando solo hay que mirar. */
  accion: 'tomar' | 'ver';
  /** Lo último que escribió el cliente, para leerlo sin abrir el chat. */
  ultimoMensaje?: string;
  /** Lo que Dali ya sabe del pedido, en dos o tres chips («Lurín», «600 m²»). */
  chips: string[];
}

export interface Inicio {
  usuario: { nombre: string; rol: string };
  empresa: { companyId: string; nombre: string; rubro: string; ciudad: string };
  asistente: { encendido: boolean; pausadoHasta?: string; numero: string; ultimoMensajeHaceMin: number | null; conectado: boolean };
  metricas: {
    conversacionesHoy: number;
    conversacionesAyer: number;
    leadsNuevosHoy: number;
    leadsNuevosAyer: number;
    sinResponder: number;
    tiempoRespuestaS: number | null;
  };
  atencion: AtencionPendiente[];
  ultimosLeads: LeadResumen[];
  plan: { nombre: string; usados: number; limite: number; porcentaje: number; renuevaEl: string; contactosUnicos: number; miembros: number };
  fecha: string;
}

const minutosDesde = (fecha: Date | undefined, ahoraMs: number): number | null =>
  fecha ? Math.max(0, Math.round((ahoraMs - new Date(fecha).getTime()) / 60_000)) : null;

/** Qué conversaciones piden a una persona: las escaladas (pidió hablar con alguien) y las que quedaron sin respuesta del bot. */
export const atencionPendiente = (conversaciones: ConversacionParaInicio[], ahoraMs: number, ultimoTextoDe: (id: string) => string | undefined = () => undefined): AtencionPendiente[] =>
  conversaciones
    .filter((c) => c.status === 'human' && c.escalatedAt)
    .sort((a, b) => new Date(b.escalatedAt!).getTime() - new Date(a.escalatedAt!).getTime())
    .slice(0, 5)
    .map((c) => {
      const lead = c.lead ? leadDeConversacion(c, ahoraMs) : null;
      return {
        conversationId: c.id,
        nombre: c.customerName || `+${c.customerPhone}`,
        telefono: c.customerPhone,
        empresa: lead?.empresa,
        motivo: 'pidio-persona' as const,
        texto: 'Pidió hablar con una persona',
        haceMin: minutosDesde(c.escalatedAt, ahoraMs) ?? 0,
        accion: 'tomar' as const,
        ultimoMensaje: ultimoTextoDe(c.id),
        chips: [lead?.distrito, lead?.cantidad].filter((v): v is string => Boolean(v)),
      };
    });

/** Tiempo de respuesta del bot: mediana, en segundos, del primer mensaje del bot tras cada mensaje del cliente (hoy). */
export const tiempoDeRespuesta = (mensajes: MensajeParaInicio[]): number | null => {
  const porConversacion = new Map<string, MensajeParaInicio[]>();
  for (const m of mensajes) porConversacion.set(m.conversationId, [...(porConversacion.get(m.conversationId) ?? []), m]);
  const demoras: number[] = [];
  for (const lista of porConversacion.values()) {
    const ordenada = [...lista].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let esperando: number | null = null;
    for (const m of ordenada) {
      const t = new Date(m.createdAt).getTime();
      if (m.role === 'customer') esperando = esperando ?? t;
      else if (m.role === 'bot' && esperando !== null) {
        demoras.push((t - esperando) / 1000);
        esperando = null;
      }
    }
  }
  if (!demoras.length) return null;
  const orden = demoras.sort((a, b) => a - b);
  return Math.round(orden[Math.floor(orden.length / 2)]);
};

const esDelDia = (fecha: Date | undefined, dia: string): boolean => Boolean(fecha) && diaPeruano(new Date(fecha as Date).getTime()) === dia;

export const metricasDelDia = (
  conversaciones: ConversacionParaInicio[],
  mensajesDeHoy: MensajeParaInicio[],
  hoy: string,
  ayer: string
): Inicio['metricas'] => {
  const activasEn = (dia: string) => conversaciones.filter((c) => esDelDia(c.lastCustomerMessageAt, dia)).length;
  const leadsEn = (dia: string) => conversaciones.filter((c) => c.lead && esDelDia(c.createdAt, dia)).length;
  const sinResponder = conversaciones.filter((c) => c.status === 'bot' && new Date(c.lastCustomerMessageAt).getTime() > new Date(c.lastMessageAt).getTime()).length;
  return {
    conversacionesHoy: activasEn(hoy),
    conversacionesAyer: activasEn(ayer),
    leadsNuevosHoy: leadsEn(hoy),
    leadsNuevosAyer: leadsEn(ayer),
    sinResponder,
    tiempoRespuestaS: tiempoDeRespuesta(mensajesDeHoy),
  };
};

const texto = (v: unknown): string => (v == null ? '' : String(v)).trim();
/** El rubro como lo lee la gente, a partir del vertical del bot. */
const RUBRO: Record<string, string> = { asphalt: 'Asfalto', restaurant: 'Restaurante', appointments: 'Citas', transport: 'Transporte' };

export const cargarInicio = async (companyId: string, usuario: { nombre: string; rol: string }, ahoraMs = Date.now()): Promise<Inicio> => {
  const hoy = diaPeruano(ahoraMs);
  const ayer = diaPeruano(ahoraMs - 24 * 3_600_000);
  const desde = new Date(ahoraMs - 2 * 24 * 3_600_000);
  const inicioDeHoy = new Date(`${hoy}T00:00:00.000-05:00`);
  const [Conversation, Message, Config, Company] = await Promise.all([getBotConversationModel(), getBotConversationMessageModel(), getBotConfigModel(), getCompanyModel()]);
  const [convDocs, config, company, quota] = await Promise.all([
    Conversation.find({ companyId, lastMessageAt: { $gte: desde } }).sort({ lastMessageAt: -1 }).limit(300).lean(),
    Config.findOne({ companyId }).lean(),
    Company.findOne({ companyId }).select('name whatsappConfig.sender contactInfo subscription').lean(),
    quotaValidatorService.getWhatsAppQuotaInfo(companyId).catch(() => null),
  ]);
  const conversaciones: ConversacionParaInicio[] = convDocs.map((c) => ({
    id: String(c._id),
    customerName: c.customerName,
    customerPhone: c.customerPhone,
    status: c.status,
    lastMessageAt: c.lastMessageAt,
    lastCustomerMessageAt: c.lastCustomerMessageAt,
    escalatedAt: c.escalatedAt,
    pausedUntil: c.pausedUntil,
    lead: c.lead,
    createdAt: c.createdAt,
  }));
  const ids = conversaciones.map((c) => c.id);
  const mensajesDeHoy: MensajeParaInicio[] = ids.length
    ? (await Message.find({ conversationId: { $in: ids }, createdAt: { $gte: inicioDeHoy } }).select('conversationId role createdAt').lean()).map((m) => ({
        conversationId: String(m.conversationId),
        role: m.role,
        createdAt: m.createdAt as Date,
      }))
    : [];
  const ultimoMensaje = conversaciones[0]?.lastMessageAt;
  // Lo último que dijo cada cliente que pide atención, para leerlo desde el inicio.
  const escaladas = conversaciones.filter((c) => c.status === 'human' && c.escalatedAt).map((c) => c.id);
  const ultimosTextos = escaladas.length
    ? await Message.aggregate<{ _id: string; text?: string }>([{ $match: { conversationId: { $in: escaladas }, role: 'customer' } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$conversationId', text: { $first: '$text' } } }])
    : [];
  const ultimoTextoPor = new Map(ultimosTextos.map((u) => [String(u._id), texto(u.text)]));
  const conLead = conversaciones.filter((c) => c.lead).slice(0, 3);
  const primerDiaProximoMes = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 1));
  const companyDoc = company as Record<string, unknown> | null;
  const whatsappConfig = (companyDoc?.whatsappConfig as Record<string, unknown> | undefined) ?? {};
  const uso = ((companyDoc?.subscription as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined) ?? {};
  const usados = typeof uso.whatsappMessages === 'number' ? uso.whatsappMessages : (quota?.current ?? 0);
  const miembros = await miembrosDeEmpresa(companyId);
  return {
    usuario,
    empresa: { companyId, nombre: texto(companyDoc?.name) || companyId, rubro: RUBRO[texto(config?.vertical)] ?? '', ciudad: texto((companyDoc?.contactInfo as Record<string, unknown> | undefined)?.city) },
    asistente: {
      encendido: Boolean(config?.enabled),
      numero: texto(whatsappConfig.sender),
      ultimoMensajeHaceMin: minutosDesde(ultimoMensaje, ahoraMs),
      conectado: Boolean(texto(whatsappConfig.sender)),
    },
    metricas: metricasDelDia(conversaciones, mensajesDeHoy, hoy, ayer),
    atencion: atencionPendiente(conversaciones, ahoraMs, (id) => ultimoTextoPor.get(id)),
    ultimosLeads: conLead.map((c) => leadDeConversacion(c, ahoraMs)),
    plan: {
      nombre: 'Piloto',
      usados,
      limite: quota?.limit ?? -1,
      porcentaje: quota && quota.limit > 0 ? Math.min(100, Math.round((usados / quota.limit) * 100)) : 0,
      renuevaEl: primerDiaProximoMes.toISOString().slice(0, 10),
      contactosUnicos: conversaciones.length,
      miembros: miembros.length,
    },
    fecha: hoy,
  };
};
