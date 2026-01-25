export declare class TypingSimulator {
    /**
     * Simula el tiempo que tardaría una persona escribiendo el texto
     * @param text Texto a "escribir"
     * @returns Promesa que se resuelve después del tiempo simulado
     */
    simulateTyping(text: string): Promise<void>;
    /**
     * Calcula el delay de escritura sin esperar
     * @param text Texto a evaluar
     * @returns Delay en milisegundos
     */
    getTypingDelay(text: string): number;
}
declare const _default: TypingSimulator;
export default _default;
