import { Schema } from 'mongoose';

/**
 * Modelos del agente conversacional (WHATSAPP-AGENT-VERTICALS §3).
 * Colecciones en el Mongo compartido con Portal (constroad_db), naming con
 * guión bajo como usage_metrics / whatsapp_instance_lease.
 */

export type BotVertical = 'asphalt' | 'restaurant' | 'appointments' | 'transport';
export type BotConversationStatus = 'bot' | 'human' | 'closed';
export type BotMessageRole = 'customer' | 'bot' | 'owner' | 'system';

export interface IBotConfig {
  companyId: string;
  vertical: BotVertical;
  enabled: boolean;
  channelProvider: 'baileys' | 'cloud-api';
  greeting?: string;
  tone?: 'cercano' | 'formal';
  /** Allowlist de números de cliente final para pilotos; vacía = todos. */
  testNumbers?: string[];
  handoffPauseMinutes: number;
  ownerNotifyTarget?: string;
  /** Guion de preguntas del agente de ventas (forma en `agent/ventas/guion.asfalto.ts`); ausente = default en código. */
  guion?: unknown;
  /** Cómo se presenta Dali (forma en `agent/dali/asistente.ts` `PerfilAsistente`); ausente = el perfil del piloto. */
  perfil?: unknown;
  /** A quién y de qué se avisa (`AvisosAsistente`). */
  avisos?: unknown;
  /** La ficha del negocio (`agent/dali/negocio.ts` `NegocioGuardado`). */
  negocio?: unknown;
  /** Las preguntas frecuentes (`agent/dali/faq.ts` `Faq[]`). */
  faq?: unknown;
  /** Pausa del dueño desde el panel: hasta esta hora Dali no contesta a nadie. */
  pausedUntil?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const BotConfigSchema = new Schema<IBotConfig>(
  {
    companyId: { type: String, required: true },
    vertical: {
      type: String,
      required: true,
      enum: ['asphalt', 'restaurant', 'appointments', 'transport'],
    },
    enabled: { type: Boolean, required: true, default: false },
    channelProvider: {
      type: String,
      enum: ['baileys', 'cloud-api'],
      default: 'baileys',
    },
    greeting: { type: String },
    tone: { type: String, enum: ['cercano', 'formal'] },
    testNumbers: { type: [String], default: undefined },
    handoffPauseMinutes: { type: Number, default: 30 },
    ownerNotifyTarget: { type: String },
    guion: { type: Schema.Types.Mixed },
    perfil: { type: Schema.Types.Mixed },
    avisos: { type: Schema.Types.Mixed },
    negocio: { type: Schema.Types.Mixed },
    faq: { type: Schema.Types.Mixed },
    pausedUntil: { type: Date },
  },
  { collection: 'bot_configs', timestamps: true }
);
BotConfigSchema.index({ companyId: 1 }, { unique: true });

export interface IBotConversation {
  companyId: string;
  sessionPhone: string;
  customerJid: string;
  /** E.164 sin '+': clave estable para F8 (Cloud API no usa jid). */
  customerPhone: string;
  customerName?: string;
  status: BotConversationStatus;
  pausedUntil?: Date;
  lastMessageAt: Date;
  lastCustomerMessageAt: Date;
  messageCount: number;
  /** 'YYYY-MM' en America/Lima — conteo de quota mensual (§3.7). */
  monthKey: string;
  /** Lo que el agente de ventas juntó del cliente y su necesidad (vertical asfalto). */
  lead?: Record<string, unknown>;
  /** Cuándo se avisó al dueño del lead (una vez por conversación y día). */
  leadNotifiedAt?: Date;
  escalatedAt?: Date;
  /** Tokens consumidos en esta conversación, para conocer el costo real. */
  tokensIn?: number;
  tokensOut?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const BotConversationSchema = new Schema<IBotConversation>(
  {
    companyId: { type: String, required: true },
    sessionPhone: { type: String, required: true },
    customerJid: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerName: { type: String },
    status: {
      type: String,
      enum: ['bot', 'human', 'closed'],
      default: 'bot',
    },
    pausedUntil: { type: Date },
    lastMessageAt: { type: Date, required: true },
    lastCustomerMessageAt: { type: Date, required: true },
    messageCount: { type: Number, default: 0 },
    monthKey: { type: String, required: true },
    lead: { type: Schema.Types.Mixed },
    leadNotifiedAt: { type: Date },
    escalatedAt: { type: Date },
    tokensIn: { type: Number },
    tokensOut: { type: Number },
  },
  { collection: 'bot_conversations', timestamps: true }
);
BotConversationSchema.index({ companyId: 1, customerJid: 1 }, { unique: true });
BotConversationSchema.index({ companyId: 1, lastMessageAt: -1 });

export interface IBotConversationMessage {
  conversationId: string;
  companyId: string;
  role: BotMessageRole;
  text?: string;
  channelMessageId?: string;
  createdAt?: Date;
}

const MESSAGE_TTL_SECONDS = 90 * 24 * 60 * 60;

export const BotConversationMessageSchema = new Schema<IBotConversationMessage>(
  {
    conversationId: { type: String, required: true },
    companyId: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ['customer', 'bot', 'owner', 'system'],
    },
    text: { type: String },
    channelMessageId: { type: String },
  },
  { collection: 'bot_conversation_messages', timestamps: { createdAt: true, updatedAt: false } }
);
BotConversationMessageSchema.index({ conversationId: 1, createdAt: 1 });
// Idempotencia de reintentos del canal: mismo mensaje = un solo turno. PARCIAL
// (no «sparse»): un índice compuesto sparse indexa el documento si cualquiera de
// sus campos existe, y los salientes sin `channelMessageId` chocaban entre sí.
BotConversationMessageSchema.index(
  { companyId: 1, channelMessageId: 1 },
  { unique: true, partialFilterExpression: { channelMessageId: { $exists: true } } }
);
// Solo el DETALLE expira (90 d); conversación y pedidos no (spec §3.5).
BotConversationMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: MESSAGE_TTL_SECONDS });
