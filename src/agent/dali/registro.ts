import { randomBytes, randomInt } from 'node:crypto';
import { getBotConfigModel } from '../../database/bot.models.js';
import { getCompanyModel } from '../../database/models.js';
import logger from '../../utils/logger.js';
import { INTENTOS_MAXIMOS, VIGENCIA_CODIGO_MS } from './acceso.js';
import { getBotMemberModel, normalizarIdentidad, type MiembroDali } from './miembros.js';

/**
 * REGISTRO (P4 → P6, spec DALI §2 «Alta de empresa» y §4 `registro`): el
 * auto-registro público. La persona cuenta su negocio (P4), recibe un código
 * en su WhatsApp y recién con el código correcto se crea todo —`companies`,
 * `bot_configs` con el pack del rubro, y ella como dueña en `bot_members`— y
 * queda con sesión; sin código no se escribe nada (un borrador en memoria,
 * 15 minutos). Después conecta su WhatsApp (P5, con A14) y carga su
 * conocimiento (P6, con A13). Hoy, sin constroad-auth, el código queda en el
 * log de lila como el de entrar; y solo el rubro Asfalto tiene pack.
 */
export interface Rubro {
  id: 'asphalt' | 'restaurant' | 'grifo' | 'lubricentro' | 'otro';
  nombre: string;
  detalle: string;
  disponible: boolean;
}

export const RUBROS: Rubro[] = [
  { id: 'asphalt', nombre: 'Asfalto y obras', detalle: 'm², mezclas, fletes', disponible: true },
  { id: 'restaurant', nombre: 'Restaurante', detalle: 'Pollerías, menú, delivery', disponible: false },
  { id: 'grifo', nombre: 'Grifo', detalle: 'Combustibles del día', disponible: false },
  { id: 'lubricentro', nombre: 'Lubricentro', detalle: 'Aceites, filtros, citas', disponible: false },
  { id: 'otro', nombre: 'Otro servicio comercial', detalle: 'Ferreterías, consultorías, talleres y venta', disponible: false },
];

export class RegistroInvalido extends Error {}

export interface DatosDeRegistro {
  negocio: string;
  rubro: 'asphalt';
  zona: string;
  nombre: string;
  /** Celular del dueño, E.164 sin «+»: su identidad en Dali y a dónde llegan los avisos. */
  whatsapp: string;
  asistente: string;
}

const textoDe = (v: unknown, max: number): string =>
  String(v ?? '')
    .trim()
    .slice(0, max);

export const datosDeRegistro = (input: Record<string, unknown>): DatosDeRegistro => {
  const negocio = textoDe(input.negocio, 80);
  if (negocio.length < 2) throw new RegistroInvalido('Escribe el nombre de tu negocio');
  const rubro = RUBROS.find((r) => r.id === input.rubro);
  if (!rubro) throw new RegistroInvalido('Elige el rubro de tu negocio');
  if (!rubro.disponible) throw new RegistroInvalido(`${rubro.nombre} todavía no está disponible: por ahora Dali atiende negocios de asfalto y obras`);
  const zona = textoDe(input.zona, 80);
  if (zona.length < 2) throw new RegistroInvalido('Escribe la ciudad o zona que atiendes');
  const nombre = textoDe(input.nombre, 60);
  if (nombre.length < 2) throw new RegistroInvalido('Escribe tu nombre');
  const whatsapp = normalizarIdentidad(textoDe(input.whatsapp, 20));
  if (!/^519\d{8}$/.test(whatsapp)) throw new RegistroInvalido('Escribe tu celular de 9 cifras');
  return { negocio, rubro: 'asphalt', zona, nombre, whatsapp, asistente: textoDe(input.asistente, 30) || 'Dali' };
};

