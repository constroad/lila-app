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
  makeCacheableSignalKeyStore,
  WASocket,
} from '@whiskeysockets/baileys';
import { getBaileysVersion } from './baileys-version.js';
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
import { clearPopulateCooldown } from './populate-store-simple.js';
import { sendTelegramAlert } from '../../services/telegram-alert.service.js';
import { hasSocketLease } from './instance-lease.js';
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

// Si el socket se crea pero `connection.open/close` no llega en este tiempo,
// lo forzamos a cerrar para que el loop de reconexión lo reintente.
const CONNECTION_TIMEOUT_MS = 90_000;

// Backoff exponencial de reconexión. Los primeros intentos son rápidos (cortes breves
// de red); a partir de ahí duplica hasta el techo. Martillar el login tras una caída
// alarga el throttle del servidor de WhatsApp: incidente 2026-07-13 — caída de red
// (428 + EPIPE a Atlas) y luego 14 handshakes seguidos colgados (sin open/close en 90s)
// durante ~35 min con el viejo backoff lineal capado a 60s; el servidor recién aceptó
// el login cuando bajó la frecuencia. El jitter evita sincronizar reintentos de varias
// sesiones tras un corte común.
const RECONNECT_BASE_DELAY_MS = 3_000;
const RECONNECT_MAX_DELAY_MS = 10 * 60_000;

// Piso de backoff para STALLS de handshake (socket que conecta pero NO llega a 'open').
// Un stall = WhatsApp está throttleando el login; los reintentos rápidos SOSTIENEN el
// throttle. Incidente 2026-07-14 (51902049935): 8 intentos entre 3s y 81s no lograron
// nada — la sesión recién abrió al intento 10, cuando el espaciado llegó a ~10min. El
// primer reintento rápido (3s) ya cubre el corte transitorio; si ESE se cuelga, ya es
// throttle → saltamos directo a intervalos largos (menos "session closed", recupera
// antes). Forzar intento >= 6 ⇒ el siguiente delay arranca en ~192s. Mismo criterio que
// el piso del 440. NO aplica a sesiones que reconectan sin stall (cuentas livianas).
const STALL_BACKOFF_FLOOR_ATTEMPT = 6;

/** Delay del intento N (1-based): exponencial capado, con jitter ±20%. */
export function reconnectDelayMs(attempt: number): number {
  const exponential = RECONNECT_BASE_DELAY_MS * 2 ** (Math.max(attempt, 1) - 1);
  const capped = Math.min(exponential, RECONNECT_MAX_DELAY_MS);
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.round(capped * jitter);
}

// Contador de desconexiones consecutivas tipo 440 (connectionReplaced).
// Si sube a >= 3 alerta por Telegram: probable otra instancia con las mismas creds.
const consecutive440s: Record<string, number> = {};

// Contador de "stalls de conexión": cierres/timeouts del socket que NUNCA llegaron a
// 'open' desde el último open exitoso. Un open resetea el contador. Si sube hasta
// MAX_CONNECTING_STALLS el login lleva mucho fallando pese al backoff máximo: ya no es
// throttle transitorio (que se recupera al bajar la frecuencia) sino, casi siempre,
// credenciales desincronizadas → requiere RE-EMPAREJAR. Distinto del 401 (loggedOut),
// que WhatsApp SÍ señala; aquí el handshake solo se cuelga sin código. Ver parkSession.
const connectingStalls: Record<string, number> = {};

// Sesiones "aparcadas": tras demasiados stalls seguidos dejamos de reintentar en bucle
// (el backoff ya está en el techo y sigue sin abrir). Quedan no-ready hasta un
// restart/re-emparejar manual — la acción correcta para creds muertas. Corta el loop
// infinito observado (número de pruebas 51902049935, jul-2026: 9+ reintentos, backoff a
// 10min, watchdog matando cada handshake, sin recuperar nunca).
const parkedSessions = new Set<string>();

