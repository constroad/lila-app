import { getBotConfigModel, getBotConversationMessageModel, getBotConversationModel } from '../../database/bot.models.js';
import { diaPeruano } from '../checklist/tiempo.js';
import { faqsDe } from './faq.js';
import { sugeridasFaq, type Sugerida } from './faq.js';
import { tiempoDeRespuesta, type MensajeParaInicio } from './inicio.js';
import { getBotLeadModel, type EstadoLead } from './leads.js';
import { leerServicios } from './servicios.js';

/**
 * REPORTES (A19, spec DALI §4 `reportes`): cómo le fue a Dali en un período
 * —esta semana, la semana pasada o los últimos 30 días— comparado con el
 * período anterior del mismo largo. Todo sale de `bot_conversations`,
 * `bot_leads` y los mensajes (90 días de detalle); nada se estima. Semanas de
 * lunes a domingo en hora de Lima. Lo que el diseño dibuja y no se mide se
 * omite (horas pico, ciclo de venta en días, «más rentable»); lo que se mide
 * distinto se nombra tal cual (las FAQ más usadas son usos acumulados desde
 * que se crearon, no del período).
 */
export type Periodo = 'semana' | 'semana-pasada' | '30-dias';
export const PERIODOS: Periodo[] = ['semana', 'semana-pasada', '30-dias'];

const DIA_MS = 86_400_000;
const OFFSET_LIMA_MS = 5 * 3_600_000;
/** Una respuesta más tarde que esto no fue de Dali (pausa, o la atendió una persona). */
const RESPUESTA_MAXIMA_S = 10 * 60;

export interface Rango {
  desde: Date;
  hasta: Date;
  dias: number;
  anterior: { desde: Date; hasta: Date };
}

const inicioDelDiaLima = (ms: number): number => Date.parse(`${diaPeruano(ms)}T00:00:00.000-05:00`);
const lunesDeLaSemana = (ms: number): number => {
  const inicio = inicioDelDiaLima(ms);
  const dow = new Date(inicio + OFFSET_LIMA_MS).getUTCDay();
  return inicio - ((dow + 6) % 7) * DIA_MS;
};

export const rangoDe = (periodo: Periodo, ahoraMs: number): Rango => {
  if (periodo === '30-dias') {
    const desde = inicioDelDiaLima(ahoraMs) - 29 * DIA_MS;
    return { desde: new Date(desde), hasta: new Date(ahoraMs), dias: 30, anterior: { desde: new Date(desde - 30 * DIA_MS), hasta: new Date(desde) } };
  }
  const lunes = lunesDeLaSemana(ahoraMs);
  if (periodo === 'semana') {
    return { desde: new Date(lunes), hasta: new Date(ahoraMs), dias: 7, anterior: { desde: new Date(lunes - 7 * DIA_MS), hasta: new Date(lunes) } };
  }
  return { desde: new Date(lunes - 7 * DIA_MS), hasta: new Date(lunes), dias: 7, anterior: { desde: new Date(lunes - 14 * DIA_MS), hasta: new Date(lunes - 7 * DIA_MS) } };
};

export interface ConversacionParaReporte {
  id: string;
  createdAt: Date;
  lastCustomerMessageAt: Date;
  escalatedAt?: Date;
  lead?: Record<string, unknown>;
}

export interface LeadParaReporte {
  conversationId: string;
  estado: EstadoLead;
}

const conServicio = (c: ConversacionParaReporte): boolean => Boolean(c.lead && typeof c.lead.servicio === 'string' && c.lead.servicio);
const listo = (c: ConversacionParaReporte): boolean => Boolean(c.lead && c.lead.listo === true);

export interface Resumen {
  conversaciones: number;
  leads: number;
  confirmados: number;
  atendidos: number;
}

export const resumenDe = (conversaciones: ConversacionParaReporte[], _leads: LeadParaReporte[]): Resumen => ({
  conversaciones: conversaciones.length,
  leads: conversaciones.filter(conServicio).length,
  confirmados: conversaciones.filter(listo).length,
  atendidos: conversaciones.filter((c) => c.escalatedAt).length,
});

export interface PasoEmbudo {
  paso: 'iniciadas' | 'servicio' | 'datos' | 'cotizados' | 'ganados';
  titulo: string;
  valor: number;
  pct: number;
}

const pctDe = (parte: number, total: number): number => (total > 0 ? Math.round((parte / total) * 100) : 0);

