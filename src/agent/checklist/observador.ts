import logger from '../../utils/logger.js';
import { getCompanyModel } from '../../database/models.js';
import { extractInboundText, type BaileysMessageContent } from '../runtime/message-text.js';
import { debeEscuchar, resolverAlcance, type AlcanceAgente } from './alcance.js';
import { recordarMensaje } from './almacen.js';

/**
 * El oído del agente: mira los mensajes del grupo piloto y NADA MÁS.
 *
 * VA APARTE DEL BOT CONVERSACIONAL a propósito. `handleAgentMessagesUpsert`
 * arranca con `if (!config.whatsapp.agentEnabled) return` —el gate del bot que
 * responde 1:1— y además su router descarta todo grupo por diseño. Colgarse de
 * ahí ataría este observador a un interruptor que es de otra cosa; y tocar ese
 * router para dejar pasar grupos cambiaría el comportamiento del bot 1:1, que
 * hoy funciona. Dos features, dos caminos.
 *
 * NO RESPONDE NADA. Solo observa y recuerda. Lo que sale al grupo de operaciones
 * lo manda el detector, y solo al destino permitido.
 */

const ALCANCE_TTL_MS = 5 * 60_000;
let alcanceCache: { alcance: AlcanceAgente; at: number } | null = null;

/** Solo para tests. */
export const _resetAlcanceCache = (): void => void (alcanceCache = null);

/**
 * El alcance, cacheado 5 min: se consulta por CADA mensaje del grupo y no tiene
 * sentido pegarle a Mongo por cada uno. Cinco minutos es más que suficiente para
 * que un cambio de grupo se tome solo.
 */
export const alcanceVigente = async (now = Date.now()): Promise<AlcanceAgente> => {
  if (alcanceCache && now - alcanceCache.at < ALCANCE_TTL_MS) return alcanceCache.alcance;

  const alcance = await resolverAlcance(async (companyId) => {
    const CompanyModel = await getCompanyModel();
    return (await CompanyModel.findOne({ companyId }).lean()) as
      | { whatsappConfig?: { adminGroupId?: string } }
      | null;
  });

  alcanceCache = { alcance, at: now };
  return alcance;
};

interface UpsertEvent {
  type?: string;
  messages?: Array<{
    key?: {
      remoteJid?: string | null;
      fromMe?: boolean | null;
      id?: string | null;
      participant?: string | null;
    };
    messageTimestamp?: number | Long | null;
    message?: BaileysMessageContent | null;
  }>;
}

type Long = { toNumber(): number };

/** El sello de Baileys viene en SEGUNDOS, y a veces como Long de protobuf. */
const aMilisegundos = (ts: unknown, ahora: number): number => {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts * 1000;
  const asLong = ts as Long | null;
  if (asLong && typeof asLong.toNumber === 'function') {
    const n = asLong.toNumber();
    if (Number.isFinite(n)) return n * 1000;
  }
  return ahora;
};

/**
 * Observa un lote de mensajes. NUNCA lanza: cuelga del listener de Baileys y un
 * fallo acá no puede afectar a la recepción de mensajes de nadie.
 */
export const observarParaChecklist = async (
  sessionPhone: string,
  upsert: UpsertEvent
): Promise<void> => {
  try {
    if (upsert?.type !== 'notify') return;

    const alcance = await alcanceVigente();
    if (!alcance.grupoEscuchado) return;

    for (const raw of upsert.messages ?? []) {
      const remoteJid = String(raw?.key?.remoteJid || '');
      // EL GUARD, y es lo único que separa "escuchar un grupo" de "escuchar todo".
      if (!debeEscuchar(remoteJid, alcance)) continue;

      const texto = extractInboundText(raw.message);
      if (!texto.trim()) continue;

      const ahora = Date.now();
      recordarMensaje(remoteJid, {
        texto,
        // En un grupo, quien escribió viene en `participant`; `remoteJid` es el
        // grupo. Se guarda para la seguridad por rol de F2 (spec §7.3).
        autor: String(raw?.key?.participant || ''),
        ts: aMilisegundos(raw?.messageTimestamp, ahora),
        // Los mensajes de nuestra propia sesión no confirman nada: el agente no
        // se cierra a sí mismo los ítems que acaba de abrir.
        esPropio: Boolean(raw?.key?.fromMe),
      });
    }
  } catch (error) {
    logger.warn(
      `[agente] no pude observar mensajes de ${sessionPhone}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};
