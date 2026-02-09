/**
 * 📦 Simple Sessions Manager (EXACT copy from notifications)
 *
 * This is a direct copy-paste of the notifications architecture.
 * Simple dictionary-based approach instead of complex ConnectionManager.
 */

import {
  makeWASocket,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import { makeInMemoryStore } from './store.manager.js';
import { InMemoryStore } from './store.types.js';
import qrcode from 'qrcode';
import logger from '../../utils/logger.js';
import { config } from '../../config/environment.js';
import { populateStoreIfEmpty } from './populate-store-simple.js';
import { flushOutboxForSession } from '../queue/outbox-queue.js';
import pino from 'pino';

// ✅ Simple dictionary approach (like notifications)
const sessions: Record<string, WASocket> = {};
const stores: Record<string, InMemoryStore> = {};
const qrCodes: Record<string, string> = {};
const readyClients: Map<string, boolean> = new Map();

/**
 * Get store for session
 */
export function getStore(sessionId: string): InMemoryStore {
  const store = stores[sessionId];
  if (!store) throw new Error(`No store found for session: ${sessionId}`);
  return store;
}

/**
 * Get session socket
 */
export function getSession(id: string): WASocket | undefined {
  return sessions[id];
}

/**
 * Check if session is ready
 */
export function isSessionReady(sessionId: string): boolean {
  return readyClients.get(sessionId) ?? false;
}

/**
 * Check if session exists and is active
 */
export function isWhatsAppSessionActive(sessionId: string): boolean {
  const sock = getSession(sessionId);
  if (!sock) {
    logger.warn(`Session ${sessionId} does not exist`);
    return false;
  }
  if (!isSessionReady(sessionId)) {
    logger.warn(`Session ${sessionId} is not ready yet`);
    return false;
  }
  return true;
}

/**
 * List all active sessions
 */
export function listSessions(): string[] {
  return Array.from(Object.keys(sessions));
}

/**
 * Get QR code for session
 */
export function getQRCode(sessionId: string): string | undefined {
  return qrCodes[sessionId];
}

/**
 * Start session with QR code (EXACT copy from notifications)
 */
export async function startSession(
  sessionId: string,
  qrCb?: (qr: string) => void
): Promise<WASocket> {
  const authDir = path.join(config.whatsapp.sessionDir, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

  // Create Pino logger for Baileys (NOT Winston!)
  const pinoLogger = pino({ level: 'silent' }); // Silent to avoid log pollution

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pinoLogger, // Baileys expects pino logger
    browser: Browsers.ubuntu('Chrome'),
    generateHighQualityLinkPreview: true,
    printQRInTerminal: false,
  });

  // Initialize store
  const storeFilePath = path.join(authDir, 'baileys_store.json');
  const store = makeInMemoryStore(storeFilePath);
  stores[sessionId] = store;
  store.readFromFile();
  setInterval(() => store.writeToFile(), 10_000);

  store.bind(sock.ev);
  sock.ev.on('creds.update', saveCreds);

  // Connection event handler
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      logger.info(`✅ QR generated for ${sessionId}`);
      qrCodes[sessionId] = qr;
      if (qrCb) qrCb(qr);
    }

    if (connection === 'open') {
      logger.info(`✅ Session connected successfully for ${sessionId}`);
      readyClients.set(sessionId, true);

      // Listen to sync history
      sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
        logger.info(`📥 Received ${chats.length} chats and ${contacts.length} contacts`);
        chats.forEach((chat) => store.chats.set(chat.id, chat));
        contacts.forEach((contact) => store.contacts.set(contact.id, contact));
        messages.forEach((msg) => {
          const jid = msg.key.remoteJid!;
          const list = store.messages.get(jid) || [];
          list.push(msg);
          store.messages.set(jid, list);
        });
      });

      // Populate store with groups (wrap in try/catch)
      try {
        await populateStoreIfEmpty(sessionId, sock);
      } catch (err) {
        logger.error(`Error populating store for ${sessionId}:`, err);
      }

      // Send presence (wrap in try/catch)
      try {
        await sock.sendPresenceUpdate('available');
      } catch (err) {
        logger.error(`Error setting presence for ${sessionId}:`, err);
      }

      // Flush outbox (send pending messages)
      try {
        await flushOutboxForSession(sessionId);
      } catch (err) {
        logger.error(`Error flushing outbox for ${sessionId}:`, err);
      }
    }

    if (connection === 'close') {
      readyClients.set(sessionId, false);
      delete qrCodes[sessionId];
      logger.warn(`❌ Session closed for ${sessionId}`);

      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      logger.info(`Disconnect reason: ${code}`);

      if (code !== DisconnectReason.loggedOut) {
        logger.info(`🔁 Reconnecting session ${sessionId}...`);
        setTimeout(() => startSession(sessionId, qrCb), 3000);
      } else {
        // Clean up
        delete sessions[sessionId];
        delete stores[sessionId];
      }
    }
  });

  sessions[sessionId] = sock;
  return sock;
}

/**
 * Create pairing session (phone number code)
 */
export async function createPairingSession(
  phone: string,
  sendCode: (code: string) => void
): Promise<void> {
  const sessionId = phone.replace('+', '');
  const authDir = path.join(config.whatsapp.sessionDir, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  // Create Pino logger for Baileys
  const pinoLogger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pinoLogger, // Baileys expects pino logger
    browser: Browsers.macOS('Lila'),
  });

  // Initialize store
  const storeFilePath = path.join(authDir, 'baileys_store.json');
  const store = makeInMemoryStore(storeFilePath);
  stores[sessionId] = store;
  store.readFromFile();
  setInterval(() => store.writeToFile(), 10_000);

  store.bind(sock.ev);
  sock.ev.on('creds.update', saveCreds);

  let pairingDone = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      logger.info(`✅ Session with ${phone} connected`);
      readyClients.set(sessionId, true);

      // Populate store (wrap in try/catch)
      try {
        await populateStoreIfEmpty(sessionId, sock);
      } catch (err) {
        logger.error(`Error populating store for ${sessionId}:`, err);
      }

      // Flush outbox (send pending messages)
      try {
        await flushOutboxForSession(sessionId);
      } catch (err) {
        logger.error(`Error flushing outbox for ${sessionId}:`, err);
      }
    }

    if (connection === 'close') {
      readyClients.set(sessionId, false);
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      logger.warn(`❌ Session ${phone} closed`, statusCode);

      if (statusCode !== DisconnectReason.loggedOut && statusCode !== 401) {
        setTimeout(() => createPairingSession(phone, sendCode), 3000);
      } else {
        delete sessions[sessionId];
        delete stores[sessionId];
      }
    }

    if (!pairingDone && !sock.authState.creds.registered && connection === 'connecting') {
      try {
        const code = await sock.requestPairingCode(phone);
        logger.info(`📲 Pairing code for ${phone}: ${code}`);
        sendCode(code);
        pairingDone = true;
      } catch (err) {
        logger.error('❌ Error requesting pairing code:', err);
      }
    }
  });

  sessions[sessionId] = sock;
}

/**
 * Disconnect session manually
 */
export async function disconnectSession(sessionId: string): Promise<void> {
  const sock = sessions[sessionId];
  if (sock) {
    await sock.logout();
    delete sessions[sessionId];
    delete stores[sessionId];
    delete qrCodes[sessionId];
    readyClients.delete(sessionId);
    logger.info(`Session ${sessionId} disconnected and removed`);
  }
}
