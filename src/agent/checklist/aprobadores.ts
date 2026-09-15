import logger from '../../utils/logger.js';
import { GROUP_ERRORS_TRACKING } from '../../constants/whatsapp.constants.js';
import { COMPANY_PILOTO } from './alcance.js';

/**
 * QUIÉN PUEDE APROBAR: cualquiera que esté en el grupo de operaciones (José,
 * 13/09/2026: «sí, cualquiera del grupo»). El grupo es privado y es nuestro:
 * estar ahí es el permiso. Lo que evita el «1» accidental del contador no es
 * quién escribe sino CÓMO: citando la propuesta.
 *
 * QUIÉN PUEDE APAGAR el agente (`!lila off`): solo los ADMINISTRADORES del
 * grupo. Apagar es más grave que aprobar un mensaje.
 *
 * Ninguna lista de teléfonos en el código ni en un `.env`: se lee del grupo, y
 * hacer miembro o admin a alguien en WhatsApp es darle el permiso, sin deploy.
 * Se cachea 10 min: esto se consulta por cada voto.
 */

const CACHE_MS = 10 * 60_000;
type Roster = { admins: Set<string>; miembros: Set<string>; at: number };
/** Un roster por grupo: el de operaciones y el que se escucha (INFRAMAQ admin). */
const caches = new Map<string, Roster>();

/** Solo para tests. */
export const _resetAprobadores = (): void => caches.clear();

/** `51949376824:12@s.whatsapp.net` y `51949376824@s.whatsapp.net` son la misma persona. */
export const sinDispositivo = (jid: string): string => String(jid || '').replace(/:\d+@/, '@');

const cargar = async (ahoraMs = Date.now(), grupo: string = GROUP_ERRORS_TRACKING): Promise<{ admins: Set<string>; miembros: Set<string> }> => {
  const cache = caches.get(grupo);
  if (cache && ahoraMs - cache.at < CACHE_MS) return cache;
  try {
    const { getCompanyModel } = await import('../../database/models.js');
    const CompanyModel = await getCompanyModel();
    const company = (await CompanyModel.findOne({ companyId: COMPANY_PILOTO }).lean()) as
      | { whatsappConfig?: { sender?: string } }
      | null;
    const sender = String(company?.whatsappConfig?.sender || '');
    const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
    const { admins, miembros } = await WhatsAppDirectService.groupRoster(sender, grupo);
    const nuevo: Roster = { admins: new Set(admins.map(sinDispositivo)), miembros: new Set(miembros.map(sinDispositivo)), at: ahoraMs };
    caches.set(grupo, nuevo);
    logger.info(
      `[agente] grupo ${grupo === GROUP_ERRORS_TRACKING ? 'de operaciones' : grupo}: ${miembros.length} miembro(s); admins: ${admins.join(', ') || '(ninguno)'}`
    );
    return nuevo;
  } catch (error) {
    logger.warn(`[agente] no pude leer el grupo ${grupo}: ${error instanceof Error ? error.message : String(error)}`);
    return cache ?? { admins: new Set(), miembros: new Set() };
  }
};

/** Compatibilidad: lo que se loguea al arrancar. */
export const cargarAprobadores = async (ahoraMs = Date.now()): Promise<Set<string>> => (await cargar(ahoraMs)).miembros;

/**
 * Quién aprueba o descarta una propuesta, según DÓNDE se publicó: en el grupo
 * de operaciones, cualquiera (es nuestro); en el grupo que se escucha (INFRAMAQ
 * admin, donde están los clientes de la planta), solo sus ADMINISTRADORES.
 */
export const esAprobador = async (jid: string, ahoraMs = Date.now(), grupo: string = GROUP_ERRORS_TRACKING): Promise<boolean> => {
  const roster = await cargar(ahoraMs, grupo);
  return grupo === GROUP_ERRORS_TRACKING ? roster.miembros.has(sinDispositivo(jid)) : roster.admins.has(sinDispositivo(jid));
};

/** Solo un administrador apaga o prende (del grupo de operaciones o del que se escucha). */
export const esAdmin = async (jid: string, ahoraMs = Date.now(), grupo: string = GROUP_ERRORS_TRACKING): Promise<boolean> =>
  (await cargar(ahoraMs, grupo)).admins.has(sinDispositivo(jid));
