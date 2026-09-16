import { getBotConfigModel, getBotConversationModel } from '../../database/bot.models.js';
import { getCompanyModel, getUsageMetricModel } from '../../database/models.js';
import logger from '../../utils/logger.js';
import { leerAsistente, pausada, type AvisosAsistente } from './asistente.js';
import { leerCatalogo } from './catalogo.js';
import { listarEquipo, type Equipo } from './equipo.js';
import { listarFaq } from './faq.js';
import { historialDeImportaciones } from './importar.js';
import { getBotLeadModel } from './leads.js';
import { EMPRESA_OPERADOR, getBotMemberModel, type MiembroDali } from './miembros.js';
import { cicloDe } from './plan.js';
import { RUBROS, asignarNumero, crearEmpresa, datosDeRegistro, type DatosDeRegistro } from './registro.js';
import { leerServicios } from './servicios.js';
import type { SesionDali } from './sesion.js';
import { anotarSuspension } from './suspension.js';
import { estadoDeLinea, leerWhatsApp, type EstadoLinea, type EventoLinea, type LineaWhatsApp, type OperacionesDeLinea, type SesionConsultable } from './whatsapp.js';

/**
 * LA CONSOLA DEL OPERADOR (S1 «Empresas» y S2 «Empresa»; spec DALI §4 `admin`,
 * rol `operator`): todas las empresas de Dali —las que tienen `bot_configs`—
 * con su línea, el estado del asistente, el uso del mes y su última
 * actividad; el detalle de una, contado con los mismos lectores del panel;
 * darla de alta desde acá (el mismo camino que el registro público, sin
 * código: el dueño entra después con su celular); pausarla, suspenderla
 * (bot apagado y panel cerrado, `suspension.ts`), anotarle una nota privada;
 * y «entrar a su panel» con una sesión de dueño a nombre del operador.
 */
export type EstadoAsistente = 'atendiendo' | 'pausado' | 'apagado' | 'requiere-qr' | 'sin-linea' | 'suspendida';

export interface EmpresaAdmin {
  companyId: string;
  nombre: string;
  ciudad: string;
  vertical: string;
  rubro: string;
  linea: { numero: string; estado: EstadoLinea };
  asistente: EstadoAsistente;
  uso: { mensajesMes: number; limite: number };
  ultimoMensaje?: string;
  miembros: number;
  creadaEl?: string;
  suspendida: boolean;
}

export interface ResumenEmpresas {
  total: number;
  atendiendo: number;
  pausadas: number;
  sinConectar: number;
  suspendidas: number;
}

const texto = (v: unknown): string => (v == null ? '' : String(v)).trim();
const RUBRO_LEGIBLE: Record<string, string> = Object.fromEntries(RUBROS.map((r) => [r.id, r.nombre.split(' y ')[0]]));
export const rubroLegible = (vertical: string): string => RUBRO_LEGIBLE[vertical] ?? (vertical ? vertical[0].toUpperCase() + vertical.slice(1) : '');

interface ConfigParaEstado {
  enabled?: boolean;
  pausedUntil?: Date | string | null;
  operador?: { suspendida?: boolean };
}

/** Lo que está haciendo el asistente de una empresa, en una palabra (la columna «Estado» de S1). */
export const estadoDeAsistente = (config: ConfigParaEstado | null | undefined, linea: EstadoLinea, ahoraMs = Date.now()): EstadoAsistente => {
  if (config?.operador?.suspendida) return 'suspendida';
  if (!config?.enabled) return 'apagado';
  if (pausada(config, ahoraMs)) return 'pausado';
  if (linea === 'sin-numero') return 'sin-linea';
  if (linea !== 'conectado') return 'requiere-qr';
  return 'atendiendo';
};

export interface FuentesDeFila {
  config: ConfigParaEstado & { companyId: string; vertical?: string };
  company?: { name?: unknown; whatsappConfig?: { sender?: unknown }; contactInfo?: { city?: unknown }; createdAt?: Date } | null;
  miembros: number;
  ultimoMensaje?: Date;
  mensajesMes: number;
  limite: number;
}

