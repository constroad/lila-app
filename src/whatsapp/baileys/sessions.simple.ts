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
import { isLocalOnlySession } from './local-sessions.js';
import { handleAgentMessagesUpsert } from '../../agent/runtime/agent-wiring.js';
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

// Generación del socket vigente por sesión. Un socket viejo puede emitir `open` DESPUÉS
// de que su reemplazo ya fue programado (observado 2026-08-04, 51902049935: cierre a las
// 16:18:58 → reconnect programado a 164s → un `open` a las 16:19:03 desde el socket
// anterior). Ese `open` marcaba la sesión lista Y cancelaba el reconnect pendiente, con
// lo que la sesión quedaba "lista" sobre un socket muerto: 4h41m sin reintentar y sin
// vaciar el outbox (que solo se vacía en `open`). Comparar generaciones descarta al
// socket obsoleto. La spec ya había visto el síntoma ("dos `open` cercanos duplicaban
// envíos", §10.d) y lo tapó con un lock de flush; esto ataca la causa.
const socketEpoch: Record<string, number> = {};

/**
 * True si el websocket sigue realmente abierto. Baileys expone `sock.ws.isOpen`
 * (readyState === OPEN). Si la propiedad no existe (mocks de test, versión distinta),
 * asumimos vivo para no romper el camino normal.
 */
function isSocketAlive(sock: WASocket | undefined): boolean {
  const ws = (sock as unknown as { ws?: { isOpen?: boolean } } | undefined)?.ws;
  return ws?.isOpen ?? true;
}

// Reconciliación de liveness: `readyClients` se escribía SOLO en los eventos open/close,
// así que cualquier estado inconsistente (ver socketEpoch) era permanente — nada volvía a
// mirar si el socket seguía vivo. Este barrido cierra ese agujero: es la red de seguridad
// para el zombi que no se haya evitado en el origen.
const LIVENESS_SWEEP_MS = Number(process.env.WHATSAPP_LIVENESS_SWEEP_MS) || 60_000;
let livenessTimer: NodeJS.Timeout | null = null;
const reconnectAttempts: Record<string, number> = {};

// Si el socket se crea pero `connection.open/close` no llega en este tiempo,
// lo forzamos a cerrar para que el loop de reconexión lo reintente.
const CONNECTION_TIMEOUT_MS = 90_000;

// PRIMER login tras un emparejamiento (pair-success → 515 → reconnect): el teléfono
// está registrando el companion y preparando el estado inicial; en cuentas pesadas
// (2400+ chats) eso tarda MÁS que un reconnect normal, y matar el socket a los 90s
// reinicia el proceso en el teléfono → nunca converge y fuerza otro re-link (el
// device index del número de pruebas llegó a :32 así). A ese primer login se le da
// una ventana mucho más ancha antes de que el watchdog lo corte.
const PAIRING_LOGIN_TIMEOUT_MS = 5 * 60_000;
// Cuánto dura el estado "vinculando" tras el pair-success antes de volver al
// tratamiento normal (stall/backoff). Cubre 2-3 intentos con el watchdog extendido.
const PAIRING_LOGIN_WINDOW_MS = 15 * 60_000;

// Epoch ms del último pair-success (QR escaneado, creds.me seteado) por sesión.
// Marca la ventana "login post-pairing en curso": watchdog extendido + status
// 'linking' hacia Portal (que oculta el QR y bloquea "Regenerar" para no matar el
// login en vuelo). Se limpia en 'open' o al expirar la ventana.
const recentlyPairedAt: Record<string, number> = {};

