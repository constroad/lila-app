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
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs-extra';
import { makeInMemoryStore } from './store.manager.js';
import { InMemoryStore } from './store.types.js';
import logger from '../../utils/logger.js';
import { config } from '../../config/environment.js';
import { populateStoreIfEmpty } from './populate-store-simple.js';
import { flushOutboxForSession } from '../queue/outbox-queue.js';
import outboxQueue from '../queue/outbox-queue.js';
import { useMongoAuthState, clearMongoAuthState } from './mongo-auth-state.js';
import { clearStoreSnapshot } from './mongo-store.js';
import pino from 'pino';

// ✅ Simple dictionary approach (like notifications)
const sessions: Record<string, WASocket> = {};
const stores: Record<string, InMemoryStore> = {};
const qrCodes: Record<string, string> = {};
// Epoch ms en que se generó el QR vigente. Permite al cliente mostrar cuánto le queda antes
// de que WhatsApp rote/invalide el código (~20s server-side). Se limpia junto con qrCodes.
const qrTimestamps: Record<string, number> = {};

/** Limpia el QR y su timestamp de una sesión (mantener ambos mapas en sync). */
function clearQR(sessionId: string): void {
  delete qrCodes[sessionId];
  delete qrTimestamps[sessionId];
}

// Pairing code vigente por sesión (flujo "vincular con número"). El handler HTTP lo
// consulta por polling hasta que Baileys lo genera. Se limpia al emparejar/desconectar.
const pairingCodes: Record<string, string> = {};
const readyClients: Map<string, boolean> = new Map();
const shuttingDown: Set<string> = new Set();
const storeTimers: Record<string, NodeJS.Timeout> = {};
// Inicializaciones en curso por sessionId. Evita crear dos sockets para el mismo
// número cuando startSession se llama de forma concurrente (ej: doble request al crear).
const startingPromises: Record<string, Promise<WASocket>> = {};

// Reconexión resiliente: timers e intentos por sessionId. La reconexión NO puede ser un solo
// `setTimeout` (si ese intento falla —ej. Mongo inalcanzable durante un corte de red— la sesión
// quedaba muerta). Reintentamos con backoff hasta recuperar. Ver auto-recuperación (history).
const reconnectTimers: Record<string, NodeJS.Timeout> = {};
const reconnectAttempts: Record<string, number> = {};

const clearStoreTimer = (sessionId: string) => {
  const timer = storeTimers[sessionId];
  if (timer) {
    clearInterval(timer);
    delete storeTimers[sessionId];
  }
};

const clearReconnectTimer = (sessionId: string) => {
  const timer = reconnectTimers[sessionId];
  if (timer) {
    clearTimeout(timer);
    delete reconnectTimers[sessionId];
  }
};

/**
 * Programa una reconexión resiliente con backoff (lineal capado a 60s). Reintenta hasta que la
 * sesión vuelva a abrir; si `startSession` falla (ej. Mongo caído por corte de red), captura el
 * error y reprograma — así la auto-recuperación sobrevive a fallos transitorios de red/Atlas.
 * `connection.open` resetea los intentos. No corre si la sesión se está apagando a propósito.
 */
function scheduleReconnect(sessionId: string, qrCb?: (qr: string) => void) {
  if (shuttingDown.has(sessionId)) return;
  if (reconnectTimers[sessionId]) return; // ya hay un intento en cola

  const attempt = (reconnectAttempts[sessionId] = (reconnectAttempts[sessionId] ?? 0) + 1);
  const delay = Math.min(3000 * attempt, 60_000);
  logger.info(`🔁 Reconnect ${sessionId}: intento ${attempt} en ${delay}ms`);

  reconnectTimers[sessionId] = setTimeout(async () => {
    delete reconnectTimers[sessionId];
    if (shuttingDown.has(sessionId)) return;
    try {
      await startSession(sessionId, qrCb);
      // Éxito de la inicialización; `connection.open` confirmará y reseteará intentos.
    } catch (error) {
      logger.error(`Reconnect ${sessionId} falló (intento ${attempt}): ${String(error)}`);
      scheduleReconnect(sessionId, qrCb); // reintentar con mayor backoff
    }
  }, delay);
}

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
 * Epoch ms en que se generó el QR vigente (o undefined si no hay QR).
 */
export function getQRCodeGeneratedAt(sessionId: string): number | undefined {
  return qrTimestamps[sessionId];
}

/**
 * Pairing code vigente de una sesión (o undefined si aún no se generó).
 */
export function getPairingCode(sessionId: string): string | undefined {
  return pairingCodes[sessionId];
}

