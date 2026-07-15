import { describe, it, expect } from '@jest/globals';
import { mapWithConcurrency, createLimiter } from './concurrency.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  it('procesa TODOS los items sin superar el límite de concurrencia', async () => {
    const seen: number[] = [];
    let active = 0;
    let peak = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await wait(10);
      seen.push(item);
      active -= 1;
    });

    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // sí hubo paralelismo real
  });

  it('tolera límites mayores que la cantidad de items y límite <= 0', async () => {
    const seen: string[] = [];
    await mapWithConcurrency(['a'], 10, async (item) => {
      seen.push(item);
    });
    await mapWithConcurrency(['b'], 0, async (item) => {
      seen.push(item);
    });
    expect(seen).toEqual(['a', 'b']);
  });
});

describe('createLimiter', () => {
  it('nunca ejecuta más de `max` trabajos a la vez y encola el resto', async () => {
    const limiter = createLimiter(2);
    let active = 0;
    let peak = 0;

    const job = () =>
      limiter.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await wait(15);
        active -= 1;
        return 'ok';
      });

    const results = await Promise.all([job(), job(), job(), job(), job()]);

    expect(results).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('libera el slot cuando el trabajo LANZA (no se atasca la cola)', async () => {
    const limiter = createLimiter(1);

    await expect(
      limiter.run(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    // Si el slot no se liberó, esto se colgaría.
    const result = await limiter.run(async () => 'despues-del-error');
    expect(result).toBe('despues-del-error');
    expect(limiter.active()).toBe(0);
    expect(limiter.pending()).toBe(0);
  });
});
