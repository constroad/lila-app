import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

// El guard consulta quota-validator para saber qué companies usan un sender.
const listCompaniesByWhatsappSender = jest.fn(async (_s: string) => [] as { companyId: string }[]);

jest.unstable_mockModule('../services/quota-validator.service.js', () => ({
  __esModule: true,
  quotaValidatorService: { listCompaniesByWhatsappSender },
}));

jest.unstable_mockModule('../config/environment.js', () => ({
  __esModule: true,
  config: { nodeEnv: 'test', security: { jwtSecret: 'x' }, whatsapp: { rlsEnforce: false } },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../database/models.js', () => ({
  __esModule: true,
  getCompanyModel: jest.fn(),
}));

const loadGuard = async () =>
  (await import('./tenant.middleware.js')).guardSharedSenderDestructive;

const run = async (
  guard: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Partial<Request>
) => {
  const next = jest.fn();
  await guard(req as Request, {} as Response, next as unknown as NextFunction);
  return next;
};

const owners = (...ids: string[]) => ids.map((companyId) => ({ companyId }));

describe('guardSharedSenderDestructive', () => {
  beforeEach(() => {
    jest.resetModules();
    listCompaniesByWhatsappSender.mockReset();
    listCompaniesByWhatsappSender.mockResolvedValue([]);
  });

  it('passes through when there is no companyId (global secret / admin)', async () => {
    const guard = await loadGuard();
    const next = await run(guard, { params: { phoneNumber: '51949376824' }, body: {} });
    expect(next).toHaveBeenCalledWith();
    expect(listCompaniesByWhatsappSender).not.toHaveBeenCalled();
  });

  it('BLOCKS (409) a shared sender used by >1 company without force', async () => {
    listCompaniesByWhatsappSender.mockResolvedValue(owners('globofas-s8k', 'constroad'));
    const guard = await loadGuard();
    const next = await run(guard, {
      companyId: 'globofas-s8k',
      params: { phoneNumber: '51949376824' },
      body: {},
    });
    const err = next.mock.calls[0][0] as { statusCode?: number };
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(409);
  });

  it('ALLOWS a shared sender when force:true', async () => {
    listCompaniesByWhatsappSender.mockResolvedValue(owners('globofas-s8k', 'constroad'));
    const guard = await loadGuard();
    const next = await run(guard, {
      companyId: 'globofas-s8k',
      params: { phoneNumber: '51949376824' },
      body: { force: true },
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('ALLOWS when the single owner is the authenticated tenant', async () => {
    listCompaniesByWhatsappSender.mockResolvedValue(owners('constroad'));
    const guard = await loadGuard();
    const next = await run(guard, {
      companyId: 'constroad',
      params: { phoneNumber: '51902049935' },
      body: {},
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('BLOCKS (403) when the sender belongs to a different single company', async () => {
    listCompaniesByWhatsappSender.mockResolvedValue(owners('constroad'));
    const guard = await loadGuard();
    const next = await run(guard, {
      companyId: 'globofas-s8k',
      params: { phoneNumber: '51902049935' },
      body: {},
    });
    const err = next.mock.calls[0][0] as { statusCode?: number };
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(403);
  });

  it('fails open (does not block) when the lookup throws', async () => {
    listCompaniesByWhatsappSender.mockRejectedValue(new Error('mongo down'));
    const guard = await loadGuard();
    const next = await run(guard, {
      companyId: 'globofas-s8k',
      params: { phoneNumber: '51949376824' },
      body: {},
    });
    expect(next).toHaveBeenCalledWith();
  });
});
