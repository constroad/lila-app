import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';

/**
 * Headers para llamadas server-to-server lila→Portal (callbacks de dominio:
 * /api/dispatch, /api/dispatch-tracking, /api/input, …). Portal exige prueba de
 * llamador (hardening F0): device de kiosco O este Bearer firmado con el secreto
 * compartido (JWT_SECRET ≡ LILA_APP_JWT_SECRET) cuyo claim `companyId` debe
 * coincidir con el scope. Sin el Bearer, Portal responde 401.
 */
export const buildPortalCallbackHeaders = (
  companyId: string,
  userId = 'lila-callback',
): Record<string, string> => ({
  Authorization: `Bearer ${jwt.sign(
    { companyId, userId, role: 'admin' },
    config.security.jwtSecret,
    { expiresIn: '15m' },
  )}`,
  'Content-Type': 'application/json',
  'x-company-id': companyId,
});