// Nº de stalls consecutivos antes de aparcar. El backoff llega al techo (~10min) cerca
// del intento 9; a partir de ahí cada intento tarda ~10min. Aparcar en 12 le da a un
// throttle real (~35min observados en el incidente 2026-07-13) tiempo de sobra para
// recuperarse solo, y corta el loop cuando ya no lo hará. Tunable por si acaso.
const MAX_CONNECTING_STALLS = Number(process.env.WHATSAPP_MAX_CONNECTING_STALLS) || 12;

/**
 * CacheStore mínimo (Map, sin dependencia nueva) para `msgRetryCounterCache`.
 * Sin él, Baileys no dedupea los retry-receipts de mensajes que un peer no pudo
 * descifrar y puede reintentar el mismo mensaje en bucle. Cap defensivo para no
 * crecer sin límite en sesiones longevas.
 */
const MSG_RETRY_CACHE_MAX = 5_000;
const makeMsgRetryCache = () => {
  const entries = new Map<string, unknown>();
  return {
    get: <T>(key: string) => entries.get(key) as T | undefined,
    set: <T>(key: string, value: T) => {
      if (entries.size >= MSG_RETRY_CACHE_MAX) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, value);
    },
    del: (key: string) => {
      entries.delete(key);
    },
    flushAll: () => entries.clear(),
  };
};

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
 * Programa una reconexión resiliente con backoff exponencial (ver reconnectDelayMs). Reintenta
 * hasta que la sesión vuelva a abrir; si `startSession` falla (ej. Mongo caído por corte de red), captura el
 * error y reprograma — así la auto-recuperación sobrevive a fallos transitorios de red/Atlas.
 * `connection.open` resetea los intentos. No corre si la sesión se está apagando a propósito.
 */
