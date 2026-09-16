import ExcelJS from 'exceljs';
import { getBotConversationModel } from '../../database/bot.models.js';
import { getBotLeadModel, type EstadoLead } from './leads.js';
import { getBotMemberModel, type MiembroDali } from './miembros.js';
import { leerServicios } from './servicios.js';

/**
 * AJUSTES (A20, spec DALI §4 `ajustes`): lo que la persona puede tocar de sí
 * misma y de sus datos. Hoy: su nombre (`bot_members.name`; la identidad con
 * la que entra no se cambia desde acá) y la exportación a Excel de las
 * conversaciones y los leads de la empresa. Lo que el diseño dibuja y no
 * existe no se ofrece: contraseñas (no hay), sesiones abiertas en otros
 * dispositivos (la sesión es una cookie de 14 días sin registro central),
 * foto, cargo, tema oscuro (sin verificar), borrar la cuenta (se pide por
 * escrito).
 */
export class PerfilInvalido extends Error {}

const NOMBRE_MAX = 60;

export const nombreDePerfil = (nombre: string): string => {
  const limpio = String(nombre ?? '')
    .trim()
    .slice(0, NOMBRE_MAX);
  if (!limpio) throw new PerfilInvalido('Escribe tu nombre');
  return limpio;
};

/** Cambia el nombre del miembro (el propio) y devuelve el miembro como queda, para reemitir la sesión. */
export const cambiarNombre = async (companyId: string, userId: string, nombre: string): Promise<MiembroDali | null> => {
  const name = nombreDePerfil(nombre);
  const Member = await getBotMemberModel();
  const doc = await Member.findOneAndUpdate({ _id: userId, companyId }, { $set: { name } }, { new: true }).lean();
  return doc ? { id: String(doc._id), companyId: doc.companyId, identity: doc.identity, name: doc.name, role: doc.role } : null;
};

export interface ConversacionParaExportar {
  id: string;
  customerName?: string;
  customerPhone: string;
  status: 'bot' | 'human' | 'closed';
  messageCount: number;
  createdAt: Date;
  lastMessageAt: Date;
  lead?: Record<string, unknown>;
}

export interface LeadParaExportar {
  conversationId: string;
  estado: EstadoLead;
  cotizacion?: { monto?: number };
  notas?: Array<{ texto: string; autor: string; fecha: Date }>;
}

const ESTADO_CONVERSACION: Record<ConversacionParaExportar['status'], string> = { bot: 'Dali atiende', human: 'La atiende una persona', closed: 'Cerrada' };

const fechaLima = (d: Date): string => {
  const lima = new Date(d.getTime() - 5 * 3_600_000);
  return `${lima.toISOString().slice(0, 10)} ${lima.toISOString().slice(11, 16)}`;
};
const telefonoLegible = (t: string): string => {
  const d = String(t || '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('51') ? `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : d ? `+${d}` : '';
};
const texto = (v: unknown): string => (v == null ? '' : String(v));

export const filaDeConversacion = (c: ConversacionParaExportar, nombres: Record<string, string>): Array<string | number> => {
  const servicio = texto(c.lead?.servicio);
  return [
    fechaLima(c.createdAt),
    fechaLima(c.lastMessageAt),
    texto(c.customerName),
    telefonoLegible(c.customerPhone),
    ESTADO_CONVERSACION[c.status] ?? c.status,
    c.messageCount,
    servicio ? (nombres[servicio] ?? servicio) : '',
    texto(c.lead?.cantidad),
    texto(c.lead?.distrito),
    c.lead?.listo === true ? 'sí' : 'no',
  ];
};

export const filaDeLead = (c: ConversacionParaExportar, lead: LeadParaExportar, nombres: Record<string, string>): Array<string | number> => {
  const servicio = texto(c.lead?.servicio);
  return [
    fechaLima(c.createdAt),
    texto(c.customerName),
    telefonoLegible(c.customerPhone),
    servicio ? (nombres[servicio] ?? servicio) : '',
    texto(c.lead?.cantidad),
    texto(c.lead?.distrito),
    lead.estado,
    typeof lead.cotizacion?.monto === 'number' ? lead.cotizacion.monto : '',
    (lead.notas ?? []).map((n) => `${fechaLima(new Date(n.fecha))} ${n.autor}: ${n.texto}`).join(' | '),
  ];
};

const ENCABEZADOS_CONVERSACIONES = ['Inicio', 'Último mensaje', 'Cliente', 'Teléfono', 'Estado', 'Mensajes', 'Servicio', 'Cantidad', 'Distrito', 'Datos completos'];
const ENCABEZADOS_LEADS = ['Fecha', 'Cliente', 'Teléfono', 'Servicio', 'Cantidad', 'Distrito', 'Estado del lead', 'Cotización (S/)', 'Notas'];

export const armarExportacion = async ({
  conversaciones,
  leads,
  nombres,
}: {
  conversaciones: ConversacionParaExportar[];
  leads: LeadParaExportar[];
  nombres: Record<string, string>;
}): Promise<Buffer> => {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Dali';
  const hoja = (nombre: string, encabezados: string[], anchos: number[]) => {
    const h = libro.addWorksheet(nombre);
    h.addRow(encabezados).font = { bold: true };
    h.columns = anchos.map((width) => ({ width }));
    h.views = [{ state: 'frozen', ySplit: 1 }];
    return h;
  };
  const hConv = hoja('Conversaciones', ENCABEZADOS_CONVERSACIONES, [18, 18, 28, 18, 22, 10, 30, 14, 18, 14]);
  for (const c of conversaciones) hConv.addRow(filaDeConversacion(c, nombres));
  // Un lead es toda conversación con servicio identificado; el trabajo del dueño (`bot_leads`) existe solo si lo tocó: sin él, está «nuevo».
  const hLeads = hoja('Leads', ENCABEZADOS_LEADS, [18, 28, 18, 30, 14, 18, 16, 16, 60]);
  const trabajoDe = new Map(leads.map((l) => [l.conversationId, l]));
  for (const c of conversaciones) {
    if (!texto(c.lead?.servicio)) continue;
    hLeads.addRow(filaDeLead(c, trabajoDe.get(c.id) ?? { conversationId: c.id, estado: 'nuevo' }, nombres));
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
};

const MAX_CONVERSACIONES = 5000;

export const exportarDatos = async (companyId: string): Promise<Buffer> => {
  const [Conversation, Lead, servicios] = await Promise.all([getBotConversationModel(), getBotLeadModel(), leerServicios(companyId).catch(() => null)]);
  const [convDocs, leadDocs] = await Promise.all([
    Conversation.find({ companyId }).sort({ createdAt: -1 }).limit(MAX_CONVERSACIONES).select('customerName customerPhone status messageCount createdAt lastMessageAt lead').lean(),
    Lead.find({ companyId }).select('conversationId estado cotizacion notas').lean(),
  ]);
  const conversaciones: ConversacionParaExportar[] = convDocs.map((c) => ({
    id: String(c._id),
    customerName: c.customerName,
    customerPhone: c.customerPhone,
    status: c.status,
    messageCount: c.messageCount ?? 0,
    createdAt: c.createdAt as Date,
    lastMessageAt: c.lastMessageAt as Date,
    lead: c.lead,
  }));
  const leads: LeadParaExportar[] = leadDocs.map((l) => ({ conversationId: String(l.conversationId), estado: l.estado, cotizacion: l.cotizacion, notas: l.notas }));
  const nombres: Record<string, string> = Object.fromEntries((servicios?.guion.servicios ?? []).map((s) => [s.id, s.nombre]));
  return armarExportacion({ conversaciones, leads, nombres });
};
