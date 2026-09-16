import { getBotConfigModel } from '../../database/bot.models.js';
import { getCompanyModel } from '../../database/models.js';
import logger from '../../utils/logger.js';
import { CONSTROAD, REGLAS_POR_DEFECTO, type NegocioAsfalto, type ReglasNegocio } from '../ventas/prompt.asfalto.js';
import { catalogoDe } from './catalogo.js';

/**
 * CÓMO SE PRESENTA Y SE COMPORTA DALI (pantalla A6 «Asistente», spec DALI
 * §3 `bot_configs.perfil` / `avisos`). Lo que la persona configura acá lo
 * lee el guion en el siguiente mensaje: el nombre de la asistente, el saludo,
 * el aviso fuera de horario, el horario (en horas para saber si está abierto
 * y en texto para decirlo), la zona. El encendido y la pausa (`pausedUntil`)
 * los mira el router antes de contestar. El tono se guarda pero el guion de
 * asfalto habla siempre de tú: la UI lo dice.
 *
 * Los valores por defecto son los del piloto (`CONSTROAD` en
 * `prompt.asfalto.ts`): una empresa recién creada arranca con ellos.
 */
export interface FranjaHoraria {
  activo: boolean;
  /** «08:00» */
  desde: string;
  hasta: string;
}

export interface HorarioAtencion {
  semana: FranjaHoraria;
  sabado: FranjaHoraria;
  domingo: FranjaHoraria;
}

export type ReglasAsistente = ReglasNegocio;

export interface PerfilAsistente {
  asistente: string;
  saludo: string;
  tono: 'cercano' | 'formal';
  emojis: 'pocos' | 'ninguno';
  horario: HorarioAtencion;
  fueraDeHorario: string;
  zona: string;
  reglas: ReglasAsistente;
}

export interface DescansoAvisos {
  activo: boolean;
  /** HH:MM en hora de Lima; la franja puede cruzar la medianoche («22:00»–«07:00»). */
  desde: string;
  hasta: string;
}

export interface AvisosAsistente {
  /** Al grupo de ventas conectado (`ownerNotifyTarget`) o al número del dueño. */
  canal: 'grupo' | 'dueno';
  numeroDueno: string;
  casos: { leadNuevo: boolean; pideUrgente: boolean; fallo: boolean };
  /** Horario de descanso (A18): en esa franja no sale ningún aviso; los leads igual quedan en el panel. */
  descanso: DescansoAvisos;
}

export interface Asistente {
  enabled: boolean;
  pausadoHasta?: string;
  perfil: PerfilAsistente;
  avisos: AvisosAsistente;
  handoffPauseMinutes: number;
  testNumbers: string[];
  ownerNotifyTarget: string;
  empresa: { nombre: string; rubro: string; ciudad: string; numero: string };
}

export const PERFIL_POR_DEFECTO: PerfilAsistente = {
  asistente: CONSTROAD.asistente,
  saludo: '',
  tono: 'cercano',
  emojis: 'pocos',
  horario: {
    semana: { activo: true, desde: '08:00', hasta: '18:00' },
    sabado: { activo: true, desde: '08:00', hasta: '13:00' },
    domingo: { activo: false, desde: '08:00', hasta: '13:00' },
  },
  fueraDeHorario: '',
  zona: CONSTROAD.zona,
  reglas: REGLAS_POR_DEFECTO,
};

export const AVISOS_POR_DEFECTO: AvisosAsistente = { canal: 'grupo', numeroDueno: '', casos: { leadNuevo: true, pideUrgente: true, fallo: true }, descanso: { activo: false, desde: '22:00', hasta: '07:00' } };

/** Cuánto se calla Dali cuando una persona interviene (A6 «Silencio al intervenir»). */
export const SILENCIOS_MIN = [15, 30, 60, 120] as const;
const SILENCIO_POR_DEFECTO_MIN = 30;
const PAUSA_MAXIMA_MIN = 24 * 60;

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const texto = (v: unknown, max = 400): string => (v == null ? '' : String(v)).trim().slice(0, max);
const bool = (v: unknown, base: boolean): boolean => (typeof v === 'boolean' ? v : base);