export const filaDeEmpresa = (f: FuentesDeFila, sesion: SesionConsultable, ahoraMs = Date.now()): EmpresaAdmin => {
  const numero = texto(f.company?.whatsappConfig?.sender).replace(/\D/g, '');
  const estado = estadoDeLinea(numero, sesion);
  return {
    companyId: f.config.companyId,
    nombre: texto(f.company?.name) || f.config.companyId,
    ciudad: texto(f.company?.contactInfo?.city),
    vertical: texto(f.config.vertical),
    rubro: rubroLegible(texto(f.config.vertical)),
    linea: { numero, estado },
    asistente: estadoDeAsistente(f.config, estado, ahoraMs),
    uso: { mensajesMes: f.mensajesMes, limite: f.limite },
    ultimoMensaje: f.ultimoMensaje ? new Date(f.ultimoMensaje).toISOString() : undefined,
    miembros: f.miembros,
    creadaEl: f.company?.createdAt ? new Date(f.company.createdAt).toISOString() : undefined,
    suspendida: f.config.operador?.suspendida === true,
  };
};

export const resumenDeEmpresas = (filas: EmpresaAdmin[]): ResumenEmpresas => ({
  total: filas.length,
  atendiendo: filas.filter((f) => f.asistente === 'atendiendo').length,
  pausadas: filas.filter((f) => f.asistente === 'pausado' || f.asistente === 'apagado').length,
  sinConectar: filas.filter((f) => f.linea.estado !== 'conectado').length,
  suspendidas: filas.filter((f) => f.suspendida).length,
});

type CompanyLean = NonNullable<FuentesDeFila['company']> & { companyId: string; limits?: { whatsappMessages?: unknown } };

const fuentesDe = async (companyIds: string[], ahoraMs: number) => {
  const [Company, Member, Conversation, Usage] = await Promise.all([getCompanyModel(), getBotMemberModel(), getBotConversationModel(), getUsageMetricModel()]);
  const periodo = cicloDe(ahoraMs).periodo;
  const [companies, miembros, ultimos, usos] = await Promise.all([
    Company.find({ companyId: { $in: companyIds } })
      .select('companyId name whatsappConfig.sender contactInfo.city createdAt limits.whatsappMessages')
      .lean() as Promise<CompanyLean[]>,
    Member.aggregate<{ _id: string; n: number }>([{ $match: { companyId: { $in: companyIds } } }, { $group: { _id: '$companyId', n: { $sum: 1 } } }]),
    Conversation.aggregate<{ _id: string; ultimo: Date }>([{ $match: { companyId: { $in: companyIds } } }, { $group: { _id: '$companyId', ultimo: { $max: '$lastMessageAt' } } }]),
    Usage.find({ companyId: { $in: companyIds }, period: periodo })
      .select('companyId whatsapp.total')
      .lean() as Promise<Array<{ companyId: string; whatsapp?: { total?: unknown } }>>,
  ]);
  return {
    company: new Map(companies.map((c) => [c.companyId, c])),
    miembros: new Map(miembros.map((m) => [m._id, m.n])),
    ultimo: new Map(ultimos.map((u) => [u._id, u.ultimo])),
    uso: new Map(usos.map((u) => [u.companyId, typeof u.whatsapp?.total === 'number' ? u.whatsapp.total : 0])),
  };
};

