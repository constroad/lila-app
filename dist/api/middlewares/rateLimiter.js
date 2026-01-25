import rateLimit from 'express-rate-limit';
import { config } from '../../config/environment';
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: config.security.rateLimitMax, // límite de 100 requests por ventana
    message: 'Demasiadas solicitudes desde esta IP, intenta más tarde',
    standardHeaders: true, // Retornar información del rate limit en los `RateLimit-*` headers
    legacyHeaders: false, // Deshabilitar los headers `X-RateLimit-*`
    skip: (req) => {
        // No limitar si tiene API key válida
        return req.headers['x-api-key'] === process.env.API_SECRET_KEY;
    },
});
export const sessionLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 5, // máximo 5 conexiones por minuto
    keyGenerator: (req) => {
        return req.body?.phoneNumber || req.ip || 'unknown';
    },
});
export const jobsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 10,
});
export const messageLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 100,
    keyGenerator: (req) => {
        return req.body?.chatId || req.ip || 'unknown';
    },
});
//# sourceMappingURL=rateLimiter.js.map