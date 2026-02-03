import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  jidNormalizedUser,
  areJidsSameUser,
  isJidGroup,
  jidEncode,
  isLidUser,
  Browsers,
} from '@whiskeysockets/baileys';
import { isBoom } from '@hapi/boom';
import fs from 'fs-extra';
import path from 'path';
import pino from 'pino';
import logger from '../../utils/logger.js';
import { config } from '../../config/environment.js';
import outboxQueue from '../queue/outbox-queue.js';

// 🔇 Silenciar logs ruidosos de Signal Protocol/Baileys
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const signalDecryptErrorPatterns = [
  'Bad MAC',
  'Session error: Error: Bad MAC',
  'Session error:Error: Bad MAC',
  'Failed to decrypt message with any known session',
  'MessageCounterError: Key used already or never filled',
  'MessageCounterError',
];

type SignalDecryptErrorPayload = {
  message: string;
  stack?: string;
};

let signalDecryptErrorHandler: ((payload: SignalDecryptErrorPayload) => void) | null = null;

const extractConsoleErrorPayload = (args: any[]): SignalDecryptErrorPayload => {
  let message = '';
  let stack: string | undefined;

  for (const arg of args) {
    if (arg instanceof Error) {
      message = message ? `${message} ${arg.message}` : arg.message;
      stack = stack || arg.stack;
      continue;
    }
    if (typeof arg === 'string') {
      message = message ? `${message} ${arg}` : arg;
      continue;
    }
    if (arg && typeof arg === 'object') {
      const maybeMessage = (arg as { message?: unknown }).message;
      if (typeof maybeMessage === 'string') {
        message = message ? `${message} ${maybeMessage}` : maybeMessage;
      }
    }
  }

  return {
    message: message.trim(),
    stack,
  };
};
console.log = (...args: any[]) => {
  const message = args.join(' ');
  // Filtrar mensajes de Signal Protocol que ensucian la consola
  if (
    message.includes('Closing open session in favor of') ||
    message.includes('Closing session: SessionEntry') ||
    message.includes('_chains:') ||
    message.includes('registrationId:') ||
    message.includes('currentRatchet:') ||
    signalDecryptErrorPatterns.some((pattern) => message.includes(pattern))
  ) {
    return; // Silenciar estos mensajes
  }
  originalConsoleLog.apply(console, args);
};
console.error = (...args: any[]) => {
  const payload = extractConsoleErrorPayload(args);
  if (signalDecryptErrorPatterns.some((pattern) => payload.message.includes(pattern))) {
    signalDecryptErrorHandler?.(payload);
    return;
  }
  originalConsoleError.apply(console, args);
};

type BackupEntry = {
  name: string;
  id: string;
  type: 'full' | 'creds';
  path: string;
  mtimeMs: number;
  isDir: boolean;
};

export class ConnectionManager {
  private connections: Map<string, any> = new Map();
  private connectionStates: Map<string, 'open' | 'close' | 'connecting'> = new Map();
  private qrCodes: Map<string, string> = new Map();
  private qrIssuedAt: Map<string, number> = new Map();
  private contactsBySession: Map<string, Map<string, any>> = new Map();
  private groupsCache: Map<string, { ts: number; data: Array<{ id: string; name: string }> }> =
    new Map();
  private groupsInFlight: Map<string, Promise<Array<{ id: string; name: string }>>> =
    new Map();
  private connectInFlight: Map<string, Promise<any>> = new Map();
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private connectWatchdogs: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private sessionRecoveryWatchdog: ReturnType<typeof setTimeout> | null = null;
  private signalDecryptStats: Map<string, { count: number; lastAt: number; lastCleanupAt: number }> =
    new Map();
  private signalDecryptCleanupInFlight: Set<string> = new Set();
  private disabledSessions: Set<string> = new Set();
  private manualDisconnects: Set<string> = new Set();
  private groupCapabilitiesVerified: Set<string> = new Set();

  constructor() {
    signalDecryptErrorHandler = this.handleSignalDecryptError.bind(this);
  }

