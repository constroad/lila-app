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

import fs from 'fs-extra';
import path from 'path';
import { Contact, Chat } from '@whiskeysockets/baileys';
import type { InMemoryStore, MessageMap } from './store.types';
import logger from '../../utils/logger.js';

export function makeInMemoryStore(filePath: string): InMemoryStore {
  // 🗄️ MAPS EN MEMORIA - Estado local rápido
  const chats = new Map<string, Chat>();
  const contacts = new Map<string, Contact>();
  // `messages` se mantiene por compatibilidad de tipo pero NO se llena ni persiste.
  const messages: MessageMap = new Map();
  // Marca si hubo cambios desde la última persistencia (evita escrituras inútiles).
  let dirty = false;

  // 📖 CARGAR DESDE DISCO - Al iniciar
  const readFromFile = () => {
    if (!fs.existsSync(filePath)) {
      logger.debug(`⚠️ Store file not found: ${filePath}, will create on first write`);
      return;
    }

    try {
      const json = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(json);

      // Hidratar Maps desde JSON
      if (data.chats) {
        data.chats.forEach((c: Chat) => chats.set(c.id, c));
        logger.info(`✅ Loaded ${data.chats.length} chats from store: ${filePath}`);
      }

      if (data.contacts) {
        data.contacts.forEach((c: Contact) => contacts.set(c.id, c));
        logger.info(`✅ Loaded ${data.contacts.length} contacts from store: ${filePath}`);
      }

      // NOTA: los mensajes ya NO se cargan ni persisten (ver writeToFile). Solo
      // necesitamos chats/contactos/grupos para enviar y listar. Esto evita el
      // crecimiento ilimitado del store (medido en 84 MB). Ver
      // specs/SCALABILITY-MULTI-SESSION.spec §3 (H2) y §5.
    } catch (error) {
      logger.error(`❌ Error reading store file ${filePath}: ${error}`);
    }
  };

  // 💾 GUARDAR A DISCO - async + atómico (tmp+rename), sin pretty-print, sin mensajes.
  // No bloquea el event loop (antes era writeFileSync de ~84 MB cada 10 s). Solo
  // escribe si hubo cambios desde la última persistencia (dirty flag).
  const writeToFile = async (): Promise<void> => {
    if (!dirty) return;
    dirty = false;
    try {
      const dir = path.dirname(filePath);
      await fs.ensureDir(dir);

      const data = {
        chats: Array.from(chats.values()),
        contacts: Array.from(contacts.values()),
      };

      const tmpPath = `${filePath}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(data));
      await fs.rename(tmpPath, filePath);
      logger.debug(`💾 Store persisted: ${chats.size} chats, ${contacts.size} contacts → ${filePath}`);
    } catch (error) {
      dirty = true; // reintentar en el próximo tick
      logger.error(`❌ Error writing store file ${filePath}: ${error}`);
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
    readFromFile,
    writeToFile,
    bind,
    markDirty,
  };
}
