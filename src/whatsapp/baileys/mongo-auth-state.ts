/**
 * Mongo Auth State — credenciales Baileys en MongoDB (portables entre máquinas).
 *
 * Problema que resuelve: con `useMultiFileAuthState` las credenciales viven en archivos
 * locales (`data/sessions/{sender}`). El sender se lee de la DB compartida, así que en
 * PRODUCCIÓN (otra máquina) el sender existe en DB pero sus creds no están en disco →
 * la sesión no se puede restaurar y falla. Guardando las creds en Mongo (compartido), el
 * sender y sus credenciales viven juntos → restaura en cualquier instancia.
 *
 * Es el ÚNICO auth store (como la industria): al abrir/reconectar una sesión, las creds y
 * signal keys se leen/escriben en Mongo. Tamaño chico (KB); los chats/contactos NO van aquí
 * (siguen como cache local liviano). Ver SCALABILITY-MULTI-SESSION.spec §5 (persistencia/creds).
 *
 * Colección `whatsapp_auth`: 1 doc por (sessionId, key). `key='creds'` = AuthenticationCreds;
 * `key='${type}-${id}'` = signal keys (pre-keys, sessions, app-state, etc.).
 */
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import type { AuthenticationCreds, AuthenticationState } from '@whiskeysockets/baileys';
// `proto` NO es un named export estático bajo ESM en baileys 6.7.x, pero SÍ está en el
// namespace del módulo → tomarlo de `import * as`.
import * as baileysNs from '@whiskeysockets/baileys';
import { getSharedConnection } from '../../database/sharedConnection.js';
import logger from '../../utils/logger.js';

const proto = (baileysNs as any).proto;

const COLLECTION = 'whatsapp_auth';

// El índice por sessionId acelera el barrido multi-sesión: restaurar (distinct sessionId)
// y limpiar (`deleteMany({ sessionId })`) sin escanear toda la colección. Se asegura una
// sola vez por proceso (createIndex es idempotente).
let indexEnsured = false;
async function ensureSessionIndex(col: { createIndex: (k: object, o?: object) => Promise<unknown> }) {
  if (indexEnsured) return;
  indexEnsured = true;
  try {
    await col.createIndex({ sessionId: 1 }, { name: 'sessionId_1' });
  } catch {
    indexEnsured = false; // reintentar en la próxima sesión si falló
  }
}

export interface MongoAuthState {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  /** Borra TODAS las credenciales de la sesión (para clearSession). */
  clearAuth: () => Promise<void>;
}

const docId = (sessionId: string, key: string) => `${sessionId}:${key}`;

export async function useMongoAuthState(sessionId: string): Promise<MongoAuthState> {
  const conn = await getSharedConnection();
  const col = conn.collection(COLLECTION);
  await ensureSessionIndex(col);

  const writeData = async (key: string, value: unknown) => {
    const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
    await col.updateOne(
      { _id: docId(sessionId, key) } as any,
      { $set: { sessionId, value: serialized } },
      { upsert: true }
    );
  };

  const readData = async (key: string): Promise<any> => {
    const doc = await col.findOne({ _id: docId(sessionId, key) } as any);
    if (!doc) return null;
    return JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver);
  };

  const removeData = async (key: string) => {
    await col.deleteOne({ _id: docId(sessionId, key) } as any);
  };

  const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: Record<string, any> = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            const entries = (data as any)[category];
            for (const id in entries) {
              const value = entries[id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
    clearAuth: async () => {
      try {
        await col.deleteMany({ sessionId });
      } catch (error) {
        logger.warn(`Failed to clear Mongo auth for ${sessionId}: ${String(error)}`);
      }
    },
  };
}

/** Lista los sessionIds con credenciales en Mongo (para restaurar al arranque). */
export async function listMongoAuthSessions(): Promise<string[]> {
  const conn = await getSharedConnection();
  const col = conn.collection(COLLECTION);
  const ids = await col.distinct('sessionId', { _id: { $regex: /:creds$/ } } as any);
  return (ids as string[]).filter(Boolean);
}

/** Borra todas las credenciales de una sesión sin inicializar el state (para clearSession). */
export async function clearMongoAuthState(sessionId: string): Promise<void> {
  try {
    const conn = await getSharedConnection();
    await conn.collection(COLLECTION).deleteMany({ sessionId });
  } catch (error) {
    logger.warn(`Failed to clear Mongo auth for ${sessionId}: ${String(error)}`);
  }
}
