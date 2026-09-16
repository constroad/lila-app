import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getBotConfigModel, getBotConversationMessageModel, getBotConversationModel } from '../../database/bot.models.js';
import { getCompanyModel } from '../../database/models.js';
import { cpuPct, obtenerHistoria, ramPct } from '../../services/metrics-history.service.js';
import { listRecentSessionEvents, type SessionEvent } from '../../whatsapp/baileys/session-events.js';
import { rubroLegible } from './admin.js';
import { tiempoDeRespuesta, type MensajeParaInicio } from './inicio.js';
import { estadoDeLinea, motivoDeCierre, type EstadoLinea, type SesionConsultable } from './whatsapp.js';

/**
 * SALUD DEL SISTEMA (S4, spec DALI §4 `admin/salud`): lo que el operador
 * mira cuando algo anda raro, en una sola respuesta: las líneas de WhatsApp
 * de cada empresa y su estado, la última hora (mensajes, tiempo de
 * respuesta de Dali, envíos fallidos y desconexiones), el modelo local
 * (cargado o no, último uso, cuándo se descarga solo), la máquina (RAM,
 * CPU, disco, uptime), los errores de las últimas 24 h y qué release está
 * corriendo. Se reusa lo que ya mide `admin-health` (CPU/RAM con historia).
 * Nada de colas ni de Redis: lila no las tiene, y S4 las dibujaba.
 */
const execFileAsync = promisify(execFile);
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
const RESPUESTA_MAXIMA_S = 600;

export interface LineaDeSalud {
  companyId: string;
  nombre: string;
  rubro: string;
  numero: string;
  estado: EstadoLinea;
  ultimoMensaje?: string;
  /** Desde cuándo está caída (el último «disconnected»/«unlinked» registrado), si no está conectada. */
  caidaDesde?: string;
  motivo?: string;
}

export interface ErrorReciente {
  tipo: 'desconexion' | 'envio-fallido' | 'sin-conectar';
  titulo: string;
  detalle: string;
  fecha: string;
  numero: string;
  empresa?: string;
}

export interface Salud {
  ahora: string;
  general: 'operativo' | 'atencion' | 'caido';
  lineas: LineaDeSalud[];
  ultimaHora: { mensajes: number; respuestaS: number | null; enviosFallidos: number; desconexiones: number };
  modelo: { activo: boolean; descargado: boolean; cargado: boolean; nombre: string; gb: number; ultimoUso?: string; ociosoMin: number };
  maquina: {
    equipo: string;
    uptimeS: number;
    ram: { totalGb: number; pct: number; procesoMb: number };
    cpu: { pct: number; carga1: number; nucleos: number };
    disco: { total: string; libre: string; pct: number } | null;
    historia: Array<{ t: number; cpu: number; ram: number }>;
  };
  errores: ErrorReciente[];
  deploy: { release: string; sha: string | null; desplegadoEl: string | null; node: string; iniciadoEl: string };
}