export const embudoDe = (conversaciones: ConversacionParaReporte[], leads: LeadParaReporte[]): PasoEmbudo[] => {
  const estadoDe = new Map(leads.map((l) => [l.conversationId, l.estado]));
  const total = conversaciones.length;
  const cotizados = conversaciones.filter((c) => ['cotizado', 'ganado'].includes(estadoDe.get(c.id) ?? '')).length;
  const ganados = conversaciones.filter((c) => estadoDe.get(c.id) === 'ganado').length;
  const pasos: Array<[PasoEmbudo['paso'], string, number]> = [
    ['iniciadas', 'Conversaciones iniciadas', total],
    ['servicio', 'Servicio identificado', conversaciones.filter(conServicio).length],
    ['datos', 'Datos completos', conversaciones.filter(listo).length],
    ['cotizados', 'Cotizados', cotizados],
    ['ganados', 'Ganados', ganados],
  ];
  return pasos.map(([paso, titulo, valor]) => ({ paso, titulo, valor, pct: pctDe(valor, total) }));
};

export interface DiaReporte {
  fecha: string;
  etiqueta: string;
  conversaciones: number;
}

const ETIQUETA_DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Conversaciones NUEVAS por día del rango (Lima), con ceros donde no hubo. */
export const porDiaDe = (conversaciones: ConversacionParaReporte[], rango: Rango): DiaReporte[] => {
  const porFecha = new Map<string, number>();
  for (const c of conversaciones) {
    if (c.createdAt.getTime() < rango.desde.getTime()) continue;
    const fecha = diaPeruano(c.createdAt.getTime());
    porFecha.set(fecha, (porFecha.get(fecha) ?? 0) + 1);
  }
  const dias: DiaReporte[] = [];
  for (let i = 0; i < rango.dias; i += 1) {
    const ms = rango.desde.getTime() + i * DIA_MS + 12 * 3_600_000;
    const fecha = diaPeruano(ms);
    dias.push({ fecha, etiqueta: ETIQUETA_DIA[new Date(ms).getUTCDay()], conversaciones: porFecha.get(fecha) ?? 0 });
  }
  return dias;
};

export interface LeadsDeServicio {
  servicio: string;
  nombre: string;
  leads: number;
  pct: number;
}

export const leadsPorServicio = (conversaciones: ConversacionParaReporte[], nombres: Record<string, string>): LeadsDeServicio[] => {
  const cuenta = new Map<string, number>();
  for (const c of conversaciones.filter(conServicio)) {
    const s = String(c.lead!.servicio);
    cuenta.set(s, (cuenta.get(s) ?? 0) + 1);
  }
  const total = [...cuenta.values()].reduce((a, b) => a + b, 0);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([servicio, n]) => ({ servicio, nombre: nombres[servicio] ?? servicio, leads: n, pct: pctDe(n, total) }));
};

export const variacion = (actual: number, anterior: number): number | null => (anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null);

/** Mediana de minutos entre la escalada y el primer mensaje del dueño en esa conversación (las que nadie contestó no cuentan). */
export const medianaDeToma = (escaladas: Array<{ id: string; escalatedAt: Date }>, mensajes: Array<{ conversationId: string; role: string; createdAt: Date }>): number | null => {
  const demoras: number[] = [];
  for (const e of escaladas) {
    const primero = mensajes
      .filter((m) => m.conversationId === e.id && m.role === 'owner' && m.createdAt.getTime() >= e.escalatedAt.getTime())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (primero) demoras.push((primero.createdAt.getTime() - e.escalatedAt.getTime()) / 60_000);
  }
  if (!demoras.length) return null;
  const orden = demoras.sort((a, b) => a - b);
  return Math.round(orden[Math.floor(orden.length / 2)]);
};

export interface Reporte {
  periodo: Periodo;
  rango: { desde: string; hasta: string; dias: number };
  actualizado: string;
  resumen: Resumen & { variacionConversaciones: number | null; variacionLeads: number | null; anterior: Resumen };
  porDia: DiaReporte[];
  porServicio: LeadsDeServicio[];
  embudo: PasoEmbudo[];
  masPreguntadas: Array<{ pregunta: string; usos: number; categoria: string }>;
  sinRespuesta: { total: number; ejemplos: string[] };
  tiempos: { respuestaDaliS: number | null; tomaHumanaMin: number | null };
}

