/**
 * Lease PROCESS-LEVEL de sockets WhatsApp (candado anti doble-instancia).
 *
 * Un número WhatsApp admite UN solo socket vivo. Como las creds viven en el Mongo
 * COMPARTIDO, dos procesos lila (segundo PM2, resilient-dev zombie, dev sin proxy)
 * restaurarían las MISMAS sesiones → guerra 440 en todos los números y riesgo de
 * corromper signal keys (incidente jul-2026). Este lease es un doc único en Mongo
 * con TTL + heartbeat: solo el holder puede abrir sockets; el resto queda pasivo
 * y alerta. Si el holder muere, otro proceso toma el lease al expirar el TTL
 * (failover automático en ~LEASE_TTL_MS).
 *
 * Alcance deliberadamente MENOR que specs/SESSION-LEASE.spec.md (handoff prod↔dev
 * por sesión, sigue propuesto): esto solo garantiza "un proceso con sockets a la vez".
 *
 * Fencing: si el holder PIERDE el lease en caliente (p.ej. Mongo inaccesible >TTL),
 * NO se cierran los sockets — durante un corte de Atlas eso mataría sesiones sanas
 * (el peor momento). El lease previene el escenario real (dos procesos VIVOS
 * restaurando a la vez); la carrera teórica de takeover en caliente se acepta y
 * se alerta por Telegram.
 */
import os from 'os';
import crypto from 'crypto';
import { getSharedConnection } from '../../database/sharedConnection.js';
import { config } from '../../config/environment.js';
import logger from '../../utils/logger.js';
import { sendTelegramAlert } from '../../services/telegram-alert.service.js';

const COLLECTION = 'whatsapp_instance_lease';
const LEASE_DOC_ID = 'whatsapp-socket-owner';
export const LEASE_TTL_MS = 90_000;
export const LEASE_HEARTBEAT_MS = 30_000;

const HOLDER_ID = `${os.hostname()}#${process.pid}#${crypto.randomUUID().slice(0, 8)}`;

let holdingLease = false;
let heartbeatTimer: NodeJS.Timeout | null = null;

const leaseEnabled = (): boolean => config.whatsapp.socketLease !== false;

type LeaseCollection = {
  updateOne: (filter: object, update: object) => Promise<{ matchedCount: number }>;
  insertOne: (doc: object) => Promise<unknown>;
  deleteOne: (filter: object) => Promise<unknown>;
};

const getLeaseCollection = async (): Promise<LeaseCollection> => {
  const conn = await getSharedConnection();
  return conn.collection(COLLECTION) as unknown as LeaseCollection;
};

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

/**
 * Intenta adquirir o renovar el lease. true = este proceso es el holder.
 * Adquiere si: el doc no existe, ya es nuestro, o el TTL del holder anterior venció.
 */
export async function tryAcquireSocketLease(): Promise<boolean> {
  const now = new Date();
  const claim = {
    holderId: HOLDER_ID,
    hostname: os.hostname(),
    pid: process.pid,
    nodeEnv: config.nodeEnv,
    renewedAt: now,
    expiresAt: new Date(now.getTime() + LEASE_TTL_MS),
  };

  const col = await getLeaseCollection();
  const renewed = await col.updateOne(
    { _id: LEASE_DOC_ID, $or: [{ holderId: HOLDER_ID }, { expiresAt: { $lt: now } }] },
    { $set: claim }
  );
  if (renewed.matchedCount > 0) {
    return true;
  }

  // Ningún doc matcheó: o no existe (insert gana) o lo tiene otro holder vivo (E11000).
  try {
    await col.insertOne({ _id: LEASE_DOC_ID, ...claim });
    return true;
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return false;
    }
    throw err;
  }
}

/**
 * ¿Este proceso puede abrir sockets WhatsApp?
 * Con el lease deshabilitado por env (WHATSAPP_SOCKET_LEASE=false) siempre true.
 */
export function hasSocketLease(): boolean {
  if (!leaseEnabled()) return true;
  return holdingLease;
}

/**
 * Handler para la adquisición TARDÍA del lease (failover), que index.ts usa para
 * restaurar las sesiones.
 *
 * POR QUÉ EXISTE (incidente 2026-08-10): la decisión de restaurar sesiones se
 * tomaba UNA sola vez, al arrancar, según si el proceso tenía el lease en ese
 * instante. El heartbeat sí podía ganarlo después —failover al expirar el TTL
 * del holder anterior— pero solo lo LOGUEABA. Resultado: un proceso que arranca
 * pasivo y después gana el lease lo retiene PARA SIEMPRE sin abrir una sola
 * sesión. Caída silenciosa y permanente de WhatsApp, con el agravante de que el
 * lease queda tomado, así que ninguna otra instancia puede tomar el relevo.
 *
 * Pasó con un reinicio: el proceso nuevo arrancó mientras el viejo aún figuraba
 * vivo (SIGKILL no libera el lease), quedó pasivo, y 2 minutos después ganó el
 * lease por TTL — con las sesiones ya nunca levantadas.
 */