export const listarEmpresas = async (sesion: SesionConsultable, ahoraMs = Date.now()): Promise<{ empresas: EmpresaAdmin[]; resumen: ResumenEmpresas }> => {
  const Config = await getBotConfigModel();
  const configs = (await Config.find({}).select('companyId vertical enabled pausedUntil operador').lean()) as Array<FuentesDeFila['config']>;
  const ids = configs.map((c) => c.companyId);
  const fuentes = await fuentesDe(ids, ahoraMs);
  const empresas = configs
    .map((config) => {
      const company = fuentes.company.get(config.companyId);
      const limite = typeof company?.limits?.whatsappMessages === 'number' ? company.limits.whatsappMessages : -1;
      return filaDeEmpresa(
        {
          config,
          company,
          miembros: fuentes.miembros.get(config.companyId) ?? 0,
          ultimoMensaje: fuentes.ultimo.get(config.companyId),
          mensajesMes: fuentes.uso.get(config.companyId) ?? 0,
          limite,
        },
        sesion,
        ahoraMs
      );
    })
    .sort((a, b) => (b.ultimoMensaje ?? '').localeCompare(a.ultimoMensaje ?? '') || a.nombre.localeCompare(b.nombre));
  return { empresas, resumen: resumenDeEmpresas(empresas) };
};

/** S2: una entrada de «Actividad reciente», de cualquiera de sus fuentes. */
export interface Actividad {
  tipo: 'escalada' | 'lead' | 'ingreso' | 'importacion' | 'linea';
  titulo: string;
  detalle: string;
  fecha: string;
  tono: 'ok' | 'aviso' | 'error' | 'info';
}

export interface FuentesDeActividad {
  escaladas: Array<{ customerName?: string; servicio?: string; escalatedAt: Date }>;
  leads: Array<{ customerName?: string; servicio?: string; fecha: Date }>;
  ingresos: Array<{ nombre: string; ultimoIngreso?: string }>;
  importaciones: Array<{ archivo: string; quien: string; total: number; fecha: string }>;
  linea: EventoLinea[];
}

const ACTIVIDAD_MAX = 12;

/** Las cinco fuentes en una sola línea de tiempo, de lo más nuevo a lo más viejo. */
export const actividadDe = (f: FuentesDeActividad, limite = ACTIVIDAD_MAX): Actividad[] => {
  const todo: Actividad[] = [
    ...f.escaladas.map((e) => ({
      tipo: 'escalada' as const,
      titulo: 'Escalada a una persona',
      detalle: `${e.customerName?.trim() || 'Un cliente'} pidió hablar con alguien${e.servicio ? ` por ${e.servicio}` : ''}.`,
      fecha: new Date(e.escalatedAt).toISOString(),
      tono: 'aviso' as const,
    })),
    ...f.leads.map((l) => ({
      tipo: 'lead' as const,
      titulo: 'Lead nuevo',
      detalle: `${l.customerName?.trim() || 'Un cliente'}${l.servicio ? `, ${l.servicio}` : ''}.`,
      fecha: new Date(l.fecha).toISOString(),
      tono: 'ok' as const,
    })),
    ...f.ingresos
      .filter((i) => i.ultimoIngreso)
      .map((i) => ({ tipo: 'ingreso' as const, titulo: 'Ingreso al panel', detalle: `${i.nombre} entró al panel.`, fecha: i.ultimoIngreso!, tono: 'info' as const })),
    ...f.importaciones.map((i) => ({
      tipo: 'importacion' as const,
      titulo: 'Importación de Excel',
      detalle: `${i.total} elementos desde ${i.archivo}, por ${i.quien}.`,
      fecha: i.fecha,
      tono: 'ok' as const,
    })),
    ...f.linea.map((e) => ({ tipo: 'linea' as const, titulo: e.titulo, detalle: e.detalle, fecha: e.fecha, tono: e.tono })),
  ];
  return todo.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, limite);
};

export interface EmpresaDetalle extends EmpresaAdmin {
  kpis: { conversacionesMes: number; leadsMes: number; leadsSemana: number; leadsSemanaPrevia: number; leadsNuevos: number };
  equipo: Equipo;
  lineaDetalle: LineaWhatsApp;
  configuracion: { asistente: string; tono: string; daPrecios: boolean; avisosA: string; numerosPrueba: string[]; pausaMin: number };
  conocimiento: { servicios: number; preguntas: number; faq: number; catalogo: number; ultimaImportacion?: { fecha: string; archivo: string; quien: string } };
  actividad: Actividad[];
  nota: string;
}

