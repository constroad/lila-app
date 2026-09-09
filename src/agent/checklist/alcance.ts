/**
 * EL ALCANCE DEL AGENTE, y es una lista blanca de UNO.
 *
 * José, 09/09/2026: «solo y únicamente debe escuchar inframaq admin y responder
 * a errors tracking. Nada a ningún otro grupo o chat individual.»
 *
 * POR QUÉ SE ESCRIBE COMO CÓDIGO Y NO COMO CONFIG. Un agente que habla en un
 * grupo de trabajo se gana la desconfianza de una sola vez: basta un mensaje en
 * el grupo equivocado. Mientras esté en fase de espejo, la garantía no puede
 * depender de que alguien no toque un campo en una pantalla — tiene que ser una
 * constante, con tests, que falle en la dirección segura.
 *
 * Los dos JID salen del entorno para no clavarlos en git, pero el DEFAULT es
 * vacío: sin configurar, el agente no escucha nada y no manda nada. Un agente
 * apagado es un estado correcto; uno que escucha "todo" no lo es nunca.
 */

/** Grupo que se ESCUCHA. Nada fuera de acá llega al agente. */
export const grupoEscuchado = (): string =>
  String(process.env.AGENTE_GRUPO_ESCUCHA || '').trim();

/** Único destino de salida: el grupo de operaciones (error tracking). */
export const grupoDestino = (): string =>
  String(process.env.AGENTE_GRUPO_DESTINO || '').trim();

/** El agente entero. Sin esto en `true`, nada de esto corre. */
export const agenteChecklistHabilitado = (): boolean =>
  String(process.env.AGENTE_CHECKLIST || '').trim().toLowerCase() === 'on';

/**
 * ¿Este mensaje entra al agente?
 *
 * Es una IGUALDAD contra un único JID, no un `includes` ni un prefijo: cualquier
 * cosa más laxa es la puerta por la que se cuela otro grupo.
 */
export const debeEscuchar = (jid: string): boolean => {
  const escuchado = grupoEscuchado();
  if (!escuchado || !agenteChecklistHabilitado()) return false;
  return String(jid || '').trim() === escuchado;
};

/**
 * ¿Se puede mandar a este destino? Solo el grupo de operaciones, y solo si es un
 * grupo: un `@s.whatsapp.net` acá sería un mensaje a una persona, que es
 * exactamente lo que José pidió que no pasara.
 */
export const puedeEnviarA = (jid: string): boolean => {
  const destino = grupoDestino();
  const pedido = String(jid || '').trim();
  if (!destino || !agenteChecklistHabilitado()) return false;
  if (!pedido.endsWith('@g.us')) return false;
  return pedido === destino;
};

/**
 * El destino, o `null` si no se puede enviar. Se usa así —y no leyendo la env
 * directo— para que el guard sea imposible de saltear por olvido.
 */
export const destinoPermitido = (): string | null => {
  const destino = grupoDestino();
  return puedeEnviarA(destino) ? destino : null;
};
