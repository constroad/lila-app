import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// store.manager persiste en Mongo (mongo-store), sin archivos. Mockeamos mongo-store.
const loadStoreSnapshot = jest.fn(async (_id: string) => null as null | { chats: any[]; contacts: any[] });
const saveStoreSnapshot = jest.fn(async (_id: string, _snap: unknown) => undefined);
const clearStoreSnapshot = jest.fn(async (_id: string) => undefined);

jest.unstable_mockModule('./mongo-store.js', () => ({
  __esModule: true,
  loadStoreSnapshot,
  saveStoreSnapshot,
  clearStoreSnapshot,
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let makeInMemoryStore: typeof import('./store.manager.js').makeInMemoryStore;

beforeEach(async () => {
  jest.resetModules();
  loadStoreSnapshot.mockReset().mockResolvedValue(null);
  saveStoreSnapshot.mockReset().mockResolvedValue(undefined);
  clearStoreSnapshot.mockReset().mockResolvedValue(undefined);
  ({ makeInMemoryStore } = await import('./store.manager.js'));
});

describe('makeInMemoryStore — carga desde Mongo', () => {
  it('hidrata chats/contactos desde el snapshot de Mongo', async () => {
    loadStoreSnapshot.mockResolvedValue({
      chats: [{ id: 'c1' }, { id: 'c2' }],
      contacts: [{ id: 'k1' }],
    });
    const store = makeInMemoryStore('51111111111');
    await store.load();
    expect(store.chats.get('c1')).toEqual({ id: 'c1' });
    expect(store.contacts.get('k1')).toEqual({ id: 'k1' });
  });

  it('arranca vacío cuando Mongo no tiene doc (sesión nueva / recién escaneada)', async () => {
    loadStoreSnapshot.mockResolvedValue(null);
    const store = makeInMemoryStore('51111111111');
    await store.load();
    expect(store.chats.size).toBe(0);
    expect(store.contacts.size).toBe(0);
  });

  it('NO persiste en load si no hubo cambios (dirty=false)', async () => {
    loadStoreSnapshot.mockResolvedValue({ chats: [{ id: 'c1' }], contacts: [] });
    const store = makeInMemoryStore('51111111111');
    await store.load();
    await store.save();
    expect(saveStoreSnapshot).not.toHaveBeenCalled();
  });
});

describe('makeInMemoryStore — persistencia y resiliencia', () => {
  it('persiste en Mongo tras markDirty', async () => {
    const store = makeInMemoryStore('51111111111');
    store.chats.set('c1', { id: 'c1' } as any);
    store.contacts.set('k1', { id: 'k1' } as any);
    store.markDirty();
    await store.save();
    expect(saveStoreSnapshot).toHaveBeenCalledWith('51111111111', {
      chats: [{ id: 'c1' }],
      contacts: [{ id: 'k1' }],
    });
  });

  it('load con Mongo caído arranca vacío y NO lanza', async () => {
    loadStoreSnapshot.mockRejectedValue(new Error('mongo down'));
    const store = makeInMemoryStore('51111111111');
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.chats.size).toBe(0);
  });

  it('save con Mongo caído mantiene dirty y reintenta en el próximo tick', async () => {
    const store = makeInMemoryStore('51111111111');
    store.chats.set('c1', { id: 'c1' } as any);
    store.markDirty();

    saveStoreSnapshot.mockRejectedValueOnce(new Error('mongo down'));
    await store.save(); // falla → dirty debe quedar true
    saveStoreSnapshot.mockResolvedValueOnce(undefined);
    await store.save(); // reintento → escribe

    expect(saveStoreSnapshot).toHaveBeenCalledTimes(2);
  });
});
