import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { config } from '../../config/environment.js';

/**
 * Verifica si el request trae una credencial de tenant válida (JWT de Portal o
 * API key `lk_fe_...`). El limiter global por IP es para tráfico anónimo/abuso;
 * el tráfico autenticado server-to-server de Portal (que NO trae `origin`) no debe
 * agotar el bucket por IP — para eso existen los límites por tenant en /message.
 * Ver SCALABILITY-MULTI-SESSION.spec §4.5.
 */
const hasValidTenantCredential = (req: { headers: Record<string, any> }): boolean => {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.slice(7), config.security.jwtSecret) as { companyId?: string };
      if (decoded?.companyId) return true;
    } catch {
      // token inválido → no exime
    }
  }
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.startsWith('lk_fe_')) return true;
  return false;
};

export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: config.security.rateLimitMax, // límite de requests por ventana
  message: 'Demasiadas solicitudes desde esta IP, intenta más tarde',
  standardHeaders: true, // Retornar información del rate limit en los `RateLimit-*` headers
  legacyHeaders: false, // Deshabilitar los headers `X-RateLimit-*`
  skip: (req) => {
    // No limitar si tiene API key global válida
    if (req.headers['x-api-key'] === process.env.API_SECRET_KEY) {
      return true;
    }

    // No limitar tráfico autenticado por tenant (Portal server-to-server con JWT,
    // o consumidores externos con API key `lk_fe_`). El throttling de la acción
    // medida (envío de mensajes) se hace por tenant en sus propias rutas.
    if (hasValidTenantCredential(req)) {
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
  max: config.security.sessionRateMax, // máx conexiones por minuto (env SESSION_RATE_MAX)
  keyGenerator: (req) => {
    return req.body?.phoneNumber || req.ip || 'unknown';
  },
});

export const jobsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: config.security.jobsRateMax, // env JOBS_RATE_MAX
});

export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: config.security.messageRateMax, // env MESSAGE_RATE_MAX
  keyGenerator: (req) => {
    return req.body?.chatId || req.ip || 'unknown';
  },
});
