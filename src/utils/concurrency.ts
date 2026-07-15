/**
 * Primitivas de concurrencia acotada (sin dependencias).
 *
 * Motivación (incidente PDF jul-2026): `Promise.all` sobre N trabajos pesados
 * (descargas + sharp, o páginas de Puppeteer) satura la CPU de la Mac mini y
 * TODOS los trabajos se vuelven lentos a la vez → timeouts en cascada. Un pool
 * acotado mantiene cada trabajo rápido y el total predecible.
 */

/** Ejecuta `worker` sobre `items` con un pool acotado (no todos a la vez). */
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

export type Limiter = {
  /** Ejecuta `fn` cuando haya un slot libre; encola FIFO si no lo hay. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Trabajos ejecutándose ahora (para logs/diagnóstico). */
  active(): number;
  /** Trabajos esperando slot (para logs/diagnóstico). */
  pending(): number;
};

/**
 * Semáforo simple: a lo sumo `max` trabajos concurrentes; el resto espera FIFO.
 */
export function createLimiter(max: number): Limiter {
  const capacity = Math.max(1, max);
  let running = 0;
  const queue: Array<() => void> = [];

  const release = () => {
    running -= 1;
    const next = queue.shift();
    if (next) next();
  };

  const acquire = (): Promise<void> =>
    new Promise((resolve) => {
      if (running < capacity) {
        running += 1;
        resolve();
        return;
      }
      queue.push(() => {
        running += 1;
        resolve();
      });
    });

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
    active: () => running,
    pending: () => queue.length,
  };
}