const franjaDe = (v: unknown, base: FranjaHoraria): FranjaHoraria => {
  const f = (v ?? {}) as Partial<FranjaHoraria>;
  const desde = HORA_RE.test(String(f.desde)) ? String(f.desde) : base.desde;
  const hasta = HORA_RE.test(String(f.hasta)) ? String(f.hasta) : base.hasta;
  return { activo: bool(f.activo, base.activo), desde, hasta: hasta > desde ? hasta : base.hasta };
};

export const reglasDe = (guardado: unknown): ReglasAsistente => {
  const r = (guardado ?? {}) as Partial<ReglasAsistente>;
  const base = PERFIL_POR_DEFECTO.reglas;
  return { sinPrecios: bool(r.sinPrecios, base.sinPrecios), sinPromesas: bool(r.sinPromesas, base.sinPromesas), escala: bool(r.escala, base.escala), zonaEstricta: bool(r.zonaEstricta, base.zonaEstricta) };
};

/**
 * El perfil completo a partir de lo guardado (parcial, o nada): cada campo
 * vuelve al defecto si no tiene forma. `heredado` son el `greeting` y el
 * `tone` que `bot_configs` tenía antes del perfil.
 */
export const perfilDe = (guardado: unknown, heredado: { greeting?: string; tone?: string } = {}): PerfilAsistente => {
  const p = (guardado ?? {}) as Partial<PerfilAsistente>;
  const h = (p.horario ?? {}) as Partial<HorarioAtencion>;
  const tono = p.tono ?? heredado.tone;
  return {
    asistente: texto(p.asistente, 40) || PERFIL_POR_DEFECTO.asistente,
    saludo: texto(p.saludo ?? heredado.greeting, 160),
    tono: tono === 'formal' ? 'formal' : 'cercano',
    emojis: p.emojis === 'ninguno' ? 'ninguno' : 'pocos',
    horario: {
      semana: franjaDe(h.semana, PERFIL_POR_DEFECTO.horario.semana),
      sabado: franjaDe(h.sabado, PERFIL_POR_DEFECTO.horario.sabado),
      domingo: franjaDe(h.domingo, PERFIL_POR_DEFECTO.horario.domingo),
    },
    fueraDeHorario: texto(p.fueraDeHorario, 300),
    zona: texto(p.zona, 120) || PERFIL_POR_DEFECTO.zona,
    reglas: reglasDe(p.reglas),
  };
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export const avisosDe = (guardado: unknown): AvisosAsistente => {
  const a = (guardado ?? {}) as Partial<AvisosAsistente>;
  const c = (a.casos ?? {}) as Partial<AvisosAsistente['casos']>;
  const d = (a.descanso ?? {}) as Partial<DescansoAvisos>;
  const base = AVISOS_POR_DEFECTO.casos;
  return {
    canal: a.canal === 'dueno' ? 'dueno' : 'grupo',
    numeroDueno: texto(a.numeroDueno, 20).replace(/\D/g, ''),
    casos: { leadNuevo: bool(c.leadNuevo, base.leadNuevo), pideUrgente: bool(c.pideUrgente, base.pideUrgente), fallo: bool(c.fallo, base.fallo) },
    descanso: {
      activo: bool(d.activo, AVISOS_POR_DEFECTO.descanso.activo),
      desde: HORA.test(String(d.desde ?? '')) ? String(d.desde) : AVISOS_POR_DEFECTO.descanso.desde,
      hasta: HORA.test(String(d.hasta ?? '')) ? String(d.hasta) : AVISOS_POR_DEFECTO.descanso.hasta,
    },
  };
};

/** ¿Estamos en el horario de descanso (hora de Lima)? La franja puede cruzar la medianoche. */
export const enDescanso = (descanso: DescansoAvisos | undefined, ahoraMs: number): boolean => {
  if (!descanso?.activo) return false;
  const lima = new Date(ahoraMs - 5 * 3_600_000);
  const ahora = lima.getUTCHours() * 60 + lima.getUTCMinutes();
  const desde = minutosDe(descanso.desde);
  const hasta = minutosDe(descanso.hasta);
  return desde <= hasta ? ahora >= desde && ahora < hasta : ahora >= desde || ahora < hasta;
};

const minutosDe = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** ¿Está abierto a esa hora de Lima? `dow` 0 = domingo. */
export const enHorarioSegun = (horario: HorarioAtencion, dow: number, hora: number, minuto = 0): boolean => {
  const franja = dow === 0 ? horario.domingo : dow === 6 ? horario.sabado : horario.semana;
  if (!franja.activo) return false;
  const ahora = hora * 60 + minuto;
  return ahora >= minutosDe(franja.desde) && ahora < minutosDe(franja.hasta);
};

/** «08:00» → «8:00», como lo dice el guion. */
const horaLegible = (hhmm: string): string => `${Number(hhmm.slice(0, 2))}:${hhmm.slice(3)}`;
const franjaLegible = (f: FranjaHoraria): string => `de ${horaLegible(f.desde)} a ${horaLegible(f.hasta)}`;

/** «lunes a viernes de 8:00 a 18:00 y sábados de 8:00 a 13:00». */
export const horarioLegible = (h: HorarioAtencion): string => {
  const partes: string[] = [];
  if (h.semana.activo) partes.push(`lunes a viernes ${franjaLegible(h.semana)}`);
  if (h.sabado.activo) partes.push(`sábados ${franjaLegible(h.sabado)}`);
  if (h.domingo.activo) partes.push(`domingos ${franjaLegible(h.domingo)}`);
  return partes.length ? partes.join(' y ') : 'sin horario definido';
};

/** La ficha (A7) tal como la guarda `negocio.ts`; acá solo se lee lo que el guion necesita. */
interface FichaGuardada {
  nombreComercial?: string;
  descripcion?: string;
  web?: string;
  direccion?: string;
  comoLlegar?: string;
  contacto?: { telefono?: string; correo?: string };
  ofrece?: string[];
  noOfrece?: string[];
}

/** El negocio que ve el guion, a partir del perfil y la ficha guardados (o el del piloto). */
export const negocioDe = (config: { perfil?: unknown; negocio?: unknown; catalogo?: unknown; dicePrecios?: unknown; greeting?: string; tone?: string } | null | undefined, nombreEmpresa?: string): NegocioAsfalto => {
  const perfil = perfilDe(config?.perfil, { greeting: config?.greeting, tone: config?.tone });
  const ficha = (config?.negocio ?? {}) as FichaGuardada;
  const lista = (v: unknown): string[] | undefined => (Array.isArray(v) && v.length ? v.map(String) : undefined);
  const contacto = { telefono: texto(ficha.contacto?.telefono) || undefined, correo: texto(ficha.contacto?.correo) || undefined, web: texto(ficha.web) || undefined };
  return {
    nombre: texto(ficha.nombreComercial) || nombreEmpresa || CONSTROAD.nombre,
    asistente: perfil.asistente,
    horario: horarioLegible(perfil.horario),
    zona: perfil.zona,
    saludo: perfil.saludo || undefined,
    fueraDeHorario: perfil.fueraDeHorario || undefined,
    tono: perfil.tono,
    emojis: perfil.emojis,
    reglas: perfil.reglas,
    descripcion: texto(ficha.descripcion) || undefined,
    ofrece: lista(ficha.ofrece),
    noOfrece: lista(ficha.noOfrece),
    direccion: texto(ficha.direccion) || undefined,
    comoLlegar: texto(ficha.comoLlegar) || undefined,
    ...(contacto.telefono || contacto.correo || contacto.web ? { contacto } : {}),
    ...(config?.catalogo ? { catalogo: catalogoDe(config) } : {}),
  };
};

/**
 * A quién le llegan los avisos y cuáles: el grupo conectado (`ownerNotifyTarget`)
 * o el número del dueño, según lo elegido en A6; sin elección, el grupo.
 */
export const destinoDeAvisos = (
  config: { avisos?: unknown; ownerNotifyTarget?: string } | null | undefined
): { target?: string; casos: AvisosAsistente['casos']; quietHours?: { desde: string; hasta: string } } => {
  const avisos = avisosDe(config?.avisos);
  const grupo = texto(config?.ownerNotifyTarget) || undefined;
  const dueno = avisos.numeroDueno ? `${avisos.numeroDueno}@s.whatsapp.net` : undefined;
  return {
    target: avisos.canal === 'dueno' ? (dueno ?? grupo) : grupo,
    casos: avisos.casos,
    ...(avisos.descanso.activo ? { quietHours: { desde: avisos.descanso.desde, hasta: avisos.descanso.hasta } } : {}),
  };
};

/**
 * A quiénes va un aviso (A16): el canal elegido en «Avisos» (grupo o número
 * del dueño) más cada miembro del equipo con los avisos activos, sin repetir;
 * nada si ese caso está apagado.
 */
export const destinosDeAviso = (
  config: { ownerNotifyTarget?: string; notifyOn?: Partial<AvisosAsistente['casos']>; alertTargets?: string[]; quietHours?: { desde: string; hasta: string } },
  caso: keyof AvisosAsistente['casos'],
  ahoraMs = Date.now()
): string[] => {
  if (!(config.notifyOn?.[caso] ?? true)) return [];
  if (config.quietHours && enDescanso({ activo: true, ...config.quietHours }, ahoraMs)) return [];
  return [...new Set([config.ownerNotifyTarget, ...(config.alertTargets ?? [])].map((t) => texto(t)).filter(Boolean))];
};

/** ¿Dali está pausada? (`pausedUntil` en el futuro). */
export const pausada = (config: { pausedUntil?: Date | string | null } | null | undefined, ahoraMs = Date.now()): boolean =>
  Boolean(config?.pausedUntil) && new Date(config!.pausedUntil as string).getTime() > ahoraMs;

/** Minutos hasta las 08:00 de Lima del día siguiente: «Hasta mañana». */
export const minutosHastaManana = (ahoraMs = Date.now()): number => {
  const LIMA_MS = 5 * 3_600_000;
  const lima = new Date(ahoraMs - LIMA_MS);
  const mananaLas8 = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate() + 1, 8) + LIMA_MS;
  return Math.max(1, Math.round((mananaLas8 - ahoraMs) / 60_000));
};