/**
 * Inicia (o reutiliza) una sesión de WhatsApp para el sessionId dado.
 *
 * Guard anti-duplicado: si ya hay una inicialización en curso, devuelve esa misma
 * promesa; si ya hay un socket conectado y listo, lo reutiliza. NO bloquea la
 * reconexión automática: un socket cerrado (no `ready`) sí se reemplaza por uno
 * nuevo, porque el cierre no-loggedOut no borra `sessions[sessionId]`.
 *
 * @param sessionId - Número emisor sin '+' (ej: "51902049935")
 * @param qrCb - Callback opcional invocado cuando Baileys genera un QR
 * @returns El WASocket existente si ya hay sesión viva, o el nuevo socket creado
 */
export async function startSession(
  sessionId: string,
  qrCb?: (qr: string) => void
): Promise<WASocket> {
  const inFlight = startingPromises[sessionId];
  if (inFlight) {
    logger.info(`[${sessionId}] Session init in progress, reusing in-flight start`);
    return inFlight;
  }

  const existing = sessions[sessionId];
  if (existing && isSessionReady(sessionId)) {
    logger.info(`[${sessionId}] Session already ready, reusing existing socket`);
    return existing;
  }

  const promise = initSession(sessionId, qrCb);
  startingPromises[sessionId] = promise;
  try {
    return await promise;
  } finally {
    delete startingPromises[sessionId];
  }
}

/**
 * Crea y registra el socket de la sesión (cuerpo real, sin el guard anti-duplicado).
 */
