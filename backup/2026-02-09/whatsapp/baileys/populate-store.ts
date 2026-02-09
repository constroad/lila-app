/**
 * Populate Store - Sincronización de grupos con el store
 *
 * Propósito:
 * - Obtener todos los grupos donde participa el bot
 * - Agregar/actualizar metadata de grupos en el store
 * - Cargar últimos mensajes de grupos nuevos
 *
 * Basado en: /Users/josezamora/projects/notifications/src/utils/populateStore.ts
 */

import type { WASocket } from '@whiskeysockets/baileys';
import type { InMemoryStore } from './store.types';
import logger from '../../utils/logger.js';

export async function populateStoreIfEmpty(
  sessionPhone: string,
  sock: WASocket,
  store: InMemoryStore
): Promise<{ success: boolean; groupCount: number; error?: string }> {
  try {
    logger.info(`🔄 Syncing groups for ${sessionPhone}...`);

    // 1. OBTENER TODOS LOS GRUPOS
    const groups = await sock.groupFetchAllParticipating();
    const groupIds = Object.keys(groups);

    logger.info(`📋 Found ${groupIds.length} groups for ${sessionPhone}`);

    // 2. AGREGAR/ACTUALIZAR CADA GRUPO EN EL STORE
    for (const group of Object.values(groups)) {
      const existing = store.chats.get(group.id);

      if (!existing) {
        // Grupo nuevo
        logger.debug(`➕ Adding new group to store: ${group.subject} (${group.id})`);
        store.chats.set(group.id, {
          id: group.id,
          name: group.subject,
          // @ts-ignore - participants puede no estar en el tipo Chat pero funciona
          participants: group.participants ?? [],
        } as any);
      } else {
        // Grupo existente - actualizar nombre si cambió
        if (existing.name !== group.subject) {
          logger.info(`🔄 Updating group name: "${existing.name}" → "${group.subject}" (${group.id})`);
          store.chats.set(group.id, {
            ...existing,
            name: group.subject,
          } as any);
        }
      }
    }

    // 3. AGREGAR CONTACTO DEL USUARIO SI NO EXISTE
    if (sock.user && !store.contacts.has(sock.user.id)) {
      logger.info(`➕ Adding user contact to store: ${sock.user.id}`);
      store.contacts.set(sock.user.id, sock.user);
    }

    // 4. CARGAR ÚLTIMOS 20 MENSAJES POR GRUPO (solo si es nuevo)
    // NOTA: Este paso es opcional y puede ralentizar la sincronización inicial
    // En notifications está comentado/deshabilitado en producción
    /*
    for (const jid of groupIds) {
      try {
        const hasMessages = store.messages.get(jid)?.length > 0;
        if (!hasMessages) {
          // @ts-ignore
          const messages = await sock.loadMessages(jid, 20);
          store.messages.set(jid, messages);
          logger.debug(`📥 Loaded 20 messages for group ${jid}`);
        }
      } catch (err) {
        logger.warn(`⚠️ Could not load messages for ${jid}: ${err}`);
      }
    }
    */

    logger.info(`✅ Synced ${groupIds.length} groups to store for ${sessionPhone}`);

    return {
      success: true,
      groupCount: groupIds.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Error populating store for ${sessionPhone}: ${errorMessage}`);

    return {
      success: false,
      groupCount: 0,
      error: errorMessage,
    };
  }
}
