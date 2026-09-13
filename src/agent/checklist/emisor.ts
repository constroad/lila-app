import logger from '../../utils/logger.js';
import { AGENTE_ACTIVO, COMPANY_PILOTO, destinoPermitido, destinosConAprobacion, grupoDestino, type AlcanceAgente } from './alcance.js';
import { anotarMensaje, type Propuesta } from './sugerencias.js';
import { guardarPropuesta } from './persistencia.js';
import { agenteApagado } from './interruptor.js';

/**
 * EL ÚNICO LUGAR QUE MANDA MENSAJES. Tres puertas, y solo tres:
 *
 *  · `enviarAOperaciones` / `publicarPropuesta`: al grupo de error-tracking, sin
 *    aprobación. Es NUESTRO grupo; ahí el agente propone y se mide.
 *  · `enviarAprobado`: a un grupo de la empresa, y SOLO con una propuesta que
 *    una persona aprobó y cuyo destino está en la lista cerrada del alcance.
 *  · `responderEnGrupo`: la respuesta a una CONSULTA, en el grupo donde se
 *    preguntó, y solo si ese grupo es el que se escucha. Sin aprobación porque
 *    una consulta es de solo lectura sobre un read model whitelisted: lo peor
 *    que puede pasar es una respuesta equivocada, no un mensaje a quien no
 *    debía. José, 13/09/2026, pidió el diálogo directo («deberías preguntarme
 *    si hay más de una producción»), y eso no se puede hacer a través de un
 *    espejo.
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

export interface ArchivoAEnviar {
  tipo: 'image' | 'video' | 'document';
  url: string;
  nombre: string;
  mime?: string;
  caption?: string;
}

/**
 * Texto y archivos al grupo que preguntó. El destino se compara contra el
 * alcance resuelto AHORA, y nada más pasa: ni otro grupo, ni una persona.
 */
export const responderEnGrupo = async (
  destino: string,
  respuesta: { texto?: string; archivos?: ArchivoAEnviar[] },
  alcance: AlcanceAgente
): Promise<boolean> => {
  if (!AGENTE_ACTIVO || agenteApagado()) return false;
  const jid = String(destino || '').trim();
  // Solo el grupo que se escucha o el nuestro de operaciones: donde se pregunta, se responde.
  if (!jid || (jid !== alcance.grupoEscuchado && jid !== grupoDestino())) {
    logger.error(`[agente] se intentó responder en ${jid || '(vacío)'}, que no es un grupo donde se atienden consultas. No se manda.`);
    return false;
  }
  if (respuesta.texto?.trim()) await mandar(jid, respuesta.texto);
  if (respuesta.archivos?.length) {
    const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
    const id = await sender();
    for (const a of respuesta.archivos) {
      const opciones = { fileUrl: a.url, fileName: a.nombre, caption: a.caption, mimeType: a.mime, companyId: COMPANY_PILOTO };
      try {
        if (a.tipo === 'image') await WhatsAppDirectService.sendImageFile(id, jid, opciones);
        else if (a.tipo === 'video') await WhatsAppDirectService.sendVideoFile(id, jid, opciones);
        else await WhatsAppDirectService.sendDocument(id, jid, opciones);
      } catch (error) {
        logger.warn(`[agente] no pude mandar «${a.nombre}»: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
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
  if (!AGENTE_ACTIVO) return false;
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
