/**
 * Router de mensajes entrantes del agente (WHATSAPP-AGENT-VERTICALS F1 §2.3).
 * PURO: sin Mongo, sin Baileys, sin LLM — todo llega por deps. El orden de los
 * gates importa: lo barato y lo que protege datos va primero.
 */
import type {
  AgentBotConfig,
  AgentInboundMessage,
  InboundRouterDeps,
  RouteOutcome,
} from './agent.types.js';

const ECHO_QUOTE_MAX_CHARS = 120;
const MIN_PHONE_MATCH_DIGITS = 8;

export function phoneFromJid(jid: string): string {
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '');
}

export function isGroupOrBroadcastJid(jid: string): boolean {
  return jid.endsWith('@g.us') || jid.includes('broadcast') || jid.endsWith('@newsletter');
}

/**
 * Allowlist de pilotos: empareja con o sin código de país (51...), comparando
 * sufijos con un mínimo de dígitos para no sobre-emparejar números cortos.
 */
export function matchesAllowlist(phone: string, allowlist?: string[]): boolean {
  if (!allowlist || allowlist.length === 0) return true;
  const digits = phone.replace(/\D/g, '');
  return allowlist.some((entry) => {
    const entryDigits = entry.replace(/\D/g, '');
    if (entryDigits.length < MIN_PHONE_MATCH_DIGITS || digits.length < MIN_PHONE_MATCH_DIGITS) {
      return entryDigits === digits;
    }
    return digits.endsWith(entryDigits) || entryDigits.endsWith(digits);
  });
}

function buildEchoReply(botConfig: AgentBotConfig, inboundText: string): string {
  const greeting = botConfig.greeting?.trim() || 'Hola';
  const quoted =
    inboundText.length > ECHO_QUOTE_MAX_CHARS
      ? `${inboundText.slice(0, ECHO_QUOTE_MAX_CHARS - 3)}...`
      : inboundText;
  return `${greeting} 👋 Soy el asistente virtual (en pruebas). Recibí tu mensaje: "${quoted}". Muy pronto voy a poder tomar tu pedido por aquí.`;
}

export async function routeInboundMessage(
  message: AgentInboundMessage,
  deps: InboundRouterDeps
): Promise<RouteOutcome> {
  if (message.fromMe) return 'from-me';
  if (isGroupOrBroadcastJid(message.remoteJid)) return 'group';
  if (!message.text.trim()) return 'non-text';

  const companyId = await deps.resolveCompanyIdBySender(message.sessionPhone);
  if (!companyId) return 'no-company';

  const botConfig = await deps.getBotConfig(companyId);
  if (!botConfig || !botConfig.enabled) return 'bot-disabled';

  const customerPhone = phoneFromJid(message.remoteJid);
  if (!matchesAllowlist(customerPhone, botConfig.testNumbers)) return 'not-allowlisted';

  if (deps.isRateLimited(message.remoteJid, message.receivedAt.getTime())) {
    return 'rate-limited';
  }

  const inbound = await deps.saveInbound({
    companyId,
    sessionPhone: message.sessionPhone,
    customerJid: message.remoteJid,
    customerPhone,
    customerName: message.pushName,
    text: message.text,
    channelMessageId: message.channelMessageId,
    receivedAt: message.receivedAt,
  });
  if (inbound.duplicated) return 'duplicate';

  const reply = buildEchoReply(botConfig, message.text);
  await deps.simulateTyping(message.remoteJid, reply);
  await deps.sendText(message.remoteJid, reply);
  await deps.saveOutbound({
    companyId,
    conversationId: inbound.conversationId,
    text: reply,
    sentAt: new Date(message.receivedAt.getTime()),
  });
  return 'replied';
}
