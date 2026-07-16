/**
 * heavyLoad.ts — Control de admisión y rate-limit para rutas de CÓMPUTO pesado
 * (PDF/Puppeteer y ZIP de export). Complementa a `requireTenant` (que ya bloquea
 * el tráfico anónimo en los endpoints de documentos/PDF).
 *
 * Contexto (auditoría jul-2026): el host público de lila expone endpoints que
 * lanzan Chromium (documentos/PDF generate y preview) y arman ZIPs (exports).
 * El `renderLimiter(2)` interno acota la concurrencia,
 * pero su cola es ILIMITADA: un pico (o un flood) hace crecer la memoria y todo
 * se degrada. Estos dos guards ponen el "tope de cola" en la capa HTTP:
 *
 *  - `heavyRequestGuard`: admission control por CAPACIDAD. A lo sumo
 *    HEAVY_MAX_INFLIGHT requests pesados a la vez; el resto recibe 503 +
 *    Retry-After (backpressure) en vez de encolarse sin límite. Aplica a TODOS
 *    (incluido el tráfico autenticado de Portal): es una válvula de memoria, no
 *    de abuso. Acota la cola interna de `renderLimiter` y evita el OOM.
 *
 *  - `heavyRateLimiter`: rate-limit por IP para el tráfico ANÓNIMO (sobre todo
 *    `/api/exports/*`, que es browser-direct por contrato). Exime al tráfico con
 *    credencial de tenant válida (JWT/`lk_fe_`) y a `constroad.com`, para NO
 *    auto-estrangular los llamados server-to-server de Portal (que salen de unas
 *    pocas IPs de egress y compartirían bucket).
 */

import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../../utils/logger.js';
import { hasValidTenantCredential } from './rateLimiter.js';

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

/** Máximo de requests pesados simultáneos antes de responder 503. */
const HEAVY_MAX_INFLIGHT = parsePositiveInt(process.env.HEAVY_MAX_INFLIGHT, 12);

// Contador de admisión compartido por TODAS las rutas pesadas (carga total).
let inFlight = 0;

export const heavyRequestGuard = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (inFlight >= HEAVY_MAX_INFLIGHT) {
    logger.warn('heavyRequestGuard: capacidad saturada → 503', {
      path: req.originalUrl,
      inFlight,
      max: HEAVY_MAX_INFLIGHT,
    });
    res.setHeader('Retry-After', '15');
    res.status(503).json({
      success: false,
      error: {
        message: 'Servidor ocupado generando documentos; reintenta en unos segundos',
        statusCode: 503,
      },
    });
    return;
  }

  inFlight += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    inFlight -= 1;
  };
  // `finish` = respuesta enviada OK; `close` = cliente cortó / error de socket.
  res.on('finish', release);
  res.on('close', release);

  next();
};

const HEAVY_RATE_WINDOW_MS = 5 * 60 * 1000; // 5 min
const HEAVY_RATE_MAX = parsePositiveInt(process.env.HEAVY_RATE_MAX, 40);

/** ¿El request viene del propio Portal (host/origin constroad.com)? */
const isConstroadHostOrOrigin = (req: Request): boolean => {
  const host = (req.hostname || req.get('host') || '').toLowerCase();
  if (host.endsWith('constroad.com')) return true;

  const origin = (req.get('origin') || req.get('referer') || '').toLowerCase();
  if (!origin) return false;
  try {
    return new URL(origin).hostname.endsWith('constroad.com');
  } catch {
    return origin.includes('constroad.com');
  }
};

export const heavyRateLimiter = rateLimit({
  windowMs: HEAVY_RATE_WINDOW_MS,
  max: HEAVY_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiadas solicitudes de generación de documentos; intenta más tarde',
  skip: (req) => hasValidTenantCredential(req) || isConstroadHostOrOrigin(req),
});
