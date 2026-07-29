/**
 * 🛡️ CRITICAL SECURITY: Console Hijacking for Signal Protocol Session Redaction
 *
 * This module MUST be imported FIRST in the application entry point (index.ts)
 * to intercept console.log/error calls BEFORE Baileys library is loaded.
 *
 * Purpose: Prevent accidental logging of Signal Protocol cryptographic material
 * (SessionEntry objects containing private keys, chain keys, etc.)
 */

// Referencias originales de CADA método. `console.info`/`warn`/`debug` NO son alias
// vivos de `console.log`: Node les asigna la misma función, pero son propiedades
// independientes. Reasignar solo `console.log` deja `console.info` apuntando al
// original → todo lo que se loggee por ahí se salta el filtro (ver más abajo).
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleDebug = console.debug;

// Patterns to detect and silence Signal Protocol decrypt errors
const signalDecryptErrorPatterns = [
  'Bad MAC',
  'Session error: Error: Bad MAC',
  'Session error:Error: Bad MAC',
  'Failed to decrypt message with any known session',
  'MessageCounterError: Key used already or never filled',
  'MessageCounterError',
];

// Global handler for Signal decrypt errors (can be set by ConnectionManager)
let signalDecryptErrorHandler: ((payload: { message: string; stack?: string }) => void) | null =
  null;

/**
 * Set a handler for Signal Protocol decrypt errors
 * This allows ConnectionManager to handle these errors appropriately
 */
export function setSignalDecryptErrorHandler(
  handler: ((payload: { message: string; stack?: string }) => void) | null
): void {
  signalDecryptErrorHandler = handler;
}

/**
 * Detect if a value is a Signal Protocol SessionEntry object
 * These objects contain sensitive cryptographic material that should never be logged
 */
function isSignalSessionEntry(value: any): boolean {
  if (!value || typeof value !== 'object') return false;

  // SessionEntry objects have these characteristic properties
  const hasChains = '_chains' in value;
  const hasRatchet = 'currentRatchet' in value;
  const hasIndexInfo = 'indexInfo' in value;
  const hasRegistrationId = 'registrationId' in value;

  // Any combination of these indicates a SessionEntry
  return (
    (hasChains && hasRatchet) ||
    (hasChains && hasIndexInfo) ||
    (hasRatchet && hasIndexInfo) ||
    (hasChains && hasRegistrationId)
  );
}

/**
 * Detect if a value contains Buffer objects (which may contain keys)
 */
function hasBufferObjects(value: any): boolean {
  if (!value || typeof value !== 'object') return false;

  // Check if value itself is a Buffer
  if (Buffer.isBuffer(value)) return true;

  // Check nested objects
  try {
    const str = JSON.stringify(value);
    return str.includes('"type":"Buffer"') || str.includes('Buffer<');
  } catch {
    return false;
  }
}

/**
 * Sanitize console arguments to prevent SessionEntry logging
 */
function sanitizeConsoleArgs(args: any[]): { sanitized: any[]; mutated: boolean } {
  let mutated = false;

  const sanitized = args.map((arg) => {
    // Redact SessionEntry objects
    if (isSignalSessionEntry(arg)) {
      mutated = true;
      return '[REDACTED: Signal Protocol Session Entry]';
    }

    // Redact objects containing Buffer keys
    if (hasBufferObjects(arg)) {
      mutated = true;
      return '[REDACTED: Object with cryptographic buffers]';
    }

    return arg;
  });

  return { sanitized, mutated };
}

/**
 * Extract error payload from console.error arguments
 */
