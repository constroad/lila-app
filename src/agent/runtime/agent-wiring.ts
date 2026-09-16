/**
 * Cableado real del router del agente (F1): Baileys → router → Mongo/envío.
 * NO importa sessions.simple ni whatsapp-direct (evita ciclos): el socket
 * llega por parámetro y la respuesta sale por ese mismo socket — el bot corre
 * donde corre el socket (prod). El conteo de quota va directo al validador.
 */
import logger from '../../utils/logger.js';
import { config } from '../../config/environment.js';
import { quotaValidatorService } from '../../services/quota-validator.service.js';
import { getBotConfigModel } from '../../database/bot.models.js';
import { calculateTypingDelay, delay } from '../../utils/retry.js';
import { extractInboundText, type BaileysMessageContent } from './message-text.js';
import { routeInboundMessage } from './inbound-router.js';
import { JidRateLimiter } from './jid-rate-limit.js';
import { saveInboundMessage, saveOutboundMessage } from './conversation.store.js';
import type { AgentBotConfig, AgentInboundMessage, InboundRouterDeps } from './agent.types.js';
import { atenderMensajeDelDueno, responderVentas } from '../ventas/index.js';
import { destinoDeAvisos } from '../dali/asistente.js';
import { jidsConAvisos } from '../dali/equipo.js';
import { recordSessionEvent } from '../../whatsapp/baileys/session-events.js';

interface AgentSocket {
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
  sendPresenceUpdate(status: 'composing' | 'paused', jid: string): Promise<void>;
}

interface AgentUpsertEvent {
  type?: string;
  messages?: Array<{
    key?: { remoteJid?: string | null; fromMe?: boolean | null; id?: string | null };
    pushName?: string | null;
    message?: BaileysMessageContent | null;
  }>;
}

const CONFIG_CACHE_TTL_MS = 60_000;
const MAX_TYPING_DELAY_MS = 4_000;
// Timeout explícito para el envío (regla portal-scalability: toda llamada
// externa acotada). Más corto que el de whatsapp-direct (120 s): una respuesta
// de bot que tarda medio minuto ya no le sirve a nadie.
const AGENT_SEND_TIMEOUT_MS = 30_000;

