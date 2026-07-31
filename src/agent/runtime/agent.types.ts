/**
 * Tipos del runtime del agente conversacional (WHATSAPP-AGENT-VERTICALS F1).
 * El router es puro y recibe TODO por deps — así los tests no montan Mongo ni Baileys.
 */

export type AgentVertical = 'restaurant' | 'appointments' | 'transport';

export interface AgentBotConfig {
  enabled: boolean;
  vertical: AgentVertical;
  greeting?: string;
  /** Allowlist de números de CLIENTE FINAL para pilotos. Vacía/ausente = todos. */
  testNumbers?: string[];
}

export interface AgentInboundMessage {
  sessionPhone: string;
  remoteJid: string;
  fromMe: boolean;
  text: string;
  pushName?: string;
  channelMessageId?: string;
  receivedAt: Date;
}

export type RouteOutcome =
  | 'from-me'
  | 'group'
  | 'non-text'
  | 'no-company'
  | 'bot-disabled'
  | 'not-allowlisted'
  | 'rate-limited'
  | 'duplicate'
  | 'replied';

export interface InboundPersistInput {
  companyId: string;
  sessionPhone: string;
  customerJid: string;
  customerPhone: string;
  customerName?: string;
  text: string;
  channelMessageId?: string;
  receivedAt: Date;
}

export interface OutboundPersistInput {
  companyId: string;
  conversationId: string;
  text: string;
  sentAt: Date;
}

export interface InboundRouterDeps {
  resolveCompanyIdBySender(sessionPhone: string): Promise<string | null>;
  getBotConfig(companyId: string): Promise<AgentBotConfig | null>;
  isRateLimited(customerJid: string, nowMs: number): boolean;
  saveInbound(entry: InboundPersistInput): Promise<{ duplicated: boolean; conversationId: string }>;
  saveOutbound(entry: OutboundPersistInput): Promise<void>;
  sendText(toJid: string, text: string): Promise<void>;
  simulateTyping(toJid: string, text: string): Promise<void>;
}
