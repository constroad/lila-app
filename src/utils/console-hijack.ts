/**
 * 🛡️ CRITICAL SECURITY: Console Hijacking for Signal Protocol Session Redaction
 *
 * This module MUST be imported FIRST in the application entry point (index.ts)
 * to intercept console.log/error calls BEFORE Baileys library is loaded.
 *
 * Purpose: Prevent accidental logging of Signal Protocol cryptographic material
 * (SessionEntry objects containing private keys, chain keys, etc.)
 */

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

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
 * Hijack console.log to prevent SessionEntry logging
 */
console.log = (...args: any[]) => {
  const { sanitized, mutated } = sanitizeConsoleArgs(args);
  const message = sanitized.join(' ');

  // Filter out noisy Signal Protocol messages that pollute logs
  if (
    message.includes('Closing open session in favor of') ||
    message.includes('Closing session: SessionEntry') ||
    message.includes('_chains:') ||
    message.includes('registrationId:') ||
    message.includes('currentRatchet:') ||
    message.includes('indexInfo:') ||
    message.includes('pendingPreKey:') ||
    signalDecryptErrorPatterns.some((pattern) => message.includes(pattern))
  ) {
    // Silently drop these messages
    return;
  }

  // Log sanitized or original args
  originalConsoleLog.apply(console, mutated ? sanitized : args);
};

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