// Última vez que ALGUIEN pidió el QR de la sesión por HTTP (Portal pollea cada
// 2.5-8s mientras el diálogo está abierto). El ciclo de emparejamiento (QR que
// rota + reconexión rápida en cada 408) SOLO tiene sentido mientras hay un
// consumidor mirando el QR: sin este corte, un QR pedido una vez dejaba un loop
// infinito rotando QRs y llenando logs para siempre (observado en prod jul-2026,
// deuda del fix sawQR). Si nadie pidió el QR en QR_CONSUMER_IDLE_MS, el ciclo se
// DETIENE (el socket se limpia); volver a pedir el QR lo reanuda con socket nuevo.
const qrLastRequestedAt: Record<string, number> = {};
const QR_CONSUMER_IDLE_MS = 90_000;
// Espera máxima a que un socket entre en modo emparejamiento (primer QR emitido)
// antes de pedir un pairing code. Ver requestPairingCodeForSession.
const PAIRING_MODE_WAIT_MS = 15_000;

/** El handler HTTP del QR marca que hay un consumidor activo mirando el QR. */
export function markQRRequested(sessionId: string): void {
  qrLastRequestedAt[sessionId] = Date.now();
}

const hasActiveQRConsumer = (sessionId: string): boolean =>
  Date.now() - (qrLastRequestedAt[sessionId] ?? 0) <= QR_CONSUMER_IDLE_MS;

/**
 * Detiene el ciclo de emparejamiento de una sesión en modo QR sin consumidores:
 * limpia socket/QR/timers y NO reprograma reconexión. Un nuevo GET /qr la reanuda.
 */
function stopIdlePairingCycle(sessionId: string): void {
  logger.info(
    `🛑 [${sessionId}] QR sin consumidor hace >${QR_CONSUMER_IDLE_MS / 1000}s — ` +
      'ciclo de emparejamiento DETENIDO (se reanuda al pedir el QR de nuevo desde Portal)'
  );
  clearReconnectTimer(sessionId);
  clearStoreTimer(sessionId);
  clearQR(sessionId);
  delete pairingCodes[sessionId];
  delete sessions[sessionId];
  delete stores[sessionId];
  readyClients.delete(sessionId);
}

/**
 * True si la sesión completó el pairing (QR escaneado) y su primer login todavía
 * no abre. Portal lo recibe como status 'linking'.
 */
export function isPairingLoginInProgress(sessionId: string): boolean {
  const pairedAt = recentlyPairedAt[sessionId];
  if (!pairedAt) return false;
  if (Date.now() - pairedAt > PAIRING_LOGIN_WINDOW_MS) {
    delete recentlyPairedAt[sessionId];
    return false;
  }
  return !isSessionReady(sessionId);
}

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

/** Por qué murió un handshake: código de cierre de WhatsApp y/o error de red. */
type StallCause = { code?: number; message?: string };

// Causa de cada stall, para que parkSession DIAGNOSTIQUE en vez de asumir. El contador
// solo, sin causa, no distingue un login throttleado de una credencial muerta.
// Incidente 2026-07-28: las 3 sesiones aparcaron con 405/408 (+ ENOTFOUND a
// web.whatsapp.com) tras un corte de red, y la alerta pidió re-emparejar — acción inútil
// que además quema un device slot y sube el device ID (síntoma de pairing corrupto,
// justo lo que se quería evitar).
const stallCauses: Record<string, StallCause[]> = {};
const MAX_TRACKED_STALL_CAUSES = MAX_CONNECTING_STALLS;

// Cierres que señalan causa EXTERNA y transitoria — WhatsApp rechazando/throttleando el
// LOGIN (405, 503, 515…) o la red local caída — y NO credenciales rotas. El 401
// (loggedOut) y el 440 (replaced) nunca llegan aquí: se manejan antes en connection.close.
const TRANSIENT_STALL_CODES = new Set([405, 408, 428, 500, 503, 515]);
const TRANSIENT_ERROR_PATTERN =
  /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|ENETDOWN|EHOSTUNREACH|EPIPE|socket hang up/i;

export function isTransientStallCause(cause: StallCause): boolean {
  if (cause.code !== undefined && TRANSIENT_STALL_CODES.has(cause.code)) return true;
  return !!cause.message && TRANSIENT_ERROR_PATTERN.test(cause.message);
}

