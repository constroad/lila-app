import { GROUP_ERRORS_TRACKING } from '../../constants/whatsapp.constants.js';

/**
 * EL ALCANCE DEL AGENTE, y es una lista blanca de UNO.
 *
 * José, 09/09/2026: «solo y únicamente debe escuchar inframaq admin y responder
 * a errors tracking. Nada a ningún otro grupo o chat individual.»
 *
 * DE DÓNDE SALE CADA GRUPO, que no es lo mismo para los dos:
 *
 * · El DESTINO es `GROUP_ERRORS_TRACKING`, la constante que ya existe. Es
 *   NUESTRO grupo de operaciones, no el de una empresa — la misma excepción que
 *   ya estaba reconocida cuando se sacaron los JID de tenant del código.
 *
 * · El ESCUCHADO sale de `whatsappConfig.adminGroupId` de la empresa piloto, y
 *   NO de una constante. Ese sí es el grupo de un tenant, y el 03/09/2026 los
 *   JID de tenant clavados en el código produjeron 75 intentos de mandar datos
 *   de una empresa al WhatsApp de otra. Además, si inframaq cambia su grupo, el
 *   agente lo sigue solo.
 *
 * Lo único escrito acá es QUÉ EMPRESA está en el piloto, que es una decisión de
 * alcance de esta fase y no un dato de nadie. Se muda a la pantalla de
 * super-admin cuando exista.
 */

/** La empresa cuyo grupo de admin se escucha en la fase de espejo. */
export const COMPANY_PILOTO = 'inframaq-iax';

/**
 * Interruptor de la fase. En código y no en `.env` a propósito: lo único que
 * hace este agente es escribir en el grupo de operaciones, así que apagarlo con
 * un revert (3 min) es proporcional. Una variable de entorno «por las dudas» es
 * deuda de configuración que después nadie sabe si está puesta.
 */
export const AGENTE_CHECKLIST_ACTIVO = true;

/** Único destino de salida: el grupo de operaciones. */
export const grupoDestino = (): string => GROUP_ERRORS_TRACKING;

export interface AlcanceAgente {
  /** JID del grupo que se escucha, resuelto desde la empresa piloto. */
  grupoEscuchado: string;
}

/**
 * ¿Este mensaje entra al agente?
 *
 * Es una IGUALDAD contra un único JID, no un `includes` ni un prefijo: cualquier
 * cosa más laxa es la puerta por la que se cuela otro grupo.
 */
export const debeEscuchar = (jid: string, alcance: AlcanceAgente): boolean => {
  if (!AGENTE_CHECKLIST_ACTIVO) return false;
  const escuchado = String(alcance.grupoEscuchado || '').trim();
  if (!escuchado) return false;
  return String(jid || '').trim() === escuchado;
};

/**
 * ¿Se puede mandar a este destino? Solo el grupo de operaciones, y solo si es un
 * grupo: un `@s.whatsapp.net` acá sería un mensaje a una persona, que es
 * exactamente lo que José pidió que no pasara.
 */
export const puedeEnviarA = (jid: string): boolean => {
  if (!AGENTE_CHECKLIST_ACTIVO) return false;
  const pedido = String(jid || '').trim();
  if (!pedido.endsWith('@g.us')) return false;
  return pedido === grupoDestino();
};

/**
 * El destino, o `null` si no se puede enviar. Se usa así —y no leyendo la
 * constante directo— para que el guard sea imposible de saltear por olvido.
 */
export const destinoPermitido = (): string | null => {
  const destino = grupoDestino();
  return puedeEnviarA(destino) ? destino : null;
};

/**
 * El alcance real, leyendo el grupo de admin de la empresa piloto.
 *
 * Sin `adminGroupId` configurado devuelve vacío y el agente no escucha nada: un
 * agente apagado es un estado correcto; uno que escucha «todo» porque falta un
 * dato, no lo es nunca.
 */
export const resolverAlcance = async (
  buscarCompany: (companyId: string) => Promise<{ whatsappConfig?: { adminGroupId?: string } } | null>
): Promise<AlcanceAgente> => {
  try {
    const company = await buscarCompany(COMPANY_PILOTO);
    return { grupoEscuchado: String(company?.whatsappConfig?.adminGroupId || '').trim() };
  } catch {
    return { grupoEscuchado: '' };
  }
};
