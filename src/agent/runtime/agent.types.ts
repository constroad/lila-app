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
  /** Qué avisar (A6 «Avisos»); ausente = todo. */
  notifyOn?: { leadNuevo: boolean; pideUrgente: boolean; fallo: boolean };
  /** El guion de preguntas del vertical (`ventas/guion.asfalto.ts`); ausente = el default en código. */
  guion?: unknown;
  /** Cómo se presenta la asistente (`dali/asistente.ts` `PerfilAsistente`); ausente = el perfil del piloto. */
  profile?: unknown;
  /** La ficha del negocio (`dali/negocio.ts`): descripción, qué ofrece y qué no, dónde está. */
  business?: unknown;
  /** Con el que se presenta el guion; ausente = CONSTROAD. */
  companyName?: string;
  /** Pausa del dueño desde el panel: hasta entonces no se contesta a nadie. */
  pausedUntil?: Date;
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
  | 'paused'
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
  channelMessageId?: string;
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
  /** El número detrás de un JID `@lid` (Baileys 6.7.18 no lo trae en la clave); sin esto, los dígitos del JID. */
  resolvePhone?(jid: string): Promise<string | null>;
}
