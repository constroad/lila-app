/**
 * Store Manager - makeInMemoryStore implementation
 *
 * Implementación EXACTA del proyecto notifications que funciona correctamente.
 *
 * Propósito:
 * - Almacenar chats, contactos y mensajes en memoria
 * - Persistir a disco cada 10 segundos
 * - Sincronizar automáticamente con eventos de Baileys
 *
 * Basado en: /Users/josezamora/projects/notifications/src/utils/makeInMemoryStore.ts
 */

import { Contact, Chat } from '@whiskeysockets/baileys';
import type { InMemoryStore, MessageMap } from './store.types';
import logger from '../../utils/logger.js';
import { loadStoreSnapshot, saveStoreSnapshot } from './mongo-store.js';

export function makeInMemoryStore(sessionId: string): InMemoryStore {
  // 🗄️ MAPS EN MEMORIA - Estado local rápido
  const chats = new Map<string, Chat>();
  const contacts = new Map<string, Contact>();
  // `messages` se mantiene por compatibilidad de tipo pero NO se llena ni persiste.
  const messages: MessageMap = new Map();
  // Marca si hubo cambios desde la última persistencia (evita escrituras inútiles).
  let dirty = false;

  // 📖 CARGAR - desde Mongo. Si no hay doc (sesión nueva / recién escaneada) o Mongo está caído,
  // arranca con store VACÍO y se repuebla al conectar (populateStoreIfEmpty + history-sync).
  // No hay lectura de archivos: el store es 100% Mongo (los archivos legacy quedaron obsoletos
  // al desconectar todas las empresas y re-escanear).
  const load = async (): Promise<void> => {
    try {
      const snap = await loadStoreSnapshot(sessionId);
      if (snap) {
        snap.chats.forEach((c) => c && chats.set(c.id, c));
        snap.contacts.forEach((c) => c && contacts.set(c.id, c));
        logger.info(
          `✅ Store cargado de Mongo: ${snap.chats.length} chats, ${snap.contacts.length} contactos (${sessionId})`
        );
      }
    } catch (error) {
      logger.warn(`⚠️ No se pudo cargar store de Mongo para ${sessionId} (arranca vacío): ${error}`);
    }
  };

  // 💾 GUARDAR - a Mongo (async, solo si hubo cambios). Reintenta en el próximo tick si falla.
  const save = async (): Promise<void> => {
    if (!dirty) return;
    dirty = false;
    try {
      await saveStoreSnapshot(sessionId, {
        chats: Array.from(chats.values()),
        contacts: Array.from(contacts.values()),
      });
      logger.debug(
        `💾 Store persistido en Mongo: ${chats.size} chats, ${contacts.size} contactos (${sessionId})`
      );
    } catch (error) {
      dirty = true; // reintentar en el próximo tick
      logger.error(`❌ Error guardando store en Mongo para ${sessionId}: ${error}`);
    }
  };

  // 🔌 BIND A EVENTOS DE BAILEYS - Sincronización automática
  const bind = (ev: any) => {
    // Chats nuevos o actualizados
    ev.on('chats.upsert', (newChats: Chat[]) => {
      newChats.forEach((chat) => {
        chats.set(chat.id, chat);
      });
      dirty = true;
      logger.debug(`📥 Upserted ${newChats.length} chats to store`);
    });

    ev.on('chats.update', (updates: Partial<Chat>[]) => {
      updates.forEach((update) => {
        if (update.id) {
          const existing = chats.get(update.id);
          if (existing) {
            chats.set(update.id, { ...existing, ...update });
            dirty = true;
          }
        }
      });
      logger.debug(`🔄 Updated ${updates.length} chats in store`);
    });

    // Contactos nuevos o actualizados
    ev.on('contacts.upsert', (newContacts: Contact[]) => {
      newContacts.forEach((contact) => {
        contacts.set(contact.id, contact);
      });
      dirty = true;
      logger.debug(`📥 Upserted ${newContacts.length} contacts to store`);
    });

    ev.on('contacts.update', (updates: Partial<Contact>[]) => {
      updates.forEach((update) => {
        if (update.id) {
          const existing = contacts.get(update.id);
          if (existing) {
            contacts.set(update.id, { ...existing, ...update });
            dirty = true;
          }
        }
      });
      logger.debug(`🔄 Updated ${updates.length} contacts in store`);
    });

    // Mensajes entrantes: NO se almacenan (solo enviamos / listamos grupos-contactos).
    // Evita el crecimiento ilimitado del store. Ver SCALABILITY spec §3 (H2).
  };

  /** Marca el store como modificado (para escrituras externas a `bind`, ej: history sync). */
  const markDirty = () => {
    dirty = true;
  };

  return {
    chats,
    contacts,
    messages,
    load,
    save,
    bind,
    markDirty,
  };
}
