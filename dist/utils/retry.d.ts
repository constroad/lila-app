export declare function retry<T>(fn: () => Promise<T>, maxAttempts?: number, delayMs?: number, multiplier?: number): Promise<T>;
export declare function calculateTypingDelay(text: string): number;
export declare function delay(ms: number): Promise<void>;
