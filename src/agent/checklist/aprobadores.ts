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
let cache: { admins: Set<string>; miembros: Set<string>; at: number } | null = null;

/** Solo para tests. */
export const _resetAprobadores = (): void => void (cache = null);

/** `51949376824:12@s.whatsapp.net` y `51949376824@s.whatsapp.net` son la misma persona. */
export const sinDispositivo = (jid: string): string => String(jid || '').replace(/:\d+@/, '@');

const cargar = async (ahoraMs = Date.now()): Promise<{ admins: Set<string>; miembros: Set<string> }> => {
  if (cache && ahoraMs - cache.at < CACHE_MS) return cache;
  try {
    const { getCompanyModel } = await import('../../database/models.js');
    const CompanyModel = await getCompanyModel();
    const company = (await CompanyModel.findOne({ companyId: COMPANY_PILOTO }).lean()) as
      | { whatsappConfig?: { sender?: string } }
      | null;
    const sender = String(company?.whatsappConfig?.sender || '');
    const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
    const { admins, miembros } = await WhatsAppDirectService.groupRoster(sender, GROUP_ERRORS_TRACKING);
    cache = { admins: new Set(admins.map(sinDispositivo)), miembros: new Set(miembros.map(sinDispositivo)), at: ahoraMs };
    logger.info(
      `[agente] grupo de operaciones: ${miembros.length} miembro(s) pueden aprobar; admins (pueden apagar): ${admins.join(', ') || '(ninguno)'}`
    );
    return cache;
  } catch (error) {
    logger.warn(`[agente] no pude leer el grupo de operaciones: ${error instanceof Error ? error.message : String(error)}`);
    return cache ?? { admins: new Set(), miembros: new Set() };
  }
};

/** Compatibilidad: lo que se loguea al arrancar. */
export const cargarAprobadores = async (ahoraMs = Date.now()): Promise<Set<string>> => (await cargar(ahoraMs)).miembros;

/** Cualquiera del grupo de operaciones aprueba o descarta. */
export const esAprobador = async (jid: string, ahoraMs = Date.now()): Promise<boolean> =>
  (await cargar(ahoraMs)).miembros.has(sinDispositivo(jid));

/** Solo un administrador apaga o prende. */
export const esAdmin = async (jid: string, ahoraMs = Date.now()): Promise<boolean> =>
  (await cargar(ahoraMs)).admins.has(sinDispositivo(jid));