function scheduleReconnect(sessionId: string, qrCb?: (qr: string) => void) {
  if (shuttingDown.has(sessionId)) return;
  if (reconnectTimers[sessionId]) return; // ya hay un intento en cola

  const attempt = (reconnectAttempts[sessionId] = (reconnectAttempts[sessionId] ?? 0) + 1);
  const delay = reconnectDelayMs(attempt);
  logger.info(`🔁 Reconnect ${sessionId}: intento ${attempt} en ${delay}ms`);

  // Alerta proactiva cuando la sesión lleva varios intentos fallidos (minutos caída).
  // No alertamos en intento 1 (desconexiones breves son normales). Dedupe de 15 min
  // para no inundar si la sesión sigue rebotando.
  if (attempt === 5) {
    sendTelegramAlert({
      dedupeKey: `session-persistent-down-${sessionId}`,
      message: `⚠️ WhatsApp sesión ${sessionId} caída y no reconecta.\nIntentos fallidos: ${attempt}. El backoff sigue reintentando (máx cada ${RECONNECT_MAX_DELAY_MS / 60_000} min).\nNO re-emparejes aún: suele recuperarse sola cuando WhatsApp deja de throttlear el login.`,
    }).catch(() => {});
  }

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
 * Aparca una sesión que no completa el handshake tras MAX_CONNECTING_STALLS intentos:
 * corta el loop de reconexión, la marca no-ready y alerta pidiendo re-emparejar. Los
 * mensajes entrantes siguen encolándose en el outbox y salen al reconectar. Se
 * "desaparca" con un restart/creación manual (restartSession, createPairingSession,
 * disconnect/clear) — nunca desde la reconexión automática, para que el contador suba.
 */
function parkSession(sessionId: string) {
  parkedSessions.add(sessionId);
  readyClients.set(sessionId, false);
  clearReconnectTimer(sessionId);
  const stalls = connectingStalls[sessionId] ?? 0;
  logger.error(
    `🅿️ [${sessionId}] Sesión APARCADA tras ${stalls} stalls de conexión ` +
      `(el handshake nunca abrió con el backoff en el techo). Se detiene la reconexión ` +
      `automática: requiere re-emparejar (QR) o un restart manual.`
  );
  sendTelegramAlert({
    dedupeKey: `session-parked-${sessionId}`,
    message:
      `🅿️ WhatsApp sesión ${sessionId} APARCADA.\n` +
      `El socket no completa el login tras ${stalls} intentos con backoff máximo — ya no ` +
      `es throttle transitorio: lo más probable es que las credenciales estén ` +
      `desincronizadas.\n\nAcción: re-emparejar la sesión (escanear QR) desde el Portal. ` +
      `Los mensajes pendientes están a salvo en el outbox y saldrán al reconectar.`,
  }).catch(() => {});
}

/** True si la sesión fue aparcada por stalls repetidos (requiere re-emparejar/restart). */
export function isSessionParked(sessionId: string): boolean {
  return parkedSessions.has(sessionId);
}

/** Limpia el estado de stall/aparcado. Solo desde recuperaciones MANUALES. */
function resetConnectingStalls(sessionId: string) {
  connectingStalls[sessionId] = 0;
  parkedSessions.delete(sessionId);
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
  // 🛰 Send-proxy (dev): NUNCA abrir un socket local. En proxy mode el socket vive en
  // PROD; abrir uno aquí con las mismas creds provoca una guerra 440 que puede matar la
  // sesión productiva (y corromper signal keys → forzar re-emparejar). Puerta única:
  // cubre TODOS los caminos (creación manual, endpoint de QR, restartSession, reconnect,
  // restore). Misma condición que whatsapp-proxy.isWhatsAppProxyMode (inline para no
  // acoplar el core Baileys a jwt/quota/media). Ver whatsapp-proxy.service.
  if (config.whatsapp.proxyTargetUrl && config.nodeEnv !== 'production') {
    throw new Error(
      'WhatsApp send-proxy activo: no se abren sesiones locales (el socket vive en prod). ' +
        'Quita WHATSAPP_PROXY_TARGET_URL para conectar un socket en esta máquina.'
    );
  }

  // Lease anti doble-instancia: solo el holder abre sockets. Cubre TODOS los caminos
  // (restore, reconnect, QR/create) igual que el guard del proxy. Ver instance-lease.ts.
  if (!hasSocketLease()) {
    throw new Error(
      'Esta instancia no posee el lease de sockets WhatsApp (otra instancia viva lo tiene). ' +
        'Mata el proceso duplicado o espera el failover automático.'
    );
  }

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

  // Versión cacheada por proceso (TTL 6h + stale-on-error): la reconexión no debe
  // depender de un fetch a internet en cada intento. Ver baileys-version.ts.
  const { version, isLatest } = await getBaileysVersion();
  logger.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

  // Create Pino logger for Baileys (NOT Winston!). Nivel configurable con
  // WHATSAPP_BAILEYS_LOG_LEVEL: en 'silent' los handshakes fallidos no dejan rastro
  // (incidente 2026-07-13: 14 intentos "Disconnect reason: undefined" sin poder ver
  // qué respondía WhatsApp). 'fatal' por defecto; subir a 'debug' para diagnosticar.
  const pinoLogger = pino({ level: config.whatsapp.baileysLogLevel ?? 'fatal' });

  const sock = makeWASocket({
    version,
    // Cache de signal keys sobre el store Mongo: sin él, CADA cifrado/descifrado
    // (por device en grupos) hace findOne a Atlas (~100ms RTT) — envíos lentos y
    // acoplados a hipos de Atlas. Práctica estándar recomendada por Baileys.
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pinoLogger),
    },
    logger: pinoLogger, // Baileys expects pino logger
    browser: Browsers.ubuntu('Chrome'),
    generateHighQualityLinkPreview: true,
    printQRInTerminal: false,
    msgRetryCounterCache: makeMsgRetryCache(),
    // History completo SOLO en el primer emparejamiento (creds sin `registered`). Baileys
    // no tiene API para "traer todos los contactos": llegan por history-sync. Pero el store
    // vive en Mongo y PERSISTE entre reconexiones (ver "Store cargado de Mongo: N chats"),
    // así que re-pedir el history completo en CADA reconexión es carga desperdiciada — y en
    // cuentas pesadas (2426 chats) esa carga repetida es justo la que agrava el throttle de
    // login de WhatsApp (incidente 2026-07-14). Ya emparejada, el store basta + eventos en
    // vivo. Ver SCALABILITY-MULTI-SESSION.spec §2.3 y §10.e.
    syncFullHistory: !state.creds.registered,
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

  // Watchdog: si el socket no llega a 'open' ni 'close' en CONNECTION_TIMEOUT_MS,
  // lo forzamos a cerrar. Evita el bug observado donde la sesión quedaba en estado
  // "connecting" infinito (readyClients=false) durante horas sin reconectar.
  // Se resetea cada vez que llega un QR para darle al usuario el tiempo completo
  // desde el último QR visible (no desde la creación del socket).
  let connectionSettled = false;
  let watchdogTimer: NodeJS.Timeout | null = null;
  // Estado de stall POR SOCKET: `everOpened` marca si este socket llegó a 'open';
  // `stallCounted` evita contar dos veces el mismo socket (el watchdog fuerza el cierre
  // y `connection.close` puede llegar igual). El contador acumulado es module-level.
  let everOpened = false;
  // `sawQR` marca que este socket emitió al menos un QR: estamos en modo EMPAREJAMIENTO
  // (sin creds). Un cierre en este estado NO es un stall de handshake, es la rotación
  // normal del QR de Baileys → hay que reconectar rápido para refrescar el QR, no aplicar
  // el backoff largo ni aparcar (si no, el QR muere en Portal y es imposible escanear).
  let sawQR = false;
  let stallCounted = false;
  const registerConnectingStall = (): number => {
    if (stallCounted) return connectingStalls[sessionId] ?? 0;
    stallCounted = true;
    return (connectingStalls[sessionId] = (connectingStalls[sessionId] ?? 0) + 1);
  };
  const startWatchdog = () => {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      if (!connectionSettled && !shuttingDown.has(sessionId)) {
        logger.warn(`⏱ [${sessionId}] Connection watchdog: socket sin respuesta por ${CONNECTION_TIMEOUT_MS / 1000}s — forzando cierre`);
        try {
          sock.end(new Error('connection-watchdog-timeout'));
        } catch (err) {
          logger.warn(`Watchdog: sock.end falló para ${sessionId}: ${String(err)}`);
        }
        // En modo EMPAREJAMIENTO (QR mostrado, sin creds) un timeout no es un stall de
        // login: el QR simplemente no fue escaneado a tiempo. Reconectar YA con backoff
        // reseteado para presentar un QR fresco, sin contar stalls ni aparcar.
        if (sawQR) {
          logger.info(`🔗 [${sessionId}] Watchdog en modo QR/pairing — reconectando rápido para refrescar el QR`);
          reconnectAttempts[sessionId] = 0;
          resetConnectingStalls(sessionId);
          scheduleReconnect(sessionId, qrCb);
          return;
        }
        // sock.end() no emite connection.close si el socket nunca llegó a 'open'
        // (Baileys stuck-connecting). Contamos el stall y decidimos aquí: si ya son
        // demasiados seguidos aparcamos (cortamos el loop); si no, reconectamos. El guard
        // interno de scheduleReconnect evita duplicados si connection.close llega igual.
        const stalls = registerConnectingStall();
        if (stalls >= MAX_CONNECTING_STALLS) {
          parkSession(sessionId);
        } else {
          // Throttle de login: espaciar YA en vez de martillar (ver STALL_BACKOFF_FLOOR).
          reconnectAttempts[sessionId] = Math.max(
            reconnectAttempts[sessionId] ?? 0,
            STALL_BACKOFF_FLOOR_ATTEMPT
          );
          scheduleReconnect(sessionId, qrCb);
        }
      }
    }, CONNECTION_TIMEOUT_MS);
  };
  startWatchdog();

  // Connection event handler
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (connection === 'open' || connection === 'close') {
      connectionSettled = true;
      if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
    }

    if (qr) {
      logger.info(`✅ QR generated for ${sessionId}`);
      sawQR = true;
      qrCodes[sessionId] = qr;
      qrTimestamps[sessionId] = Date.now();
      // Resetear watchdog: el usuario tiene CONNECTION_TIMEOUT_MS desde el último QR para escanear.
      startWatchdog();
      if (qrCb) qrCb(qr);
    }

    if (connection === 'open') {
      everOpened = true;
      const wasReconnect = (reconnectAttempts[sessionId] ?? 0) > 0;
      if (wasReconnect) {
        logger.info(`🔄 Session RECONECTADA para ${sessionId} tras ${reconnectAttempts[sessionId]} intento(s)`);
      } else {
        logger.info(`✅ Session connected successfully for ${sessionId}`);
      }
      readyClients.set(sessionId, true);
      // Reconexión exitosa → resetear backoff, contador de 440s y stalls de conexión.
      reconnectAttempts[sessionId] = 0;
      consecutive440s[sessionId] = 0;
      resetConnectingStalls(sessionId);
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

      // Loggear también el mensaje del error: con solo el statusCode, los cierres
      // forzados por el watchdog o errores de red salen como "undefined" y no se
      // puede distinguir la causa (incidente 2026-07-13).
      const boom = lastDisconnect?.error as Boom | undefined;
      const code = boom?.output?.statusCode;
      logger.info(
        `Disconnect reason: ${code ?? 'sin código'}${boom?.message ? ` — ${boom.message}` : ''}`
      );

      if (shuttingDown.has(sessionId)) {
        logger.info(`Skipping reconnect for ${sessionId} (shutdown in progress)`);
        return;
      }

      if (code === DisconnectReason.connectionReplaced) {
        // 440: otra instancia (¿dev con creds de prod?) se conectó con las mismas creds.
        // Reconectar inmediatamente crea un "440 war" — ambas instancias se patean entre
        // sí a 3s, bombardeando WhatsApp con groupFetchAllParticipating → rate-overlimit.
        // Solución: backoff largo (forzar intento >= 20 → delay = 60s cap) + alerta si persiste.
        const count = (consecutive440s[sessionId] = (consecutive440s[sessionId] ?? 0) + 1);
        logger.warn(
          `⚠️ Session ${sessionId} desplazada por otra instancia (440) — ${count}x consecutiva. Backoff largo.`
        );

        if (count >= 3) {
          sendTelegramAlert({
            message: `⚠️ WhatsApp sesión ${sessionId} en guerra 440 (${count}x).\n\nOtra instancia de lila-app (¿dev con creds de prod?) está compitiendo por la misma sesión.\n\nAcción: detener la instancia duplicada o usar un PORTAL_MONGO_URI separado para dev.`,
            dedupeKey: `440-war-${sessionId}`,
          }).catch(() => {});
        }

        // Forzar backoff largo: subir al intento cuyo delay exponencial ya es >= 60s
        // (attempt 6 → 96s con base 3s), para no pelear con la otra instancia.
        reconnectAttempts[sessionId] = Math.max(reconnectAttempts[sessionId] ?? 0, 6);
        scheduleReconnect(sessionId, qrCb);
      } else if (code !== DisconnectReason.loggedOut) {
        // Si el socket se cerró SIN haber abierto nunca, es un stall de handshake (no un
        // corte de una sesión que estaba viva). WhatsApp NO manda 401 en este caso: el
        // login simplemente se cuelga. Si se repite hasta el tope, aparcamos en vez de
        // reintentar en bucle infinito (el backoff ya está en el techo y no abre).
        if (!everOpened && sawQR) {
          // Cierre en modo EMPAREJAMIENTO (QR mostrado, sin creds): NO es un stall de
          // handshake — es la rotación normal del QR de Baileys (cierra con 515/timeout y
          // espera que reabras para dar un QR fresco). Tratarlo como stall aplicaba el
          // backoff largo (~2-3min, STALL_BACKOFF_FLOOR) y dejaba el QR muerto en Portal →
          // imposible escanear a tiempo. Reconectar YA con backoff reseteado.
          logger.info(`🔗 [${sessionId}] Cierre en modo QR/pairing — reconectando rápido para refrescar el QR`);
          reconnectAttempts[sessionId] = 0;
          resetConnectingStalls(sessionId);
          scheduleReconnect(sessionId, qrCb);
          return;
        }
        if (!everOpened) {
          const stalls = registerConnectingStall();
          if (stalls >= MAX_CONNECTING_STALLS) {
            parkSession(sessionId);
            return;
          }
          // Throttle de login: espaciar YA en vez de martillar (ver STALL_BACKOFF_FLOOR).
          reconnectAttempts[sessionId] = Math.max(
            reconnectAttempts[sessionId] ?? 0,
            STALL_BACKOFF_FLOOR_ATTEMPT
          );
        }
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
        consecutive440s[sessionId] = 0;
        resetConnectingStalls(sessionId);
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
  // Send-proxy (dev): igual que startSession, el pairing abre un socket local con las
  // creds de prod → guerra 440. Re-emparejar debe hacerse contra prod. Ver startSession.
  if (config.whatsapp.proxyTargetUrl && config.nodeEnv !== 'production') {
    throw new Error(
      'WhatsApp send-proxy activo: no se vinculan sesiones locales (el socket vive en prod). ' +
        'Quita WHATSAPP_PROXY_TARGET_URL para vincular en esta máquina.'
    );
  }

  // Lease anti doble-instancia (mismo guard que startSession).
  if (!hasSocketLease()) {
    throw new Error(
      'Esta instancia no posee el lease de sockets WhatsApp (otra instancia viva lo tiene). ' +
        'Mata el proceso duplicado o espera el failover automático.'
    );
  }

  const sessionId = phone.replace('+', '');
  // Credenciales Y store (chats/contactos) SIEMPRE en Mongo. Ya NO se usan archivos locales.
  const { state, saveCreds } = await useMongoAuthState(sessionId);
  const { version } = await getBaileysVersion();

  // Create Pino logger for Baileys (nivel configurable, ver initSession)
  const pinoLogger = pino({ level: config.whatsapp.baileysLogLevel ?? 'fatal' });

  const sock = makeWASocket({
    version,
    // Mismo cache de signal keys que initSession (menos roundtrips a Atlas).
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pinoLogger),
    },
    logger: pinoLogger, // Baileys expects pino logger
    // El browser afecta la entrega del pairing code (Baileys #2306); usamos el mismo
    // valor probado del flujo QR que sí funciona. 'Lila' (no-browser real) fallaba.
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false, // pairing code es alternativo al QR
    syncFullHistory: true, // maximiza contactos al conectar (ver startSession)
    msgRetryCounterCache: makeMsgRetryCache(),
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
    resetConnectingStalls(sessionId);
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
  // Reinicio manual = intención humana de recuperar: desaparca y resetea el contador de
  // stalls para que el nuevo socket tenga el margen completo antes de volver a aparcar.
  resetConnectingStalls(sessionId);
  reconnectAttempts[sessionId] = 0;
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
    resetConnectingStalls(sessionId);

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

    // 3c. Delete store snapshot in Mongo (chats/contactos) y limpiar cooldown de populate
    try {
      await clearStoreSnapshot(sessionId);
      clearPopulateCooldown(sessionId);
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
