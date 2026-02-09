/**
 * Store Types - Estructura de datos para makeInMemoryStore
 *
 * Basado en: /Users/josezamora/projects/notifications/src/utils/makeInMemoryStore.ts
 */

import type { WAMessage, Contact, Chat } from '@whiskeysockets/baileys';

export type MessageMap = Map<string, WAMessage[]>;

export interface InMemoryStore {
  chats: Map<string, Chat>;
  contacts: Map<string, Contact>;
  messages: MessageMap;
  readFromFile: () => void;
  writeToFile: () => void;
  bind: (ev: any) => void;
}
