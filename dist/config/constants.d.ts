export declare const TYPING_DELAY: {
    minMs: number;
    maxMs: number;
    wordsPerMinute: number;
};
export declare const CONVERSATION_TIMEOUT: number;
export declare const QR_EXPIRY_TIME: number;
export declare const SERVICE_TYPES: {
    readonly VENTA: "venta";
    readonly COLOCACION: "colocacion";
    readonly TRANSPORTE: "transporte";
    readonly FABRICACION: "fabricacion";
};
export declare const CONVERSATION_STATES: {
    readonly ACTIVE: "active";
    readonly WAITING_HUMAN: "waiting_human";
    readonly CLOSED: "closed";
};
export declare const HTTP_STATUS: {
    readonly OK: 200;
    readonly CREATED: 201;
    readonly BAD_REQUEST: 400;
    readonly UNAUTHORIZED: 401;
    readonly FORBIDDEN: 403;
    readonly NOT_FOUND: 404;
    readonly CONFLICT: 409;
    readonly INTERNAL_ERROR: 500;
    readonly SERVICE_UNAVAILABLE: 503;
};
export declare const CLAUDE_MODEL = "claude-sonnet-4-20250514";
export declare const CLAUDE_MAX_TOKENS = 1024;