let onLeaseAcquiredLate: (() => void | Promise<void>) | null = null;
let yaArrancado = false;

export function setOnLeaseAcquiredLate(handler: () => void | Promise<void>): void {
  onLeaseAcquiredLate = handler;
}

const heartbeat = async (): Promise<void> => {
  try {
    const acquired = await tryAcquireSocketLease();
    if (acquired && !holdingLease) {
      logger.info(`🔓 Socket lease ADQUIRIDO por ${HOLDER_ID}`);
      // Solo en adquisiciones POSTERIORES al arranque: la inicial ya la maneja
      // index.ts con su propio restore.
      if (yaArrancado && onLeaseAcquiredLate) {
        logger.info('🔁 Lease ganado por failover — restaurando sesiones WhatsApp');
        void Promise.resolve(onLeaseAcquiredLate()).catch((error) =>
          logger.error(`Restore tras failover del lease falló: ${String(error)}`)
        );
      }
    }
    if (!acquired && holdingLease) {
      logger.error(
        `⚠️ Socket lease PERDIDO por ${HOLDER_ID}: otra instancia lo tomó. ` +
          'Los sockets vivos NO se cierran (ver fencing en el header), pero revisa si hay un proceso duplicado.'
      );
      sendTelegramAlert({
        dedupeKey: 'socket-lease-lost',
        message:
          `⚠️ lila-app ${HOLDER_ID} perdió el lease de sockets WhatsApp.\n\n` +
          'Otra instancia lo posee. Si no esperabas dos procesos, mata el duplicado.',
      }).catch(() => {});
    }
    holdingLease = acquired;
  } catch (err) {
    // Mongo inaccesible: conservar el estado actual (no soltar sockets por un hipo).
    logger.warn(`Socket lease heartbeat falló (estado se mantiene: holding=${holdingLease}): ${String(err)}`);
  }
};

/**
 * Adquiere el lease (o queda pasivo reintentando) y arranca el heartbeat.
 * Devuelve si este proceso quedó como holder en el primer intento.
 */
export async function startSocketLeaseLoop(): Promise<boolean> {
  if (!leaseEnabled()) {
    logger.warn('Socket lease DESHABILITADO por env (WHATSAPP_SOCKET_LEASE=false)');
    return true;
  }
  await heartbeat();
  // A partir de acá, cualquier adquisición es TARDÍA (failover) y debe disparar
  // el restore — ver setOnLeaseAcquiredLate.
  yaArrancado = true;
  if (!holdingLease) {
    logger.error(
      '🔒 Otra instancia de lila-app posee el lease de sockets WhatsApp: este proceso queda PASIVO ' +
        `(sin sockets) y reintenta cada ${LEASE_HEARTBEAT_MS / 1000}s. Failover automático si el holder muere.`
    );
    sendTelegramAlert({
      dedupeKey: 'socket-lease-passive',
      message:
        `⚠️ lila-app ${HOLDER_ID} arrancó SIN el lease de sockets WhatsApp (otra instancia viva lo posee).\n\n` +
        'Queda pasivo: no abre sesiones. Si no esperabas dos procesos, mata el duplicado.',
    }).catch(() => {});
  }
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => void heartbeat(), LEASE_HEARTBEAT_MS);
  // No retener el event loop por el heartbeat (procesos cortos / tests).
  heartbeatTimer.unref?.();
  return holdingLease;
}

/** Suelta el lease en shutdown para que el próximo arranque lo tome al instante. */
export async function releaseSocketLease(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (!leaseEnabled() || !holdingLease) return;
  holdingLease = false;
  try {
    const col = await getLeaseCollection();
    await col.deleteOne({ _id: LEASE_DOC_ID, holderId: HOLDER_ID });
    logger.info(`🔓 Socket lease liberado por ${HOLDER_ID}`);
  } catch (err) {
    logger.warn(`No se pudo liberar el socket lease (expira solo en ${LEASE_TTL_MS / 1000}s): ${String(err)}`);
  }
}

/** Solo para tests. */
export function __resetSocketLeaseForTests(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  holdingLease = false;
  onLeaseAcquiredLate = null;
  yaArrancado = false;
}
