import { getBotConversationMessageModel, getBotConversationModel } from '../../database/bot.models.js';
import { getCompanyModel, getUsageMetricModel } from '../../database/models.js';
import { diaPeruano } from '../checklist/tiempo.js';
import { CUPO_MIEMBROS, listarEquipo } from './equipo.js';

/**
 * PLAN Y USO (A17, spec DALI §4 `plan`): lo que la empresa usa este ciclo y
 * cómo viene la actividad. Hoy el único plan es el PILOTO: sin costo, sin
 * pagos, sin comprobantes; los planes de pago se definen con José en F4 y la
 * pantalla lo dice en vez de dibujar precios. Lo que sí es real: los mensajes
 * de WhatsApp que lila contó este mes (`usage_metrics`, el mismo conteo que
 * la cuota de `companies.limits.whatsappMessages`), las respuestas de Dali,
 * los números conectados, los miembros, y las conversaciones por semana de
 * las últimas ocho semanas (`bot_conversations` por fecha de creación).
 */
const DIA_MS = 86_400_000;
const SEMANAS = 8;

export interface Ciclo {
  desde: string;
  hasta: string;
  renuevaEl: string;
  diasRestantes: number;
  periodo: string;
}

const fechaLima = (ms: number): string => diaPeruano(ms);
const msDeFecha = (fecha: string): number => Date.parse(`${fecha}T00:00:00.000-05:00`);

/** El ciclo es el mes calendario en Lima. */
export const cicloDe = (ahoraMs: number): Ciclo => {
  const hoy = fechaLima(ahoraMs);
  const [anio, mes] = hoy.split('-').map(Number);
  const primero = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  const siguiente = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  const diaDeHoy = Number(hoy.slice(8, 10));
  return { desde: primero, hasta, renuevaEl: siguiente, diasRestantes: ultimoDia - diaDeHoy, periodo: hoy.slice(0, 7) };
};

export interface Semana {
  etiqueta: string;
  desde: string;
  conversaciones: number;
  actual: boolean;
}

/** El lunes (Lima) de la semana de una fecha `YYYY-MM-DD`. */
const lunesDe = (fecha: string): string => {
  const ms = msDeFecha(fecha);
  const dow = new Date(ms + 5 * 3_600_000).getUTCDay(); // el día de la semana en Lima
  const retroceso = (dow + 6) % 7;
  return fechaLima(ms - retroceso * DIA_MS + 12 * 3_600_000);
};

/** Las últimas ocho semanas (lunes a domingo, Lima) hasta la actual, a partir de un conteo por lunes. */
export const semanasDe = (porLunes: Record<string, number>, ahoraMs: number): Semana[] => {
  const lunesActual = lunesDe(fechaLima(ahoraMs));
  const semanas: Semana[] = [];
  for (let i = SEMANAS - 1; i >= 0; i -= 1) {
    const desde = fechaLima(msDeFecha(lunesActual) - i * 7 * DIA_MS + 12 * 3_600_000);
    semanas.push({ etiqueta: `S${SEMANAS - i}`, desde, conversaciones: porLunes[desde] ?? 0, actual: i === 0 });
  }
  return semanas;
};

export const variacionPct = (actual: number, anterior: number): number | null => (anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null);

export interface PlanYUso {
  plan: { nombre: string; estado: 'activo'; sinCosto: true; ciclo: Ciclo };
  uso: {
    mensajesMes: number;
    mensajesLimite: number;
    respuestasDali: number;
    numeros: { usados: number; limite: number; principal: string };
    miembros: { usados: number; limite: number; nombres: string[] };
  };
  semanas: Semana[];
  promedioSemanal: number;
  variacionPct: number | null;
  facturacion: { razonSocial: string; ruc: string };
  pagos: never[];
}

export const leerPlan = async (companyId: string, ahoraMs = Date.now()): Promise<PlanYUso> => {
  const ciclo = cicloDe(ahoraMs);
  const inicioCiclo = new Date(msDeFecha(ciclo.desde));
  const desdeSemanas = new Date(msDeFecha(semanasDe({}, ahoraMs)[0].desde));
  const [Company, Usage, Conversation, Message] = await Promise.all([getCompanyModel(), getUsageMetricModel(), getBotConversationModel(), getBotConversationMessageModel()]);
  const [company, usage, respuestasDali, porSemana, equipo] = await Promise.all([
    Company.findOne({ companyId }).select('name ruc whatsappConfig.sender limits.whatsappMessages').lean() as Promise<{
      name?: unknown;
      ruc?: unknown;
      whatsappConfig?: { sender?: unknown };
      limits?: { whatsappMessages?: unknown };
    } | null>,
    Usage.findOne({ companyId, period: ciclo.periodo }).select('whatsapp.total').lean() as Promise<{ whatsapp?: { total?: unknown } } | null>,
    Message.countDocuments({ companyId, role: 'bot', createdAt: { $gte: inicioCiclo } }),
    Conversation.aggregate<{ _id: Date; n: number }>([
      { $match: { companyId, createdAt: { $gte: desdeSemanas } } },
      { $group: { _id: { $dateTrunc: { date: '$createdAt', unit: 'week', startOfWeek: 'monday', timezone: 'America/Lima' } }, n: { $sum: 1 } } },
    ]),
    listarEquipo(companyId, ahoraMs),
  ]);
  const porLunes: Record<string, number> = {};
  for (const s of porSemana) porLunes[fechaLima(new Date(s._id).getTime() + 12 * 3_600_000)] = s.n;
  const semanas = semanasDe(porLunes, ahoraMs);
  const total = semanas.reduce((acc, s) => acc + s.conversaciones, 0);
  const principal = String(company?.whatsappConfig?.sender ?? '').replace(/\D/g, '');
  const limite = typeof company?.limits?.whatsappMessages === 'number' ? company.limits.whatsappMessages : -1;
  return {
    plan: { nombre: 'Piloto', estado: 'activo', sinCosto: true, ciclo },
    uso: {
      mensajesMes: typeof usage?.whatsapp?.total === 'number' ? usage.whatsapp.total : 0,
      mensajesLimite: limite,
      respuestasDali,
      numeros: { usados: principal ? 1 : 0, limite: 1, principal },
      miembros: { usados: equipo.cupo.usados, limite: CUPO_MIEMBROS, nombres: equipo.miembros.map((m) => m.nombre) },
    },
    semanas,
    promedioSemanal: Math.round(total / SEMANAS),
    variacionPct: variacionPct(semanas[SEMANAS - 1].conversaciones, semanas[SEMANAS - 2].conversaciones),
    facturacion: { razonSocial: String(company?.name ?? companyId), ruc: String(company?.ruc ?? '') },
    pagos: [],
  };
};
