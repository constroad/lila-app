/**
 * 📦 Restore All Sessions on Startup (EXACT copy from notifications)
 */

import { startSession } from './sessions.simple.js';
import { listMongoAuthSessions } from './mongo-auth-state.js';

export const restoreAllSessions = async () => {
  // Las sesiones a restaurar salen de Mongo (donde viven las creds), no de archivos
  // locales: así prod/otra instancia restaura las mismas sesiones que tienen credenciales.
  const sessionIds = (await listMongoAuthSessions()).filter((id) => /^\d{9,15}$/.test(id));

  for (const phone of sessionIds) {
    try {
      console.log(`♻️ Restoring session for ${phone}`);
      await startSession(phone, () => {}); // Empty QR callback
    } catch (err) {
      console.error(`❌ Error restoring session for ${phone}:`, err);
    }
  }
};
