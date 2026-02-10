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
import { WAMessage, Contact, Chat } from '@whiskeysockets/baileys';
import type { InMemoryStore, MessageMap } from './store.types';
import logger from '../../utils/logger.js';

export function makeInMemoryStore(filePath: string): InMemoryStore {
  // 🗄️ MAPS EN MEMORIA - Estado local rápido
  const chats = new Map<string, Chat>();
  const contacts = new Map<string, Contact>();
  const messages: MessageMap = new Map();

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

      if (data.messages) {
        Object.entries(data.messages).forEach(([jid, msgs]: [string, any]) => {
          messages.set(jid, msgs as WAMessage[]);
        });
        logger.info(`✅ Loaded messages for ${Object.keys(data.messages).length} chats`);
      }
    } catch (error) {
      logger.error(`❌ Error reading store file ${filePath}: ${error}`);
    }
  };

  // 💾 GUARDAR A DISCO - Cada 10 segundos
  const writeToFile = () => {
    try {
      // Asegurar que el directorio existe
      const dir = path.dirname(filePath);
      fs.ensureDirSync(dir);

      const data = {
        chats: Array.from(chats.values()),
        contacts: Array.from(contacts.values()),
        messages: Object.fromEntries(messages),
      };

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      logger.debug(`💾 Store persisted: ${chats.size} chats, ${contacts.size} contacts → ${filePath}`);
    } catch (error) {
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
      logger.debug(`📥 Upserted ${newChats.length} chats to store`);
    });

    ev.on('chats.update', (updates: Partial<Chat>[]) => {
      updates.forEach((update) => {
        if (update.id) {
          const existing = chats.get(update.id);
          if (existing) {
            chats.set(update.id, { ...existing, ...update });
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
      logger.debug(`📥 Upserted ${newContacts.length} contacts to store`);
    });

    ev.on('contacts.update', (updates: Partial<Contact>[]) => {
      updates.forEach((update) => {
        if (update.id) {
          const existing = contacts.get(update.id);
          if (existing) {
            contacts.set(update.id, { ...existing, ...update });
          }
        }
      });
      logger.debug(`🔄 Updated ${updates.length} contacts in store`);
    });

    // Mensajes entrantes
    ev.on('messages.upsert', ({ messages: msgs }: { messages: WAMessage[] }) => {
      msgs.forEach((msg) => {
        const jid = msg.key.remoteJid!;
        if (!messages.has(jid)) {
          messages.set(jid, []);
        }
        const list = messages.get(jid)!;
        list.push(msg);
        messages.set(jid, list);
      });
      logger.debug(`📨 Received ${msgs.length} messages`);
    });
  };

  return {
    chats,
    contacts,
    messages,
    readFromFile,
    writeToFile,
    bind,
  };
}
