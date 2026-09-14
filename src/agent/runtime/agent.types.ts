/**
 * Tipos del runtime del agente conversacional (WHATSAPP-AGENT-VERTICALS F1).
 * El router es puro y recibe TODO por deps — así los tests no montan Mongo ni Baileys.
 */

export type AgentVertical = 'asphalt' | 'restaurant' | 'appointments' | 'transport';

export interface AgentBotConfig {
  enabled: boolean;
  vertical: AgentVertical;
  greeting?: string;
  /** Allowlist de números de CLIENTE FINAL para pilotos. Vacía/ausente = todos. */
  testNumbers?: string[];
  handoffPauseMinutes?: number;
  /** JID (grupo o persona) al que se avisan los leads y las escaladas. */
  ownerNotifyTarget?: string;
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
  | 'silent'
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

export interface ReplyInput {
  companyId: string;
  conversationId: string;
  botConfig: AgentBotConfig;
  message: AgentInboundMessage;
  customerPhone: string;
}

export interface InboundRouterDeps {
  resolveCompanyIdBySender(sessionPhone: string): Promise<string | null>;
  getBotConfig(companyId: string): Promise<AgentBotConfig | null>;
  isRateLimited(customerJid: string, nowMs: number): boolean;
  saveInbound(entry: InboundPersistInput): Promise<{ duplicated: boolean; conversationId: string }>;
  saveOutbound(entry: OutboundPersistInput): Promise<void>;
  sendText(toJid: string, text: string): Promise<void>;
  simulateTyping(toJid: string, text: string): Promise<void>;
  /**
   * F2: la respuesta del agente (o `null` para callar: conversación en manos
   * de una persona). Sin esto, el eco de F1.
   */
  reply?(input: ReplyInput): Promise<string | null>;
  /** F3: un mensaje escrito desde el número del negocio (el dueño): pausa, comandos. */
  onOwnerMessage?(message: AgentInboundMessage, companyId: string | null): Promise<void>;
}
