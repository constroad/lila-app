export const TYPING_DELAY = {
  minMs: 1000,
  maxMs: 8000,
  wordsPerMinute: 40,
};

export const CONVERSATION_TIMEOUT = 30 * 60 * 1000; // 30 minutos
export const QR_EXPIRY_TIME = 60 * 1000; // 60 segundos

export const SERVICE_TYPES = {
  VENTA: 'venta',
  COLOCACION: 'colocacion',
  TRANSPORTE: 'transporte',
  FABRICACION: 'fabricacion',
} as const;

export const CONVERSATION_STATES = {
  ACTIVE: 'active',
  WAITING_HUMAN: 'waiting_human',
  CLOSED: 'closed',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  REQUEST_TOO_LONG: 413,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
export const CLAUDE_MAX_TOKENS = 1024;
