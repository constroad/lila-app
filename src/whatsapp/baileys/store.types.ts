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
  /** Carga el store desde Mongo (migra del archivo legacy la primera vez). */
  load: () => Promise<void>;
  /** Persiste el store en Mongo si hubo cambios (dirty flag). */
  save: () => Promise<void>;
  bind: (ev: any) => void;
  /** Marca el store como modificado para que el próximo save persista. */
  markDirty: () => void;
}