async function initSession(
  sessionId: string,
  qrCb?: (qr: string) => void
): Promise<WASocket> {
  shuttingDown.delete(sessionId);
  // Credenciales Y store (chats/contactos) SIEMPRE en Mongo (portables entre máquinas/instancias).
  // Ya NO se usan archivos locales de sesión.
  const { state, saveCreds } = await useMongoAuthState(sessionId);

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
    // Baileys NO tiene API para "traer todos los contactos": llegan por history-sync y
    // eventos (contacts.upsert es poco fiable en WhatsApp personal — issue #522). Pedir el
    // history completo maximiza chats+contactos al conectar. Sin costo de memoria porque ya
    // no almacenamos mensajes (store.manager). Ver SCALABILITY-MULTI-SESSION.spec §2.3.
    syncFullHistory: true,
  });

  // Initialize store (Mongo-backed). Cargar ANTES de arrancar el timer para no pisar el doc.
  const store = makeInMemoryStore(sessionId);
  stores[sessionId] = store;
  await store.load();

  clearStoreTimer(sessionId);
  storeTimers[sessionId] = setInterval(() => store.save(), 10_000);

  store.bind(sock.ev);
  sock.ev.on('creds.update', saveCreds);

  // Sync history: bind once at session creation (not inside 'open' which fires on every reconnect).
  // Solo chats/contactos; los mensajes NO se almacenan (ver store.manager / SCALABILITY spec §3).
  sock.ev.on('messaging-history.set', ({ chats, contacts }) => {
    logger.info(`📥 Received ${chats.length} chats and ${contacts.length} contacts`);
    chats.forEach((chat) => store.chats.set(chat.id, chat));
    contacts.forEach((contact) => store.contacts.set(contact.id, contact));
    store.markDirty();
  });

  // Connection event handler
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      logger.info(`✅ QR generated for ${sessionId}`);
      qrCodes[sessionId] = qr;
      qrTimestamps[sessionId] = Date.now();
      if (qrCb) qrCb(qr);
    }

    if (connection === 'open') {
      logger.info(`✅ Session connected successfully for ${sessionId}`);
      readyClients.set(sessionId, true);
      // Reconexión exitosa → resetear backoff y cancelar cualquier reintento pendiente.
      reconnectAttempts[sessionId] = 0;
      clearReconnectTimer(sessionId);

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
      clearQR(sessionId);
      logger.warn(`❌ Session closed for ${sessionId}`);

      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      logger.info(`Disconnect reason: ${code}`);

      if (shuttingDown.has(sessionId)) {
        logger.info(`Skipping reconnect for ${sessionId} (shutdown in progress)`);
        return;
      }

      if (code !== DisconnectReason.loggedOut) {
        // Reconexión RESILIENTE con reintentos (no un solo setTimeout): sobrevive a fallos
        // transitorios (red caída, Mongo/Atlas inalcanzable durante el corte).
        scheduleReconnect(sessionId, qrCb);
      } else {
        // Logout real (401): el dispositivo fue desvinculado, las creds están MUERTAS.
        // No reconectar y, sobre todo, BORRAR las creds de Mongo: si se dejan, cada
        // arranque `restoreAllSessions` las vuelve a levantar → 401 → muere, en un loop
        // infinito (era el caso observado). Sin creds, la sesión sale de la lista de
        // restauración y solo vuelve tras re-emparejar (QR/pairing) — que es lo correcto.
        clearStoreTimer(sessionId);
        clearReconnectTimer(sessionId);
        reconnectAttempts[sessionId] = 0;
        delete sessions[sessionId];
        delete stores[sessionId];
        try {
          await clearMongoAuthState(sessionId);
          logger.info(`🧹 Cleared dead Mongo creds for ${sessionId} (loggedOut)`);
        } catch (err) {
          logger.warn(`Failed to clear dead creds for ${sessionId}:`, err);
        }
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
  // Credenciales Y store (chats/contactos) SIEMPRE en Mongo. Ya NO se usan archivos locales.
  const { state, saveCreds } = await useMongoAuthState(sessionId);
  const { version } = await fetchLatestBaileysVersion();

  // Create Pino logger for Baileys
  const pinoLogger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pinoLogger, // Baileys expects pino logger
    // El browser afecta la entrega del pairing code (Baileys #2306); usamos el mismo
    // valor probado del flujo QR que sí funciona. 'Lila' (no-browser real) fallaba.
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false, // pairing code es alternativo al QR
    syncFullHistory: true, // maximiza contactos al conectar (ver startSession)
  });

  // Initialize store (Mongo-backed). Cargar ANTES de arrancar el timer para no pisar el doc.
  const store = makeInMemoryStore(sessionId);
  stores[sessionId] = store;
  await store.load();
  clearStoreTimer(sessionId);
  storeTimers[sessionId] = setInterval(() => store.save(), 10_000);

  store.bind(sock.ev);
  sock.ev.on('creds.update', saveCreds);

  let pairingDone = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      logger.info(`✅ Session with ${phone} connected`);
      readyClients.set(sessionId, true);
      delete pairingCodes[sessionId]; // ya emparejado: el código dejó de ser válido

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

      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        // Logout/401 → creds muertas: borrarlas de Mongo para no reintentarlas en el
        // próximo restore (mismo criterio que initSession).
        delete sessions[sessionId];
        delete stores[sessionId];
        delete pairingCodes[sessionId];
        try {
          await clearMongoAuthState(sessionId);
        } catch (err) {
          logger.warn(`Failed to clear dead creds for ${sessionId}:`, err);
        }
      } else if (sock.authState.creds.registered) {
        // Ya emparejado: reconectar para establecer la sesión completa (patrón resiliente).
        setTimeout(() => createPairingSession(phone, sendCode), 3000);
      } else {
        // Aún SIN emparejar: NO recrear. Cada socket nuevo pediría un pairing code nuevo
        // y WhatsApp responde 429 rate-overlimit (Baileys #2008). El usuario re-dispara.
        logger.warn(`Pairing session ${phone} cerró antes de emparejar; esperando reintento manual`);
      }
    }

    if (!pairingDone && !sock.authState.creds.registered && connection === 'connecting') {
      try {
        // Baileys exige el número en E.164 SIN '+', paréntesis, espacios ni guiones
        // (solo dígitos con código de país). Un número mal formado genera un código
        // asociado a un número inválido → nunca llega al dispositivo real.
        const msisdn = phone.replace(/\D/g, '');
        const code = await sock.requestPairingCode(msisdn);
        logger.info(`📲 Pairing code for ${msisdn}: ${code}`);
        pairingCodes[sessionId] = code;
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
 * Disconnect session manually (logs out from WhatsApp servers).
 * Use ONLY for explicit user-initiated logout — invalidates credentials
 * and forces re-pairing. Do NOT call from graceful shutdown.
 */
export async function disconnectSession(sessionId: string): Promise<void> {
  const sock = sessions[sessionId];
  if (sock) {
    shuttingDown.add(sessionId); // evita reconexión automática por el cierre que provoca logout
    clearReconnectTimer(sessionId);
    reconnectAttempts[sessionId] = 0;
    await sock.logout();
    clearStoreTimer(sessionId);
    delete sessions[sessionId];
    delete stores[sessionId];
    clearQR(sessionId);
    readyClients.delete(sessionId);
    logger.info(`Session ${sessionId} disconnected and removed`);
  }
}

/**
 * End session for graceful shutdown — closes the websocket WITHOUT
 * calling logout(), so credentials remain valid and the session can be
 * restored on next startup.
 */
export async function endSession(sessionId: string): Promise<void> {
  const sock = sessions[sessionId];
  if (sock) {
    shuttingDown.add(sessionId);
    clearReconnectTimer(sessionId);
    try {
      sock.end(undefined);
    } catch (err) {
      logger.warn(`Error ending socket for ${sessionId}:`, err);
    }
    clearStoreTimer(sessionId);
    delete sessions[sessionId];
    delete stores[sessionId];
    clearQR(sessionId);
    readyClients.delete(sessionId);
    logger.info(`Session ${sessionId} closed (creds preserved)`);
  }
}

/**
 * Reinicio SUAVE de la sesión: cierra el socket actual SIN logout (conserva credenciales y
 * store en Mongo) y vuelve a levantarla. A diferencia de `clearSession`, NO borra nada —
 * por eso es seguro para números compartidos entre companies (reconecta sin obligar a
 * re-emparejar ni afectar a los demás tenants). Es la operación que debería usar el botón
 * "reconectar / reiniciar" del Portal.
 */
export async function restartSession(
  sessionId: string,
  qrCb?: (qr: string) => void
): Promise<WASocket> {
  logger.info(`🔄 Restarting session ${sessionId} (soft, creds preserved)`);
  // `endSession` cierra el socket con `sock.end()` (sin logout → creds intactas) y marca
  // shuttingDown para que el cierre no dispare la reconexión automática. `startSession`
  // (vía initSession) limpia shuttingDown y crea un socket nuevo con las mismas creds.
  await endSession(sessionId);
  return startSession(sessionId, qrCb);
}

/**
 * Clear session completely (reset)
 * This performs a full session reset including:
 * - Logout from WhatsApp
 * - Delete physical session files (credentials)
 * - Clear message queue
 * - Remove backup files
 * - Clean memory structures
 *
 * Use this when user wants to completely remove a session and prevent auto-recovery.
 */
export async function clearSession(sessionId: string): Promise<void> {
  try {
    logger.info(`🧹 Clearing session ${sessionId} completely...`);

    // 0. Impedir auto-recuperación: marca shutdown y cancela cualquier reconexión en cola.
    shuttingDown.add(sessionId);
    clearReconnectTimer(sessionId);
    reconnectAttempts[sessionId] = 0;

    // 1. Logout if session is active
    const sock = sessions[sessionId];
    if (sock) {
      try {
        logger.info(`Logging out session ${sessionId}...`);
        await sock.logout();
      } catch (error) {
        logger.warn(`Failed to logout ${sessionId} (may already be disconnected):`, error);
      }
    }

    // 2. Clean up memory structures
    clearStoreTimer(sessionId);
    delete sessions[sessionId];
    delete stores[sessionId];
    clearQR(sessionId);
    readyClients.delete(sessionId);
    logger.info(`✅ Memory cleaned for ${sessionId}`);

    // 3. Delete legacy physical session dir (si quedó de antes de migrar a Mongo).
    const sessionDir = path.join(config.whatsapp.sessionDir, sessionId);
    try {
      if (await fs.pathExists(sessionDir)) {
        await fs.remove(sessionDir);
        logger.info(`✅ Deleted session directory: ${sessionDir}`);
      } else {
        logger.info(`Session directory already deleted: ${sessionDir}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to delete session directory ${sessionDir}:`, error);
      // Don't throw - continue with cleanup
    }

    // 3b. Delete credentials in Mongo (fuente de verdad de las creds)
    await clearMongoAuthState(sessionId);
    logger.info(`✅ Cleared Mongo auth for ${sessionId}`);

    // 3c. Delete store snapshot in Mongo (chats/contactos)
    try {
      await clearStoreSnapshot(sessionId);
      logger.info(`✅ Cleared Mongo store for ${sessionId}`);
    } catch (error) {
      logger.warn(`Failed to clear Mongo store for ${sessionId}:`, error);
    }

    // 4. Delete backup files (if they exist)
    const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionId);
    try {
      if (await fs.pathExists(backupDir)) {
        await fs.remove(backupDir);
        logger.info(`✅ Deleted backup directory: ${backupDir}`);
      } else {
        logger.info(`Backup directory already deleted: ${backupDir}`);
      }
    } catch (error) {
      logger.warn(`Failed to delete backup directory ${backupDir}:`, error);
      // Don't throw - continue with cleanup
    }

    // 5. Clear message queue
    try {
      await outboxQueue.clear(sessionId);
      logger.info(`✅ Cleared message queue for ${sessionId}`);
    } catch (error) {
      logger.warn(`Failed to clear queue for ${sessionId}:`, error);
      // Don't throw - continue with cleanup
    }

    logger.info(`✅ Session ${sessionId} completely cleared and reset`);
  } catch (error) {
    logger.error(`❌ Error during clearSession for ${sessionId}:`, error);
    throw error;
  }
}
