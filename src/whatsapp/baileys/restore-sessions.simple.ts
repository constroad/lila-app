/**
 * 📦 Restore All Sessions on Startup (EXACT copy from notifications)
 */

import fs from 'fs';
import { startSession } from './sessions.simple.js';
import { config } from '../../config/environment.js';

export const restoreAllSessions = async () => {
  if (!fs.existsSync(config.whatsapp.sessionDir)) return;

  const sessionDirs = fs
    .readdirSync(config.whatsapp.sessionDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .filter((dirent) => /^\d{9,15}$/.test(dirent.name)) // Detect phone number folders (e.g., 51902049935)
    .map((dirent) => dirent.name);

  for (const phone of sessionDirs) {
    try {
      console.log(`♻️ Restoring session for ${phone}`);
      await startSession(phone, () => {}); // Empty QR callback
    } catch (err) {
      console.error(`❌ Error restoring session for ${phone}:`, err);
    }
  }
};
