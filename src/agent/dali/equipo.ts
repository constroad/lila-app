import { esIdentidadValida, getBotMemberModel, normalizarIdentidad, type IBotMember, type RolDali } from './miembros.js';

/**
 * EQUIPO (A16, spec DALI §4 `equipo`): quién puede entrar al panel de la
 * empresa y quién recibe los avisos de Dali por WhatsApp. Es `bot_members`
 * administrado desde el panel: invitar (= dar acceso: la persona entra con
 * su celular o correo pidiendo su código), cambiar el rol, prender o apagar
 * sus avisos y quitarla. Un miembro es «pendiente» hasta su primer ingreso.
 * El último dueño no se puede quitar ni degradar. Los avisos (leads,
 * escaladas, fallos) salen al canal de A6 y, además, a cada miembro con
 * celular y avisos activos (`jidsConAvisos` → `AgentBotConfig.alertTargets`).
 */
export const ROLES: RolDali[] = ['owner', 'sales', 'viewer'];
/** Personas por empresa en el piloto (no hay plan con cupos todavía). */
export const CUPO_MIEMBROS = 5;

export class EquipoInvalido extends Error {}

export interface MiembroEquipo {
  id: string;
  nombre: string;
  identidad: string;
  rol: RolDali;
  recibeAvisos: boolean;
  pendiente: boolean;
  ultimoIngreso?: string;
  invitadoEl?: string;
}

export interface Equipo {
  miembros: MiembroEquipo[];
  activos: number;
  pendientes: number;
  cupo: { usados: number; limite: number };
}

type MiembroGuardado = Pick<IBotMember, 'companyId' | 'identity' | 'name' | 'role' | 'receivesAlerts' | 'lastLoginAt' | 'createdAt'> & { id: string };

export const miembroLegible = (m: MiembroGuardado, _ahoraMs = Date.now()): MiembroEquipo => ({
  id: m.id,
  nombre: m.name,
  identidad: m.identity,
  rol: m.role,
  recibeAvisos: m.receivesAlerts !== false,
  pendiente: !m.lastLoginAt,
  ultimoIngreso: m.lastLoginAt ? new Date(m.lastLoginAt).toISOString() : undefined,
  invitadoEl: m.createdAt ? new Date(m.createdAt).toISOString() : undefined,
});

export interface Invitacion {
  destino: string;
  nombre: string;
  rol: string;
  recibeAvisos: boolean;
}

/** Lo que manda el panel, normalizado; lanza `EquipoInvalido` con el motivo para la persona. */
export const invitacionDe = (i: Invitacion): { identity: string; name: string; role: RolDali; receivesAlerts: boolean } => {
  const identity = normalizarIdentidad(String(i.destino ?? ''));
  if (!esIdentidadValida(identity)) throw new EquipoInvalido('Escribe un celular de 9 dígitos o un correo válido');
  const name = String(i.nombre ?? '')
    .trim()
    .slice(0, 60);
  if (!name) throw new EquipoInvalido('Ponle nombre a la persona');
  if (!ROLES.includes(i.rol as RolDali)) throw new EquipoInvalido('Elige un rol: dueño, ventas o solo lectura');
  return { identity, name, role: i.rol as RolDali, receivesAlerts: Boolean(i.recibeAvisos) };
};

/** ¿Quitar (o degradar) a este miembro deja a la empresa sin ningún dueño? */
export const quedaSinDueno = (equipo: MiembroGuardado[], id: string): boolean => {
  const m = equipo.find((x) => x.id === id);
  if (!m || m.role !== 'owner') return false;
  return !equipo.some((x) => x.id !== id && x.role === 'owner');
};

/** Los JIDs a los que van los avisos: miembros con celular (no correo) y avisos activos. */
export const jidsDe = (equipo: Array<Pick<IBotMember, 'identity' | 'receivesAlerts'>>): string[] =>
  equipo.filter((m) => m.receivesAlerts !== false && /^\d{10,15}$/.test(m.identity)).map((m) => `${m.identity}@s.whatsapp.net`);

const aGuardado = (d: IBotMember & { _id: unknown }): MiembroGuardado => ({
  id: String(d._id),
  companyId: d.companyId,
  identity: d.identity,
  name: d.name,
  role: d.role,
  receivesAlerts: d.receivesAlerts,
  lastLoginAt: d.lastLoginAt,
  createdAt: d.createdAt,
});

const equipoGuardado = async (companyId: string): Promise<MiembroGuardado[]> => {
  const Member = await getBotMemberModel();
  const docs = await Member.find({ companyId }).sort({ createdAt: 1 }).lean();
  return docs.map((d) => aGuardado(d as IBotMember & { _id: unknown }));
};

export const jidsConAvisos = async (companyId: string): Promise<string[]> => jidsDe(await equipoGuardado(companyId));

export const listarEquipo = async (companyId: string, ahoraMs = Date.now()): Promise<Equipo> => {
  const miembros = (await equipoGuardado(companyId)).map((m) => miembroLegible(m, ahoraMs));
  const pendientes = miembros.filter((m) => m.pendiente).length;
  return { miembros, activos: miembros.length - pendientes, pendientes, cupo: { usados: miembros.length, limite: CUPO_MIEMBROS } };
};

export const invitarMiembro = async (companyId: string, invitacion: Invitacion): Promise<MiembroEquipo> => {
  const datos = invitacionDe(invitacion);
  const equipo = await equipoGuardado(companyId);
  if (equipo.some((m) => m.identity === datos.identity)) throw new EquipoInvalido('Esa persona ya está en el equipo');
  if (equipo.length >= CUPO_MIEMBROS) throw new EquipoInvalido(`El piloto admite hasta ${CUPO_MIEMBROS} personas por empresa`);
  const Member = await getBotMemberModel();
  const creado = await Member.create({ companyId, ...datos });
  return miembroLegible(aGuardado(creado.toObject() as IBotMember & { _id: unknown }));
};

export interface CambiosMiembro {
  rol?: string;
  recibeAvisos?: boolean;
}

export const cambiarMiembro = async (companyId: string, id: string, cambios: CambiosMiembro): Promise<MiembroEquipo | null> => {
  const equipo = await equipoGuardado(companyId);
  const actual = equipo.find((m) => m.id === id);
  if (!actual) return null;
  const set: Partial<Pick<IBotMember, 'role' | 'receivesAlerts'>> = {};
  if (cambios.rol !== undefined) {
    if (!ROLES.includes(cambios.rol as RolDali)) throw new EquipoInvalido('Elige un rol: dueño, ventas o solo lectura');
    if (cambios.rol !== 'owner' && quedaSinDueno(equipo, id)) throw new EquipoInvalido('La empresa se quedaría sin dueño: nombra a otro dueño primero');
    set.role = cambios.rol as RolDali;
  }
  if (cambios.recibeAvisos !== undefined) set.receivesAlerts = Boolean(cambios.recibeAvisos);
  const Member = await getBotMemberModel();
  const doc = await Member.findOneAndUpdate({ _id: id, companyId }, { $set: set }, { new: true }).lean();
  return doc ? miembroLegible(aGuardado(doc as IBotMember & { _id: unknown })) : null;
};

export const quitarMiembro = async (companyId: string, id: string): Promise<boolean> => {
  const equipo = await equipoGuardado(companyId);
  if (!equipo.some((m) => m.id === id)) return false;
  if (quedaSinDueno(equipo, id)) throw new EquipoInvalido('La empresa se quedaría sin dueño: nombra a otro dueño primero');
  const Member = await getBotMemberModel();
  await Member.deleteOne({ _id: id, companyId });
  return true;
};
