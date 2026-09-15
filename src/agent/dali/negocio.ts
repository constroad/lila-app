import { getBotConfigModel } from '../../database/bot.models.js';
import { getCompanyModel } from '../../database/models.js';
import logger from '../../utils/logger.js';
import { perfilDe } from './asistente.js';

/**
 * LA FICHA DEL NEGOCIO (A7, spec DALI §3 `bot_configs.negocio`): cómo se
 * describe la empresa, dónde está, cómo llegar, contactos, qué ofrece y qué
 * no. Lo que no está guardado sale de la empresa de Portal (nombre, RUC,
 * dirección, teléfono, correo) para que la ficha nunca arranque vacía. La
 * zona que atiende es la del perfil (A6): un solo dato. El motor lo lee en
 * `negocioDe` (descripción, ofrece, no ofrece, dónde está, cómo llegar).
 */
export interface ContactoNegocio {
  /** El número de Dali (la sesión de la empresa): solo se muestra. */
  whatsapp: string;
  telefono: string;
  correo: string;
  redSocial: string;
}

export interface FichaNegocio {
  nombreComercial: string;
  descripcion: string;
  ruc: string;
  web: string;
  direccion: string;
  zona: string;
  comoLlegar: string;
  contacto: ContactoNegocio;
  ofrece: string[];
  noOfrece: string[];
}

/** Lo que se guarda en `bot_configs.negocio` (la zona vive en el perfil; el WhatsApp, en la empresa). */
export type NegocioGuardado = Omit<FichaNegocio, 'zona' | 'contacto'> & { contacto: Omit<ContactoNegocio, 'whatsapp'> };

export const LARGOS_FICHA = { nombre: 80, descripcion: 240, web: 120, direccion: 200, comoLlegar: 400, texto: 80, lista: 30, zona: 120 } as const;

const texto = (v: unknown, max: number): string => (v == null ? '' : String(v)).trim().slice(0, max);
const lista = (v: unknown): string[] => {
  const vistas = new Set<string>();
  const limpia: string[] = [];
  for (const cruda of Array.isArray(v) ? v : []) {
    const t = texto(cruda, LARGOS_FICHA.texto);
    if (!t || vistas.has(t.toLowerCase())) continue;
    vistas.add(t.toLowerCase());
    limpia.push(t);
  }
  return limpia.slice(0, LARGOS_FICHA.lista);
};
const rucDe = (v: unknown): string => {
  const d = texto(v, 20).replace(/\D/g, '');
  return d.length === 11 ? d : '';
};

interface EmpresaPortal {
  name?: unknown;
  ruc?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  whatsappConfig?: { sender?: unknown };
}

/** La ficha completa: lo guardado, y donde no hay nada, lo de la empresa. */
export const fichaDe = (guardado: unknown, empresa: EmpresaPortal | null | undefined, zona: string): FichaNegocio => {
  const g = (guardado ?? {}) as Partial<NegocioGuardado>;
  const c = (g.contacto ?? {}) as Partial<ContactoNegocio>;
  return {
    nombreComercial: texto(g.nombreComercial, LARGOS_FICHA.nombre) || texto(empresa?.name, LARGOS_FICHA.nombre),
    descripcion: texto(g.descripcion, LARGOS_FICHA.descripcion),
    ruc: rucDe(g.ruc) || rucDe(empresa?.ruc),
    web: texto(g.web, LARGOS_FICHA.web),
    direccion: texto(g.direccion, LARGOS_FICHA.direccion) || texto(empresa?.address, LARGOS_FICHA.direccion),
    zona,
    comoLlegar: texto(g.comoLlegar, LARGOS_FICHA.comoLlegar),
    contacto: {
      whatsapp: texto(empresa?.whatsappConfig?.sender, 20),
      telefono: texto(c.telefono, LARGOS_FICHA.texto) || texto(empresa?.phone, LARGOS_FICHA.texto),
      correo: texto(c.correo, LARGOS_FICHA.texto) || texto(empresa?.email, LARGOS_FICHA.texto),
      redSocial: texto(c.redSocial, LARGOS_FICHA.texto),
    },
    ofrece: lista(g.ofrece),
    noOfrece: lista(g.noOfrece),
  };
};

