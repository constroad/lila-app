import { Schema, type Model } from 'mongoose';
import { getSharedConnection } from '../../database/sharedConnection.js';
import { getBotConversationModel } from '../../database/bot.models.js';
import { GUION_ASFALTO, guionDe } from '../ventas/guion.asfalto.js';
import { leadDe, type EstadoGuiado } from '../ventas/guiado.js';

/**
 * EL LEAD COMO OBJETO DE TRABAJO DEL DUEÑO (spec DALI §3, `bot_leads`). Lo que
 * el cliente dijo vive en `bot_conversations.lead` (lo escribe el motor); lo
 * que el dueño hace con eso —estado, cotización, notas— vive acá, por
 * conversación. Un lead se lee juntando las dos cosas; si el dueño nunca lo
 * tocó, es «nuevo».
 */
export type EstadoLead = 'nuevo' | 'contactado' | 'cotizado' | 'ganado' | 'perdido';
export const ESTADOS_LEAD: readonly EstadoLead[] = ['nuevo', 'contactado', 'cotizado', 'ganado', 'perdido'];

export interface IBotLead {
  companyId: string;
  conversationId: string;
  estado: EstadoLead;
  cotizacion?: { monto?: number; enviadaEl?: Date; validaHasta?: Date };
  motivoPerdido?: string;
  notas: Array<{ texto: string; autor: string; fecha: Date }>;
  historial: Array<{ estado: EstadoLead; autor: string; fecha: Date }>;
  createdAt?: Date;
  updatedAt?: Date;
}

const BotLeadSchema = new Schema<IBotLead>(
  {
    companyId: { type: String, required: true },
    conversationId: { type: String, required: true },
    estado: { type: String, enum: [...ESTADOS_LEAD], default: 'nuevo' },
    cotizacion: { monto: Number, enviadaEl: Date, validaHasta: Date },
    motivoPerdido: String,
    notas: { type: [{ texto: String, autor: String, fecha: Date }], default: [] },
    historial: { type: [{ estado: String, autor: String, fecha: Date }], default: [] },
  },
  { collection: 'bot_leads', timestamps: true }
);
BotLeadSchema.index({ companyId: 1, conversationId: 1 }, { unique: true });
BotLeadSchema.index({ companyId: 1, estado: 1, updatedAt: -1 });

let model: Model<IBotLead> | null = null;
export const getBotLeadModel = async (): Promise<Model<IBotLead>> => {
  if (model) return model;
  const conn = await getSharedConnection();
  model = (conn.models.BotLead as Model<IBotLead>) || conn.model<IBotLead>('BotLead', BotLeadSchema);
  return model;
};

export interface LeadResumen {
  id: string;
  conversationId: string;
  titulo: string;
  servicio: string;
  cantidad?: string;
  distrito?: string;
  fecha?: string;
  nombre: string;
  empresa?: string;
  telefono: string;
  estado: EstadoLead;
  confirmado: boolean;
  /** Etiqueta → valor, en el orden del guion. */
  campos: Array<[string, string]>;
  /** Lo que el cliente agregó después de confirmar (el motor lo guarda como notas al asesor). */
  notasDelCliente: string[];
  /** Cuándo cerró el motor el lead confirmado, si lo hizo. */
  cerradoEn?: string;
  creadoMs: number;
  actualizadoMs: number;
}

const texto = (v: unknown): string => (v == null ? '' : String(v)).trim();

/** El servicio con su nombre del guion («colocacion» → «Colocación de asfalto»). */
const nombreDeServicio = (id: string, guion = GUION_ASFALTO): string => guion.servicios.find((s) => s.id === id)?.nombre ?? (id || 'Consulta');

/** «Asfaltado 600 m² · Lurín»: el servicio como título (sin el paréntesis del guion, con mayúscula), cantidad y distrito. */
export const tituloDeLead = (l: { servicio: string; cantidad?: string; distrito?: string }): string => {
  const servicio = l.servicio.replace(/\s*\(.*?\)/g, '').trim();
  const conMayuscula = servicio.charAt(0).toUpperCase() + servicio.slice(1);
  return [conMayuscula, l.cantidad].filter(Boolean).join(' ') + (l.distrito ? ` · ${l.distrito}` : '');
};

/** Un lead a partir de la conversación (lo que dijo el cliente) y del trabajo del dueño, si lo hay. */
export const leadDeConversacion = (
  c: { id: string; customerName?: string; customerPhone: string; lead?: Record<string, unknown>; createdAt?: Date; updatedAt?: Date; lastMessageAt?: Date },
  ahoraMs: number,
  trabajo?: Pick<IBotLead, 'estado'> | null,
  guion = GUION_ASFALTO
): LeadResumen => {
  const estadoGuiado = (c.lead ?? {}) as EstadoGuiado;
  const l = leadDe(guion, estadoGuiado);
  const servicio = nombreDeServicio(texto(l.servicio), guion);
  return {
    id: c.id,
    conversationId: c.id,
    titulo: tituloDeLead({ servicio, cantidad: l.cantidad, distrito: l.distrito }),
    servicio,
    cantidad: l.cantidad,
    distrito: l.distrito,
    fecha: l.fecha,
    nombre: l.nombre || c.customerName || `+${c.customerPhone}`,
    empresa: l.empresa,
    telefono: c.customerPhone,
    estado: trabajo?.estado ?? 'nuevo',
    confirmado: Boolean(l.listo),
    campos: l.campos,
    notasDelCliente: Array.isArray(estadoGuiado.notas) ? estadoGuiado.notas.map(String) : [],
    cerradoEn: estadoGuiado.cerradoEn,
    creadoMs: c.createdAt ? new Date(c.createdAt).getTime() : ahoraMs,
    actualizadoMs: c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : ahoraMs,
  };
};

