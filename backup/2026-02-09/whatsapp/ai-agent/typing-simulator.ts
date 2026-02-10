import { calculateTypingDelay, delay } from '../../utils/retry.js';
import logger from '../../utils/logger.js';

export class TypingSimulator {
  /**
   * Simula el tiempo que tardaría una persona escribiendo el texto
   * @param text Texto a "escribir"
   * @returns Promesa que se resuelve después del tiempo simulado
   */
  async simulateTyping(text: string): Promise<void> {
    const delayMs = calculateTypingDelay(text);
    logger.debug(`Simulating typing delay: ${delayMs}ms for ${text.length} chars`);
    await delay(delayMs);
  }

  /**
   * Calcula el delay de escritura sin esperar
   * @param text Texto a evaluar
   * @returns Delay en milisegundos
   */
  getTypingDelay(text: string): number {
    return calculateTypingDelay(text);
  }
}

export default new TypingSimulator();
