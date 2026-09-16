import { Schema, type Model } from 'mongoose';
import { getSharedConnection } from '../../database/sharedConnection.js';

/**
 * QUIÉN ENTRA A DALI (spec DALI §3, `bot_members`): la identidad con la que la
 * persona pide su código (teléfono E.164 sin «+», o correo), la empresa a la
 * que pertenece y su rol dentro de Dali. Es el espejo mínimo de `miembros` de
 * constroad-auth (F2); hasta entonces es la única lista.
 */
export type RolDali = 'owner' | 'sales' | 'viewer' | 'operator';

/**
 * El operador de la plataforma (José; spec §2 «rol operator») también vive en
 * `bot_members`, con esta empresa ficticia: no pertenece a ninguna. Entra con
 * su identidad como cualquiera y desde su panel pasa a la consola (S1–S4).
 */
export const EMPRESA_OPERADOR = '*';

export interface IBotMember {
  companyId: string;
  /** Teléfono sin «+» ni espacios, o correo en minúsculas. */
  identity: string;
  name: string;
  role: RolDali;
  receivesAlerts: boolean;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const BotMemberSchema = new Schema<IBotMember>(
  {
    companyId: { type: String, required: true, index: true },
    identity: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['owner', 'sales', 'viewer', 'operator'], required: true },
    receivesAlerts: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { collection: 'bot_members', timestamps: true }
);
BotMemberSchema.index({ identity: 1, companyId: 1 }, { unique: true });

let model: Model<IBotMember> | null = null;
export const getBotMemberModel = async (): Promise<Model<IBotMember>> => {
  if (model) return model;
  const conn = await getSharedConnection();
  model = (conn.models.BotMember as Model<IBotMember>) || conn.model<IBotMember>('BotMember', BotMemberSchema);
  return model;
};

/** «+51 949 376 824» → «51949376824»; «Jose@Mail.com » → «jose@mail.com». */
export const normalizarIdentidad = (destino: string): string => {
  const t = String(destino || '').trim();
  if (t.includes('@')) return t.toLowerCase();
  const digitos = t.replace(/\D/g, '');
  // Un celular peruano de 9 cifras sin código de país es de Perú.
  return digitos.length === 9 ? `51${digitos}` : digitos;
};

export const esIdentidadValida = (identidad: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identidad) || /^\d{10,15}$/.test(identidad);

export interface MiembroDali {
  id: string;
  companyId: string;
  identity: string;
  name: string;
  role: RolDali;
}

const aMiembro = (d: IBotMember & { _id: unknown }): MiembroDali => ({
  id: String(d._id),
  companyId: d.companyId,
  identity: d.identity,
  name: d.name,
  role: d.role,
});

/**
 * El miembro por su identidad. Una identidad puede estar en varias empresas:
 * se devuelve la primera (F2 elegirá). Su ficha de operador, si la tiene, va
 * última: uno entra a su empresa y desde ahí pasa a la consola.
 */
export const miembroPorIdentidad = async (identidad: string): Promise<MiembroDali | null> => {
  const Member = await getBotMemberModel();
  const doc =
    (await Member.findOne({ identity: identidad, role: { $ne: 'operator' } })
      .sort({ updatedAt: -1 })
      .lean()) ?? (await Member.findOne({ identity: identidad, role: 'operator' }).lean());
  return doc ? aMiembro(doc as IBotMember & { _id: unknown }) : null;
};

/** La ficha de operador de una identidad (`companyId` `*`), o null si no es operador. */
export const operadorPorIdentidad = async (identidad: string): Promise<MiembroDali | null> => {
  const Member = await getBotMemberModel();
  const doc = await Member.findOne({ identity: identidad, role: 'operator', companyId: EMPRESA_OPERADOR }).lean();
  return doc ? aMiembro(doc as IBotMember & { _id: unknown }) : null;
};

export const miembrosDeEmpresa = async (companyId: string): Promise<Array<MiembroDali & { receivesAlerts: boolean; lastLoginAt?: Date }>> => {
  const Member = await getBotMemberModel();
  const docs = await Member.find({ companyId }).sort({ createdAt: 1 }).lean();
  return docs.map((d) => ({ ...aMiembro(d as IBotMember & { _id: unknown }), receivesAlerts: d.receivesAlerts !== false, lastLoginAt: d.lastLoginAt }));
};

export const registrarIngreso = async (id: string): Promise<void> => {
  const Member = await getBotMemberModel();
  await Member.updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } });
};