export interface FiltroLeads {
  estado?: EstadoLead;
  q?: string;
  limite?: number;
}

export const listarLeads = async (companyId: string, filtro: FiltroLeads = {}, ahoraMs = Date.now()): Promise<{ leads: LeadResumen[]; total: number; porEstado: Record<EstadoLead, number> }> => {
  const [Conversation, Lead] = await Promise.all([getBotConversationModel(), getBotLeadModel()]);
  const guion = await guionDeEmpresa(companyId);
  const [convs, trabajos] = await Promise.all([
    Conversation.find({ companyId, lead: { $exists: true } }).sort({ lastMessageAt: -1 }).limit(500).lean(),
    Lead.find({ companyId }).select('conversationId estado').lean(),
  ]);
  const trabajoPor = new Map(trabajos.map((t) => [t.conversationId, t]));
  let leads = convs.map((c) => leadDeConversacion({ ...c, id: String(c._id) }, ahoraMs, trabajoPor.get(String(c._id)), guion));
  const porEstado = Object.fromEntries(ESTADOS_LEAD.map((e) => [e, leads.filter((l) => l.estado === e).length])) as Record<EstadoLead, number>;
  const total = leads.length;
  if (filtro.estado) leads = leads.filter((l) => l.estado === filtro.estado);
  if (filtro.q) {
    const q = filtro.q.toLowerCase();
    leads = leads.filter((l) => [l.titulo, l.nombre, l.empresa, l.telefono, l.distrito].some((v) => (v ?? '').toLowerCase().includes(q)));
  }
  return { leads: leads.slice(0, filtro.limite ?? 100), total, porEstado };
};

export interface LeadDetalle extends LeadResumen {
  cotizacion?: IBotLead['cotizacion'];
  motivoPerdido?: string;
  notas: IBotLead['notas'];
  historial: IBotLead['historial'];
}

export const detalleDeLead = async (companyId: string, conversationId: string, ahoraMs = Date.now()): Promise<LeadDetalle | null> => {
  const [Conversation, Lead] = await Promise.all([getBotConversationModel(), getBotLeadModel()]);
  const [c, trabajo] = await Promise.all([Conversation.findOne({ _id: conversationId, companyId }).lean(), Lead.findOne({ companyId, conversationId }).lean()]);
  if (!c) return null;
  const guion = await guionDeEmpresa(companyId);
  const resumen = leadDeConversacion({ ...c, id: String(c._id) }, ahoraMs, trabajo, guion);
  return { ...resumen, cotizacion: trabajo?.cotizacion, motivoPerdido: trabajo?.motivoPerdido, notas: trabajo?.notas ?? [], historial: trabajo?.historial ?? [] };
};

export const cambiarEstadoDeLead = async (
  companyId: string,
  conversationId: string,
  cambio: { estado?: EstadoLead; cotizacion?: IBotLead['cotizacion']; motivoPerdido?: string },
  autor: string
): Promise<void> => {
  const Lead = await getBotLeadModel();
  const set: Record<string, unknown> = {};
  if (cambio.estado) set.estado = cambio.estado;
  if (cambio.cotizacion) set.cotizacion = cambio.cotizacion;
  if (cambio.motivoPerdido !== undefined) set.motivoPerdido = cambio.motivoPerdido;
  await Lead.updateOne(
    { companyId, conversationId },
    { $set: set, ...(cambio.estado ? { $push: { historial: { estado: cambio.estado, autor, fecha: new Date() } } } : {}), $setOnInsert: { companyId, conversationId } },
    { upsert: true }
  );
};

export const agregarNotaALead = async (companyId: string, conversationId: string, nota: string, autor: string): Promise<void> => {
  const Lead = await getBotLeadModel();
  await Lead.updateOne(
    { companyId, conversationId },
    { $push: { notas: { texto: nota, autor, fecha: new Date() } }, $setOnInsert: { companyId, conversationId, estado: 'nuevo' } },
    { upsert: true }
  );
};

/** El guion vigente de la empresa (`bot_configs.guion`, validado) o el de asfalto. */
export const guionDeEmpresa = async (companyId: string) => {
  const { getBotConfigModel } = await import('../../database/bot.models.js');
  const Config = await getBotConfigModel();
  const config = await Config.findOne({ companyId }).select('guion').lean();
  return guionDe(config?.guion);
};
