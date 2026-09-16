import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/environment.js';
import type { MiembroDali, RolDali } from './miembros.js';
import { estaSuspendida } from './suspension.js';

/**
 * LA SESIÓN DEL PANEL: un JWT de lila (mismo secreto que `requireTenant`) en
 * una cookie `HttpOnly` de 14 días (spec DALI §2). El `companyId` sale del
 * token verificado y de ningún otro lado (`lila-security` §0). Se acepta
 * también como `Authorization: Bearer` para pruebas con curl.
 */
export const COOKIE_SESION = 'dali_session';
export const DURACION_SESION_S = 14 * 24 * 3600;

export interface SesionDali {
  companyId: string;
  userId: string;
  identity: string;
  name: string;
  role: RolDali;
}

declare module 'express-serve-static-core' {
  interface Request {
    dali?: SesionDali;
  }
}

export const firmarSesion = (miembro: MiembroDali): string =>
  jwt.sign({ companyId: miembro.companyId, userId: miembro.id, identity: miembro.identity, name: miembro.name, role: miembro.role, app: 'dali' }, config.security.jwtSecret, {
    expiresIn: DURACION_SESION_S,
  });

export const leerSesion = (token: string): SesionDali | null => {
  try {
    const d = jwt.verify(token, config.security.jwtSecret) as Record<string, unknown>;
    if (d.app !== 'dali' || typeof d.companyId !== 'string' || typeof d.userId !== 'string') return null;
    return { companyId: d.companyId, userId: d.userId, identity: String(d.identity || ''), name: String(d.name || ''), role: (d.role as RolDali) || 'viewer' };
  } catch {
    return null;
  }
};

const cookieDe = (req: Request, nombre: string): string | undefined => {
  const crudo = req.headers.cookie;
  if (!crudo) return undefined;
  for (const par of crudo.split(';')) {
    const [k, ...v] = par.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return undefined;
};

const tokenDe = (req: Request): string | undefined => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return cookieDe(req, COOKIE_SESION);
};

/** `Set-Cookie` de la sesión; `Secure` solo detrás de https (en desarrollo va por http). */
export const cabeceraCookie = (token: string, segura: boolean): string =>
  [`${COOKIE_SESION}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${DURACION_SESION_S}`, segura ? 'Secure' : ''].filter(Boolean).join('; ');

export const cabeceraCookieBorrada = (): string => `${COOKIE_SESION}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/**
 * Con sesión, y con la empresa sin suspender: una empresa suspendida por el
 * operador (S2) no entra al panel (403 con `motivo: 'suspendida'`); el
 * operador mismo entra siempre. Si Mongo no contesta, la sesión vigente
 * sigue («la ausencia de respuesta no revoca»).
 */
export const requireDaliSession = (req: Request, res: Response, next: NextFunction): void => {
  const token = tokenDe(req);
  const sesion = token ? leerSesion(token) : null;
  if (!sesion) {
    res.status(401).json({ error: 'Sesión requerida' });
    return;
  }
  req.dali = sesion;
  req.companyId = sesion.companyId;
  if (sesion.role === 'operator') {
    next();
    return;
  }
  void estaSuspendida(sesion.companyId)
    .catch(() => false)
    .then((suspendida) => {
      if (suspendida) res.status(403).json({ error: 'La empresa está suspendida', motivo: 'suspendida' });
      else next();
    });
};

/** Solo el operador de la plataforma (rol `operator` en el token) entra a `/admin/*`. */
export const requireDaliOperator = (req: Request, res: Response, next: NextFunction): void => {
  if ((req.dali?.role as string) !== 'operator') {
    res.status(403).json({ error: 'Solo el operador de Dali' });
    return;
  }
  next();
};
