import logger from './logger';
export async function retry(fn, maxAttempts = 3, delayMs = 1000, multiplier = 2) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            logger.warn(`Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`);
            if (attempt < maxAttempts) {
                const delay = delayMs * Math.pow(multiplier, attempt - 1);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw new Error(`Failed after ${maxAttempts} attempts: ${lastError?.message}`);
}
export function calculateTypingDelay(text) {
    const wordsPerMinute = 40;
    const words = text.split(' ').length;
    const baseTime = (words / wordsPerMinute) * 60 * 1000;
    // Agregar variabilidad ±20%
    const variability = 0.2;
    const delay = baseTime * (1 + (Math.random() - 0.5) * variability);
    // Limitar entre 1s y 8s
    return Math.min(Math.max(delay, 1000), 8000);
}
export function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=retry.js.map