/** Lo que manda el panel, mezclado sobre lo guardado y limpio; la zona aparte, porque va al perfil. */
export type CambiosFicha = Partial<Omit<FichaNegocio, 'contacto'>> & { contacto?: Partial<ContactoNegocio> };

export const cambiosDeFicha = (actual: unknown, cambios: CambiosFicha): { negocio: NegocioGuardado; zona?: string } => {
  const a = (actual ?? {}) as Partial<NegocioGuardado>;
  const ca = (a.contacto ?? {}) as Partial<ContactoNegocio>;
  const cc = (cambios.contacto ?? {}) as Partial<ContactoNegocio>;
  const campo = (clave: keyof Omit<NegocioGuardado, 'contacto' | 'ofrece' | 'noOfrece'>, max: number) => texto(clave in cambios ? cambios[clave] : a[clave], max);
  const negocio: NegocioGuardado = {
    nombreComercial: campo('nombreComercial', LARGOS_FICHA.nombre),
    descripcion: campo('descripcion', LARGOS_FICHA.descripcion),
    ruc: rucDe('ruc' in cambios ? cambios.ruc : a.ruc),
    web: campo('web', LARGOS_FICHA.web),
    direccion: campo('direccion', LARGOS_FICHA.direccion),
    comoLlegar: campo('comoLlegar', LARGOS_FICHA.comoLlegar),
    contacto: {
      telefono: texto('telefono' in cc ? cc.telefono : ca.telefono, LARGOS_FICHA.texto),
      correo: texto('correo' in cc ? cc.correo : ca.correo, LARGOS_FICHA.texto),
      redSocial: texto('redSocial' in cc ? cc.redSocial : ca.redSocial, LARGOS_FICHA.texto),
    },
    ofrece: lista('ofrece' in cambios ? cambios.ofrece : a.ofrece),
    noOfrece: lista('noOfrece' in cambios ? cambios.noOfrece : a.noOfrece),
  };
  const zona = typeof cambios.zona === 'string' ? texto(cambios.zona, LARGOS_FICHA.zona) : undefined;
  return { negocio, ...(zona !== undefined ? { zona } : {}) };
};

export const leerNegocio = async (companyId: string): Promise<FichaNegocio> => {
  const [Config, Company] = await Promise.all([getBotConfigModel(), getCompanyModel()]);
  const [config, company] = await Promise.all([Config.findOne({ companyId }).select('negocio perfil greeting tone').lean(), Company.findOne({ companyId }).select('name ruc email phone address whatsappConfig.sender').lean()]);
  const c = (config ?? {}) as Record<string, unknown>;
  const perfil = perfilDe(c.perfil, { greeting: c.greeting as string | undefined, tone: c.tone as string | undefined });
  return fichaDe(c.negocio, company as EmpresaPortal | null, perfil.zona);
};

export const guardarNegocio = async (companyId: string, cambios: CambiosFicha, quien: string): Promise<FichaNegocio> => {
  const Config = await getBotConfigModel();
  const actual = ((await Config.findOne({ companyId }).select('negocio perfil greeting tone').lean()) ?? {}) as Record<string, unknown>;
  const { negocio, zona } = cambiosDeFicha(actual.negocio, cambios);
  const set: Record<string, unknown> = { negocio };
  if (zona !== undefined) {
    const perfil = perfilDe(actual.perfil, { greeting: actual.greeting as string | undefined, tone: actual.tone as string | undefined });
    set.perfil = { ...perfil, zona: zona || perfil.zona };
  }
  await Config.updateOne({ companyId }, { $set: set });
  logger.info(`[dali] ${quien} guardó la ficha del negocio de ${companyId}`);
  return leerNegocio(companyId);
};
