import logger from '../../utils/logger.js';
import { COMPANY_PILOTO, destinoPermitido, destinosConAprobacion, type AlcanceAgente } from './alcance.js';
import { anotarMensaje, type Propuesta } from './sugerencias.js';
import { guardarPropuesta } from './persistencia.js';
import { agenteApagado } from './interruptor.js';

/**
 * EL ÚNICO LUGAR QUE MANDA MENSAJES. Dos puertas, y solo dos:
 *
 *  · `enviarAOperaciones` / `publicarPropuesta`: al grupo de error-tracking, sin
 *    aprobación. Es NUESTRO grupo; ahí el agente propone y se mide.
 *  · `enviarAprobado`: a un grupo de la empresa, y SOLO con una propuesta que
 *    una persona aprobó y cuyo destino está en la lista cerrada del alcance. No
 *    hay una tercera función.
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

/** Manda y devuelve el id del mensaje de WhatsApp, si el envío fue directo. */
const mandar = async (destino: string, texto: string): Promise<string | undefined> => {
  const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
  const resultado = (await WhatsAppDirectService.sendMessage(await sender(), destino, texto, {
    companyId: COMPANY_PILOTO,
  })) as { key?: { id?: string | null }; queued?: boolean } | undefined;
  return resultado?.key?.id || undefined;
};

export const enviarAOperaciones = async (texto: string): Promise<boolean> => {
  const destino = destinoPermitido();
  if (!destino) return false;
  await mandar(destino, texto);
  return true;
};

/**
 * Publica una propuesta en operaciones y le anota el id del mensaje: ese id es
 * lo que una respuesta citada trae, y es lo único que puede aprobarla.
 */
export const publicarPropuesta = async (propuesta: Propuesta, textoPublicado: string): Promise<boolean> => {
  const destino = destinoPermitido();
  if (!destino) return false;
  const msgId = await mandar(destino, textoPublicado);
  if (msgId) anotarMensaje(propuesta.id, msgId);
  else logger.warn(`[agente] la propuesta ${propuesta.id} salió sin id de mensaje (¿encolada?): no se va a poder aprobar por cita`);
  void guardarPropuesta(propuesta);
  return true;
};

const mandadas = new Set<string>();

/** Solo para tests. */
export const _resetEmisor = (): void => mandadas.clear();

/**
 * Manda una propuesta APROBADA a su destino real. Verifica las tres cosas que
 * la hacen legítima, y falla cerrado en cualquiera:
 *   1. la propuesta está en estado `aprobada` (una persona con permiso lo dijo);
 *   2. su destino es uno de los dos grupos de la empresa, según el alcance
 *      resuelto AHORA —no según lo que decía la propuesta al crearse—;
 *   3. no se mandó ya (una aprobación se consume).
 */
export const enviarAprobado = async (
  propuesta: Propuesta,
  alcance: AlcanceAgente
): Promise<boolean> => {
  if (agenteApagado()) {
    logger.warn(`[agente] la propuesta ${propuesta.id} está aprobada pero el agente está apagado: no se manda`);
    return false;
  }
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
  void guardarPropuesta(propuesta);
  logger.info(
    `[agente] propuesta ${propuesta.id} (${propuesta.tipo}) enviada a «${propuesta.nombreDestino}» ` +
      `con aprobación de ${propuesta.decididaPor}`
  );
  return true;
};
