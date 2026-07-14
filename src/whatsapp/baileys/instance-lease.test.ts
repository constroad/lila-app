import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals';

// Doc único del lease simulado en memoria con la semántica Mongo que usa el módulo:
// updateOne con $or (holder propio o TTL vencido) e insertOne que E11000 si ya existe.
type LeaseDoc = {
  _id: string;
  holderId: string;
  expiresAt: Date;
  [key: string]: unknown;
};
let leaseDoc: LeaseDoc | null = null;

const fakeCollection = {
  updateOne: jest.fn(
    async (
      filter: { $or: [{ holderId: string }, { expiresAt: { $lt: Date } }] },
      update: { $set: Record<string, unknown> }
    ) => {
      const ownLease = leaseDoc && leaseDoc.holderId === filter.$or[0].holderId;
      const expired = leaseDoc && leaseDoc.expiresAt < filter.$or[1].expiresAt.$lt;
      if (leaseDoc && (ownLease || expired)) {
        leaseDoc = { ...leaseDoc, ...update.$set } as LeaseDoc;
        return { matchedCount: 1 };
      }
      return { matchedCount: 0 };
    }
  ),
  insertOne: jest.fn(async (doc: LeaseDoc) => {
    if (leaseDoc) {
      const err = new Error('E11000 duplicate key') as Error & { code: number };
      err.code = 11000;
      throw err;
    }
    leaseDoc = doc;
  }),
  deleteOne: jest.fn(async (filter: { holderId: string }) => {
    if (leaseDoc && leaseDoc.holderId === filter.holderId) {
      leaseDoc = null;
    }
  }),
};

jest.unstable_mockModule('../../database/sharedConnection.js', () => ({
  __esModule: true,
  getSharedConnection: jest.fn(async () => ({ collection: () => fakeCollection })),
}));

// Config mutable para togglear socketLease por test.
const mutableConfig = {
  nodeEnv: 'test',
  whatsapp: { socketLease: true as boolean },
};
jest.unstable_mockModule('../../config/environment.js', () => ({
  __esModule: true,
  config: mutableConfig,
}));

const sendTelegramAlert = jest.fn(async () => undefined);
jest.unstable_mockModule('../../services/telegram-alert.service.js', () => ({
  __esModule: true,
  sendTelegramAlert,
}));

jest.unstable_mockModule('../../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

type Subject = typeof import('./instance-lease.js');
let subject: Subject;

beforeAll(async () => {
  subject = await import('./instance-lease.js');
});

beforeEach(() => {
  leaseDoc = null;
  mutableConfig.whatsapp.socketLease = true;
  sendTelegramAlert.mockClear();
  fakeCollection.updateOne.mockClear();
  fakeCollection.insertOne.mockClear();
  fakeCollection.deleteOne.mockClear();
  subject.__resetSocketLeaseForTests();
});

describe('tryAcquireSocketLease', () => {
  it('acquires when no lease exists (insert path)', async () => {
    await expect(subject.tryAcquireSocketLease()).resolves.toBe(true);
    expect(leaseDoc?.holderId).toBeTruthy();
  });

  it('renews its own lease on subsequent calls', async () => {
    await subject.tryAcquireSocketLease();
    const firstExpiry = leaseDoc!.expiresAt;

    await expect(subject.tryAcquireSocketLease()).resolves.toBe(true);
    expect(leaseDoc!.expiresAt.getTime()).toBeGreaterThanOrEqual(firstExpiry.getTime());
  });

  it('does NOT acquire when another LIVE instance holds it', async () => {
    leaseDoc = {
      _id: 'whatsapp-socket-owner',
      holderId: 'otra-instancia#999',
      expiresAt: new Date(Date.now() + 60_000),
    };

    await expect(subject.tryAcquireSocketLease()).resolves.toBe(false);
    expect(leaseDoc.holderId).toBe('otra-instancia#999'); // intacto
  });

  it('takes over an EXPIRED lease (failover cuando el holder murió)', async () => {
    leaseDoc = {
      _id: 'whatsapp-socket-owner',
      holderId: 'instancia-muerta#123',
      expiresAt: new Date(Date.now() - 1_000),
    };

    await expect(subject.tryAcquireSocketLease()).resolves.toBe(true);
    expect(leaseDoc.holderId).not.toBe('instancia-muerta#123');
  });
});

describe('startSocketLeaseLoop / hasSocketLease', () => {
  it('holder tras adquirir: hasSocketLease true', async () => {
    const holder = await subject.startSocketLeaseLoop();

    expect(holder).toBe(true);
    expect(subject.hasSocketLease()).toBe(true);
  });

  it('pasivo cuando otra instancia viva lo posee: hasSocketLease false + alerta', async () => {
    leaseDoc = {
      _id: 'whatsapp-socket-owner',
      holderId: 'otra#1',
      expiresAt: new Date(Date.now() + 60_000),
    };

    const holder = await subject.startSocketLeaseLoop();

    expect(holder).toBe(false);
    expect(subject.hasSocketLease()).toBe(false);
    expect(sendTelegramAlert).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: 'socket-lease-passive' })
    );
  });

  it('con el lease deshabilitado por env, hasSocketLease es true sin tocar Mongo', async () => {
    mutableConfig.whatsapp.socketLease = false;

    expect(subject.hasSocketLease()).toBe(true);
    expect(fakeCollection.updateOne).not.toHaveBeenCalled();
  });
});

describe('releaseSocketLease', () => {
  it('borra su propio doc para que el próximo arranque no espere el TTL', async () => {
    await subject.startSocketLeaseLoop();
    expect(leaseDoc).not.toBeNull();

    await subject.releaseSocketLease();

    expect(leaseDoc).toBeNull();
    expect(subject.hasSocketLease()).toBe(false);
  });

  it('no borra el doc de OTRO holder', async () => {
    await subject.startSocketLeaseLoop();
    // Otro proceso se robó el lease (p.ej. tras expiración durante un corte):
    leaseDoc = {
      _id: 'whatsapp-socket-owner',
      holderId: 'otra#2',
      expiresAt: new Date(Date.now() + 60_000),
    };

    await subject.releaseSocketLease();

    expect(leaseDoc?.holderId).toBe('otra#2');
  });
});
