/**
 * Sesiones WhatsApp LOCAL-ONLY (WHATSAPP_LOCAL_SESSIONS).
 *
 * Un número WhatsApp admite UN solo socket vivo. Normalmente ese socket vive en
 * PROD y dev usa el send-proxy. Para cerrar el E2E completo en local (generar QR,
 * emparejar y enviar con el número de PRUEBAS sin tocar prod) se declara el número
 * en WHATSAPP_LOCAL_SESSIONS:
 *
 * - En DEV: la sesión queda EXENTA del send-proxy y del socket lease → abre socket
 *   local real (QR, pairing, envíos y lecturas locales). El resto sigue proxyado.
 * - En PROD: la sesión queda BLOQUEADA (no se restaura ni se abre): su socket vive
 *   en la máquina dev que la declaró. Sin esta exclusión, un restart de prod
 *   restauraría las creds compartidas de Mongo → guerra 440 contra el dev.
 *
 * La MISMA variable debe estar en ambos env (dev y el launchd de la Mac mini) para
 * que el reparto sea consistente. Sin deps de jwt/quota: importable desde el core
 * Baileys sin acoplarlo al proxy.
 */
import { config } from '../../config/environment.js';

const normalizeSessionId = (value: string): string => String(value || '').replace(/\D/g, '');

/** True si el número está declarado como sesión local-only en el env. */
export function isLocalOnlySession(sessionId: string): boolean {
  const normalized = normalizeSessionId(sessionId);
  // `?? []` defensivo: los tests mockean config parcial sin `localSessions`.
  return Boolean(normalized) && (config.whatsapp.localSessions ?? []).includes(normalized);
}

/** Números declarados local-only (normalizados, puede ser vacío). */
export function listLocalOnlySessions(): string[] {
  return config.whatsapp.localSessions ?? [];
}