/** Resumen legible para la alerta: "405 ×7, 408 ×2, timeout sin código ×3". */
function summarizeStallCauses(causes: StallCause[]): string {
  const tally = new Map<string, number>();
  for (const cause of causes) {
    const label = cause.code !== undefined ? String(cause.code) : 'timeout sin código';
    tally.set(label, (tally.get(label) ?? 0) + 1);
  }
  return [...tally.entries()].map(([label, n]) => `${label} ×${n}`).join(', ');
}

// Correlación de aparcados entre sesiones. Si ≥2 sesiones aparcan en la misma ventana, la
// causa es común POR DEFINICIÓN (red/IP/throttle del servidor): las credenciales de cuentas
// independientes no se rompen a la vez. En el incidente 2026-07-28 salieron 3 alertas de
// "credenciales desincronizadas" para lo que era UN corte de red — hay que reportarlo como
// un incidente único. La ventana cubre el espaciado real entre aparcados (18:26/18:39/18:40).
const PARK_CORRELATION_WINDOW_MS = 20 * 60_000;
const recentParks = new Map<string, number>();

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
 * corta el loop de reconexión, la marca no-ready y alerta. La alerta DIAGNOSTICA por la
 * causa de los stalls (throttle/red vs. credenciales) y correlaciona con otras sesiones
 * aparcadas en la misma ventana, en vez de asumir siempre "re-emparejar". Los
 * mensajes entrantes siguen encolándose en el outbox y salen al reconectar. Se
 * "desaparca" con un restart/creación manual (restartSession, disconnect/clear o el
 * ciclo de emparejamiento) — nunca desde la reconexión automática, para que el contador suba.
 */
function parkSession(sessionId: string) {
  parkedSessions.add(sessionId);
  readyClients.set(sessionId, false);
  clearReconnectTimer(sessionId);
  const stalls = connectingStalls[sessionId] ?? 0;

  // 1) Diagnóstico por CAUSA, no por conteo: cierres con código transitorio (o error de
  //    red) ⇒ throttle de login / red caída, NO credenciales. El umbral es "al menos la
  //    mitad" y no "mayoría estricta" porque el costo es asimétrico: re-emparejar de más
  //    quema un device slot y sube el device ID (daño real), mientras que esperar de más
  //    solo demora. Ante el empate, conviene NO mandar a escanear el QR.
  const causes = stallCauses[sessionId] ?? [];
  const transientCount = causes.filter(isTransientStallCause).length;
  const externalCause = causes.length > 0 && transientCount * 2 >= causes.length;
  const causeSummary = causes.length > 0 ? summarizeStallCauses(causes) : 'sin causas registradas';

  // 2) Correlación entre sesiones: ≥2 aparcadas en la ventana ⇒ causa común.
  const now = Date.now();
  for (const [id, at] of recentParks) {
    if (now - at > PARK_CORRELATION_WINDOW_MS) recentParks.delete(id);
  }
  recentParks.set(sessionId, now);
  const correlated = [...recentParks.keys()];
  const isCommonCause = correlated.length >= 2;

  logger.error(
    `🅿️ [${sessionId}] Sesión APARCADA tras ${stalls} stalls de conexión ` +
      `(causas: ${causeSummary}). Se detiene la reconexión automática. ` +
      `Diagnóstico: ${externalCause || isCommonCause ? 'causa externa (throttle de login o red) — NO re-emparejar' : 'posible desincronización de credenciales — re-emparejar'}.`
  );

  if (isCommonCause) {
    // Causas agregadas de TODAS las sesiones del incidente (no solo la última en aparcar):
    // es lo que permite ver de un vistazo que las 3 cayeron por el mismo 405/408.
    const allCauses = correlated.flatMap((id) => stallCauses[id] ?? []);
    const combinedSummary =
      allCauses.length > 0 ? summarizeStallCauses(allCauses) : 'sin causas registradas';
    // Una sola alerta para el incidente completo: dedupeKey compartida (no por sesión).
    sendTelegramAlert({
      dedupeKey: 'session-parked-multi',
      message:
        `🅿️ WhatsApp: ${correlated.length} sesiones APARCADAS en ${PARK_CORRELATION_WINDOW_MS / 60_000} min.\n` +
        `Sesiones: ${correlated.join(', ')}\n` +
        `Causas de cierre (todas): ${combinedSummary}\n\n` +
        `Varias sesiones cayeron juntas ⇒ la causa es COMÚN (red local, o WhatsApp ` +
        `throttleando el login desde esta IP). Las credenciales de cuentas independientes ` +
        `no se desincronizan a la vez.\n\n` +
        `Acción: NO re-emparejes. Verificá red/DNS y reiniciá el proceso cuando ceda el ` +
        `throttle (el aparcado se limpia al reiniciar). Los mensajes pendientes están a ` +
        `salvo en el outbox.`,
    }).catch(() => {});
    return;
  }

  sendTelegramAlert({
    dedupeKey: `session-parked-${sessionId}`,
    message: externalCause
      ? `🅿️ WhatsApp sesión ${sessionId} APARCADA.\n` +
        `El socket no completó el login tras ${stalls} intentos (causas: ${causeSummary}).\n\n` +
        `Esos códigos son de causa EXTERNA — WhatsApp rechazando el login o la red caída — ` +
        `no de credenciales rotas.\n\n` +
        `Acción: NO re-emparejes. Verificá red/DNS y reiniciá el proceso cuando ceda el ` +
        `throttle (el aparcado se limpia al reiniciar). Los mensajes pendientes están a ` +
        `salvo en el outbox y saldrán al reconectar.`
      : `🅿️ WhatsApp sesión ${sessionId} APARCADA.\n` +
        `El socket no completa el login tras ${stalls} intentos con backoff máximo y sin ` +
        `código de cierre (causas: ${causeSummary}) — el patrón típico de credenciales ` +
        `desincronizadas.\n\n` +
        `Acción: re-emparejar la sesión (escanear QR) desde el Portal. Los mensajes ` +
        `pendientes están a salvo en el outbox y saldrán al reconectar.`,
  }).catch(() => {});
}