const RUBRO: Record<string, string> = { asphalt: 'Asfalto', restaurant: 'Restaurante', appointments: 'Citas', transport: 'Transporte' };

export const leerAsistente = async (companyId: string): Promise<Asistente> => {
  const [Config, Company] = await Promise.all([getBotConfigModel(), getCompanyModel()]);
  const [config, company] = await Promise.all([Config.findOne({ companyId }).lean(), Company.findOne({ companyId }).select('name whatsappConfig.sender contactInfo').lean()]);
  const c = (config ?? {}) as Record<string, unknown>;
  const companyDoc = (company ?? {}) as Record<string, unknown>;
  return {
    enabled: Boolean(c.enabled),
    pausadoHasta: pausada(c as { pausedUntil?: Date }) ? new Date(c.pausedUntil as Date).toISOString() : undefined,
    perfil: perfilDe(c.perfil, { greeting: c.greeting as string | undefined, tone: c.tone as string | undefined }),
    avisos: avisosDe(c.avisos),
    handoffPauseMinutes: typeof c.handoffPauseMinutes === 'number' ? c.handoffPauseMinutes : SILENCIO_POR_DEFECTO_MIN,
    testNumbers: Array.isArray(c.testNumbers) ? c.testNumbers.map(String) : [],
    ownerNotifyTarget: texto(c.ownerNotifyTarget),
    empresa: {
      nombre: texto(companyDoc.name) || companyId,
      rubro: RUBRO[texto(c.vertical)] ?? '',
      ciudad: texto((companyDoc.contactInfo as Record<string, unknown> | undefined)?.city),
      numero: texto((companyDoc.whatsappConfig as Record<string, unknown> | undefined)?.sender),
    },
  };
};

