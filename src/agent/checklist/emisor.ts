import logger from '../../utils/logger.js';
import { COMPANY_PILOTO, destinoPermitido, destinosConAprobacion, type AlcanceAgente } from './alcance.js';
import type { Propuesta } from './sugerencias.js';

/**
 * EL ÚNICO LUGAR QUE MANDA MENSAJES. Dos puertas, y solo dos:
 *
 *  · `enviarAOperaciones`: al grupo de error-tracking, sin aprobación. Es
 *    NUESTRO grupo; ahí el agente propone y se mide.
 *  · `enviarAprobado`: a un grupo de la empresa, y SOLO con una propuesta que
 *    una persona aprobó («1») y cuyo destino está en la lista cerrada del
 *    alcance. No hay una tercera función. Si alguien necesita mandar a otro
 *    lado, tiene que pasar por acá, y acá no puede.
 *
 * `WhatsAppDirectService` se carga con import dinámico: pitfall §13, este
 * módulo cuelga del grafo del observador, que cuelga de `sessions.simple.ts`.
 */

const sender = async (): Promise<string> => {
  const { getCompanyModel } = await import('../../database/models.js');
  const CompanyModel = await getCompanyModel();
  const company = (await CompanyModel.findOne({ companyId: COMPANY_PILOTO }).lean()) as
    | { whatsappConfig?: { sender?: string } }
    | null;
  return String(company?.whatsappConfig?.sender || '');
};

const mandar = async (destino: string, texto: string): Promise<void> => {
  const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
  await WhatsAppDirectService.sendMessage(await sender(), destino, texto, {
    companyId: COMPANY_PILOTO,
  });
};

export const enviarAOperaciones = async (texto: string): Promise<boolean> => {
  const destino = destinoPermitido();
  if (!destino) return false;
  await mandar(destino, texto);
  return true;
};

/**
 * Manda una propuesta APROBADA a su destino real. Verifica las tres cosas que
 * la hacen legítima, y falla cerrado en cualquiera:
 *   1. la propuesta está en estado `aprobada` (una persona dijo «1»);
 *   2. su destino es uno de los dos grupos de la empresa, según el alcance
 *      resuelto AHORA —no según lo que decía la propuesta al crearse—;
 *   3. no se mandó ya (una aprobación se consume).
 */
const mandadas = new Set<string>();

/** Solo para tests. */
export const _resetEmisor = (): void => mandadas.clear();

export const enviarAprobado = async (
  propuesta: Propuesta,
  alcance: AlcanceAgente
): Promise<boolean> => {
  if (propuesta.estado !== 'aprobada') {
    logger.warn(`[agente] se intentó mandar la propuesta ${propuesta.id} sin aprobación (${propuesta.estado})`);
    return false;
  }
  if (!destinosConAprobacion(alcance).includes(propuesta.destino)) {
    logger.error(
      `[agente] la propuesta ${propuesta.id} apunta a ${propuesta.destino}, que NO es un destino aprobable. No se manda.`
    );
    return false;
  }
  if (mandadas.has(propuesta.id)) return false;
  mandadas.add(propuesta.id);

  await mandar(propuesta.destino, propuesta.texto);
  logger.info(
    `[agente] propuesta ${propuesta.id} (${propuesta.tipo}) enviada a «${propuesta.nombreDestino}» ` +
      `con aprobación de ${propuesta.decididaPor}`
  );
  return true;
};
