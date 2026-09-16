import { Schema, type Model } from 'mongoose';
import { getSharedConnection } from '../../database/sharedConnection.js';
import logger from '../../utils/logger.js';

/**
 * Historial de la línea de WhatsApp (Dali A14 «Historial de conexión»): un
 * documento por evento en `whatsapp_session_events`, con TTL de 30 días. Lo
 * escribe el manager de sesiones (open/close/logout/pairing/aparcado), el
 * agente cuando un envío falla, y el panel cuando alguien reconecta,
 * desconecta o manda un mensaje de prueba. Registrar es fire-and-forget: un
 * fallo de Mongo se loggea y jamás toca el ciclo del socket.
 */
export type SessionEventKind =
  | 'connected'
  | 'reconnected'
  | 'disconnected'
  | 'linked'
  | 'unlinked'
  | 'parked'
  | 'restart-requested'
  | 'logout-requested'
  | 'test-message'
  | 'send-failed';

export interface SessionEvent {
  sessionId: string;
  kind: SessionEventKind;
  /** Texto corto para la persona (motivo, destino, error recortado). */
  detail?: string;
  /** Código de cierre de Baileys/WhatsApp (401, 428, 440, 515…). */
  code?: number;
  /** Quién lo disparó desde el panel («José»). */
  actor?: string;
  /** La empresa, cuando el evento es de una conversación suya (envíos fallidos). */
  companyId?: string;
  at: Date;
}

export const SESSION_EVENTS_TTL_DAYS = 30;
const DETAIL_MAX = 200;

const SessionEventSchema = new Schema<SessionEvent>(
  {
    sessionId: { type: String, required: true },
    kind: { type: String, required: true },
    detail: String,
    code: Number,
    actor: String,
    companyId: String,
    at: { type: Date, required: true },
  },
  { collection: 'whatsapp_session_events', versionKey: false }
);
SessionEventSchema.index({ sessionId: 1, at: -1 });
SessionEventSchema.index({ companyId: 1, kind: 1, at: -1 });
SessionEventSchema.index({ at: 1 }, { expireAfterSeconds: SESSION_EVENTS_TTL_DAYS * 86_400 });

let model: Model<SessionEvent> | null = null;
const getModel = async (): Promise<Model<SessionEvent>> => {
  if (model) return model;
  const conn = await getSharedConnection();
  model = (conn.models.WhatsAppSessionEvent as Model<SessionEvent>) || conn.model<SessionEvent>('WhatsAppSessionEvent', SessionEventSchema);
  return model;
};

/** Registra un evento sin bloquear: quien llama sigue; el error, si lo hay, va al log. */
export const recordSessionEvent = (event: Omit<SessionEvent, 'at'>): void => {
  const doc = { ...event, detail: event.detail?.slice(0, DETAIL_MAX), at: new Date() };
  void getModel()
    .then((M) => M.create(doc))
    .catch((error) => logger.warn(`[session-events] no se pudo registrar ${event.kind} de ${event.sessionId}: ${String(error)}`));
};

export const listSessionEvents = async (sessionId: string, { sinceMs, limit = 30 }: { sinceMs: number; limit?: number }): Promise<SessionEvent[]> => {
  const M = await getModel();
  return M.find({ sessionId, at: { $gte: new Date(sinceMs) } })
    .sort({ at: -1 })
    .limit(limit)
    .lean<SessionEvent[]>();
};

export const countSessionEvents = async ({ companyId, kind, sinceMs }: { companyId: string; kind: SessionEventKind; sinceMs: number }): Promise<number> => {
  const M = await getModel();
  return M.countDocuments({ companyId, kind, at: { $gte: new Date(sinceMs) } });
};
