import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs-extra';
import path from 'path';
import logger from '../../utils/logger.js';
import messageListener from '../ai-agent/message.listener.js';
import { config } from '../../config/environment.js';
import outboxQueue from '../queue/outbox-queue.js';

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
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        // Crear socket
        const socket = makeWASocket({
          auth: state,
          version,
          syncFullHistory: false,
          shouldIgnoreJid: (jid) => /status@broadcast/.test(jid),
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
    if (!this.connections.has(sessionPhone)) {
      try {
        await this.createConnection(sessionPhone);
      } catch (error) {
        this.scheduleReconnect(sessionPhone, error);
        return false;
      }
    }

    if (this.isConnected(sessionPhone)) {
      return true;
    }

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

    const entries = await fs.readdir(baseDir);
    const sessionDirs = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(baseDir, entry);
        const stat = await fs.stat(fullPath);
        return stat.isDirectory() ? entry : null;
      })
    );

    for (const sessionPhone of sessionDirs.filter(Boolean) as string[]) {
      const credsPath = path.join(baseDir, sessionPhone, 'creds.json');
      if (!(await fs.pathExists(credsPath))) {
        continue;
      }

      try {
        await this.createConnection(sessionPhone);
        logger.info(`Reconnected session ${sessionPhone}`);
      } catch (error) {
        logger.warn(`Failed to reconnect session ${sessionPhone}: ${String(error)}`);
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
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (
          reason === DisconnectReason.loggedOut ||
          reason === DisconnectReason.badSession
        ) {
          logger.warn(`Session invalid for ${sessionPhone}, clearing auth state`);
          await this.resetAuthState(sessionPhone, sessionDir);
          this.cleanupSession(sessionPhone, { clearQr: true });
          this.scheduleReconnect(sessionPhone);
          return;
        }
        const shouldReconnect =
          reason === DisconnectReason.connectionClosed ||
          reason === DisconnectReason.connectionLost ||
          reason === DisconnectReason.timedOut ||
          reason === DisconnectReason.restartRequired ||
          reason === DisconnectReason.connectionReplaced;

        logger.warn(`Connection closed for ${sessionPhone}, reason: ${reason}`);

        if (reason === DisconnectReason.loggedOut) {
          logger.warn(`Session logged out for ${sessionPhone}, clearing auth`);
          this.cleanupSession(sessionPhone, { clearQr: true });
          return;
        }

        this.cleanupSession(sessionPhone, { clearQr: true });

        if (shouldReconnect) {
          this.scheduleReconnect(sessionPhone);
        } else {
          logger.error(`Cannot reconnect ${sessionPhone}, manual intervention required`);
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
    for (const [sessionPhone] of this.connections) {
      await this.disconnect(sessionPhone);
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
      logger.error(`Reconnect attempts exhausted for ${sessionPhone}`);
      return;
    }

    const delayMs = Math.min(60000, 1000 * Math.pow(2, nextAttempt - 1));
    const message = `Scheduling reconnect for ${sessionPhone} in ${delayMs}ms (attempt ${nextAttempt})`;
    if (error) {
      logger.warn(message, { error: String(error) });
    } else {
      logger.warn(message);
    }

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(sessionPhone);
      try {
        await this.createConnection(sessionPhone);
      } catch (err) {
        logger.warn(`Reconnect failed for ${sessionPhone}: ${String(err)}`);
        this.scheduleReconnect(sessionPhone, err);
      }
    }, delayMs);

    this.reconnectTimers.set(sessionPhone, timer);
  }

  private async resetAuthState(sessionPhone: string, sessionDir: string): Promise<void> {
    try {
      await fs.remove(sessionDir);
      logger.info(`Auth state cleared for ${sessionPhone}`);
    } catch (error) {
      logger.error(`Failed to clear auth state for ${sessionPhone}:`, error);
    }
  }

  private scheduleConnectWatchdog(sessionPhone: string): void {
    if (this.connectWatchdogs.has(sessionPhone)) {
      return;
    }

    const timer = setTimeout(() => {
      this.connectWatchdogs.delete(sessionPhone);
      if (this.connectionStates.get(sessionPhone) !== 'open') {
        logger.warn(`Connection watchdog triggered for ${sessionPhone}`);
        this.cleanupSession(sessionPhone, { clearQr: false });
        this.scheduleReconnect(sessionPhone);
      }
    }, 30000);

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