/**
 * Barrido de liveness: degrada las sesiones marcadas como listas cuyo websocket ya no
 * está abierto y les programa reconexión. Sin esto, un estado inconsistente era
 * PERMANENTE (`readyClients` solo se escribía en open/close): el 2026-08-04 una sesión
 * quedó "lista" 4h41m sobre un socket muerto, encolando todo al outbox sin reintentar.
 * Ignora sesiones aparcadas (su estado terminal es deliberado) y las que se están apagando.
 */
export function sweepDeadSessions(): number {
  let demoted = 0;
  for (const [sessionId, ready] of readyClients) {
    if (!ready || shuttingDown.has(sessionId) || parkedSessions.has(sessionId)) continue;
    if (isSocketAlive(sessions[sessionId])) continue;
    logger.warn(`👻 [${sessionId}] Sesión marcada lista con el websocket cerrado — degradando y reconectando`);
    readyClients.set(sessionId, false);
    demoted += 1;
    scheduleReconnect(sessionId);
  }
  return demoted;
}

/** Arranca el barrido periódico (idempotente). Se llama al crear la primera sesión. */
function startLivenessSweep(): void {
  if (livenessTimer) return;
  livenessTimer = setInterval(() => {
    try {
      sweepDeadSessions();
    } catch (error) {
      logger.warn(`Liveness sweep falló: ${String(error)}`);
    }
  }, LIVENESS_SWEEP_MS);
  livenessTimer.unref?.(); // no debe mantener vivo el proceso en tests/shutdown
}

/** Detiene el barrido (shutdown / tests). */
export function stopLivenessSweep(): void {
  if (!livenessTimer) return;
  clearInterval(livenessTimer);
  livenessTimer = null;
}