const DIAS_ACTIVIDAD = 30;

export const avisosLegibles = (avisos: AvisosAsistente, ownerNotifyTarget: string): string => {
  if (avisos.canal === 'dueno' && avisos.numeroDueno) return `Al dueño (+${avisos.numeroDueno})`;
  if (ownerNotifyTarget) return 'Al grupo de la línea';
  return 'Sin destino';
};

export const leerEmpresa = async (companyId: string, ops: OperacionesDeLinea, ahoraMs = Date.now()): Promise<EmpresaDetalle | null> => {
  const [Config, Conversation, Lead] = await Promise.all([getBotConfigModel(), getBotConversationModel(), getBotLeadModel()]);
  const config = (await Config.findOne({ companyId }).select('companyId vertical enabled pausedUntil operador').lean()) as
    | (FuentesDeFila['config'] & { operador?: { nota?: string } })
    | null;
  if (!config) return null;
  const inicioCiclo = new Date(cicloDe(ahoraMs).desde + 'T00:00:00.000-05:00');
  const semana = new Date(ahoraMs - 7 * 86_400_000);
  const dosSemanas = new Date(ahoraMs - 14 * 86_400_000);
  const desdeActividad = new Date(ahoraMs - DIAS_ACTIVIDAD * 86_400_000);
  const [fuentes, asistente, equipo, lineaDetalle, servicios, faqs, catalogo, importaciones, convMes, leadsMes, leadsSemana, leadsSemanaPrevia, leadsNuevos, escaladas, leads] =
    await Promise.all([
      fuentesDe([companyId], ahoraMs),
      leerAsistente(companyId),
      listarEquipo(companyId, ahoraMs),
      leerWhatsApp(companyId, ops, ahoraMs),
      leerServicios(companyId),
      listarFaq(companyId),
      leerCatalogo(companyId),
      historialDeImportaciones(companyId),
      Conversation.countDocuments({ companyId, createdAt: { $gte: inicioCiclo } }),
      Lead.countDocuments({ companyId, createdAt: { $gte: inicioCiclo } }),
      Lead.countDocuments({ companyId, createdAt: { $gte: semana } }),
      Lead.countDocuments({ companyId, createdAt: { $gte: dosSemanas, $lt: semana } }),
      Lead.countDocuments({ companyId, estado: 'nuevo' }),
      Conversation.find({ companyId, escalatedAt: { $gte: desdeActividad } })
        .sort({ escalatedAt: -1 })
        .limit(10)
        .select('customerName lead.servicio escalatedAt')
        .lean(),
      Conversation.find({ companyId, leadNotifiedAt: { $gte: desdeActividad } })
        .sort({ leadNotifiedAt: -1 })
        .limit(10)
        .select('customerName lead.servicio leadNotifiedAt')
        .lean(),
    ]);
  const company = fuentes.company.get(companyId);
  const limite = typeof company?.limits?.whatsappMessages === 'number' ? company.limits.whatsappMessages : -1;
  const fila = filaDeEmpresa(
    { config, company, miembros: fuentes.miembros.get(companyId) ?? 0, ultimoMensaje: fuentes.ultimo.get(companyId), mensajesMes: fuentes.uso.get(companyId) ?? 0, limite },
    ops,
    ahoraMs
  );
  const activos = servicios.guion.servicios.filter((s) => s.activo !== false);
  const ultima = importaciones[0];
  return {
    ...fila,
    kpis: { conversacionesMes: convMes, leadsMes, leadsSemana, leadsSemanaPrevia, leadsNuevos },
    equipo,
    lineaDetalle,
    configuracion: {
      asistente: asistente.perfil.asistente,
      tono: asistente.perfil.tono,
      daPrecios: !asistente.perfil.reglas.sinPrecios,
      avisosA: avisosLegibles(asistente.avisos, asistente.ownerNotifyTarget),
      numerosPrueba: asistente.testNumbers,
      pausaMin: asistente.handoffPauseMinutes,
    },
    conocimiento: {
      servicios: activos.length,
      preguntas: activos.reduce((a, s) => a + s.preguntas.length, 0),
      faq: faqs.length,
      catalogo: catalogo.items.length,
      ultimaImportacion: ultima ? { fecha: ultima.fecha, archivo: ultima.archivo, quien: ultima.quien } : undefined,
    },
    actividad: actividadDe({
      escaladas: escaladas.map((c) => ({ customerName: c.customerName, servicio: (c.lead as { servicio?: string } | undefined)?.servicio, escalatedAt: c.escalatedAt as Date })),
      leads: leads.map((c) => ({ customerName: c.customerName, servicio: (c.lead as { servicio?: string } | undefined)?.servicio, fecha: c.leadNotifiedAt as Date })),
      ingresos: equipo.miembros.map((m) => ({ nombre: m.nombre, ultimoIngreso: m.ultimoIngreso })),
      importaciones: importaciones.map((i) => ({ archivo: i.archivo, quien: i.quien, total: i.resumen.total, fecha: i.fecha })),
      linea: lineaDetalle.historial,
    }),
    nota: texto(config.operador?.nota),
  };
};