export interface CambiosAsistente {
  enabled?: boolean;
  perfil?: Partial<PerfilAsistente>;
  avisos?: Partial<AvisosAsistente>;
  handoffPauseMinutes?: number;
  testNumbers?: string[];
}

const numerosDePrueba = (lista: string[]): string[] => [...new Set(lista.map((n) => String(n).replace(/\D/g, '')).filter((n) => /^\d{9,15}$/.test(n)))].slice(0, 20);

/** Lo que cambia se mezcla sobre lo guardado, campo a campo, y se valida entero. */
export const cambiosParaGuardar = (actual: Record<string, unknown>, cambios: CambiosAsistente): Record<string, unknown> => {
  const set: Record<string, unknown> = {};
  if (typeof cambios.enabled === 'boolean') set.enabled = cambios.enabled;
  if (cambios.perfil) {
    const previo = perfilDe(actual.perfil, { greeting: actual.greeting as string | undefined, tone: actual.tone as string | undefined });
    const horario = { ...previo.horario, ...(cambios.perfil.horario ?? {}) };
    const reglas = { ...previo.reglas, ...(cambios.perfil.reglas ?? {}) };
    set.perfil = perfilDe({ ...previo, ...cambios.perfil, horario, reglas });
  }
  if (cambios.avisos) {
    const previo = avisosDe(actual.avisos);
    set.avisos = avisosDe({ ...previo, ...cambios.avisos, casos: { ...previo.casos, ...(cambios.avisos.casos ?? {}) }, descanso: { ...previo.descanso, ...(cambios.avisos.descanso ?? {}) } });
  }
  if (typeof cambios.handoffPauseMinutes === 'number' && (SILENCIOS_MIN as readonly number[]).includes(cambios.handoffPauseMinutes)) set.handoffPauseMinutes = cambios.handoffPauseMinutes;
  if (Array.isArray(cambios.testNumbers)) set.testNumbers = numerosDePrueba(cambios.testNumbers);
  return set;
};

