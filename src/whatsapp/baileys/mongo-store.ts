/**
 * Mongo Store — snapshot de chats/contactos de Baileys en MongoDB (portable entre máquinas).
 *
 * Reemplaza el archivo local `data/sessions/{sessionId}/baileys_store.json`. Motivación (igual
 * que las creds en `mongo-auth-state`): en prod/otra instancia el sender vive en la DB
 * compartida; su store debe vivir ahí también para que cualquier máquina lo restaure sin
 * depender del disco local. Habilita workers stateless (SCALABILITY-MULTI-SESSION.spec §5/Fase 3).
 *
 * Naturaleza del dato: solo chats + contactos (SIN mensajes) → KB, muy por debajo del límite de
 * 16 MB/doc de Mongo (el veto de §5.3 era con los 84 MB de mensajes, que ya no se guardan). Es
 * un CACHE reconstruible (grupos vía `groupFetchAllParticipating`, contactos vía history-sync),
 * no la fuente de verdad — por eso perderlo no rompe, solo se repuebla al conectar.
 *
 * Formato: 1 doc por sessionId en `whatsapp_store`, `_id = sessionId`. El campo `data` guarda
 * EXACTAMENTE el mismo string que tenía el archivo (`JSON.stringify({ chats, contacts })`) →
 * paridad 1:1 con la persistencia previa y cero problemas de claves BSON (`.`/`$`).
 */
import type { Chat, Contact } from '@whiskeysockets/baileys';
import { getSharedConnection } from '../../database/sharedConnection.js';

const COLLECTION = 'whatsapp_store';

export interface StoreSnapshot {
  chats: Chat[];
  contacts: Contact[];
}

/** Lee el snapshot desde Mongo. `null` si no existe (sesión nueva / aún no persistida). */
export async function loadStoreSnapshot(sessionId: string): Promise<StoreSnapshot | null> {
  const conn = await getSharedConnection();
  const doc = await conn.collection(COLLECTION).findOne({ _id: sessionId } as any);
  if (!doc || typeof (doc as any).data !== 'string') return null;
  const parsed = JSON.parse((doc as any).data);
  return {
    chats: Array.isArray(parsed.chats) ? parsed.chats : [],
    contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
  };
}

/** Persiste (upsert) el snapshot en Mongo. Atómico por sessionId. */
export async function saveStoreSnapshot(
  sessionId: string,
  snapshot: StoreSnapshot
): Promise<void> {
  const conn = await getSharedConnection();
  const data = JSON.stringify({ chats: snapshot.chats, contacts: snapshot.contacts });
  await conn.collection(COLLECTION).updateOne(
    { _id: sessionId } as any,
    { $set: { data, updatedAt: new Date() } },
    { upsert: true }
  );
}

/** Borra el snapshot de una sesión (para clearSession). */
export async function clearStoreSnapshot(sessionId: string): Promise<void> {
  const conn = await getSharedConnection();
  await conn.collection(COLLECTION).deleteOne({ _id: sessionId } as any);
}