/** «20260916-093255-e3d7a34» (la carpeta de release de torre) → sha y fecha. */
export const deployDe = (cwd: string, node = process.version, iniciadoMs = Date.now() - process.uptime() * 1000): Salud['deploy'] => {
  const release = path.basename(cwd);
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-([0-9a-f]{7,})$/.exec(release);
  return {
    release,
    sha: m ? m[7] : null,
    desplegadoEl: m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-05:00`).toISOString() : null,
    node,
    iniciadoEl: new Date(iniciadoMs).toISOString(),
  };
};

const TITULO: Record<ErrorReciente['tipo'], string> = { desconexion: 'Línea desconectada', 'envio-fallido': 'Envío fallido', 'sin-conectar': 'Sin poder conectar' };

/** Los eventos de las últimas 24 h que son un problema, con el nombre de la empresa dueña de la línea. */
export const erroresDe = (eventos: SessionEvent[], empresaDe: (numero: string, companyId?: string) => string | undefined): ErrorReciente[] =>
  eventos.flatMap((e) => {
    const tipo: ErrorReciente['tipo'] | null =
      e.kind === 'disconnected' || e.kind === 'unlinked' ? 'desconexion' : e.kind === 'send-failed' ? 'envio-fallido' : e.kind === 'parked' ? 'sin-conectar' : null;
    if (!tipo) return [];
    const detalle = tipo === 'desconexion' ? motivoDeCierre(e.code, e.detail) : (e.detail ?? '').trim() || 'Sin detalle';
    return [{ tipo, titulo: TITULO[tipo], detalle, fecha: new Date(e.at).toISOString(), numero: e.sessionId, empresa: empresaDe(e.sessionId, e.companyId) }];
  });

export const estadoGeneral = (lineas: LineaDeSalud[], enviosFallidos: number): Salud['general'] => {
  const conNumero = lineas.filter((l) => l.numero);
  if (conNumero.length && conNumero.every((l) => l.estado !== 'conectado')) return 'caido';
  if (conNumero.some((l) => l.estado !== 'conectado') || enviosFallidos > 0) return 'atencion';
  return 'operativo';
};

const disco = async (ruta: string): Promise<Salud['maquina']['disco']> => {
  try {
    const { stdout } = await execFileAsync('/bin/df', ['-h', ruta], { timeout: 4000 });
    const cols = stdout.trim().split('\n').pop()?.split(/\s+/) ?? [];
    if (cols.length < 5) return null;
    return { total: cols[1], libre: cols[3], pct: Number(cols[4].replace('%', '')) };
  } catch {
    return null;
  }
};

interface EmpresaConLinea {
  companyId: string;
  nombre: string;
  rubro: string;
  numero: string;
}

const empresasConLinea = async (): Promise<EmpresaConLinea[]> => {
  const [Config, Company] = await Promise.all([getBotConfigModel(), getCompanyModel()]);
  const configs = (await Config.find({}).select('companyId vertical').lean()) as Array<{ companyId: string; vertical?: string }>;
  const companies = (await Company.find({ companyId: { $in: configs.map((c) => c.companyId) } })
    .select('companyId name whatsappConfig.sender')
    .lean()) as Array<{ companyId: string; name?: unknown; whatsappConfig?: { sender?: unknown } }>;
  const por = new Map(companies.map((c) => [c.companyId, c]));
  return configs.map((c) => ({
    companyId: c.companyId,
    nombre: String(por.get(c.companyId)?.name ?? c.companyId),
    rubro: rubroLegible(String(c.vertical ?? '')),
    numero: String(por.get(c.companyId)?.whatsappConfig?.sender ?? '').replace(/\D/g, ''),
  }));
};

const mensajesDeLaHora = async (desde: Date): Promise<MensajeParaInicio[]> => {
  const Message = await getBotConversationMessageModel();
  const docs = await Message.find({ createdAt: { $gte: desde } })
    .select('conversationId role createdAt')
    .limit(5000)
    .lean();
  return docs.map((m) => ({ conversationId: String(m.conversationId), role: m.role, createdAt: m.createdAt as Date }));
};

export interface EstadoDelModelo {
  activo: boolean;
  descargado: boolean;
  cargado: boolean;
  nombre: string;
  bytes: number;
  ultimoUsoMs: number | null;
  ociosoMs: number;
}

export const leerSalud = async (sesion: SesionConsultable, modelo: EstadoDelModelo, ahoraMs = Date.now()): Promise<Salud> => {
  const haceUnaHora = new Date(ahoraMs - HORA_MS);
  const Conversation = await getBotConversationModel();
  const [empresas, mensajes, eventosDia, ultimos, ramPorcentaje, discoSistema] = await Promise.all([
    empresasConLinea(),
    mensajesDeLaHora(haceUnaHora),
    listRecentSessionEvents({ sinceMs: ahoraMs - DIA_MS, limit: 200 }).catch(() => [] as SessionEvent[]),
    Conversation.aggregate<{ _id: string; ultimo: Date }>([{ $group: { _id: '$companyId', ultimo: { $max: '$lastMessageAt' } } }]),
    ramPct(),
    disco('/'),
  ]);
  const ultimoPor = new Map(ultimos.map((u) => [u._id, u.ultimo]));
  const caidaPor = new Map<string, SessionEvent>();
  for (const e of eventosDia) if ((e.kind === 'disconnected' || e.kind === 'unlinked' || e.kind === 'parked') && !caidaPor.has(e.sessionId)) caidaPor.set(e.sessionId, e);
  const lineas: LineaDeSalud[] = empresas.map((e) => {
    const estado = estadoDeLinea(e.numero, sesion);
    const caida = estado !== 'conectado' ? caidaPor.get(e.numero) : undefined;
    return {
      ...e,
      estado,
      ultimoMensaje: ultimoPor.get(e.companyId) ? new Date(ultimoPor.get(e.companyId)!).toISOString() : undefined,
      caidaDesde: caida ? new Date(caida.at).toISOString() : undefined,
      motivo: caida ? (caida.kind === 'disconnected' ? motivoDeCierre(caida.code, caida.detail) : (caida.detail ?? undefined)) : undefined,
    };
  });
  const numerosDali = new Set(empresas.map((e) => e.numero).filter(Boolean));
  // Un número lo pueden compartir dos empresas (el piloto): se nombran las dos.
  const empresaDeLinea = (numero: string, companyId?: string): string | undefined => {
    const propia = empresas.find((e) => e.companyId === companyId)?.nombre;
    if (propia) return propia;
    const nombres = empresas.filter((e) => e.numero === numero).map((e) => e.nombre);
    return nombres.length ? nombres.join(' y ') : undefined;
  };
  const deLaHora = eventosDia.filter((e) => new Date(e.at).getTime() >= haceUnaHora.getTime());
  const enviosFallidos = deLaHora.filter((e) => e.kind === 'send-failed').length;
  const mem = process.memoryUsage();
  return {
    ahora: new Date(ahoraMs).toISOString(),
    general: estadoGeneral(lineas, enviosFallidos),
    lineas,
    ultimaHora: {
      mensajes: mensajes.length,
      respuestaS: tiempoDeRespuesta(mensajes, RESPUESTA_MAXIMA_S),
      enviosFallidos,
      desconexiones: deLaHora.filter((e) => e.kind === 'disconnected' || e.kind === 'unlinked').length,
    },
    modelo: {
      activo: modelo.activo,
      descargado: modelo.descargado,
      cargado: modelo.cargado,
      nombre: modelo.nombre,
      gb: Number((modelo.bytes / 1e9).toFixed(2)),
      ultimoUso: modelo.ultimoUsoMs ? new Date(modelo.ultimoUsoMs).toISOString() : undefined,
      ociosoMin: Math.round(modelo.ociosoMs / 60_000),
    },
    maquina: {
      equipo: os.hostname(),
      uptimeS: Math.round(os.uptime()),
      ram: { totalGb: Number((os.totalmem() / 1024 ** 3).toFixed(1)), pct: ramPorcentaje, procesoMb: Math.round(mem.rss / 1024 ** 2) },
      cpu: { pct: cpuPct(), carga1: Number(os.loadavg()[0].toFixed(2)), nucleos: os.cpus().length },
      disco: discoSistema,
      historia: obtenerHistoria(),
    },
    // Solo las líneas de Dali: en la misma máquina hay otras sesiones (Lila) que no son de esta consola.
    errores: erroresDe(
      eventosDia.filter((e) => numerosDali.has(e.sessionId)),
      empresaDeLinea
    ).slice(0, 20),
    deploy: deployDe(process.cwd()),
  };
};
