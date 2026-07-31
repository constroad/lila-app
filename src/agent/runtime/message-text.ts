/**
 * Extracción de texto de un mensaje Baileys para el agente (F1).
 * Misma cobertura que el listener legacy: wrappers ephemeral/viewOnce + captions.
 */

export interface BaileysMessageContent {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string };
  videoMessage?: { caption?: string };
  documentMessage?: { caption?: string };
  ephemeralMessage?: { message?: BaileysMessageContent };
  viewOnceMessage?: { message?: BaileysMessageContent };
  viewOnceMessageV2?: { message?: BaileysMessageContent };
  viewOnceMessageV2Extension?: { message?: BaileysMessageContent };
}

const MAX_WRAPPER_DEPTH = 4;

function unwrapContent(content?: BaileysMessageContent | null): BaileysMessageContent | null {
  let current = content ?? null;
  for (let depth = 0; depth < MAX_WRAPPER_DEPTH && current; depth += 1) {
    const wrapped =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message;
    if (!wrapped) break;
    current = wrapped;
  }
  return current;
}

export function extractInboundText(content?: BaileysMessageContent | null): string {
  const unwrapped = unwrapContent(content);
  if (!unwrapped) return '';
  return (
    unwrapped.conversation ||
    unwrapped.extendedTextMessage?.text ||
    unwrapped.imageMessage?.caption ||
    unwrapped.videoMessage?.caption ||
    unwrapped.documentMessage?.caption ||
    ''
  );
}