const conversacionesEn = async (companyId: string, desde: Date, hasta: Date): Promise<ConversacionParaReporte[]> => {
  const Conversation = await getBotConversationModel();
  const docs = await Conversation.find({ companyId, createdAt: { $lt: hasta }, lastMessageAt: { $gte: desde } })
    .select('createdAt lastCustomerMessageAt escalatedAt lead')
    .limit(2000)
    .lean();
  return docs
    .map((d) => ({
      id: String(d._id),
      createdAt: d.createdAt as Date,
      lastCustomerMessageAt: d.lastCustomerMessageAt as Date,
      escalatedAt: d.escalatedAt as Date | undefined,
      lead: d.lead,
    }))
    .filter(
      (c) =>
        c.createdAt.getTime() >= desde.getTime() ||
        (c.lastCustomerMessageAt && c.lastCustomerMessageAt.getTime() >= desde.getTime() && c.lastCustomerMessageAt.getTime() < hasta.getTime())
    );
};

export const leerReporte = async (companyId: string, periodo: Periodo, ahoraMs = Date.now()): Promise<Reporte> => {
  const rango = rangoDe(periodo, ahoraMs);
  const [conversaciones, anteriores, Lead, Message, Config, servicios, sugeridas] = await Promise.all([
    conversacionesEn(companyId, rango.desde, rango.hasta),
    conversacionesEn(companyId, rango.anterior.desde, rango.anterior.hasta),
    getBotLeadModel(),
    getBotConversationMessageModel(),
    getBotConfigModel(),
    leerServicios(companyId).catch(() => null),
    sugeridasFaq(companyId, ahoraMs).catch(() => [] as Sugerida[]),
  ]);
  const ids = [...conversaciones, ...anteriores].map((c) => c.id);
  const [leadDocs, mensajes, config] = await Promise.all([
    ids.length
      ? Lead.find({ companyId, conversationId: { $in: ids } })
          .select('conversationId estado')
          .lean()
      : Promise.resolve([]),
    conversaciones.length
      ? Message.find({ conversationId: { $in: conversaciones.map((c) => c.id) }, createdAt: { $gte: rango.desde, $lt: rango.hasta } })
          .select('conversationId role createdAt')
          .lean()
      : Promise.resolve([]),
    Config.findOne({ companyId }).select('faq').lean(),
  ]);
  const leads: LeadParaReporte[] = leadDocs.map((l) => ({ conversationId: String(l.conversationId), estado: l.estado }));
  const mensajesLimpios: MensajeParaInicio[] = mensajes.map((m) => ({ conversationId: String(m.conversationId), role: m.role, createdAt: m.createdAt as Date }));
  const nombres: Record<string, string> = Object.fromEntries((servicios?.guion.servicios ?? []).map((s) => [s.id, s.nombre]));
  const resumen = resumenDe(conversaciones, leads);
  const anterior = resumenDe(anteriores, leads);
  const faqs = faqsDe((config as { faq?: unknown } | null)?.faq);
  return {
    periodo,
    rango: { desde: rango.desde.toISOString(), hasta: rango.hasta.toISOString(), dias: rango.dias },
    actualizado: new Date(ahoraMs).toISOString(),
    resumen: {
      ...resumen,
      variacionConversaciones: variacion(resumen.conversaciones, anterior.conversaciones),
      variacionLeads: variacion(resumen.leads, anterior.leads),
      anterior,
    },
    porDia: porDiaDe(conversaciones, rango),
    porServicio: leadsPorServicio(conversaciones, nombres),
    embudo: embudoDe(conversaciones, leads),
    masPreguntadas: faqs
      .filter((f) => f.usos > 0)
      .sort((a, b) => b.usos - a.usos)
      .slice(0, 5)
      .map((f) => ({ pregunta: f.pregunta, usos: f.usos, categoria: f.categoria })),
    sinRespuesta: { total: sugeridas.reduce((acc, s) => acc + s.veces, 0), ejemplos: sugeridas.slice(0, 2).map((s) => s.pregunta) },
    tiempos: {
      respuestaDaliS: tiempoDeRespuesta(mensajesLimpios, RESPUESTA_MAXIMA_S),
      tomaHumanaMin: medianaDeToma(
        conversaciones.filter((c): c is ConversacionParaReporte & { escalatedAt: Date } => Boolean(c.escalatedAt)).map((c) => ({ id: c.id, escalatedAt: c.escalatedAt })),
        mensajesLimpios
      ),
    },
  };
};