  async createConnection(sessionPhone: string): Promise<any> {
    const existing = this.connections.get(sessionPhone);
    if (existing) {
      logger.debug(`Connection already exists for ${sessionPhone}`);
      return existing;
    }

    const inFlight = this.connectInFlight.get(sessionPhone);
    if (inFlight) {
      return await inFlight;
    }

    const connectPromise = (async () => {
      try {
        logger.info(`Creating WhatsApp connection for ${sessionPhone}`);
        this.connectionStates.set(sessionPhone, 'connecting');

        const sessionDir = path.join(config.whatsapp.sessionDir, sessionPhone);
        if (!this.isSessionDisabled(sessionPhone)) {
          await this.clearSessionMarker(sessionPhone);
        }

        // 🛡️ PROTECCIÓN CRÍTICA: Validar integridad del auth state (creds + key material)
        const authState = await this.inspectAuthState(sessionDir);
        const hasUsableAuthState =
          authState.hasCreds && (authState.hasKeyMaterial || !authState.hasIdentity);

        if (!hasUsableAuthState) {
          if (authState.hasCreds && !authState.hasKeyMaterial && authState.hasIdentity) {
            logger.warn(
              `⚠️ Detected partial auth state for ${sessionPhone} (creds without key material), attempting recovery`
            );
          } else if (!authState.hasCreds) {
            logger.warn(`⚠️ No credentials found for ${sessionPhone}, attempting auto-recovery from backup`);
          }

          const recovered = await this.autoRecoverSession(sessionPhone);

          if (recovered) {
            logger.info(`✅ Successfully auto-recovered session ${sessionPhone} from backup`);
            const postState = await this.inspectAuthState(sessionDir);
            const postUsable =
              postState.hasCreds && (postState.hasKeyMaterial || !postState.hasIdentity);
            if (!postUsable && postState.hasCreds && postState.hasIdentity) {
              if (this.isWithinQrGracePeriod(sessionPhone)) {
                logger.warn(
                  `⚠️ Recovered backup for ${sessionPhone} is incomplete but QR pairing is recent; skipping auth reset`
                );
              } else {
                logger.warn(
                  `⚠️ Recovered backup for ${sessionPhone} is incomplete (missing key material), clearing auth state to force QR`
                );
                await this.backupAndResetAuthState(sessionPhone, sessionDir);
              }
            }
          } else {
            if (authState.hasCreds && !authState.hasKeyMaterial && authState.hasIdentity) {
              if (this.isWithinQrGracePeriod(sessionPhone)) {
                logger.warn(
                  `⚠️ No valid backup found for ${sessionPhone} but QR pairing is recent; skipping auth reset`
                );
              } else {
                logger.warn(
                  `⚠️ No valid backup found for ${sessionPhone} and auth state is incomplete, clearing auth state to force QR`
                );
                await this.backupAndResetAuthState(sessionPhone, sessionDir);
              }
            } else if (!authState.hasCreds) {
              logger.warn(`⚠️ No valid backup found for ${sessionPhone}, will generate new QR`);
            }
          }
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        // Crear socket
        const socket = makeWASocket({
          auth: state,
          version,
          syncFullHistory: false,
          shouldIgnoreJid: (jid) => /status@broadcast/.test(jid),
          printQRInTerminal: false,
          logger: pino({ level: config.whatsapp.baileysLogLevel }),
          // 🔧 FIX: Browser specification (from notifications project)
          browser: Browsers.ubuntu('Chrome'),
          // 🔧 FIX: Explicit WebSocket URL (from notifications project)
          waWebSocketUrl: 'wss://web.whatsapp.com/ws/chat',
        });

        this.contactsBySession.set(sessionPhone, new Map());

        // Guardar conexión
        this.connections.set(sessionPhone, socket);

        // Configurar listeners
        this.setupListeners(socket, sessionPhone, sessionDir, saveCreds);

        return socket;
      } catch (error) {
        logger.error(`Error creating connection for ${sessionPhone}:`, error);
        throw error;
      }
    })();

    this.connectInFlight.set(sessionPhone, connectPromise);
    try {
      return await connectPromise;
    } finally {
      this.connectInFlight.delete(sessionPhone);
    }
  }

  /**
   * Request pairing code for session (alternative to QR)
   * Returns 8-character code that user enters in WhatsApp
   */
  async requestPairingCode(sessionPhone: string): Promise<string> {
    try {
      logger.info(`🔢 Requesting pairing code for ${sessionPhone}`);

      const sessionDir = path.join(config.whatsapp.sessionDir, sessionPhone);
      await fs.ensureDir(sessionDir);

      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      const socket = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        waWebSocketUrl: 'wss://web.whatsapp.com/ws/chat',
        printQRInTerminal: false,
      });

      this.connections.set(sessionPhone, socket);
      this.setupListeners(socket, sessionPhone, sessionDir, saveCreds);

      // Wait for socket to be ready to request pairing code
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for pairing code'));
        }, 30000);

        socket.ev.on('connection.update', async (update) => {
          const { connection } = update;

          if (connection === 'connecting' && !socket.authState.creds.registered) {
            try {
              const code = await socket.requestPairingCode(sessionPhone);
              clearTimeout(timeout);
              logger.info(`✅ Pairing code generated: ${code}`);
              resolve(code);
            } catch (err) {
              clearTimeout(timeout);
              logger.error(`❌ Error requesting pairing code: ${err}`);
              reject(err);
            }
          }

          if (connection === 'open') {
            clearTimeout(timeout);
          }
        });
      });
    } catch (error) {
      logger.error(`Error requesting pairing code for ${sessionPhone}:`, error);
      throw error;
    }
  }

  async ensureConnected(
    sessionPhone: string,
    timeoutMs = 15000,
    intervalMs = 300
  ): Promise<boolean> {
    // 🛡️ PUNTO CRÍTICO: Este método se llama antes de cada operación (enviar mensaje, etc.)
    // Aquí debemos asegurar auto-recuperación si no hay conexión

    if (this.isSessionDisabled(sessionPhone)) {
      logger.warn(`Session ${sessionPhone} is disabled, skipping auto-connect`);
      return false;
    }

    if (!this.connections.has(sessionPhone)) {
      try {
        // createConnection ya tiene auto-recuperación integrada
        await this.createConnection(sessionPhone);
      } catch (error) {
        logger.warn(`Failed to create connection for ${sessionPhone}, will schedule reconnect: ${error}`);
        this.scheduleReconnect(sessionPhone, error);
        return false;
      }
    }

    if (this.isConnected(sessionPhone)) {
      return true;
    }

    const existingSocket = this.connections.get(sessionPhone);
    if (existingSocket) {
      logger.warn(
        `ensureConnected: ${sessionPhone} socket exists but state=${this.connectionStates.get(sessionPhone)}`
      );
    }

    // Esperar a que la conexión se establezca
    const start = Date.now();
    const connected = await new Promise<boolean>((resolve) => {
      const timer = setInterval(() => {
        if (this.isConnected(sessionPhone)) {
          clearInterval(timer);
          resolve(true);
          return;
        }

        if (Date.now() - start >= timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, intervalMs);
    });

    if (!connected) {
      logger.warn(`Connection timeout for ${sessionPhone} after ${timeoutMs}ms`);
      const state = this.connectionStates.get(sessionPhone);
      logger.warn(`Connection state for ${sessionPhone} on timeout: ${state}`);
      this.cleanupSession(sessionPhone, { clearQr: false });
      this.scheduleReconnect(sessionPhone);
    }

    return connected;
  }

  async reconnectSavedSessions(): Promise<void> {
    const baseDir = path.resolve(config.whatsapp.sessionDir);
    if (!(await fs.pathExists(baseDir))) {
      return;
    }

    // 1. Reconectar sesiones con credenciales existentes
    const entries = await fs.readdir(baseDir);
    const sessionDirs = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(baseDir, entry);
        const stat = await fs.stat(fullPath);
        return stat.isDirectory() && entry !== 'backups' ? entry : null;
      })
    );

    const sessionsWithCreds: string[] = [];

    for (const sessionPhone of sessionDirs.filter(Boolean) as string[]) {
      const sessionDir = path.join(baseDir, sessionPhone);
      if (await this.hasSessionClearMarker(sessionPhone)) {
        logger.info(`Skipping cleared session ${sessionPhone} during reconnect`);
        continue;
      }
      const authState = await this.inspectAuthState(sessionDir);
      if (authState.hasCreds) {
        if (authState.hasCreds && !authState.hasKeyMaterial && authState.hasIdentity) {
          logger.warn(
            `⚠️ Partial auth state detected for ${sessionPhone} during reconnect, attempting recovery`
          );
        }
        sessionsWithCreds.push(sessionPhone);
        try {
          await this.createConnection(sessionPhone);
          logger.info(`✅ Reconnected session ${sessionPhone}`);
        } catch (error) {
          logger.warn(`Failed to reconnect session ${sessionPhone}: ${String(error)}`);
        }
      }
    }

    // 2. 🛡️ RECUPERACIÓN AUTOMÁTICA: Buscar sesiones perdidas con backups disponibles
    const backupBaseDir = path.join(baseDir, 'backups');
    if (await fs.pathExists(backupBaseDir)) {
      const backupEntries = await fs.readdir(backupBaseDir);

      for (const sessionPhone of backupEntries) {
        // Si esta sesión ya tiene credenciales, skip
        if (sessionsWithCreds.includes(sessionPhone)) {
          continue;
        }

        const backupDir = path.join(backupBaseDir, sessionPhone);
        const stat = await fs.stat(backupDir);
        if (!stat.isDirectory()) {
          continue;
        }

        // Intentar recuperar esta sesión perdida
        logger.info(`🔍 Found session ${sessionPhone} with backups but no active credentials, attempting auto-recovery`);

        try {
          const recovered = await this.autoRecoverSession(sessionPhone);
          if (recovered) {
            await this.createConnection(sessionPhone);
            logger.info(`✅ Auto-recovered and reconnected session ${sessionPhone}`);
          }
        } catch (error) {
          logger.warn(`Failed to auto-recover session ${sessionPhone}: ${String(error)}`);
        }
      }
    }
  }

  private setupListeners(socket: any, sessionPhone: string, sessionDir: string, saveCreds: any) {
    // Conexión establecida
    socket.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (connection) {
        this.connectionStates.set(sessionPhone, connection);
      }

      if (qr) {
        const qrText = typeof qr === 'string' ? qr : String(qr);
        logger.info(`QR Code for ${sessionPhone}`);
        this.qrCodes.set(sessionPhone, qrText);
        this.qrIssuedAt.set(sessionPhone, Date.now());
        // Aquí se podría emitir un evento para mostrar el QR en una interfaz web
      }

        if (connection === 'close') {
          this.clearConnectWatchdog(sessionPhone);
          const reason = this.getDisconnectReason(lastDisconnect?.error);
          const errorMessage = lastDisconnect?.error ? String(lastDisconnect.error) : '';
          const reasonName = this.getDisconnectReasonName(reason);

          logger.warn(`Connection closed for ${sessionPhone}, reason: ${reason} (${reasonName}), error: ${errorMessage}`);

          if (this.isSessionDisabled(sessionPhone)) {
            logger.info(`Session ${sessionPhone} is disabled, skipping close handling`);
            this.cleanupSession(sessionPhone, { clearQr: true });
            return;
          }

          const isManualDisconnect = this.manualDisconnects.has(sessionPhone);
          if (isManualDisconnect && reason !== DisconnectReason.loggedOut && reason !== 401) {
            this.manualDisconnects.delete(sessionPhone);
            logger.info(`Manual disconnect for ${sessionPhone}, skipping auto-reconnect`);
            this.cleanupSession(sessionPhone, { clearQr: true });
          return;
        }
        if (isManualDisconnect) {
          this.manualDisconnects.delete(sessionPhone);
        }

        // 🛡️ PROTECCIÓN CRÍTICA: Detectar errores de red/stream que NO deben borrar credenciales
        const isNetworkError =
          errorMessage.includes('Stream Errored') ||
          errorMessage.includes('Connection Failure') ||
          errorMessage.includes('Socket hang up') ||
          errorMessage.includes('ECONNRESET') ||
          errorMessage.includes('ETIMEDOUT') ||
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('timed out') ||
          reason === 408 || // timedOut
          reason === 428 || // connectionLost
          reason === 500 || // restartRequired (no es 515!)
          reason === 503;   // service unavailable

        if (isNetworkError) {
          logger.warn(`🌐 Network/Stream error detected for ${sessionPhone}, preserving auth state and reconnecting`);
          this.cleanupSession(sessionPhone, { clearQr: false });
          this.scheduleReconnect(sessionPhone);
          return;
        }

        // 🔒 PROTECCIÓN 1: Solo borrar credenciales si es REALMENTE logout manual
        // DisconnectReason.loggedOut (401) = Usuario hizo logout desde WhatsApp
        if (reason === DisconnectReason.loggedOut || reason === 401) {
          logger.warn(`🔴 User manually logged out ${sessionPhone}, clearing auth state`);
          await this.backupAndResetAuthState(sessionPhone, sessionDir);
          this.cleanupSession(sessionPhone, { clearQr: true });
          this.scheduleReconnect(sessionPhone);
          return;
        }

        // 🔒 PROTECCIÓN 2: badSession (403) - verificar si es genuino
        if (reason === DisconnectReason.badSession || reason === 403) {
          // Intentar restaurar desde backup reciente primero (< 24h)
          let backupRestored = await this.tryRestoreRecentBackup(sessionPhone);

          if (backupRestored) {
            logger.info(`✅ Restored recent backup for ${sessionPhone}, attempting reconnect`);
            this.cleanupSession(sessionPhone, { clearQr: false });
            this.scheduleReconnect(sessionPhone);
            return;
          }

          // Si no hay backup reciente, intentar ANY backup disponible (auto-recuperación completa)
          logger.warn(`⚠️ No recent backup for ${sessionPhone}, trying full auto-recovery`);
          backupRestored = await this.autoRecoverSession(sessionPhone);

          if (backupRestored) {
            logger.info(`✅ Full auto-recovery successful for ${sessionPhone}, attempting reconnect`);
            this.cleanupSession(sessionPhone, { clearQr: false });
            this.scheduleReconnect(sessionPhone);
            return;
          }

          // Solo borrar si genuinamente no hay ningún backup disponible
          logger.warn(`🔴 Bad session detected for ${sessionPhone} (no backups available), clearing auth state`);
          await this.backupAndResetAuthState(sessionPhone, sessionDir);
          this.cleanupSession(sessionPhone, { clearQr: true });
          this.scheduleReconnect(sessionPhone);
          return;
        }

        // 🔒 PROTECCIÓN 3: Preservar credenciales para errores recuperables
        const shouldReconnect =
          reason === DisconnectReason.connectionClosed ||
          reason === DisconnectReason.connectionLost ||
          reason === DisconnectReason.timedOut ||
          reason === DisconnectReason.restartRequired ||
          reason === DisconnectReason.connectionReplaced ||
          reason === 411 || // connectionClosed
          reason === 428 || // connectionLost
          reason === 440 || // connectionReplaced
          reason === 515;   // restartRequired (valor correcto de Baileys)

        if (shouldReconnect) {
          logger.info(`♻️ Reconnectable disconnect for ${sessionPhone}, preserving credentials`);
          this.cleanupSession(sessionPhone, { clearQr: false });
          this.scheduleReconnect(sessionPhone);
        } else {
          // Error desconocido - preservar credenciales por defecto (fail-safe)
          logger.warn(`⚠️ Unknown disconnect reason ${reason} for ${sessionPhone}, preserving credentials and reconnecting`);
          this.cleanupSession(sessionPhone, { clearQr: false });
          this.scheduleReconnect(sessionPhone);
        }
      } else if (connection === 'open') {
        this.clearConnectWatchdog(sessionPhone);
        if (this.isSessionDisabled(sessionPhone)) {
          logger.warn(`Session ${sessionPhone} is disabled, closing connection`);
          await this.disconnect(sessionPhone);
          return;
        }
        await this.clearSessionMarker(sessionPhone);
        this.qrIssuedAt.delete(sessionPhone);
        logger.info(`✅ Connection established for ${sessionPhone}`);

        // DEBUG: Log socket.user state
        logger.info(`🔍 socket.user state: ${socket.user ? JSON.stringify({id: socket.user.id, name: socket.user.name}) : 'NULL'}`);
        logger.info(`🔍 creds.me state: ${socket.authState?.creds?.me ? JSON.stringify({id: socket.authState.creds.me.id, name: socket.authState.creds.me.name}) : 'NULL'}`);

        // 🔧 FIX CRÍTICO: Establecer socket.user explícitamente si no existe
        if (!socket.user && socket.authState?.creds?.me) {
          logger.info(`🔧 Fixing socket.user from creds.me for ${sessionPhone}`);
          socket.user = {
            id: socket.authState.creds.me.id,
            name: socket.authState.creds.me.name,
            lid: socket.authState.creds.me.lid,
          };
          logger.info(`✅ socket.user established: ${JSON.stringify({id: socket.user.id, name: socket.user.name})}`);
        }

        // 🔒 VALIDACIÓN DE DEVICE ID: Verificar que el device ID sea válido
        if (socket.user?.id) {
          const deviceIdMatch = socket.user.id.match(/:(\d+)@/);
          if (deviceIdMatch) {
            const deviceId = parseInt(deviceIdMatch[1], 10);
            logger.info(`📱 Device ID detected: ${deviceId}`);

            // Advertir si el device ID es anormalmente alto (> 10)
            if (deviceId > 10) {
              logger.warn(`⚠️ WARNING: Abnormally high device ID (${deviceId}). This may indicate:`);
              logger.warn(`   - Corrupted pairing process`);
              logger.warn(`   - WhatsApp Web/Desktop pairing instead of primary device`);
              logger.warn(`   - Potential issues with group messaging`);
              logger.warn(`   Recommendation: Clear session and re-pair with PRIMARY WhatsApp app`);
            } else if (deviceId === 0) {
              logger.info(`✅ Primary device detected (ID: 0) - Full functionality available`);
            } else {
              logger.info(`📱 Linked device detected (ID: ${deviceId}) - Normal operation`);
            }
          }
        }

        // 🧪 VERIFICACIÓN POST-PAIRING: Test group capabilities
        // Solo ejecutar esto para conexiones nuevas, no reconnects
        if (!this.hasVerifiedGroupCapabilities(sessionPhone)) {
          this.scheduleGroupCapabilityTest(sessionPhone, socket);
        }

        // 🔧 FIX: Send presence update after connection opens (from notifications project)
        try {
          await socket.sendPresenceUpdate('available');
          logger.info(`✅ Presence set to 'available' for ${sessionPhone}`);
        } catch (error) {
          logger.warn(`Failed to set presence for ${sessionPhone}: ${String(error)}`);
        }

        this.qrCodes.delete(sessionPhone);
        this.resetReconnectState(sessionPhone);
        await this.flushOutbox(sessionPhone);
      } else if (connection === 'connecting') {
        this.scheduleConnectWatchdog(sessionPhone);
      }
    });

    socket.ev.on('messaging-history.set', (data: any) => {
      const store = this.contactsBySession.get(sessionPhone);
      if (!store || !data?.contacts) {
        return;
      }
      data.contacts.forEach((contact: any) => {
        if (contact?.id) {
          store.set(contact.id, contact);
        }
      });
    });

    socket.ev.on('contacts.upsert', (contacts: any[]) => {
      const store = this.contactsBySession.get(sessionPhone);
      if (!store) {
        return;
      }
      contacts.forEach((contact) => {
        if (contact?.id) {
          store.set(contact.id, contact);
        }
      });
    });

    socket.ev.on('contacts.update', (updates: any[]) => {
      const store = this.contactsBySession.get(sessionPhone);
      if (!store) {
        return;
      }
      updates.forEach((update) => {
        if (!update?.id) {
          return;
        }
        const existing = store.get(update.id) || {};
        store.set(update.id, { ...existing, ...update });
      });
    });

    // Group metadata is fetched on-demand via getGroups() to avoid rate-overlimit on connection

    // Guardar credenciales
    socket.ev.on('creds.update', saveCreds);

    // Procesar mensajes entrantes deshabilitado temporalmente (bot listener)
  }

  async disconnect(sessionPhone: string): Promise<void> {
    try {
      // Limpiar timers de reconexión primero
      this.resetReconnectState(sessionPhone);

      const socket = this.connections.get(sessionPhone);
      if (socket) {
        await socket.end({
          cancel: true,
        });
        this.cleanupSession(sessionPhone, { clearQr: true });
        logger.info(`Disconnected ${sessionPhone}`);
      }
    } catch (error) {
      logger.error(`Error disconnecting ${sessionPhone}:`, error);
      this.cleanupSession(sessionPhone, { clearQr: true });
    }
  }

  async disconnectManual(sessionPhone: string): Promise<void> {
    this.markManualDisconnect(sessionPhone);
    await this.disconnect(sessionPhone);
  }

  async clearSession(sessionPhone: string): Promise<void> {
    try {
      this.disableSession(sessionPhone);
      this.resetReconnectState(sessionPhone);

      const socket = this.connections.get(sessionPhone);
      if (socket) {
        try {
          await socket.end({ cancel: true });
        } catch (error) {
          logger.warn(`Failed to end socket for ${sessionPhone}: ${String(error)}`);
        }
      }

      this.cleanupSession(sessionPhone, { clearQr: true });

      const sessionDir = path.join(config.whatsapp.sessionDir, sessionPhone);
      await this.purgeAuthState(sessionPhone, sessionDir);
      await this.markSessionCleared(sessionPhone);
      await outboxQueue.clear(sessionPhone);

      logger.info(`Session ${sessionPhone} cleared`);
    } catch (error) {
      logger.error(`Error clearing session ${sessionPhone}:`, error);
      throw error;
    }
  }

  async disconnectAll(): Promise<void> {
    // Detener watchdog de recuperación
    this.stopSessionRecoveryWatchdog();

    for (const [sessionPhone] of this.connections) {
      await this.disconnect(sessionPhone);
    }
  }

  /**
   * 🛡️ WATCHDOG DE RECUPERACIÓN AUTOMÁTICA
   * Ejecuta verificación periódica cada 5 minutos para:
   * 1. Detectar sesiones perdidas (sin conexión pero con backups disponibles)
   * 2. Recuperar automáticamente desde backups
   * 3. Intentar reconectar sesiones caídas
   *
   * Esto es una capa adicional de resiliencia que funciona incluso si
   * los otros mecanismos de auto-recuperación fallan.
   */
  startSessionRecoveryWatchdog(): void {
    // Si ya está corriendo, no iniciar otro
    if (this.sessionRecoveryWatchdog) {
      return;
    }

    const runRecoveryCheck = async () => {
      try {
        logger.debug('🔍 Running session recovery watchdog check...');

        const baseDir = path.resolve(config.whatsapp.sessionDir);
        const backupBaseDir = path.join(baseDir, 'backups');

        if (!(await fs.pathExists(backupBaseDir))) {
          return;
        }

        const backupEntries = await fs.readdir(backupBaseDir);

        for (const sessionPhone of backupEntries) {
          const backupDir = path.join(backupBaseDir, sessionPhone);
          const stat = await fs.stat(backupDir);

          if (!stat.isDirectory()) {
            continue;
          }
          if (this.isSessionDisabled(sessionPhone)) {
            continue;
          }
          if (await this.hasSessionClearMarker(sessionPhone)) {
            continue;
          }

          // Verificar si esta sesión está conectada
          const isConnected = this.isConnected(sessionPhone);
          const hasConnection = this.connections.has(sessionPhone);
          const isReconnecting = this.reconnectTimers.has(sessionPhone);

          // Si ya está conectada o reconectando, skip
          if (isConnected || isReconnecting) {
            continue;
          }

          // Si tiene conexión pero no está conectada, dejar que scheduleReconnect lo maneje
          if (hasConnection && !isConnected) {
            continue;
          }

          // Esta sesión no está conectada y no está en proceso de reconexión
          const sessionDir = path.join(baseDir, sessionPhone);
          const authState = await this.inspectAuthState(sessionDir);
          const hasUsableAuthState =
            authState.hasCreds && (authState.hasKeyMaterial || !authState.hasIdentity);

          if (!hasUsableAuthState) {
            // Sesión perdida o incompleta detectada - intentar auto-recuperación
            logger.info(`🚨 Watchdog detected lost/incomplete session ${sessionPhone}, attempting auto-recovery`);

            const recovered = await this.autoRecoverSession(sessionPhone);

            if (recovered) {
              logger.info(`✅ Watchdog successfully recovered ${sessionPhone}, initiating reconnect`);
              try {
                await this.createConnection(sessionPhone);
              } catch (error) {
                logger.warn(`Watchdog recovery connect failed for ${sessionPhone}: ${error}`);
                this.scheduleReconnect(sessionPhone, error);
              }
            } else {
              if (authState.hasCreds && !authState.hasKeyMaterial && authState.hasIdentity) {
                if (this.isWithinQrGracePeriod(sessionPhone)) {
                  logger.warn(
                    `⚠️ Watchdog found incomplete auth state for ${sessionPhone} but QR pairing is recent; skipping auth reset`
                  );
                } else {
                  logger.warn(
                    `⚠️ Watchdog found incomplete auth state for ${sessionPhone} with no valid backups, clearing to force QR`
                  );
                  await this.backupAndResetAuthState(sessionPhone, sessionDir);
                }
              }
              logger.warn(`⚠️ Watchdog could not recover ${sessionPhone}, no valid backups`);
            }
          }
        }
      } catch (error) {
        logger.error(`Session recovery watchdog error: ${error}`);
      }
    };

    // Ejecutar cada 5 minutos
    const intervalMs = 5 * 60 * 1000;

    const scheduleNext = () => {
      this.sessionRecoveryWatchdog = setTimeout(async () => {
        await runRecoveryCheck();
        scheduleNext();
      }, intervalMs);
    };

    scheduleNext();
    logger.info('✅ Session recovery watchdog started (checking every 5 minutes)');
  }

  /**
   * Detener el watchdog de recuperación
   */
  stopSessionRecoveryWatchdog(): void {
    if (this.sessionRecoveryWatchdog) {
      clearTimeout(this.sessionRecoveryWatchdog);
      this.sessionRecoveryWatchdog = null;
      logger.info('Session recovery watchdog stopped');
    }
  }

  async sendTextMessage(
    sessionPhone: string,
    recipient: string,
    text: string,
    options: { queueOnFail?: boolean } = {}
  ): Promise<{ queued: boolean }> {
    const isConnected = await this.ensureConnected(sessionPhone);
    const queueOnFail = options.queueOnFail !== false;

    if (!isConnected) {
      if (queueOnFail) {
        await outboxQueue.enqueue(sessionPhone, recipient, text);
        return { queued: true };
      }
      throw new Error('Session not connected');
    }

    const socket = this.connections.get(sessionPhone);
    if (!socket) {
      if (queueOnFail) {
        await outboxQueue.enqueue(sessionPhone, recipient, text);
        return { queued: true };
      }
      throw new Error('Session not connected');
    }

    try {
      // 🔧 CRITICAL FIX: Assert sessions before sending to groups
      if (isJidGroup(recipient)) {
        logger.info(`📨 Preparing to send group message to ${recipient}`);
        await this.assertGroupSessions(socket, recipient);

        // ⏳ Additional delay to ensure sessions are fully persisted
        logger.info(`⏳ Extra 3s delay to ensure session persistence...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        logger.info(`✅ Ready to send after persistence delay`);
      }

      await socket.sendMessage(recipient, { text });
      return { queued: false };
    } catch (error) {
      logger.warn(`Failed to send message via ${sessionPhone}: ${String(error)}`);
      await this.disconnect(sessionPhone);
      this.scheduleReconnect(sessionPhone, error);
      if (queueOnFail) {
        await outboxQueue.enqueue(sessionPhone, recipient, text);
        return { queued: true };
      }
      throw error;
    }
  }

  getConnection(sessionPhone: string): any {
    return this.connections.get(sessionPhone);
  }

  getAllConnections(): Map<string, any> {
    return this.connections;
  }

  getQRCode(sessionPhone: string): string | undefined {
    return this.qrCodes.get(sessionPhone);
  }

  isConnected(sessionPhone: string): boolean {
    return this.connectionStates.get(sessionPhone) === 'open';
  }

  getConnectionStatus(sessionPhone: string): string {
    const state = this.connectionStates.get(sessionPhone);
    if (state === 'open') return 'connected';
    if (this.qrCodes.has(sessionPhone)) return 'waiting_qr';
    if (state === 'connecting') return 'connecting';
    return 'disconnected';
  }

  enableSession(sessionPhone: string): void {
    this.disabledSessions.delete(sessionPhone);
    void this.clearSessionMarker(sessionPhone);
  }

  private disableSession(sessionPhone: string): void {
    this.disabledSessions.add(sessionPhone);
  }

  private isSessionDisabled(sessionPhone: string): boolean {
    return this.disabledSessions.has(sessionPhone);
  }

  private markManualDisconnect(sessionPhone: string): void {
    this.manualDisconnects.add(sessionPhone);
  }

  async getGroups(sessionPhone: string) {
    const socket = this.connections.get(sessionPhone);
    if (!socket) {
      throw new Error('Session not connected');
    }
    const cacheTtlMs = 60 * 1000;
    const cached = this.groupsCache.get(sessionPhone);
    if (cached && Date.now() - cached.ts < cacheTtlMs) {
      return cached.data;
    }

    const inFlight = this.groupsInFlight.get(sessionPhone);
    if (inFlight) {
      return await inFlight;
    }

    const fetchPromise = (async () => {
      try {
        const groups = await socket.groupFetchAllParticipating();
        const data = Object.values(groups || {}).map((group: any) => ({
          id: group.id,
          name: group.subject,
        }));
        this.groupsCache.set(sessionPhone, { ts: Date.now(), data });
        return data;
      } catch (error) {
        const message = String(error);
        if (message.includes('rate-overlimit') && cached) {
          logger.warn(`Using cached groups for ${sessionPhone} after rate limit`);
          return cached.data;
        }
        throw error;
      } finally {
        this.groupsInFlight.delete(sessionPhone);
      }
    })();

    this.groupsInFlight.set(sessionPhone, fetchPromise);
    return await fetchPromise;
  }

  async getContacts(sessionPhone: string) {
    const socket = this.connections.get(sessionPhone);
    if (!socket) {
      throw new Error('Session not connected');
    }

    const store = this.contactsBySession.get(sessionPhone);
    const storeContacts = store ? Array.from(store.values()) : [];
    const socketContacts = Object.values(socket.contacts || {});
    const contacts = storeContacts.length > 0 ? storeContacts : socketContacts;
    return contacts.map((contact: any) => ({
      id: contact.id,
      name: contact.name || contact.notify || null,
      number: contact.id ? contact.id.split('@')[0] : null,
      isBusiness: Boolean(contact.isBusiness),
      isMyContact: Boolean(contact.isMyContact),
    }));
  }

  private cleanupSession(
    sessionPhone: string,
    options: { clearQr?: boolean } = {}
  ): void {
    this.connections.delete(sessionPhone);
    this.connectionStates.set(sessionPhone, 'close');
    this.contactsBySession.delete(sessionPhone);
    this.groupsCache.delete(sessionPhone);
    this.groupsInFlight.delete(sessionPhone);
    this.clearConnectWatchdog(sessionPhone);
    this.clearGroupCapabilityVerification(sessionPhone);
    if (options.clearQr) {
      this.qrCodes.delete(sessionPhone);
      this.qrIssuedAt.delete(sessionPhone);
    }
  }

  private resetReconnectState(sessionPhone: string): void {
    const timer = this.reconnectTimers.get(sessionPhone);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(sessionPhone);
    }
    this.reconnectAttempts.delete(sessionPhone);
  }

  private scheduleReconnect(sessionPhone: string, error?: unknown): void {
    if (!config.whatsapp.autoReconnect) {
      return;
    }

    if (this.isSessionDisabled(sessionPhone)) {
      logger.info(`Reconnect skipped for disabled session ${sessionPhone}`);
      return;
    }

    if (this.reconnectTimers.has(sessionPhone)) {
      return;
    }

    const pairingInProgress = this.isWithinQrGracePeriod(sessionPhone);
    const currentAttempts = pairingInProgress ? 0 : (this.reconnectAttempts.get(sessionPhone) || 0);
    const nextAttempt = currentAttempts + 1;
    if (!pairingInProgress) {
      this.reconnectAttempts.set(sessionPhone, nextAttempt);
    } else {
      this.reconnectAttempts.delete(sessionPhone);
    }

    const maxAttempts = config.whatsapp.maxReconnectAttempts;
    if (!pairingInProgress && maxAttempts > 0 && nextAttempt > maxAttempts) {
      logger.error(`Reconnect attempts exhausted for ${sessionPhone} after ${maxAttempts} attempts`);

      // 🛡️ ÚLTIMO INTENTO: Verificar si hay backup disponible
      (async () => {
        const hasBackup = await this.hasAvailableBackup(sessionPhone);
        if (hasBackup) {
          logger.info(`💡 Found backup for ${sessionPhone}, attempting final auto-recovery`);
          const recovered = await this.autoRecoverSession(sessionPhone);
          if (recovered) {
            logger.info(`✅ Final auto-recovery successful for ${sessionPhone}, resetting reconnect attempts`);
            this.reconnectAttempts.delete(sessionPhone);
            this.scheduleReconnect(sessionPhone);
          }
        } else {
          logger.info(`💡 No backups available for ${sessionPhone}, manual QR scan required`);
        }
      })();

      return;
    }

    // Backoff exponencial pero más conservador
    // 2s, 4s, 8s, 16s, 32s, 60s (max)
    const delayMs = Math.min(60000, 2000 * Math.pow(2, nextAttempt - 1));
    const message = `Scheduling reconnect for ${sessionPhone} in ${delayMs}ms (attempt ${nextAttempt}/${maxAttempts || '∞'})`;
    if (error) {
      logger.warn(message, { error: String(error) });
    } else {
      logger.warn(message);
    }

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(sessionPhone);
      const pairingInProgressNow = this.isWithinQrGracePeriod(sessionPhone);

      // 🛡️ Verificar si hay credenciales, si no, intentar auto-recuperación
      const sessionDir = path.join(config.whatsapp.sessionDir, sessionPhone);
      const authState = await this.inspectAuthState(sessionDir);
      const hasUsableAuthState =
        authState.hasCreds && (authState.hasKeyMaterial || !authState.hasIdentity);

      if (!hasUsableAuthState) {
        if (pairingInProgressNow) {
          logger.info(`⏳ Pairing in progress for ${sessionPhone}, skipping auto-recovery and retrying connect`);
        } else if (authState.hasCreds && !authState.hasKeyMaterial && authState.hasIdentity) {
          logger.warn(
            `⚠️ Detected partial auth state for ${sessionPhone} (creds without key material), attempting recovery`
          );
        } else if (!authState.hasCreds) {
          logger.warn(`⚠️ No credentials found for ${sessionPhone}, attempting auto-recovery from backup`);
        }

        const recovered = pairingInProgressNow ? false : await this.autoRecoverSession(sessionPhone);

        if (!recovered) {
          if (pairingInProgressNow) {
            // Permitir que el emparejamiento termine sin borrar credenciales parciales
          } else if (authState.hasCreds && !authState.hasKeyMaterial && authState.hasIdentity) {
            if (this.isWithinQrGracePeriod(sessionPhone)) {
              logger.warn(
                `⚠️ No valid backup found for ${sessionPhone} but QR pairing is recent; skipping auth reset`
              );
            } else {
              logger.warn(
                `⚠️ No valid backup found for ${sessionPhone} and auth state is incomplete, clearing auth state to force QR`
              );
              await this.backupAndResetAuthState(sessionPhone, sessionDir);
            }
          }
          if (!pairingInProgressNow) {
            logger.error(`❌ Auto-recovery failed for ${sessionPhone}, no valid backups found`);
            // Continuar intentando - quizás el backup se cree en el siguiente ciclo
            this.scheduleReconnect(sessionPhone);
            return;
          }
        }

        if (!pairingInProgressNow) {
          logger.info(`✅ Auto-recovered credentials for ${sessionPhone}, proceeding with reconnect`);
        }
      }

      try {
        logger.info(`🔄 Attempting reconnect ${nextAttempt}/${maxAttempts || '∞'} for ${sessionPhone}...`);
        await this.createConnection(sessionPhone);
      } catch (err) {
        logger.warn(`Reconnect failed for ${sessionPhone}: ${String(err)}`);
        this.scheduleReconnect(sessionPhone, err);
      }
    }, delayMs);

    this.reconnectTimers.set(sessionPhone, timer);
  }

  private getClearMarkerPath(sessionPhone: string): string {
    return path.join(config.whatsapp.sessionDir, 'cleared', `${sessionPhone}.json`);
  }

  private getLegacyClearMarkerPath(sessionPhone: string): string {
    return path.join(config.whatsapp.sessionDir, 'backups', sessionPhone, 'cleared.json');
  }

  private async markSessionCleared(sessionPhone: string): Promise<void> {
    try {
      const markerPath = this.getClearMarkerPath(sessionPhone);
      await fs.ensureDir(path.dirname(markerPath));
      await fs.writeJson(markerPath, {
        clearedAt: new Date().toISOString(),
        reason: 'manual-clear',
      });
      const legacyPath = this.getLegacyClearMarkerPath(sessionPhone);
      if (await fs.pathExists(legacyPath)) {
        await fs.remove(legacyPath);
      }
    } catch (error) {
      logger.warn(`Failed to write clear marker for ${sessionPhone}: ${error}`);
    }
  }

  private async clearSessionMarker(sessionPhone: string): Promise<void> {
    try {
      const markerPath = this.getClearMarkerPath(sessionPhone);
      if (await fs.pathExists(markerPath)) {
        await fs.remove(markerPath);
      }
      const legacyPath = this.getLegacyClearMarkerPath(sessionPhone);
      if (await fs.pathExists(legacyPath)) {
        await fs.remove(legacyPath);
      }
    } catch (error) {
      logger.warn(`Failed to remove clear marker for ${sessionPhone}: ${error}`);
    }
  }

  private async hasSessionClearMarker(sessionPhone: string): Promise<boolean> {
    try {
      if (await fs.pathExists(this.getClearMarkerPath(sessionPhone))) {
        return true;
      }
      return await fs.pathExists(this.getLegacyClearMarkerPath(sessionPhone));
    } catch (error) {
      return false;
    }
  }

  private isWithinQrGracePeriod(sessionPhone: string): boolean {
    const issuedAt = this.qrIssuedAt.get(sessionPhone);
    if (!issuedAt) {
      return false;
    }
    const graceMs = Math.max(config.whatsapp.qrTimeout * 2, 120000);
    return Date.now() - issuedAt < graceMs;
  }

  /**
   * 🛡️ PROTECCIÓN: Backup antes de eliminar auth state
   * Crea un backup timestamped del auth state completo antes de borrarlo
   * para permitir recuperación manual si es necesario
   */
  private async purgeAuthState(sessionPhone: string, sessionDir: string): Promise<void> {
    try {
      await fs.remove(sessionDir);
      const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionPhone);
      await fs.remove(backupDir);
      logger.info(`🗑️ Purged auth state and backups for ${sessionPhone}`);
    } catch (error) {
      logger.error(`❌ Failed to purge auth state for ${sessionPhone}:`, error);
    }
  }

  private async backupAndResetAuthState(sessionPhone: string, sessionDir: string): Promise<void> {
    try {
      const credsPath = path.join(sessionDir, 'creds.json');
      const credsExist = await fs.pathExists(credsPath);
      const sessionDirExists = await fs.pathExists(sessionDir);

      if (sessionDirExists) {
        // Crear backup con timestamp (full + legacy creds)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(sessionDir, '..', 'backups', sessionPhone);
        const fullBackupDir = path.join(backupDir, `full-${timestamp}`);

        await fs.ensureDir(backupDir);
        await fs.copy(sessionDir, fullBackupDir);
        logger.info(`✅ Backed up full auth state for ${sessionPhone} to ${fullBackupDir}`);

        if (credsExist) {
          const legacyBackupPath = path.join(backupDir, `creds-${timestamp}.json`);
          await fs.copy(credsPath, legacyBackupPath);
          logger.info(`✅ Backed up credentials for ${sessionPhone} to ${legacyBackupPath}`);
        }

        // Mantener solo los últimos 20 backups (aumentado para mayor seguridad)
        await this.cleanupOldBackups(backupDir, 20);
      }

      // Ahora sí, eliminar el directorio de sesión
      await fs.remove(sessionDir);
      logger.info(`🗑️ Auth state cleared for ${sessionPhone}`);
    } catch (error) {
      logger.error(`❌ Failed to backup/clear auth state for ${sessionPhone}:`, error);
    }
  }

  /**
   * Mantiene solo los N backups más recientes
   * Aumentado a 20 backups para mayor seguridad de recuperación
   */
  private async cleanupOldBackups(backupDir: string, keepCount: number = 20): Promise<void> {
    try {
      const groups = await this.getBackupGroups(backupDir);
      const sorted = groups.sort((a, b) => b.mtimeMs - a.mtimeMs);

      // Eliminar backups antiguos (full + legacy)
      for (let i = keepCount; i < sorted.length; i++) {
        const group = sorted[i];
        for (const entry of group.entries) {
          await fs.remove(entry.path);
        }
      }
    } catch (error) {
      logger.warn(`Failed to cleanup old backups: ${error}`);
    }
  }

  /**
   * 🔄 Restaurar credenciales desde backup (para recuperación manual)
   */
  async restoreFromBackup(sessionPhone: string, backupTimestamp?: string): Promise<boolean> {
    try {
      const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionPhone);

      if (!(await fs.pathExists(backupDir))) {
        logger.error(`No backups found for ${sessionPhone}`);
        return false;
      }

      const groups = await this.getBackupGroups(backupDir);
      if (groups.length === 0) {
        logger.error(`No backup files found for ${sessionPhone}`);
        return false;
      }

      let target: BackupEntry | undefined;

      if (backupTimestamp) {
        // 1) direct name match (full dir or creds file)
        const directPath = path.join(backupDir, backupTimestamp);
        if (await fs.pathExists(directPath)) {
          const stats = await fs.stat(directPath);
          const parsed = this.parseBackupEntryName(backupTimestamp);
          if (parsed) {
            target = {
              name: backupTimestamp,
              id: parsed.id,
              type: parsed.type,
              path: directPath,
              mtimeMs: stats.mtimeMs,
              isDir: stats.isDirectory(),
            };
          }
        }

        // 2) match by id (timestamp fragment)
        if (!target) {
          const match = groups.find((group) => group.id === backupTimestamp);
          if (match) {
            target = match.preferred;
          }
        }

        // 3) match by conventional file naming
        if (!target) {
          const fullName = `full-${backupTimestamp}`;
          const credsName = `creds-${backupTimestamp}.json`;
          const byName = groups.find(
            (group) =>
              group.preferred.name === fullName ||
              group.preferred.name === credsName ||
              group.entries.some((entry) => entry.name === fullName || entry.name === credsName)
          );
          if (byName) {
            target = byName.preferred;
          }
        }

        // 4) match by mtime ISO (from listBackups)
        if (!target) {
          const isoMatch = groups.find(
            (group) => new Date(group.mtimeMs).toISOString() === backupTimestamp
          );
          if (isoMatch) {
            target = isoMatch.preferred;
          }
        }
      } else {
        // Usar el backup más reciente (prefer full)
        const sorted = groups.sort((a, b) => b.mtimeMs - a.mtimeMs);
        target = sorted[0].preferred;
      }

      if (!target) {
        logger.error(`No matching backup found for ${sessionPhone}`);
        return false;
      }

      let restored = await this.restoreBackupEntry(sessionPhone, target);
      if (!restored) {
        const fallbackGroup = groups.find((group) => group.id === target.id);
        if (fallbackGroup) {
          restored = await this.restoreBackupGroup(sessionPhone, fallbackGroup);
        }
      }
      if (!restored) {
        logger.error(`Failed to restore backup for ${sessionPhone}: ${target.name}`);
        return false;
      }

      logger.info(`✅ Restored auth state for ${sessionPhone} from ${target.name}`);
      return true;
    } catch (error) {
      logger.error(`❌ Failed to restore backup for ${sessionPhone}:`, error);
      return false;
    }
  }

  /**
   * 📋 Listar todos los backups disponibles para una sesión
   */
  async listBackups(sessionPhone: string): Promise<Array<{ filename: string; timestamp: string; size: number; age: string }>> {
    try {
      const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionPhone);

      if (!(await fs.pathExists(backupDir))) {
        return [];
      }

      const groups = await this.getBackupGroups(backupDir);
      const sorted = groups.sort((a, b) => b.mtimeMs - a.mtimeMs);

      const backupList = await Promise.all(
        sorted.map(async (group) => {
          const entry = group.preferred;
          let size = 0;
          if (entry.type === 'full') {
            size = await this.getDirSize(entry.path);
          } else {
            const stats = await fs.stat(entry.path);
            size = stats.size;
          }

          const now = Date.now();
          const ageMs = now - entry.mtimeMs;
          const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
          const ageDays = Math.floor(ageHours / 24);

          let ageStr: string;
          if (ageDays > 0) {
            ageStr = `${ageDays}d ${ageHours % 24}h ago`;
          } else if (ageHours > 0) {
            ageStr = `${ageHours}h ago`;
          } else {
            const ageMinutes = Math.floor(ageMs / (1000 * 60));
            ageStr = `${ageMinutes}m ago`;
          }

          return {
            filename: entry.name,
            timestamp: new Date(entry.mtimeMs).toISOString(),
            size,
            age: ageStr,
          };
        })
      );

      return backupList;
    } catch (error) {
      logger.error(`Failed to list backups for ${sessionPhone}:`, error);
      return [];
    }
  }

  /**
   * 🔄 Resetear estado de reconexión (útil cuando se queda en bucle)
   */
  async resetReconnect(sessionPhone: string): Promise<void> {
    logger.info(`Resetting reconnect state for ${sessionPhone}`);
    this.resetReconnectState(sessionPhone);
  }

  /**
   * 🔍 Mejorada: Extrae el DisconnectReason con logging detallado
   */
  private getDisconnectReason(error: unknown): number | undefined {
    if (isBoom(error)) {
      const statusCode = error.output?.statusCode;
      logger.debug(`Boom error detected: ${statusCode} - ${error.message}`);
      return statusCode;
    }

    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const maybe = error as { output?: { statusCode?: number }; statusCode?: number };
    const statusCode = maybe.output?.statusCode ?? maybe.statusCode;

    // Log para debugging
    if (statusCode) {
      const reasonName = this.getDisconnectReasonName(statusCode);
      logger.debug(`Disconnect reason: ${statusCode} (${reasonName})`);
    }

    return statusCode;
  }

  /**
   * 📝 Helper: Convierte código numérico a nombre legible
   * Nota: Baileys usa códigos HTTP como DisconnectReason
   */
  private getDisconnectReasonName(code: number | undefined): string {
    if (!code) return 'unknown';

    const reasons: Record<number, string> = {
      401: 'loggedOut',
      403: 'badSession',
      408: 'timedOut/connectionLost',
      411: 'multideviceMismatch',
      428: 'connectionClosed',
      440: 'connectionReplaced',
      500: 'internalError/streamError',
      503: 'serviceUnavailable',
      515: 'restartRequired',
    };
    return reasons[code] || `unknown(${code})`;
  }

  private handleSignalDecryptError(payload: SignalDecryptErrorPayload): void {
    const sessionId = this.extractSignalSessionId(payload);
    if (!sessionId) {
      return;
    }

    const now = Date.now();
    const existing =
      this.signalDecryptStats.get(sessionId) || { count: 0, lastAt: 0, lastCleanupAt: 0 };

    if (now - existing.lastAt > 2 * 60 * 1000) {
      existing.count = 0;
    }

    existing.count += 1;
    existing.lastAt = now;
    this.signalDecryptStats.set(sessionId, existing);

    const threshold = 3;
    const cooldownMs = 5 * 60 * 1000;

    if (existing.count < threshold) {
      return;
    }

    if (now - existing.lastCleanupAt < cooldownMs) {
      return;
    }

    if (this.signalDecryptCleanupInFlight.has(sessionId)) {
      return;
    }

    existing.lastCleanupAt = now;
    this.signalDecryptStats.set(sessionId, existing);
    this.signalDecryptCleanupInFlight.add(sessionId);

    void this.scrubSignalState(sessionId).finally(() => {
      this.signalDecryptCleanupInFlight.delete(sessionId);
    });
  }

  private extractSignalSessionId(payload: SignalDecryptErrorPayload): string | null {
    const stack = payload.stack || '';
    const stackMatch = stack.match(/\bat\s+([0-9]{6,}(?:\.[0-9]+)?)\s+\[as awaitable\]/);
    if (stackMatch?.[1]) {
      return stackMatch[1];
    }

    const sessionMatch = stack.match(/session-([0-9]{6,}(?:\.[0-9]+)?)\.json/);
    if (sessionMatch?.[1]) {
      return sessionMatch[1];
    }

    const messageMatch = payload.message.match(/([0-9]{6,}(?:\.[0-9]+)?)/);
    if (messageMatch?.[1]) {
      return messageMatch[1];
    }

    return null;
  }

  private async scrubSignalState(sessionId: string): Promise<void> {
    try {
      const baseDir = path.resolve(config.whatsapp.sessionDir);
      if (!(await fs.pathExists(baseDir))) {
        return;
      }

      const entries = await fs.readdir(baseDir);
      const senderId = sessionId.split('.')[0];
      let removed = 0;

      for (const entry of entries) {
        if (entry === 'backups') {
          continue;
        }

        const sessionDir = path.join(baseDir, entry);
        const stat = await fs.stat(sessionDir);
        if (!stat.isDirectory()) {
          continue;
        }

        const files = await fs.readdir(sessionDir);

        for (const file of files) {
          if (file.startsWith(`session-${sessionId}`) && file.endsWith('.json')) {
            await fs.remove(path.join(sessionDir, file));
            removed += 1;
            continue;
          }

          if (!file.startsWith('sender-key-')) {
            continue;
          }

          const match = file.match(/^sender-key-(.+)--([0-9]{6,}(?:\.[0-9]+)?)--/);
          if (!match) {
            continue;
          }

          const groupId = match[1];
          const sender = match[2];
          if (sender !== sessionId && sender !== senderId) {
            continue;
          }

          await fs.remove(path.join(sessionDir, file));
          removed += 1;

          const memoryFile = path.join(sessionDir, `sender-key-memory-${groupId}.json`);
          if (await fs.pathExists(memoryFile)) {
            await fs.remove(memoryFile);
            removed += 1;
          }
        }
      }

      if (removed > 0) {
        logger.warn(
          `🧹 Cleaned ${removed} signal state files for ${sessionId} to recover from decrypt errors`
        );
      }
    } catch (error) {
      logger.warn(`Failed to cleanup signal state for ${sessionId}: ${error}`);
    }
  }

  private parseBackupEntryName(
    name: string
  ): { id: string; type: 'full' | 'creds' } | null {
    if (name.startsWith('full-')) {
      const id = name.slice('full-'.length);
      return id ? { id, type: 'full' } : null;
    }
    if (name.startsWith('creds-') && name.endsWith('.json')) {
      const id = name.slice('creds-'.length, -'.json'.length);
      return id ? { id, type: 'creds' } : null;
    }
    return null;
  }

  private async listBackupEntries(backupDir: string): Promise<BackupEntry[]> {
    const entries = await fs.readdir(backupDir);
    const result: BackupEntry[] = [];

    for (const name of entries) {
      const parsed = this.parseBackupEntryName(name);
      if (!parsed) {
        continue;
      }

      const entryPath = path.join(backupDir, name);
      const stats = await fs.stat(entryPath);
      const isDir = stats.isDirectory();

      if (parsed.type === 'full' && !isDir) {
        continue;
      }
      if (parsed.type === 'creds' && isDir) {
        continue;
      }

      result.push({
        name,
        id: parsed.id,
        type: parsed.type,
        path: entryPath,
        mtimeMs: stats.mtimeMs,
        isDir,
      });
    }

    return result;
  }

  private async getBackupGroups(
    backupDir: string
  ): Promise<Array<{ id: string; preferred: BackupEntry; mtimeMs: number; entries: BackupEntry[] }>> {
    const entries = await this.listBackupEntries(backupDir);
    const groups = new Map<string, BackupEntry[]>();

    for (const entry of entries) {
      const group = groups.get(entry.id) || [];
      group.push(entry);
      groups.set(entry.id, group);
    }

    return Array.from(groups.entries()).map(([id, groupEntries]) => {
      const preferred =
        groupEntries.find((entry) => entry.type === 'full') ||
        groupEntries.find((entry) => entry.type === 'creds')!;
      const mtimeMs = Math.max(...groupEntries.map((entry) => entry.mtimeMs));
      return { id, preferred, mtimeMs, entries: groupEntries };
    });
  }

  private async getDirSize(dirPath: string): Promise<number> {
    let total = 0;
    const entries = await fs.readdir(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        total += await this.getDirSize(fullPath);
      } else {
        total += stats.size;
      }
    }

    return total;
  }

  private async inspectAuthState(sessionDir: string): Promise<{
    hasCreds: boolean;
    hasKeyMaterial: boolean;
    hasIdentity: boolean;
  }> {
    const credsPath = path.join(sessionDir, 'creds.json');
    const hasCreds = await fs.pathExists(credsPath);
    let hasIdentity = false;

    if (hasCreds) {
      try {
        const creds = await fs.readJson(credsPath);
        hasIdentity = Boolean(creds?.me?.id || creds?.me?.lid || creds?.me?.name);
      } catch (error) {
        logger.warn(`Failed to read creds.json for ${sessionDir}: ${error}`);
      }
    }

    let hasKeyMaterial = false;
    try {
      if (await fs.pathExists(sessionDir)) {
        const entries = await fs.readdir(sessionDir);
        hasKeyMaterial = entries.some(
          (name) => name !== 'creds.json' && !name.startsWith('.')
        );
      }
    } catch (error) {
      logger.warn(`Failed to inspect auth state at ${sessionDir}: ${error}`);
    }

    return { hasCreds, hasKeyMaterial, hasIdentity };
  }

  private async restoreBackupEntry(sessionPhone: string, entry: BackupEntry): Promise<boolean> {
    const sessionDir = path.join(config.whatsapp.sessionDir, sessionPhone);

    if (entry.type === 'full') {
      const credsPath = path.join(entry.path, 'creds.json');
      if (!(await fs.pathExists(credsPath))) {
        logger.warn(`Full backup ${entry.name} missing creds.json, skipping`);
        return false;
      }

      await fs.remove(sessionDir);
      await fs.ensureDir(sessionDir);
      await fs.copy(entry.path, sessionDir);
      return true;
    }

    // Legacy creds-only backup
    try {
      const stats = await fs.stat(entry.path);
      if (stats.size < 100) {
        logger.warn(`Backup ${entry.name} is too small (${stats.size} bytes), skipping`);
        return false;
      }

      const backupContent = await fs.readJson(entry.path);
      if (!backupContent || typeof backupContent !== 'object') {
        logger.warn(`Backup ${entry.name} has invalid content, skipping`);
        return false;
      }

      await fs.remove(sessionDir);
      await fs.ensureDir(sessionDir);
      await fs.copy(entry.path, path.join(sessionDir, 'creds.json'));
      return true;
    } catch (error) {
      logger.warn(`Failed to restore backup ${entry.name}: ${error}`);
      return false;
    }
  }

  private async restoreBackupGroup(
    sessionPhone: string,
    group: { preferred: BackupEntry; entries: BackupEntry[] }
  ): Promise<boolean> {
    const ordered = [...group.entries].sort((a, b) => {
      if (a.type === b.type) return 0;
      return a.type === 'full' ? -1 : 1;
    });

    for (const entry of ordered) {
      const restored = await this.restoreBackupEntry(sessionPhone, entry);
      if (restored) {
        return true;
      }
    }

    return false;
  }

  /**
   * 🔄 Intenta restaurar desde el backup más reciente si existe y es reciente (< 24h)
   * Esto previene pérdida de sesión por errores transitorios
   * NOTA: Este método se llama solo en caso de badSession para restauración rápida
   */
  private async tryRestoreRecentBackup(sessionPhone: string): Promise<boolean> {
    try {
      if (await this.hasSessionClearMarker(sessionPhone)) {
        logger.info(`Auto-restore skipped for cleared session ${sessionPhone}`);
        return false;
      }
      const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionPhone);

      if (!(await fs.pathExists(backupDir))) {
        return false;
      }

      const groups = await this.getBackupGroups(backupDir);
      if (groups.length === 0) {
        return false;
      }

      // Solo restaurar si el backup tiene menos de 24 horas
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recent = groups
        .filter((group) => group.mtimeMs >= twentyFourHoursAgo)
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

      if (recent.length === 0) {
        const latest = groups.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
        logger.warn(
          `Latest backup for ${sessionPhone} is too old (${latest?.preferred?.name}), skipping quick restore`
        );
        return false;
      }

      for (const candidate of recent) {
        const restored = await this.restoreBackupGroup(sessionPhone, candidate);
        if (restored) {
          logger.info(
            `✅ Auto-restored auth state for ${sessionPhone} from recent backup (${candidate.preferred.name})`
          );
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.warn(`Failed to auto-restore recent backup for ${sessionPhone}: ${error}`);
      return false;
    }
  }

  /**
   * 🛡️ AUTO-RECUPERACIÓN COMPLETA: Intenta restaurar sesión desde CUALQUIER backup disponible
   * Este método es más agresivo que tryRestoreRecentBackup:
   * - No tiene límite de tiempo (acepta backups antiguos)
   * - Valida que el backup sea válido antes de restaurar
   * - Es la última línea de defensa contra pérdida de sesión
   *
   * Se llama automáticamente en:
   * - createConnection (si no hay credenciales)
   * - scheduleReconnect (si no hay credenciales)
   * - reconnectSavedSessions (para sesiones perdidas con backups)
   */
  private async autoRecoverSession(sessionPhone: string): Promise<boolean> {
    try {
      if (await this.hasSessionClearMarker(sessionPhone)) {
        logger.info(`Auto-recovery skipped for cleared session ${sessionPhone}`);
        return false;
      }
      const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionPhone);

      if (!(await fs.pathExists(backupDir))) {
        logger.debug(`No backup directory found for ${sessionPhone}`);
        return false;
      }

      const groups = await this.getBackupGroups(backupDir);
      if (groups.length === 0) {
        logger.debug(`No backup files found for ${sessionPhone}`);
        return false;
      }

      const sorted = groups.sort((a, b) => b.mtimeMs - a.mtimeMs);

      // Intentar restaurar desde el backup más reciente (sin límite de tiempo)
      for (const candidate of sorted) {
        const restored = await this.restoreBackupGroup(sessionPhone, candidate);
        if (restored) {
          const age = this.getBackupAge(candidate.mtimeMs);
          logger.info(
            `✅ Auto-recovered session ${sessionPhone} from backup ${candidate.preferred.name} (${age} old)`
          );
          return true;
        }
      }

      logger.warn(`⚠️ No valid backups found for ${sessionPhone} (tried ${sorted.length} backups)`);
      return false;
    } catch (error) {
      logger.error(`❌ Auto-recovery failed for ${sessionPhone}:`, error);
      return false;
    }
  }

  /**
   * 🔍 Verifica si hay backups disponibles para una sesión
   */
  private async hasAvailableBackup(sessionPhone: string): Promise<boolean> {
    try {
      const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionPhone);

      if (!(await fs.pathExists(backupDir))) {
        return false;
      }

      const backups = await this.listBackupEntries(backupDir);
      return backups.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * 📅 Helper: Calcula la edad de un backup en formato legible
   */
  private getBackupAge(timestampMs: number): string {
    const ageMs = Date.now() - timestampMs;
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    const ageDays = Math.floor(ageHours / 24);

    if (ageDays > 0) {
      return `${ageDays}d ${ageHours % 24}h`;
    } else if (ageHours > 0) {
      return `${ageHours}h`;
    } else {
      const ageMinutes = Math.floor(ageMs / (1000 * 60));
      return `${ageMinutes}m`;
    }
  }

  private scheduleConnectWatchdog(sessionPhone: string): void {
    if (this.connectWatchdogs.has(sessionPhone)) {
      return;
    }

    // Aumentado de 30s a 90s para dar más tiempo a conexiones lentas
    // WhatsApp puede tardar en conectar dependiendo de la red
    const timer = setTimeout(() => {
      this.connectWatchdogs.delete(sessionPhone);
      if (this.connectionStates.get(sessionPhone) !== 'open') {
        const hasQR = this.qrCodes.has(sessionPhone);

        // Si hay QR esperando ser escaneado, NO reconectar automáticamente
        // esto evita bucles infinitos de QR
        if (hasQR) {
          logger.info(`Connection watchdog: ${sessionPhone} has QR code waiting, not auto-reconnecting`);
          return;
        }

        logger.warn(`Connection watchdog triggered for ${sessionPhone} (no connection after 90s)`);
        this.cleanupSession(sessionPhone, { clearQr: false });
        this.scheduleReconnect(sessionPhone);
      }
    }, 90000); // 90 segundos

    this.connectWatchdogs.set(sessionPhone, timer);
  }

  private clearConnectWatchdog(sessionPhone: string): void {
    const timer = this.connectWatchdogs.get(sessionPhone);
    if (timer) {
      clearTimeout(timer);
      this.connectWatchdogs.delete(sessionPhone);
    }
  }

  private async flushOutbox(sessionPhone: string): Promise<void> {
    const socket = this.connections.get(sessionPhone);
    if (!socket || !this.isConnected(sessionPhone)) {
      return;
    }

    const queue = await outboxQueue.list(sessionPhone);
    if (queue.length === 0) {
      return;
    }

    logger.info(`Flushing ${queue.length} queued messages for ${sessionPhone}`);

    for (const item of queue) {
      try {
        await socket.sendMessage(item.recipient, { text: item.text });
        await outboxQueue.remove(sessionPhone, item.id);
      } catch (error) {
        const updated = {
          ...item,
          attempts: item.attempts + 1,
          lastError: String(error),
        };
        await outboxQueue.update(sessionPhone, updated);
        logger.warn(`Failed to flush queued message ${item.id}: ${String(error)}`);
        break;
      }
    }
  }

  /**
   * Verifica si ya se han verificado las capacidades de grupo para una sesión
   */
  private hasVerifiedGroupCapabilities(sessionPhone: string): boolean {
    return this.groupCapabilitiesVerified.has(sessionPhone);
  }

  /**
   * Programa una prueba de capacidades de grupo después de establecer conexión
   */
  private scheduleGroupCapabilityTest(sessionPhone: string, socket: any): void {
    // Esperar 5 segundos después de la conexión para dar tiempo a la sincronización
    setTimeout(async () => {
      try {
        logger.info(`🧪 Testing group capabilities for ${sessionPhone}`);

        // Intentar obtener lista de grupos como test básico
        const groups = await socket.groupFetchAllParticipating();
        const groupCount = Object.keys(groups || {}).length;

        logger.info(`✅ Group capability test passed: Found ${groupCount} groups`);

        // Si el test pasa, marcar como verificado
        this.groupCapabilitiesVerified.add(sessionPhone);

        // Validación adicional: verificar que assertSessions funcione
        if (groupCount > 0) {
          const firstGroupId = Object.keys(groups)[0];
          try {
            const participants = groups[firstGroupId]?.participants || [];
            if (participants.length > 0) {
              const testJids = participants.slice(0, 1).map((p: any) => p.id);
              await socket.assertSessions(testJids, false);
              logger.info(`✅ assertSessions test passed for ${sessionPhone}`);
            }
          } catch (assertError) {
            logger.warn(`⚠️ assertSessions test failed: ${String(assertError)}`);
            logger.warn(`   This may indicate limited group messaging capabilities`);
          }
        }
      } catch (error) {
        logger.error(`❌ Group capability test failed for ${sessionPhone}: ${String(error)}`);
        logger.warn(`   Device may have limited group messaging capabilities`);
        logger.warn(`   Consider re-pairing with PRIMARY WhatsApp app`);
      }
    }, 5000);
  }

  /**
   * Limpia el estado de verificación de capacidades al desconectar
   */
  private clearGroupCapabilityVerification(sessionPhone: string): void {
    this.groupCapabilitiesVerified.delete(sessionPhone);
  }

  /**
   * Establece sesiones para participantes de un grupo antes de enviar mensajes
   * Esta es la función CRÍTICA que faltaba integrar en el flujo de envío
   */
  private async assertGroupSessions(socket: any, groupJid: string): Promise<void> {
    try {
      logger.info(`🔄 Asserting sessions for group ${groupJid}...`);

      // Obtener metadatos del grupo
      const metadata = await socket.groupMetadata(groupJid);
      const participants = (metadata?.participants || [])
        .map((p: any) => p?.id)
        .filter(Boolean);

      if (participants.length === 0) {
        logger.warn(`Group ${groupJid} has no participants`);
        return;
      }

      logger.info(`📋 Group has ${participants.length} participants`);

      // Obtener propios JIDs para excluirlos
      const ownJids = [
        socket?.user?.id,
        socket?.user?.lid,
        socket?.authState?.creds?.me?.id,
        socket?.authState?.creds?.me?.lid,
      ]
        .filter(Boolean)
        .map((jid) => jidNormalizedUser(jid as string));

      // Normalizar y filtrar participantes
      const normalizedParticipants = Array.from(new Set(participants))
        .filter((jid) => typeof jid === 'string')
        .map((jid) => jidNormalizedUser(jid as string))
        .filter(Boolean);

      // Expandir LID participants
      const useLid = normalizedParticipants.some((jid) => isLidUser(jid));
      const expandedParticipants = normalizedParticipants.flatMap((jid) => {
        if (!isLidUser(jid)) {
          return [jid];
        }
        const user = jid.split('@')[0] || '';
        if (!user) {
          return [jid];
        }
        return [jid, jidEncode(user, 's.whatsapp.net')];
      });

      // Filtrar: solo s.whatsapp.net y lid, excluyendo propios JIDs
      const filtered = expandedParticipants
        .filter((jid) => isLidUser(jid) || jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us'))
        .filter((jid) => !ownJids.some((ownJid) => areJidsSameUser(jid, ownJid)));

      if (filtered.length === 0) {
        logger.warn(`No participants to assert sessions for in ${groupJid}`);
        return;
      }

      logger.info(`🔄 Asserting sessions for ${filtered.length} filtered participants...`);

      // Assert user-level sessions
      await socket.assertSessions(filtered, true);
      logger.info(`✅ User-level sessions asserted`);

      // Esperar para dar tiempo a que se establezcan las sesiones
      const waitTime = Math.min(2000 + (filtered.length * 50), 10000);
      logger.info(`⏳ Waiting ${waitTime}ms for sessions to establish...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Assert device-level sessions si está disponible
      if (typeof socket.getUSyncDevices === 'function') {
        try {
          const devices = await socket.getUSyncDevices(normalizedParticipants, false, false);
          const deviceJids = Array.from(
            new Set(
              devices
                .map((device: { user: string; device?: number }) =>
                  useLid
                    ? [
                        jidEncode(device.user, 'lid', device.device),
                        jidEncode(device.user, 's.whatsapp.net', device.device),
                      ]
                    : [jidEncode(device.user, 's.whatsapp.net', device.device)]
                )
                .flat()
                .filter(Boolean)
            )
          ).filter((jid) => !ownJids.some((ownJid) => areJidsSameUser(jid, ownJid)));

          if (deviceJids.length > 0) {
            logger.info(`🔄 Asserting ${deviceJids.length} device-level sessions...`);
            await socket.assertSessions(deviceJids, true);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            logger.info(`✅ Device-level sessions asserted`);
          }
        } catch (error) {
          logger.warn(`Failed to assert device sessions: ${String(error)}`);
        }
      }

      logger.info(`✅ All sessions asserted for ${groupJid}, ready to send`);
    } catch (error) {
      logger.error(`Failed to assert group sessions for ${groupJid}: ${String(error)}`);
      // No lanzar error - dejar que el intento de envío sea la prueba final
    }
  }
}

export default new ConnectionManager();