/** Alta desde la consola: los datos del registro (P4) más, opcionalmente, el número de la línea. */
export const crearEmpresaDesdeConsola = async (input: Record<string, unknown>, quien: string): Promise<{ companyId: string; dueno: MiembroDali; numero?: string }> => {
  const datos: DatosDeRegistro = datosDeRegistro(input);
  const dueno = await crearEmpresa(datos, { ingresa: false });
  const numeroCrudo = texto(input.numero);
  const numero = numeroCrudo ? await asignarNumero(dueno.companyId, numeroCrudo) : undefined;
  logger.info(`[dali] ${quien} dio de alta a ${dueno.companyId} desde la consola${numero ? ` con la línea ${numero}` : ''}`);
  return { companyId: dueno.companyId, dueno, numero };
};

export interface CambiosEmpresa {
  encendida?: boolean;
  suspendida?: boolean;
  nota?: string;
}

const NOTA_MAX = 1000;

export const cambiarEmpresa = async (companyId: string, cambios: CambiosEmpresa, quien: string, ahoraMs = Date.now()): Promise<boolean> => {
  const Config = await getBotConfigModel();
  const set: Record<string, unknown> = {};
  if (typeof cambios.encendida === 'boolean') set.enabled = cambios.encendida;
  if (typeof cambios.nota === 'string') set['operador.nota'] = cambios.nota.trim().slice(0, NOTA_MAX);
  if (typeof cambios.suspendida === 'boolean') {
    set['operador.suspendida'] = cambios.suspendida;
    set['operador.suspendidaEl'] = cambios.suspendida ? new Date(ahoraMs) : null;
    if (cambios.suspendida) set.enabled = false;
  }
  if (!Object.keys(set).length) return false;
  const r = await Config.updateOne({ companyId }, { $set: set });
  if (!r.matchedCount) return false;
  if (typeof cambios.suspendida === 'boolean') anotarSuspension(companyId, cambios.suspendida, ahoraMs);
  logger.info(`[dali] ${quien} cambió ${companyId} desde la consola: ${Object.keys(set).join(', ')}`);
  return true;
};

/**
 * «Abrir su panel»: una sesión de dueño de esa empresa a nombre del operador
 * (lo que haga queda firmado «<nombre> (Dali)»); su identidad sigue siendo la
 * del operador, así que desde el panel vuelve a la consola con `auth/operador`.
 */
export const sesionParaEntrar = (companyId: string, operador: SesionDali): MiembroDali => ({
  id: `operador:${operador.userId}`,
  companyId,
  identity: operador.identity,
  name: `${operador.name} (Dali)`,
  role: 'owner',
});

export const esEmpresaDali = async (companyId: string): Promise<boolean> => {
  if (!companyId || companyId === EMPRESA_OPERADOR) return false;
  const Config = await getBotConfigModel();
  return Boolean(await Config.exists({ companyId }));
};