async function sendWithAgentTimeout<T>(label: string, sendPromise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Agent send timeout (${AGENT_SEND_TIMEOUT_MS / 1000}s): ${label}`)),
      AGENT_SEND_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([sendPromise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const rateLimiter = new JidRateLimiter(8, 60_000);
const sessionContextCache = new Map<
  string,
  { companyId: string | null; botConfig: AgentBotConfig | null; cachedAt: number }
>();

async function resolveSessionContext(
  sessionPhone: string
): Promise<{ companyId: string | null; botConfig: AgentBotConfig | null }> {
  const cached = sessionContextCache.get(sessionPhone);
  if (cached && Date.now() - cached.cachedAt < CONFIG_CACHE_TTL_MS) {
    return cached;
  }

  let companyId: string | null = null;
  let botConfig: AgentBotConfig | null = null;
  try {
    const company = await quotaValidatorService.getCompanyByWhatsappSender(sessionPhone);
    // La CLAVE de tenant es `companyId` («constroad»), la que llevan todas las
    // colecciones (clientes, pedidos, quota). F1 usaba el `_id` del documento y
    // con eso el agente de ventas no encontraba a nadie (14/09).
    const clave = (company as { companyId?: unknown; _id?: unknown } | null)?.companyId ?? (company as { _id?: unknown } | null)?._id;
    companyId = clave ? String(clave) : null;
    if (companyId) {
      const configModel = await getBotConfigModel();
      const [stored, alertTargets] = await Promise.all([configModel.findOne({ companyId }).lean(), jidsConAvisos(companyId).catch(() => [] as string[])]);
      const avisos = destinoDeAvisos(stored);
      botConfig = stored
        ? {
            enabled: Boolean(stored.enabled),
            vertical: stored.vertical,
            greeting: stored.greeting,
            testNumbers: stored.testNumbers,
            handoffPauseMinutes: stored.handoffPauseMinutes,
            ownerNotifyTarget: avisos.target,
            notifyOn: avisos.casos,
            alertTargets,
            guion: stored.guion,
            profile: stored.perfil,
            business: stored.negocio,
            faq: stored.faq,
            catalog: stored.catalogo,
            tellsPrices: stored.dicePrecios === true,
            companyName: (company as { name?: unknown } | null)?.name ? String((company as { name?: unknown }).name) : undefined,
            pausedUntil: stored.pausedUntil ? new Date(stored.pausedUntil) : undefined,
          }
        : null;
    }
  } catch (error) {
    logger.warn(`Agent: no se pudo resolver contexto de ${sessionPhone}: ${String(error)}`);
  }

  const resolved = { companyId, botConfig, cachedAt: Date.now() };
  sessionContextCache.set(sessionPhone, resolved);
  return resolved;
}

/** Un aviso al dueño (grupo o persona) por el mismo socket, con tope de tiempo y sin contar quota dos veces. */
const notificarPor = (sock: AgentSocket) => async (target: string, texto: string): Promise<void> => {
  try {
    await sendWithAgentTimeout(`agent→${target}`, sock.sendMessage(target, { text: texto }));
  } catch (error) {
    logger.warn(`Agent: no pude avisar a ${target}: ${String(error)}`);
  }
};

function buildDeps(sessionPhone: string, sock: AgentSocket): InboundRouterDeps {
  const notificar = notificarPor(sock);
  return {
    resolveCompanyIdBySender: async () => (await resolveSessionContext(sessionPhone)).companyId,
    getBotConfig: async () => (await resolveSessionContext(sessionPhone)).botConfig,
    isRateLimited: (jid, nowMs) => rateLimiter.isLimited(jid, nowMs),
    saveInbound: saveInboundMessage,
    saveOutbound: saveOutboundMessage,
    resolvePhone: async (jid) => {
      try {
        const { WhatsAppDirectService } = await import('../../services/whatsapp-direct.service.js');
        // 1) Los grupos en común; 2) la allowlist del piloto al revés: cada
        // número permitido → su LID (WhatsApp sí contesta eso), y si el chat es
        // uno de ellos, ese es el número. Un lead desconocido queda como LID.
        const porGrupos = await WhatsAppDirectService.telefonoDeLid(sessionPhone, jid);
        if (porGrupos) return porGrupos;
        const { botConfig } = await resolveSessionContext(sessionPhone);
        const lidBuscado = jid.replace(/:\d+@/, '@');
        for (const numero of botConfig?.testNumbers ?? []) {
          const lid = await WhatsAppDirectService.lidDeTelefono(sessionPhone, numero);
          if (lid && lid === lidBuscado) return numero.replace(/\D/g, '');
        }
        return null;
      } catch {
        return null;
      }
    },
    // F2: el agente de ventas (vertical asfalto). Otros verticales, cuando existan, entran acá.
    reply: async (input) => {
      if (input.botConfig.vertical !== 'asphalt') return null;
      // «Escribiendo…» desde que llega el mensaje: entre la espera de ráfaga y el
      // modelo pasan varios segundos, y la persona tiene que ver que algo pasa.
      await sock.sendPresenceUpdate('composing', input.message.remoteJid).catch(() => undefined);
      return responderVentas(input, { notificar });
    },
    // F3: el dueño escribe desde su número → pausa / comandos.
    onOwnerMessage: async (message, companyId) => {
      const { botConfig } = await resolveSessionContext(sessionPhone);
      if (!botConfig) return;
      await atenderMensajeDelDueno(message, companyId, botConfig, {
        notificar,
        setBotEnabled: async (id, enabled) => {
          const configModel = await getBotConfigModel();
          await configModel.updateOne({ companyId: id }, { $set: { enabled } });
          clearAgentSessionCache(sessionPhone);
        },
      });
    },
    simulateTyping: async (toJid, text) => {
      await sock.sendPresenceUpdate('composing', toJid).catch(() => undefined);
      await delay(Math.min(calculateTypingDelay(text), MAX_TYPING_DELAY_MS));
    },
    // A14: cada respuesta que no salió queda en el historial de la línea («Fallidos»).
    onSendFailed: (companyId, error) => recordSessionEvent({ sessionId: sessionPhone, companyId, kind: 'send-failed', detail: String(error) }),
    sendText: async (toJid, text) => {
      await sendWithAgentTimeout(`agent→${toJid}`, sock.sendMessage(toJid, { text }));
      await sock.sendPresenceUpdate('paused', toJid).catch(() => undefined);
      const { companyId } = await resolveSessionContext(sessionPhone);
      if (companyId) {
        void quotaValidatorService
          .incrementWhatsAppUsage(companyId, 1)
          .catch((error) => logger.warn(`Agent: fallo conteo de quota: ${String(error)}`));
      }
    },
  };
}

/** Invalidar el cache (p.ej. al togglear bot_config desde Portal en el futuro). */
export function clearAgentSessionCache(sessionPhone?: string): void {
  if (sessionPhone) {
    sessionContextCache.delete(sessionPhone);
    return;
  }
  sessionContextCache.clear();
}

/**
 * Handler de `messages.upsert`. Solo actúa con eventos `notify` (mensajes
 * nuevos en vivo; el history sync no debe generar respuestas).
 */
export async function handleAgentMessagesUpsert(
  sessionPhone: string,
  sock: AgentSocket,
  upsert: AgentUpsertEvent
): Promise<void> {
  if (!config.whatsapp.agentEnabled) return;
  if (upsert?.type !== 'notify') return;

  for (const rawMessage of upsert.messages ?? []) {
    const remoteJid = rawMessage?.key?.remoteJid;
    if (!remoteJid) continue;
    try {
      const inbound: AgentInboundMessage = {
        sessionPhone,
        remoteJid,
        fromMe: Boolean(rawMessage.key?.fromMe),
        text: extractInboundText(rawMessage.message),
        pushName: rawMessage.pushName ?? undefined,
        channelMessageId: rawMessage.key?.id ?? undefined,
        receivedAt: new Date(),
      };
      const outcome = await routeInboundMessage(inbound, buildDeps(sessionPhone, sock));
      if (outcome === 'replied') {
        logger.info(`Agent: respondido a ${remoteJid} (sesión ${sessionPhone})`);
      } else if (outcome !== 'bot-disabled' && outcome !== 'from-me' && outcome !== 'group') {
        // A nivel info: «no me responde» se diagnostica con esta línea (14/09: un
        // chat @lid quedó «not-allowlisted» sin dejar rastro en el log).
        logger.info(`[dali] mensaje de ${remoteJid} → ${outcome}`);
      }
    } catch (error) {
      logger.error(`Agent: error procesando mensaje de ${remoteJid}: ${String(error)}`);
    }
  }
}