/** True si la sesión fue aparcada por stalls repetidos (requiere re-emparejar/restart). */
export function isSessionParked(sessionId: string): boolean {
  return parkedSessions.has(sessionId);
}

/** Limpia el estado de stall/aparcado. Solo desde recuperaciones MANUALES. */
function resetConnectingStalls(sessionId: string) {
  connectingStalls[sessionId] = 0;
  delete stallCauses[sessionId];
  parkedSessions.delete(sessionId);
  // Salir de la correlación: si esta sesión se recuperó, ya no cuenta como evidencia de
  // un incidente común para las que aparquen después.
  recentParks.delete(sessionId);
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
  if (config.nodeEnv === 'production' && isLocalOnlySession(sessionId)) {
    throw new Error(
      `Sesión ${sessionId} es LOCAL-ONLY (WHATSAPP_LOCAL_SESSIONS): su socket vive en una ` +
        'máquina de desarrollo. Prod no la abre ni la restaura (evita guerra 440).'
    );
  }
  // Excepción LOCAL-ONLY: esa sesión SÍ abre socket local en dev (E2E QR real).
  if (
    config.whatsapp.proxyTargetUrl &&
    config.nodeEnv !== 'production' &&
    !isLocalOnlySession(sessionId)
  ) {
    throw new Error(
      'WhatsApp send-proxy activo: no se abren sesiones locales (el socket vive en prod). ' +
        'Quita WHATSAPP_PROXY_TARGET_URL para conectar un socket en esta máquina.'
    );
  }

  // Lease anti doble-instancia: solo el holder abre sockets. Cubre TODOS los caminos
  // (restore, reconnect, QR/create) igual que el guard del proxy. Ver instance-lease.ts.
  // Las sesiones LOCAL-ONLY quedan exentas: el lease lo posee PROD (Mongo compartido),
  // pero prod tiene esas sesiones bloqueadas, así que no hay doble socket posible.
  if (!hasSocketLease() && !isLocalOnlySession(sessionId)) {
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
    // History completo SOLO en el socket de EMPAREJAMIENTO (creds sin `me`). En Baileys
    // 6.7.18 syncFullHistory solo viaja en el nodo de REGISTRO (`requireFullSync` del
    // pairing payload) — el nodo de LOGIN de reconexiones no lo incluye, y `webSubPlatform`
    // tampoco cambia con Browsers.ubuntu. El gate anterior (`!registered`) estaba roto:
    // `registered` NUNCA flipa a true en el flujo QR (solo en pairing-code), así que toda
    // sesión QR-emparejada lo mandaba siempre. `me` sí se setea en el pair-success, que es
    // el corte real entre "emparejando" y "ya emparejada". El store vive en Mongo y
    // persiste entre reconexiones. Ver SCALABILITY-MULTI-SESSION.spec §2.3 y §10.e.
    syncFullHistory: !state.creds.me,
    // Vida uniforme de CADA QR = 20s (default Baileys: primer ref 60s, resto 20s).
    // Portal muestra un countdown de 20s (QR_VALIDITY_MS); sin esto, el primer QR
    // "expiraba" en pantalla a los 20s aunque seguía vigente 40s más.
    qrTimeout: 20_000,
  });

  // Generación de ESTE socket. Cualquier socket creado después la incrementa, así que un
  // `open` tardío de este puede detectarse como obsoleto (ver `socketEpoch`).
  const myEpoch = (socketEpoch[sessionId] = (socketEpoch[sessionId] ?? 0) + 1);

  // Store en el mapa YA (el open handler lo consulta); el snapshot se carga en
  // PARALELO y se espera DESPUÉS de registrar los listeners (ver abajo).
  const store = makeInMemoryStore(sessionId);
  stores[sessionId] = store;
  const storeLoaded = store.load();

  // ⚠️ ORDEN CRÍTICO (medido 2026-07-15): los listeners de `creds.update` y
  // `connection.update` van ANTES de cualquier await. Baileys emite el PRIMER QR
  // ~200ms después del registro (pair-device) y ese ref vive 60s; con el
  // `await store.load()` delante (1-2s contra Atlas en cuentas de 2400+ chats) el
  // primer QR se PERDÍA: el usuario recién veía el SEGUNDO ref a los ~60s
  // (T0→QR visible: 63s medidos; con este orden: segundos). Además se quemaba 1 de
  // los ~6 refs de la ventana de pairing. Mismo riesgo con creds.update: un
  // pair-success ocurrido durante la carga no se persistía a Mongo.
  sock.ev.on('creds.update', saveCreds);

  // Agente conversacional (WHATSAPP-AGENT-VERTICALS F1): entrantes → router.
  // Doble gate: WHATSAPP_AGENT_ENABLED (env, default off) + bot_configs.enabled
  // por company (+ allowlist de pilotos). Sin ambos, este handler es no-op y el
  // comportamiento de sesiones/grupos queda EXACTAMENTE igual que hoy.
  sock.ev.on('messages.upsert', (upsert) => {
    void handleAgentMessagesUpsert(sessionId, sock, upsert);
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
  const registerConnectingStall = (cause: StallCause): number => {
    if (stallCounted) return connectingStalls[sessionId] ?? 0;
    stallCounted = true;
    // La causa acompaña al contador: parkSession la necesita para no diagnosticar
    // "credenciales desincronizadas" ante lo que es throttle de login o red caída.
    const causes = (stallCauses[sessionId] ??= []);
    causes.push(cause);
    if (causes.length > MAX_TRACKED_STALL_CAUSES) causes.shift();
    return (connectingStalls[sessionId] = (connectingStalls[sessionId] ?? 0) + 1);
  };
  const startWatchdog = () => {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    // Primer login post-pairing: ventana ancha (el teléfono está registrando el
    // companion; matarlo a los 90s reinicia ese proceso y nunca converge).
    const watchdogMs = isPairingLoginInProgress(sessionId)
      ? PAIRING_LOGIN_TIMEOUT_MS
      : CONNECTION_TIMEOUT_MS;
    watchdogTimer = setTimeout(() => {
      if (!connectionSettled && !shuttingDown.has(sessionId)) {
        logger.warn(`⏱ [${sessionId}] Connection watchdog: socket sin respuesta por ${watchdogMs / 1000}s — forzando cierre`);
        try {
          sock.end(new Error('connection-watchdog-timeout'));
        } catch (err) {
          logger.warn(`Watchdog: sock.end falló para ${sessionId}: ${String(err)}`);
        }
        // En modo EMPAREJAMIENTO (QR mostrado, sin creds) un timeout no es un stall de
        // login: el QR simplemente no fue escaneado a tiempo. Reconectar YA con backoff
        // reseteado para presentar un QR fresco, sin contar stalls ni aparcar.
        if (sawQR) {
          // Si el QR SÍ fue escaneado (pair-success dejó creds.me) marca la ventana
          // de primer login: el próximo socket recibe watchdog extendido + 'linking'.
          if (state.creds.me) {
            recentlyPairedAt[sessionId] = Date.now();
            logger.info(`🔗 [${sessionId}] Pair-success detectado (watchdog) — primer login en curso`);
          } else if (!hasActiveQRConsumer(sessionId)) {
            // Nadie está mirando el QR: no rotar en vano (loop infinito de QRs).
            stopIdlePairingCycle(sessionId);
            return;
          }
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
        // Watchdog: el socket nunca respondió — no hay código de cierre de WhatsApp.
        // Es la causa AMBIGUA (handshake colgado en Noise), la que sí sugiere creds rotas.
        const stalls = registerConnectingStall({ message: 'connection-watchdog-timeout' });
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
    }, watchdogMs);
  };
  startWatchdog();

  // Connection event handler
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Traza de FASE del handshake (barata: pocas líneas por socket). connection.update
    // trae más que open/close: `isNewLogin` (pair-success procesado), `isOnline`,
    // `receivedPendingNotifications` (offline sync completo). Con solo "socket sin
    // respuesta 90s" no se distinguía Noise vs login vs sync; con esto sí:
    //   - nunca llega nada → colgado en Noise/TCP
    //   - llega isNewLogin y muere → pairing OK, WhatsApp no completa el login
    //   - open sin receivedPendingNotifications → login OK, sync inicial colgado.
    // El string del QR se omite (enorme); el detalle del close ya se loggea aparte.
    const phaseTrace = JSON.stringify({
      ...update,
      qr: qr ? '«qr»' : undefined,
      lastDisconnect: lastDisconnect ? '«ver Disconnect reason»' : undefined,
    });
    logger.info(`🧭 [${sessionId}] connection.update ${phaseTrace}`);

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
      // Un `open` de un socket OBSOLETO (ya reemplazado por un reconnect posterior) no
      // debe marcar la sesión lista ni —sobre todo— cancelar el reconnect pendiente:
      // dejaba la sesión "lista" sobre un socket muerto. Ver `socketEpoch`.
      if (socketEpoch[sessionId] !== myEpoch) {
        logger.warn(
          `👻 [${sessionId}] Ignorando 'open' de un socket obsoleto (gen ${myEpoch}, vigente ${socketEpoch[sessionId]})`
        );
        return;
      }
      // Baileys emite `open` y el socket puede morir en el mismo tick (observado: el
      // `sendPresenceUpdate` siguiente falla con "Connection Closed"). Marcar lista una
      // sesión cuyo ws ya no está abierto es justamente el estado zombi.
      if (!isSocketAlive(sock)) {
        logger.warn(`👻 [${sessionId}] 'open' recibido pero el websocket ya no está abierto — no se marca lista`);
        scheduleReconnect(sessionId, qrCb);
        return;
      }
      // El snapshot puede seguir cargando (los listeners se registran antes del
      // await — ver ORDEN CRÍTICO arriba); populate necesita el store hidratado.
      await storeLoaded.catch(() => {});
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
      // Primer login post-pairing completado (si estaba en curso).
      delete recentlyPairedAt[sessionId];
      // Emparejado: el pairing code (si hubo) dejó de ser válido.
      delete pairingCodes[sessionId];

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

      // La presencia es el primer uso REAL del socket tras el `open`. Si falló y el ws ya
      // no está abierto, el `open` fue espurio: degradar y reintentar en vez de quedarnos
      // "listos" sobre un socket muerto (era exactamente el caso de las 16:19 del 08-04).
      if (!isSocketAlive(sock)) {
        logger.warn(`👻 [${sessionId}] El websocket murió justo tras el 'open' — degradando y reconectando`);
        readyClients.set(sessionId, false);
        scheduleReconnect(sessionId, qrCb);
        return;
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
          // Si el cierre viene de un pair-success (515 con creds.me ya seteado), abrir la
          // ventana de PRIMER LOGIN: watchdog extendido + status 'linking' hacia Portal.
          if (state.creds.me) {
            recentlyPairedAt[sessionId] = Date.now();
            logger.info(`🔗 [${sessionId}] Pair-success (QR escaneado) — primer login post-pairing en curso`);
          } else if (!hasActiveQRConsumer(sessionId)) {
            // Nadie está mirando el QR (Portal dejó de pollear hace >90s): detener el
            // ciclo en vez de rotar QRs para siempre. Se reanuda con el próximo GET /qr.
            stopIdlePairingCycle(sessionId);
            return;
          }
          logger.info(`🔗 [${sessionId}] Cierre en modo QR/pairing — reconectando rápido para refrescar el QR`);
          reconnectAttempts[sessionId] = 0;
          resetConnectingStalls(sessionId);
          scheduleReconnect(sessionId, qrCb);
          return;
        }
        if (!everOpened) {
          // Aquí SÍ hay diagnóstico: WhatsApp mandó un código (405 throttle, 503 stream)
          // o el socket murió con un error de red (ENOTFOUND…). parkSession lo usa.
          const stalls = registerConnectingStall({ code, message: boom?.message });
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
        delete pairingCodes[sessionId];
        try {
          await clearMongoAuthState(sessionId);
          logger.info(`🧹 Cleared dead Mongo creds for ${sessionId} (loggedOut)`);
        } catch (err) {
          logger.warn(`Failed to clear dead creds for ${sessionId}:`, err);
        }
      }
    }
  });

  // Esperar el snapshot ANTES del timer de save (no pisar el doc de Mongo) y del
  // bind (mismo orden que siempre; los listeners de conexión ya están arriba).
  await storeLoaded;

  clearStoreTimer(sessionId);
  storeTimers[sessionId] = setInterval(() => store.save(), 10_000);

  store.bind(sock.ev);

  // Sync history: bind once at session creation (not inside 'open' which fires on every reconnect).
  // Solo chats/contactos; los mensajes NO se almacenan (ver store.manager / SCALABILITY spec §3).
  sock.ev.on('messaging-history.set', ({ chats, contacts }) => {
    logger.info(`📥 Received ${chats.length} chats and ${contacts.length} contacts`);
    chats.forEach((chat) => store.chats.set(chat.id, chat));
    contacts.forEach((contact) => store.contacts.set(contact.id, contact));
    store.markDirty();
  });

  sessions[sessionId] = sock;
  startLivenessSweep();
  return sock;
}

