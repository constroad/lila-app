import { describe, expect, it } from '@jest/globals';
import { JidRateLimiter } from './jid-rate-limit.js';

describe('JidRateLimiter', () => {
  const T0 = 1_700_000_000_000;

  it('permite hasta el máximo dentro de la ventana y corta el siguiente', () => {
    const limiter = new JidRateLimiter(3, 60_000);
    expect(limiter.isLimited('jid-a', T0)).toBe(false);
    expect(limiter.isLimited('jid-a', T0 + 1_000)).toBe(false);
    expect(limiter.isLimited('jid-a', T0 + 2_000)).toBe(false);
    expect(limiter.isLimited('jid-a', T0 + 3_000)).toBe(true);
  });

  it('vuelve a permitir cuando la ventana expira', () => {
    const limiter = new JidRateLimiter(2, 60_000);
    expect(limiter.isLimited('jid-a', T0)).toBe(false);
    expect(limiter.isLimited('jid-a', T0 + 1_000)).toBe(false);
    expect(limiter.isLimited('jid-a', T0 + 2_000)).toBe(true);
    expect(limiter.isLimited('jid-a', T0 + 61_500)).toBe(false);
  });

  it('cada jid tiene su propio contador', () => {
    const limiter = new JidRateLimiter(1, 60_000);
    expect(limiter.isLimited('jid-a', T0)).toBe(false);
    expect(limiter.isLimited('jid-b', T0)).toBe(false);
    expect(limiter.isLimited('jid-a', T0 + 500)).toBe(true);
    expect(limiter.isLimited('jid-b', T0 + 500)).toBe(true);
  });
});
