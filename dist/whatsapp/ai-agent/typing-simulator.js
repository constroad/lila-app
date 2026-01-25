import { calculateTypingDelay, delay } from '../../utils/retry';
import logger from '../../utils/logger';
export class TypingSimulator {
    /**
     * Simula el tiempo que tardaría una persona escribiendo el texto
     * @param text Texto a "escribir"
     * @returns Promesa que se resuelve después del tiempo simulado
     */
    async simulateTyping(text) {
        const delayMs = calculateTypingDelay(text);
        logger.debug(`Simulating typing delay: ${delayMs}ms for ${text.length} chars`);
        await delay(delayMs);
    }
    /**
     * Calcula el delay de escritura sin esperar
     * @param text Texto a evaluar
     * @returns Delay en milisegundos
     */
    getTypingDelay(text) {
        return calculateTypingDelay(text);
    }
}
export default new TypingSimulator();
//# sourceMappingURL=typing-simulator.js.map