function extractConsoleErrorPayload(args: any[]): { message: string; stack?: string } {
  let message = '';
  let stack: string | undefined;

  for (const arg of args) {
    if (arg instanceof Error) {
      message = message ? `${message} ${arg.message}` : arg.message;
      stack = stack || arg.stack;
      continue;
    }
    if (typeof arg === 'string') {
      message = message ? `${message} ${arg}` : arg;
      continue;
    }
    if (arg && typeof arg === 'object') {
      const maybeMessage = (arg as { message?: unknown }).message;
      if (typeof maybeMessage === 'string') {
        message = message ? `${message} ${maybeMessage}` : maybeMessage;
      }
    }
  }

  return {
    message: message.trim(),
    stack,
  };
}

/**
 * True si algún argumento es un objeto con forma de SessionEntry de libsignal
 * (ratchet/chains/keys). libsignal loggea con `console.log("Closing session:", obj)`
 * pasando el objeto como argumento SEPARADO; `args.join(' ')` lo vuelve
 * "[object Object]" y los `.includes()` de texto NO lo detectan → el volcado
 * (incluidas claves privadas `privKey`) se filtraba al log de prod. Detectarlo
 * por sus keys cierra esa fuga.
 */
const SIGNAL_OBJECT_KEYS = ['_chains', 'currentRatchet', 'registrationId', 'indexInfo', 'pendingPreKey'];
function hasSignalSessionObject(args: any[]): boolean {
  return args.some((arg) => {
    if (!arg || typeof arg !== 'object') return false;
    if ((arg.constructor?.name ?? '') === 'SessionEntry') return true;
    return SIGNAL_OBJECT_KEYS.some((key) => key in arg);
  });
}

/** True si el mensaje/args son material Signal que nunca debe llegar al log. */
export function isSignalNoise(args: any[], message: string): boolean {
  return (
    hasSignalSessionObject(args) ||
    message.includes('Closing open session in favor of') ||
    message.includes('Closing session: SessionEntry') ||
    message.includes('_chains:') ||
    message.includes('registrationId:') ||
    message.includes('currentRatchet:') ||
    message.includes('indexInfo:') ||
    message.includes('pendingPreKey:') ||
    signalDecryptErrorPatterns.some((pattern) => message.includes(pattern))
  );
}

/**
 * Envuelve un método de consola con el filtro de material Signal.
 *
 * Se aplica a TODOS los métodos que escriben a stdout, no solo a `console.log`:
 * libsignal loggea con `console.info("Closing session:", session)`
 * (node_modules/libsignal/src/session_record.js), y como `console.info` es una
 * propiedad independiente, hijackear solo `console.log` lo dejaba pasar — 1396
 * volcados de SessionEntry con `privKey`/`rootKey`/`chainKey` en claro llegaron al
 * log de producción entre may-2026 y jul-2026 por esta vía.
 */
function withSignalFilter(original: (...args: any[]) => void) {
  return (...args: any[]) => {
    const { sanitized, mutated } = sanitizeConsoleArgs(args);
    const message = sanitized.join(' ');
    if (isSignalNoise(args, message)) return; // Silently drop
    original.apply(console, mutated ? sanitized : args);
  };
}

console.log = withSignalFilter(originalConsoleLog);
console.info = withSignalFilter(originalConsoleInfo);
console.warn = withSignalFilter(originalConsoleWarn);
console.debug = withSignalFilter(originalConsoleDebug);

/**
 * Hijack console.error to handle Signal decrypt errors and prevent SessionEntry logging
 */
console.error = (...args: any[]) => {
  const { sanitized, mutated } = sanitizeConsoleArgs(args);
  const payload = extractConsoleErrorPayload(mutated ? sanitized : args);

  // Check if this is a Signal Protocol decrypt error
  if (signalDecryptErrorPatterns.some((pattern) => payload.message.includes(pattern))) {
    // Forward to handler if registered (ConnectionManager handles cleanup)
    signalDecryptErrorHandler?.(payload);
    // Don't log these errors to console
    return;
  }

  // Log sanitized or original args
  originalConsoleError.apply(console, mutated ? sanitized : args);
};

// Log that hijacking is active
originalConsoleLog('🛡️ Console hijacking activated - Signal Protocol sessions will be redacted');
