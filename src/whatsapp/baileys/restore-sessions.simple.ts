/**
 * 📦 Restore All Sessions on Startup (EXACT copy from notifications)
 */

import { startSession } from './sessions.simple.js';
import { listMongoAuthSessions } from './mongo-auth-state.js';
import { getCompanyModel } from '../../database/models.js';
import { config } from '../../config/environment.js';
import { isLocalOnlySession } from './local-sessions.js';

const normalizeSender = (value: unknown): string =>
  String(value || '').replace(/\D/g, '');

const listConfiguredActiveSenders = async (): Promise<Set<string>> => {
  const CompanyModel = await getCompanyModel();
  const companies = await CompanyModel.find(
    {
      isActive: true,
      'whatsappConfig.sender': { $exists: true, $nin: ['', null] },
    },
    { 'whatsappConfig.sender': 1 }
  ).lean();

  return new Set(
    companies
      .map((company) => normalizeSender(company.whatsappConfig?.sender))
      .filter(Boolean)
  );
};

export const restoreAllSessions = async (
  options: { localOnly?: boolean } = {}
) => {
  // Las sesiones a restaurar salen de Mongo (donde viven las creds), no de archivos
  // locales: así prod/otra instancia restaura las mismas sesiones que tienen credenciales.
  const [storedSessionIds, configuredSenders] = await Promise.all([
    listMongoAuthSessions(),
    listConfiguredActiveSenders(),
  ]);
  // Reparto LOCAL-ONLY (WHATSAPP_LOCAL_SESSIONS): prod NUNCA restaura esas sesiones
  // (su socket vive en una máquina dev); dev con `localOnly` restaura SOLO esas.
  // Ver local-sessions.ts.
  const isRestorableHere = (sessionId: string): boolean => {
    if (config.nodeEnv === 'production') return !isLocalOnlySession(sessionId);
    // Dev con send-proxy: los sockets no-locales viven en prod — restaurar solo
    // las local-only evita el throw del guard de startSession por cada sesión.
    if (config.whatsapp.proxyTargetUrl) return isLocalOnlySession(sessionId);
    return options.localOnly ? isLocalOnlySession(sessionId) : true;
  };
  const sessionIds = storedSessionIds.filter(
    (sessionId) =>
      /^\d{9,15}$/.test(sessionId) &&
      configuredSenders.has(sessionId) &&
      isRestorableHere(sessionId)
  );
  const ignoredSessionIds = storedSessionIds.filter(
    (sessionId) =>
      /^\d{9,15}$/.test(sessionId) && !configuredSenders.has(sessionId)
  );
  if (ignoredSessionIds.length > 0) {
    console.warn(
      `Skipping unassigned WhatsApp sessions: ${ignoredSessionIds.join(', ')}`
    );
  }
  const localOnlySkipped = storedSessionIds.filter(
    (sessionId) =>
      /^\d{9,15}$/.test(sessionId) &&
      configuredSenders.has(sessionId) &&
      !isRestorableHere(sessionId)
  );
  if (localOnlySkipped.length > 0) {
    console.warn(
      `Skipping WhatsApp sessions by WHATSAPP_LOCAL_SESSIONS split: ${localOnlySkipped.join(', ')}`
    );
  }

  for (const phone of sessionIds) {
    try {
      console.log(`♻️ Restoring session for ${phone}`);
      await startSession(phone, () => {}); // Empty QR callback
    } catch (err) {
      console.error(`❌ Error restoring session for ${phone}:`, err);
    }
  }
};
