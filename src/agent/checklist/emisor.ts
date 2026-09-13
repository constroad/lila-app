import logger from '../../utils/logger.js';
import { AGENTE_ACTIVO, COMPANY_PILOTO, EMPRESAS_CON_PEDIDOS, destinoPermitido, destinosConAprobacion, grupoDestino, type AlcanceAgente } from './alcance.js';
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
  /** Dueña del archivo. Tiene que estar en `EMPRESAS_CON_PEDIDOS`. */
  companyId: string;
  /** Generado en memoria (imagen renderizada): se manda tal cual. */
  buffer?: Buffer;
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
  const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
  const id = await sender();
  // «Escribiendo…» un momento antes de contestar. Lo justo para que parezca
  // una persona y no un cañón; proporcional al largo de lo que va a decir.
  await WhatsAppDirectService.setTyping(id, jid, true);
  await new Promise((r) => setTimeout(r, Math.min(600 + (respuesta.texto?.length ?? 0) * 8, 2_500)));
  if (respuesta.texto?.trim()) await mandar(jid, respuesta.texto);
  if (respuesta.archivos?.length) {
    const { resolveFileBuffer } = await import('../../services/whatsapp-media.utils.js');
    for (const a of respuesta.archivos) {
      // El storage está aislado por empresa: el archivo se LEE con la empresa
      // dueña (globofast, constroad…) y se MANDA desde la sesión de inframaq.
      // Solo empresas del piloto: es la lista cerrada de cuyos datos el agente
      // puede hablar en este grupo. (13/09: «File not found» por leerlo con la
      // empresa equivocada.)
      if (!a.buffer && !(EMPRESAS_CON_PEDIDOS as readonly string[]).includes(a.companyId)) {
        logger.error(`[agente] archivo de ${a.companyId}, fuera del piloto: no se manda`);
        continue;
      }
      const inicio = Date.now();
      try {
        const leido = a.buffer
          ? { buffer: a.buffer, mimeType: a.mime || 'image/png', fileName: a.nombre }
          : await resolveFileBuffer({ companyId: a.companyId, fileUrl: a.url, mimeType: a.mime, fileName: a.nombre });
        if (!leido) throw new Error('no se pudo leer del storage');
        // El mime sin parámetros: «video/mp4;codecs=…» es lo que grabó el
        // navegador; WhatsApp quiere «video/mp4».
        const mime = String(leido.mimeType || a.mime || '').split(';')[0].trim() || undefined;
        const opciones = { buffer: leido.buffer, fileName: leido.fileName || a.nombre, caption: a.caption, mimeType: mime, companyId: COMPANY_PILOTO, queueOnFail: false };
        logger.info(`[agente] mandando ${a.tipo} «${a.nombre}» (${Math.round(leido.buffer.length / 1024)} KB, ${mime})`);
        // Límite propio por archivo: un video colgado no puede dejar «escribiendo…»
        // para siempre ni frenar lo que viene después. Y deja rastro: el 13/09 un
        // video no llegó y no había ni éxito ni error en el log.
        const envio =
          a.tipo === 'image'
            ? WhatsAppDirectService.sendImageFile(id, jid, opciones)
            : a.tipo === 'video'
              ? WhatsAppDirectService.sendVideoFile(id, jid, opciones)
              : WhatsAppDirectService.sendDocument(id, jid, opciones);
        const resultado = (await Promise.race([
          envio,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('límite de 90 s del agente')), 90_000)),
        ])) as { key?: { id?: string | null }; queued?: boolean } | undefined;
        logger.info(
          `[agente] ${a.tipo} «${a.nombre}» ${resultado?.queued ? 'ENCOLADO (no salió)' : `enviado (id ${resultado?.key?.id ?? '?'})`} en ${((Date.now() - inicio) / 1000).toFixed(1)} s`
        );
      } catch (error) {
        logger.warn(`[agente] no pude mandar «${a.nombre}» tras ${((Date.now() - inicio) / 1000).toFixed(1)} s: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  await WhatsAppDirectService.setTyping(id, jid, false);
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
