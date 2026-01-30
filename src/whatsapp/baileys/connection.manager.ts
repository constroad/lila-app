import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { isBoom } from '@hapi/boom';
import fs from 'fs-extra';
import path from 'path';
import pino from 'pino';
import logger from '../../utils/logger.js';
import messageListener from '../ai-agent/message.listener.js';
import { config } from '../../config/environment.js';
import outboxQueue from '../queue/outbox-queue.js';

// 🔇 Silenciar logs ruidosos de Signal Protocol/Baileys
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
  const message = args.join(' ');
  // Filtrar mensajes de Signal Protocol que ensucian la consola
  if (
    message.includes('Closing open session in favor of') ||
    message.includes('Closing session: SessionEntry') ||
    message.includes('_chains:') ||
    message.includes('registrationId:') ||
    message.includes('currentRatchet:')
  ) {
    return; // Silenciar estos mensajes
  }
  originalConsoleLog.apply(console, args);
};

export class ConnectionManager {
  private connections: Map<string, any> = new Map();
  private connectionStates: Map<string, 'open' | 'close' | 'connecting'> = new Map();
  private qrCodes: Map<string, string> = new Map();
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
        const credsPath = path.join(sessionDir, 'creds.json');

        // 🛡️ PROTECCIÓN CRÍTICA: Restaurar automáticamente desde backup si no hay credenciales
        const hasCredentials = await fs.pathExists(credsPath);
        if (!hasCredentials) {
          logger.warn(`⚠️ No credentials found for ${sessionPhone}, attempting auto-recovery from backup`);
          const recovered = await this.autoRecoverSession(sessionPhone);

          if (recovered) {
            logger.info(`✅ Successfully auto-recovered session ${sessionPhone} from backup`);
          } else {
            logger.warn(`⚠️ No valid backup found for ${sessionPhone}, will generate new QR`);
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

  async ensureConnected(
    sessionPhone: string,
    timeoutMs = 15000,
    intervalMs = 300
  ): Promise<boolean> {
    // 🛡️ PUNTO CRÍTICO: Este método se llama antes de cada operación (enviar mensaje, etc.)
    // Aquí debemos asegurar auto-recuperación si no hay conexión

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
      const credsPath = path.join(baseDir, sessionPhone, 'creds.json');
      if (await fs.pathExists(credsPath)) {
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
        // Aquí se podría emitir un evento para mostrar el QR en una interfaz web
      }

      if (connection === 'close') {
        this.clearConnectWatchdog(sessionPhone);
        const reason = this.getDisconnectReason(lastDisconnect?.error);
        const errorMessage = lastDisconnect?.error ? String(lastDisconnect.error) : '';
        const reasonName = this.getDisconnectReasonName(reason);

        logger.warn(`Connection closed for ${sessionPhone}, reason: ${reason} (${reasonName}), error: ${errorMessage}`);

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
        logger.info(`✅ Connection established for ${sessionPhone}`);
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

    // Guardar credenciales
    socket.ev.on('creds.update', saveCreds);

    // Procesar mensajes
    socket.ev.on('messages.upsert', async (m: any) => {
      for (const message of m.messages) {
        await messageListener.handleIncomingMessage(message, sessionPhone, socket);
      }
    });
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
          const credsPath = path.join(sessionDir, 'creds.json');
          const hasCredentials = await fs.pathExists(credsPath);

          if (!hasCredentials) {
            // Sesión perdida detectada - intentar auto-recuperación
            logger.info(`🚨 Watchdog detected lost session ${sessionPhone} with backups, attempting auto-recovery`);

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
    if (options.clearQr) {
      this.qrCodes.delete(sessionPhone);
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

    if (this.reconnectTimers.has(sessionPhone)) {
      return;
    }

    const currentAttempts = this.reconnectAttempts.get(sessionPhone) || 0;
    const nextAttempt = currentAttempts + 1;
    this.reconnectAttempts.set(sessionPhone, nextAttempt);

    const maxAttempts = config.whatsapp.maxReconnectAttempts;
    if (maxAttempts > 0 && nextAttempt > maxAttempts) {
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

      // 🛡️ Verificar si hay credenciales, si no, intentar auto-recuperación
      const sessionDir = path.join(config.whatsapp.sessionDir, sessionPhone);
      const credsPath = path.join(sessionDir, 'creds.json');
      const hasCredentials = await fs.pathExists(credsPath);

      if (!hasCredentials) {
        logger.warn(`⚠️ No credentials found for ${sessionPhone}, attempting auto-recovery from backup`);

        const recovered = await this.autoRecoverSession(sessionPhone);

        if (!recovered) {
          logger.error(`❌ Auto-recovery failed for ${sessionPhone}, no valid backups found`);
          // Continuar intentando - quizás el backup se cree en el siguiente ciclo
          this.scheduleReconnect(sessionPhone);
          return;
        }

        logger.info(`✅ Auto-recovered credentials for ${sessionPhone}, proceeding with reconnect`);
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

  /**
   * 🛡️ PROTECCIÓN: Backup antes de eliminar credenciales
   * Crea un backup timestamped de las credenciales antes de borrarlas
   * para permitir recuperación manual si es necesario
   */
  private async backupAndResetAuthState(sessionPhone: string, sessionDir: string): Promise<void> {
    try {
      const credsPath = path.join(sessionDir, 'creds.json');
      const credsExist = await fs.pathExists(credsPath);

      if (credsExist) {
        // Crear backup con timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(sessionDir, '..', 'backups', sessionPhone);
        const backupPath = path.join(backupDir, `creds-${timestamp}.json`);

        await fs.ensureDir(backupDir);
        await fs.copy(credsPath, backupPath);

        logger.info(`✅ Backed up credentials for ${sessionPhone} to ${backupPath}`);

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
      const files = await fs.readdir(backupDir);
      const backupFiles = files
        .filter((f) => f.startsWith('creds-') && f.endsWith('.json'))
        .sort()
        .reverse(); // Más recientes primero

      // Eliminar backups antiguos
      for (let i = keepCount; i < backupFiles.length; i++) {
        await fs.remove(path.join(backupDir, backupFiles[i]));
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
      const sessionDir = path.join(config.whatsapp.sessionDir, sessionPhone);
      const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionPhone);

      if (!(await fs.pathExists(backupDir))) {
        logger.error(`No backups found for ${sessionPhone}`);
        return false;
      }

      let backupFile: string;

      if (backupTimestamp) {
        backupFile = `creds-${backupTimestamp}.json`;
      } else {
        // Usar el backup más reciente
        const files = await fs.readdir(backupDir);
        const backups = files.filter((f) => f.startsWith('creds-') && f.endsWith('.json')).sort().reverse();

        if (backups.length === 0) {
          logger.error(`No backup files found for ${sessionPhone}`);
          return false;
        }

        backupFile = backups[0];
      }

      const backupPath = path.join(backupDir, backupFile);
      const restorePath = path.join(sessionDir, 'creds.json');

      await fs.ensureDir(sessionDir);
      await fs.copy(backupPath, restorePath);

      logger.info(`✅ Restored credentials for ${sessionPhone} from ${backupFile}`);
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

      const files = await fs.readdir(backupDir);
      const backups = files.filter((f) => f.startsWith('creds-') && f.endsWith('.json')).sort().reverse();

      const backupList = await Promise.all(
        backups.map(async (file) => {
          const filePath = path.join(backupDir, file);
          const stats = await fs.stat(filePath);
          const now = Date.now();
          const ageMs = now - stats.mtimeMs;
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
            filename: file,
            timestamp: stats.mtime.toISOString(),
            size: stats.size,
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

  /**
   * 🔄 Intenta restaurar desde el backup más reciente si existe y es reciente (< 24h)
   * Esto previene pérdida de sesión por errores transitorios
   * NOTA: Este método se llama solo en caso de badSession para restauración rápida
   */
  private async tryRestoreRecentBackup(sessionPhone: string): Promise<boolean> {
    try {
      const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionPhone);

      if (!(await fs.pathExists(backupDir))) {
        return false;
      }

      const files = await fs.readdir(backupDir);
      const backups = files
        .filter((f) => f.startsWith('creds-') && f.endsWith('.json'))
        .sort()
        .reverse(); // Más recientes primero

      if (backups.length === 0) {
        return false;
      }

      // Obtener el backup más reciente
      const latestBackup = backups[0];
      const backupPath = path.join(backupDir, latestBackup);
      const backupStats = await fs.stat(backupPath);

      // Solo restaurar si el backup tiene menos de 24 horas
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      if (backupStats.mtimeMs < twentyFourHoursAgo) {
        logger.warn(`Latest backup for ${sessionPhone} is too old (${latestBackup}), skipping quick restore`);
        return false;
      }

      // Restaurar el backup
      const sessionDir = path.join(config.whatsapp.sessionDir, sessionPhone);
      const restorePath = path.join(sessionDir, 'creds.json');

      await fs.ensureDir(sessionDir);
      await fs.copy(backupPath, restorePath);

      logger.info(`✅ Auto-restored credentials for ${sessionPhone} from recent backup (${latestBackup})`);
      return true;
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
      const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionPhone);

      if (!(await fs.pathExists(backupDir))) {
        logger.debug(`No backup directory found for ${sessionPhone}`);
        return false;
      }

      const files = await fs.readdir(backupDir);
      const backups = files
        .filter((f) => f.startsWith('creds-') && f.endsWith('.json'))
        .sort()
        .reverse(); // Más recientes primero

      if (backups.length === 0) {
        logger.debug(`No backup files found for ${sessionPhone}`);
        return false;
      }

      // Intentar restaurar desde el backup más reciente (sin límite de tiempo)
      for (const backupFile of backups) {
        const backupPath = path.join(backupDir, backupFile);

        try {
          // Validar que el backup tenga contenido válido
          const backupStats = await fs.stat(backupPath);
          if (backupStats.size < 100) {
            logger.warn(`Backup ${backupFile} is too small (${backupStats.size} bytes), skipping`);
            continue;
          }

          // Intentar leer el backup para validar que sea JSON válido
          const backupContent = await fs.readJson(backupPath);
          if (!backupContent || typeof backupContent !== 'object') {
            logger.warn(`Backup ${backupFile} has invalid content, skipping`);
            continue;
          }

          // Backup válido encontrado, restaurar
          const sessionDir = path.join(config.whatsapp.sessionDir, sessionPhone);
          const restorePath = path.join(sessionDir, 'creds.json');

          await fs.ensureDir(sessionDir);
          await fs.copy(backupPath, restorePath);

          const age = this.getBackupAge(backupStats.mtimeMs);
          logger.info(`✅ Auto-recovered session ${sessionPhone} from backup ${backupFile} (${age} old)`);

          return true;
        } catch (error) {
          logger.warn(`Failed to restore from backup ${backupFile}: ${error}`);
          // Continuar con el siguiente backup
          continue;
        }
      }

      logger.warn(`⚠️ No valid backups found for ${sessionPhone} (tried ${backups.length} backups)`);
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

      const files = await fs.readdir(backupDir);
      const backups = files.filter((f) => f.startsWith('creds-') && f.endsWith('.json'));

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
}

export default new ConnectionManager();
