import rateLimit from 'express-rate-limit';
import { config } from '../../config/environment.js';

export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: config.security.rateLimitMax, // límite de requests por ventana
  message: 'Demasiadas solicitudes desde esta IP, intenta más tarde',
  standardHeaders: true, // Retornar información del rate limit en los `RateLimit-*` headers
  legacyHeaders: false, // Deshabilitar los headers `X-RateLimit-*`
  skip: (req) => {
    // No limitar si tiene API key válida
    if (req.headers['x-api-key'] === process.env.API_SECRET_KEY) {
      return true;
    }

    const host = (req.hostname || req.get('host') || '').toLowerCase();
    if (host.endsWith('constroad.com') || host === 'localhost:3000') {
      return true;
    }

    const origin = (req.get('origin') || req.get('referer') || '').toLowerCase();
    if (!origin) {
      return false;
    }

    try {
      const parsed = new URL(origin);
      return (
        parsed.hostname.endsWith('constroad.com') ||
        (parsed.hostname === 'localhost' && parsed.port === '3000')
      );
    } catch {
      return origin.includes('constroad.com') || origin.includes('localhost:3000');
    }
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
