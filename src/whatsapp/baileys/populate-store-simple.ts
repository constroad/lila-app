/**
 * 📦 Populate Store from WhatsApp (EXACT copy from notifications)
 *
 * This syncs groups from WhatsApp to the in-memory store.
 */

import { WASocket } from '@whiskeysockets/baileys';
import { getStore } from './sessions.simple.js';
import logger from '../../utils/logger.js';

export const populateStoreIfEmpty = async (id: string, sock: WASocket) => {
  const store = getStore(id);

  try {
    // 1. Get all groups where bot is member
    const groups = await sock.groupFetchAllParticipating();
    const groupIds = Object.keys(groups);

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