export const guardarAsistente = async (companyId: string, cambios: CambiosAsistente, quien: string): Promise<Asistente> => {
  const Config = await getBotConfigModel();
  const actual = ((await Config.findOne({ companyId }).lean()) ?? {}) as Record<string, unknown>;
  const set = cambiosParaGuardar(actual, cambios);
  if (Object.keys(set).length) {
    await Config.updateOne({ companyId }, { $set: set });
    logger.info(`[dali] ${quien} guardó el asistente de ${companyId}: ${Object.keys(set).join(', ')}`);
  }
  return leerAsistente(companyId);
};

/** Pausar a Dali un rato (30 min, 2 h, hasta mañana): el router no contesta hasta `pausedUntil`. 0 = reanudar. */
export const pausarAsistente = async (companyId: string, minutos: number, quien: string, ahoraMs = Date.now()): Promise<Asistente> => {
  const Config = await getBotConfigModel();
  const hasta = minutos > 0 ? new Date(ahoraMs + Math.min(minutos, PAUSA_MAXIMA_MIN) * 60_000) : null;
  await Config.updateOne({ companyId }, hasta ? { $set: { pausedUntil: hasta } } : { $unset: { pausedUntil: 1 } });
  logger.info(`[dali] ${quien} ${hasta ? `pausó a Dali de ${companyId} hasta ${hasta.toISOString()}` : `reanudó a Dali de ${companyId}`}`);
  return leerAsistente(companyId);
};