/**
 * Solicita un pairing code ("vincular con número") sobre el ciclo de vida COMPLETO
 * de initSession — guards (proxy/local-only/lease), watchdog, 515→linking,
 * reconexión e idle-stop incluidos. El flujo anterior (createPairingSession) era
 * una copia huérfana del socket SIN nada de eso: tras ingresar el código en el
 * teléfono, el 515 post-pairing moría sin reconectar y el login nunca completaba
 * ("nunca funcionó" histórico — ver spec §10.f y §10).
 *
 * El código se pide UNA sola vez por llamada (click del usuario): pedirlo en cada
 * reconexión provoca 429 rate-overlimit (Baileys #2008). El browser del socket
 * (Browsers.ubuntu, initSession) es el valor probado para la entrega del código
 * (Baileys #2306). El pair-success por código dispara el MISMO camino que el QR
 * (creds.me + cierre 515) → ventana linking + reconexión rápida + open.
 */
export async function requestPairingCodeForSession(sessionId: string): Promise<string> {
  // E.164 SIN '+' (solo dígitos): Baileys genera el código PARA ese número; uno
  // mal formado produce un código huérfano que nunca llega al teléfono.
  const normalizedId = sessionId.replace(/\D/g, '');
  if (!normalizedId) {
    throw new Error('Número inválido para vincular con código.');
  }

  // Consumidor activo: mantiene vivo el ciclo de emparejamiento (ver idle-stop).
  markQRRequested(normalizedId);

  const sock = getSession(normalizedId) ?? (await startSession(normalizedId, () => {}));
  if (isSessionReady(normalizedId) || sock.authState?.creds?.me) {
    throw new Error(
      'La sesión ya está emparejada o conectada: usa Desconectar/Limpiar antes de vincular con código.'
    );
  }

  // Esperar a que el socket esté REALMENTE en modo emparejamiento (primer QR
  // emitido = registro aceptado por WhatsApp; con el fix §10.f llega en ~2s).
  // Pedir el código antes de eso falla o genera un código huérfano.
  const waitStart = Date.now();
  while (!qrCodes[normalizedId] && Date.now() - waitStart < PAIRING_MODE_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!qrCodes[normalizedId]) {
    throw new Error(
      'El socket no entró en modo emparejamiento (15s sin QR). Reintenta en unos segundos.'
    );
  }

  const code = await sock.requestPairingCode(normalizedId);
  pairingCodes[normalizedId] = code;
  logger.info(`📲 [${normalizedId}] Pairing code generado (válido unos minutos)`);
  return code;
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
