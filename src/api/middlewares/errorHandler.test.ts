import { describe, it, expect, jest, afterEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { validateApiKey } from './errorHandler.js';

const makeReq = (headers: Record<string, string | undefined> = {}): Request =>
  ({ headers } as unknown as Request);

const makeRes = (): Response => ({} as Response);

describe('validateApiKey', () => {
  const ORIGINAL_KEY = process.env.API_SECRET_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.API_SECRET_KEY;
    } else {
      process.env.API_SECRET_KEY = ORIGINAL_KEY;
    }
  });

  it('rejects when API_SECRET_KEY is unset (fail-closed)', () => {
    delete process.env.API_SECRET_KEY;
    const next = jest.fn() as NextFunction;
    validateApiKey(makeReq({ 'x-api-key': 'anything' }), makeRes(), next);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(401);
  });

  it('rejects when header missing', () => {
    process.env.API_SECRET_KEY = 'expected';
    const next = jest.fn() as NextFunction;
    validateApiKey(makeReq(), makeRes(), next);
    expect((next as jest.Mock).mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  it('rejects on header mismatch', () => {
    process.env.API_SECRET_KEY = 'expected';
    const next = jest.fn() as NextFunction;
    validateApiKey(makeReq({ 'x-api-key': 'wrong' }), makeRes(), next);
    expect((next as jest.Mock).mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  it('passes through when header matches', () => {
    process.env.API_SECRET_KEY = 'expected';
    const next = jest.fn() as NextFunction;
    validateApiKey(makeReq({ 'x-api-key': 'expected' }), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects empty-string header even if env is empty', () => {
    process.env.API_SECRET_KEY = '';
    const next = jest.fn() as NextFunction;
    validateApiKey(makeReq({ 'x-api-key': '' }), makeRes(), next);
    expect((next as jest.Mock).mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });
});