/** «Asfaltos del Sur S.A.C.» → «asfaltos-del-sur-sac»; con «-2», «-3»… si ya existe. */
export const companyIdDe = (nombre: string, existe: (id: string) => boolean): string => {
  const base =
    nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\.(?=[a-z]\.|[a-z]$|\s*$)/g, '') // «S.A.C.» → «sac»
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'empresa';
  if (!existe(base)) return base;
  for (let n = 2; n < 1000; n += 1) if (!existe(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now().toString(36)}`;
};

interface Borrador {
  datos: DatosDeRegistro;
  codigo: string;
  creadoMs: number;
  intentos: number;
}

const VIGENCIA_BORRADOR_MS = 15 * 60_000;
const REENVIO_MINIMO_MS = 30_000;
const borradores = new Map<string, Borrador>();

/** Solo para tests. */
export const _resetRegistros = (): void => borradores.clear();

const limpiarVencidos = (ahoraMs: number): void => {
  for (const [token, b] of borradores) if (ahoraMs - b.creadoMs > VIGENCIA_BORRADOR_MS) borradores.delete(token);
};

export const iniciarRegistro = (input: Record<string, unknown>, deps: { generar?: () => string; ahoraMs?: number } = {}): { token: string; reintentoEnMs: number } => {
  const datos = datosDeRegistro(input);
  const ahora = deps.ahoraMs ?? Date.now();
  limpiarVencidos(ahora);
  const previo = [...borradores.values()].find((b) => b.datos.whatsapp === datos.whatsapp && ahora - b.creadoMs < REENVIO_MINIMO_MS);
  if (previo) throw new RegistroInvalido('Espera 30 segundos para pedir otro código');
  const token = randomBytes(12).toString('hex');
  const codigo = (deps.generar ?? (() => String(randomInt(0, 1_000_000)).padStart(6, '0')))();
  borradores.set(token, { datos, codigo, creadoMs: ahora, intentos: 0 });
  // F2: acá el código viaja por constroad-auth. Hoy queda en el log, como el de entrar.
  logger.info(`[dali] código de registro para ${datos.whatsapp} (${datos.negocio}, ${datos.nombre}): ${codigo} — vale ${VIGENCIA_CODIGO_MS / 60_000} min`);
  return { token, reintentoEnMs: REENVIO_MINIMO_MS };
};

export type ResultadoRegistro = { ok: true; miembro: MiembroDali } | { ok: false; motivo: 'sin-registro' | 'vencido' | 'incorrecto' | 'bloqueado' };

export const confirmarRegistro = async (
  token: string,
  codigo: string,
  deps: { crear?: (datos: DatosDeRegistro) => Promise<MiembroDali>; ahoraMs?: number } = {}
): Promise<ResultadoRegistro> => {
  const ahora = deps.ahoraMs ?? Date.now();
  const borrador = borradores.get(String(token || ''));
  if (!borrador) return { ok: false, motivo: 'sin-registro' };
  if (ahora - borrador.creadoMs > VIGENCIA_CODIGO_MS) {
    borradores.delete(token);
    return { ok: false, motivo: 'vencido' };
  }
  if (String(codigo || '').trim() !== borrador.codigo) {
    borrador.intentos += 1;
    if (borrador.intentos >= INTENTOS_MAXIMOS) {
      borradores.delete(token);
      logger.warn(`[dali] registro bloqueado por ${INTENTOS_MAXIMOS} intentos: ${borrador.datos.whatsapp}`);
      return { ok: false, motivo: 'bloqueado' };
    }
    return { ok: false, motivo: 'incorrecto' };
  }
  borradores.delete(token);
  const miembro = await (deps.crear ?? crearEmpresa)(borrador.datos);
  logger.info(`[dali] empresa nueva: ${miembro.companyId} (${borrador.datos.negocio}), dueño ${miembro.name} (${miembro.identity})`);
  return { ok: true, miembro };
};

/** Crea la empresa con el pack del rubro y a la persona como dueña, y devuelve el miembro para abrirle la sesión. */
export const crearEmpresa = async (datos: DatosDeRegistro): Promise<MiembroDali> => {
  const [Company, Config, Member] = await Promise.all([getCompanyModel(), getBotConfigModel(), getBotMemberModel()]);
  const existentes = new Set((await Company.find({}).select('companyId').lean()).map((c) => String(c.companyId)));
  const companyId = companyIdDe(datos.negocio, (id) => existentes.has(id));
  await Company.create({ companyId, name: datos.negocio, slug: companyId, isActive: true, limits: {} });
  await Config.create({
    companyId,
    vertical: datos.rubro,
    enabled: true,
    perfil: { asistente: datos.asistente, zona: datos.zona },
    avisos: { canal: 'dueno', numeroDueno: datos.whatsapp },
  });
  const miembro = await Member.create({ companyId, identity: datos.whatsapp, name: datos.nombre, role: 'owner', receivesAlerts: true, lastLoginAt: new Date() });
  return { id: String(miembro._id), companyId, identity: datos.whatsapp, name: datos.nombre, role: 'owner' };
};

/** P5: el número del negocio pasa a ser la línea de la empresa, salvo que ya sea la línea de otra. */
export class NumeroOcupado extends Error {}

export const asignarNumero = async (companyId: string, numeroCrudo: string): Promise<string> => {
  const numero = normalizarIdentidad(String(numeroCrudo || ''));
  if (!/^\d{10,15}$/.test(numero)) throw new RegistroInvalido('Escribe el celular del negocio, de 9 cifras');
  const Company = await getCompanyModel();
  const dueno = await Company.findOne({ 'whatsappConfig.sender': numero, companyId: { $ne: companyId } })
    .select('companyId')
    .lean();
  if (dueno) throw new NumeroOcupado('Ese número ya es la línea de otra empresa en Dali. Si es tuyo, escríbenos.');
  await Company.updateOne({ companyId }, { $set: { 'whatsappConfig.sender': numero } });
  return numero;
};
