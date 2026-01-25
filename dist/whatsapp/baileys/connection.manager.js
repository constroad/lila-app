import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs-extra';
import path from 'path';
import logger from '../../utils/logger';
import messageListener from '../ai-agent/message.listener';
import { config } from '../../config/environment';
export class ConnectionManager {
    constructor() {
        this.connections = new Map();
        this.qrCodes = new Map();
    }
    async createConnection(sessionPhone) {
        try {
            logger.info(`Creating WhatsApp connection for ${sessionPhone}`);
            // Verificar si ya existe conexión
            if (this.connections.has(sessionPhone)) {
                logger.debug(`Connection already exists for ${sessionPhone}`);
                return this.connections.get(sessionPhone);
            }
            const sessionDir = path.join(config.whatsapp.sessionDir, sessionPhone);
            await fs.ensureDir(sessionDir);
            // Cargar estado de sesión previa si existe
            const { state, saveCreds } = await this.loadOrCreateState(sessionDir);
            // Crear socket
            const socket = makeWASocket({
                auth: state,
                printQRInTerminal: true,
                syncFullHistory: false,
                shouldIgnoreJid: (jid) => /status@broadcast/.test(jid),
            });
            // Guardar conexión
            this.connections.set(sessionPhone, socket);
            // Configurar listeners
            this.setupListeners(socket, sessionPhone, sessionDir, saveCreds);
            return socket;
        }
        catch (error) {
            logger.error(`Error creating connection for ${sessionPhone}:`, error);
            throw error;
        }
    }
    setupListeners(socket, sessionPhone, sessionDir, saveCreds) {
        // Conexión establecida
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                logger.info(`QR Code for ${sessionPhone}`, qr);
                this.qrCodes.set(sessionPhone, qr);
                // Aquí se podría emitir un evento para mostrar el QR en una interfaz web
            }
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = reason === DisconnectReason.connectionClosed;
                logger.warn(`Connection closed for ${sessionPhone}, reason: ${reason}`);
                if (shouldReconnect) {
                    if (config.whatsapp.autoReconnect) {
                        logger.info(`Auto-reconnecting ${sessionPhone}...`);
                        setTimeout(() => {
                            this.connections.delete(sessionPhone);
                            this.createConnection(sessionPhone);
                        }, 3000);
                    }
                }
                else {
                    logger.error(`Cannot reconnect ${sessionPhone}, reconnecting...`);
                    this.connections.delete(sessionPhone);
                }
            }
            else if (connection === 'open') {
                logger.info(`✅ Connection established for ${sessionPhone}`);
                this.qrCodes.delete(sessionPhone);
            }
        });
        // Guardar credenciales
        socket.ev.on('creds.update', saveCreds);
        // Procesar mensajes
        socket.ev.on('messages.upsert', async (m) => {
            for (const message of m.messages) {
                await messageListener.handleIncomingMessage(message, sessionPhone, socket);
            }
        });
    }
    async loadOrCreateState(sessionDir) {
        const credPath = path.join(sessionDir, 'creds.json');
        const keysPath = path.join(sessionDir, 'keys.json');
        let creds = null;
        let keys = {};
        if (await fs.pathExists(credPath)) {
            creds = await fs.readJSON(credPath);
            logger.debug(`Loaded existing credentials from ${sessionDir}`);
        }
        if (await fs.pathExists(keysPath)) {
            keys = await fs.readJSON(keysPath);
        }
        const saveCreds = async () => {
            await fs.ensureDir(sessionDir);
            await fs.writeJSON(credPath, creds, { spaces: 2 });
            await fs.writeJSON(keysPath, keys, { spaces: 2 });
            logger.debug(`Saved credentials for ${sessionDir}`);
        };
        // Usar la estructura de state que espera Baileys
        const state = {
            creds: creds || {},
            keys: {
                get: (type, jids) => {
                    const data = {};
                    jids.forEach((jid) => {
                        data[jid] = keys[jid] || null;
                    });
                    return data;
                },
                set: async (data) => {
                    Object.assign(keys, data);
                    await saveCreds();
                },
            },
        };
        return { state, saveCreds };
    }
    async disconnect(sessionPhone) {
        try {
            const socket = this.connections.get(sessionPhone);
            if (socket) {
                await socket.end({
                    cancel: true,
                });
                this.connections.delete(sessionPhone);
                logger.info(`Disconnected ${sessionPhone}`);
            }
        }
        catch (error) {
            logger.error(`Error disconnecting ${sessionPhone}:`, error);
            this.connections.delete(sessionPhone);
        }
    }
    async disconnectAll() {
        for (const [sessionPhone] of this.connections) {
            await this.disconnect(sessionPhone);
        }
    }
    getConnection(sessionPhone) {
        return this.connections.get(sessionPhone);
    }
    getAllConnections() {
        return this.connections;
    }
    getQRCode(sessionPhone) {
        return this.qrCodes.get(sessionPhone);
    }
    isConnected(sessionPhone) {
        const socket = this.connections.get(sessionPhone);
        return socket && socket.user !== undefined;
    }
    getConnectionStatus(sessionPhone) {
        const socket = this.connections.get(sessionPhone);
        if (!socket)
            return 'disconnected';
        if (socket.user)
            return 'connected';
        if (this.qrCodes.has(sessionPhone))
            return 'waiting_qr';
        return 'connecting';
    }
}
export default new ConnectionManager();
//# sourceMappingURL=connection.manager.js.map