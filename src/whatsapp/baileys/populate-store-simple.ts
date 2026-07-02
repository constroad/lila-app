/**
 * 📦 Populate Store from WhatsApp (EXACT copy from notifications)
 *
 * This syncs groups from WhatsApp to the in-memory store.
 */

import { WASocket } from '@whiskeysockets/baileys';
import { getStore } from './sessions.simple.js';
import logger from '../../utils/logger.js';

// Cooldown entre llamadas a groupFetchAllParticipating por sesión.
// Previene rate-limit de WhatsApp en loops de reconexión (ej. guerra 440).
const POPULATE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos
const lastPopulatedAt = new Map<string, number>();

/** Limpia el cooldown de una sesión (llamar en clearSession). */
export const clearPopulateCooldown = (id: string): void => {
  lastPopulatedAt.delete(id);
};

export const populateStoreIfEmpty = async (id: string, sock: WASocket) => {
  const store = getStore(id);

  // Cooldown: si se llamó hace menos de 5 min, saltar la llamada a WhatsApp.
  // Esto evita el rate-limit durante loops de reconexión (ej. guerra 440 donde
  // connect→kick ocurre cada 3s y `groupFetchAllParticipating` se disparaba en cada intento).
  const last = lastPopulatedAt.get(id);
  if (last !== undefined && Date.now() - last < POPULATE_COOLDOWN_MS) {
    const remaining = Math.round((POPULATE_COOLDOWN_MS - (Date.now() - last)) / 1000);
    logger.info(`⏭ populateStore ${id}: cooldown activo, saltando API call (${remaining}s restantes)`);
    return { success: true, groupCount: store.chats.size, skipped: true };
  }

  try {
    // 1. Get all groups where bot is member (fuente AUTORITATIVA: solo los grupos a
    //    los que la cuenta conectada pertenece AHORA).
    const groups = await sock.groupFetchAllParticipating();
    const groupIds = Object.keys(groups);

    // 1b. Reconciliar: quitar del store los grupos `@g.us` que YA NO están en la lista
    //     autoritativa. Sin esto, los grupos quedaban "pegados" (de un emparejamiento
    //     anterior, history-sync, o tras salir del grupo) y la UI mostraba grupos que no
    //     pertenecen al número conectado. El store es cache → debe reflejar la cuenta real.
    const authoritativeIds = new Set(groupIds);
    let removed = 0;
    for (const chatId of Array.from(store.chats.keys())) {
      if (chatId.endsWith('@g.us') && !authoritativeIds.has(chatId)) {
        store.chats.delete(chatId);
        removed += 1;
      }
    }
    if (removed > 0) {
      logger.info(`🧹 Removed ${removed} stale group(s) from store (no longer participating)`);
    }

    // 2. Add/update groups in store.chats
    for (const group of Object.values(groups)) {
      const existing = store.chats.get(group.id);

      if (!existing) {
        logger.info(`➕ Adding new group to store: ${group.subject} (${group.id})`);
        store.chats.set(group.id, {
          id: group.id,
          name: group.subject,
          participants: group.participants ?? [],
        } as any);
      } else {
        // Update group name if changed
        if (existing.name !== group.subject) {
          logger.info(`🔄 Updating group name in store: ${existing.name} → ${group.subject}`);
          store.chats.set(group.id, {
            ...existing,
            name: group.subject,
            participants: group.participants ?? [],
          } as any);
        }
      }
    }

    // 3. Add user contact if not exists
    if (sock.user && !store.contacts.has(sock.user.id)) {
      store.contacts.set(sock.user.id, sock.user);
    }

    // 4. Load last 20 messages per group
    // NOTE: sock.loadMessages() doesn't exist in current Baileys version
    // Messages are synced automatically via 'messaging-history.set' event
    // So this section is commented out to avoid errors
    /*
    for (const jid of groupIds) {
      try {
        const hasMessages = store.messages.get(jid)?.length > 0;
        if (!hasMessages) {
          const messages = await sock.loadMessages(jid, 20);
          if (store.insertMessages) {
            store.insertMessages(jid, messages);
          } else {
            store.messages.set(jid, messages);
          }
        }
      } catch (err) {
        logger.warn(`⚠️ Could not load messages for ${jid}:`, err);
      }
    }
    */

    store.markDirty();
    lastPopulatedAt.set(id, Date.now());
    logger.info(`✅ Synced ${Object.keys(groups).length} groups to store`);
    return {
      success: true,
      groupCount: Object.keys(groups).length,
    };
  } catch (err) {
    logger.error('❌ Error populating store from groupFetchAllParticipating:', err);
    return {
      success: false,
      groupCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
