import logger from '../../utils/logger.js';
import { GROUP_ERRORS_TRACKING } from '../../constants/whatsapp.constants.js';
import { COMPANY_PILOTO } from './alcance.js';

/**
 * QUIÉN PUEDE APROBAR: los ADMINISTRADORES de WhatsApp del grupo de operaciones.
 *
 * No es una lista de teléfonos en el código ni en un `.env`: es una regla que se
 * mantiene sola. Quien administra el grupo de error-tracking decide qué le
 * llega a la gente que trabaja; hacer admin a alguien en WhatsApp es darle ese
 * permiso, sin deploy. José, 13/09/2026: «¿qué pasa si el contador escribe
 * inmediatamente después?» — el contador no es admin.
 *
 * Se cachea 10 min: los admins de un grupo no cambian cada minuto y esto se
 * consulta por cada voto.
 */

const CACHE_MS = 10 * 60_000;
let cache: { admins: Set<string>; at: number } | null = null;

/** Solo para tests. */
export const _resetAprobadores = (): void => void (cache = null);

/** `51949376824:12@s.whatsapp.net` y `51949376824@s.whatsapp.net` son la misma persona. */
export const sinDispositivo = (jid: string): string => String(jid || '').replace(/:\d+@/, '@');

export const cargarAprobadores = async (ahoraMs = Date.now()): Promise<Set<string>> => {
  if (cache && ahoraMs - cache.at < CACHE_MS) return cache.admins;
  try {
    const { getCompanyModel } = await import('../../database/models.js');
    const CompanyModel = await getCompanyModel();
    const company = (await CompanyModel.findOne({ companyId: COMPANY_PILOTO }).lean()) as
      | { whatsappConfig?: { sender?: string } }
      | null;
    const sender = String(company?.whatsappConfig?.sender || '');
    const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
    const admins = await WhatsAppDirectService.groupAdmins(sender, GROUP_ERRORS_TRACKING);
    cache = { admins: new Set(admins.map(sinDispositivo)), at: ahoraMs };
    logger.info(`[agente] aprobadores (admins del grupo de operaciones): ${admins.join(', ') || '(ninguno)'}`);
    return cache.admins;
  } catch (error) {
    logger.warn(`[agente] no pude leer los admins del grupo de operaciones: ${error instanceof Error ? error.message : String(error)}`);
    return cache?.admins ?? new Set();
  }
};

export const esAprobador = async (jid: string, ahoraMs = Date.now()): Promise<boolean> =>
  (await cargarAprobadores(ahoraMs)).has(sinDispositivo(jid));
