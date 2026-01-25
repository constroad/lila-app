import logger from './logger.js';

export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000,
  multiplier: number = 2
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`);

      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(multiplier, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts: ${lastError?.message}`);
}

export function calculateTypingDelay(text: string): number {
  const wordsPerMinute = 40;
  const words = text.split(' ').length;
  const baseTime = (words / wordsPerMinute) * 60 * 1000;

  // Agregar variabilidad ±20%
  const variability = 0.2;
  const delay = baseTime * (1 + (Math.random() - 0.5) * variability);

  // Limitar entre 1s y 8s
  return Math.min(Math.max(delay, 1000), 8000);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
