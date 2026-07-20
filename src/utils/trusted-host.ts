/**
 * Match exacto de host/subdominio confiable — NO usar `.endsWith(suffix)` para
 * esto: "evilconstroad.com".endsWith("constroad.com") es `true` en JS. Un
 * atacante controla libremente el header `Host`/`Origin`/`Referer` en un
 * request crudo (curl/Python no está sujeto a same-origin policy), así que ese
 * bug permitía bypasear a la vez el allowlist de CORS y ambos rate limiters
 * (ver `index.ts`, `rateLimiter.ts`, `heavyLoad.ts`) con un solo header falso.
 */
export function isTrustedHost(hostname: string, rootDomain: string): boolean {
  const host = hostname.toLowerCase();
  const root = rootDomain.toLowerCase();
  return host === root || host.endsWith(`.${root}`);
}
