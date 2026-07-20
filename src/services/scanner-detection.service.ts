/**
 * Detección de escaneo automatizado (nuclei/gobuster/etc.) por comportamiento, no
 * por lista de paths conocidos: cualquier IP que acumule muchos 404/CORS-reject en
 * poco tiempo es tratada como scanner, sin importar qué wordlist use. lila-app se
 * expone vía Tailscale Funnel (sin Cloudflare/WAF por delante), así que este es el
 * único punto donde se puede agrupar la alerta y contener al atacante.
 *
 * El dedupe de 5 min de `sendTelegramAlert` (misma key por IP) ya evita re-alertar
 * en cada request; no se duplica esa lógica aquí.
 *
 * Señal de alta confianza (2026-07-19, post-incidente): un path como
 * `.env.production`, `wp-config.php` o `_ignition/execute-solution` NUNCA es
 * legítimo en esta app — no hay que esperar el umbral genérico de volumen para
 * sospechar. Esos paths pesan como si ya hubieran cruzado el umbral, así que
 * alertan desde el PRIMER hit; el 404 genérico (typo, favicon.ico, bot benigno)
 * sigue necesitando volumen antes de alertar.
 */
import { sendTelegramAlert } from './telegram-alert.service.js';
import logger from '../utils/logger.js';

const WINDOW_MS = 5 * 60 * 1000;
const ALERT_THRESHOLD = 5;
const BAN_THRESHOLD = 40;
const BAN_DURATION_MS = 30 * 60 * 1000;
// Cap duro: ante un scan distribuido (muchas IPs distintas) el Map no debe crecer
// sin límite. Se descarta la entrada más vieja al llegar al tope.
const MAX_TRACKED_IPS = 5000;

// Paths que ningún cliente legítimo de esta API pediría jamás (credential/config
// leak scanners, paneles PHP/Laravel que no existen aquí, etc.). Un solo hit ya
// es señal de ataque, no de tráfico ambiguo.
const HIGH_CONFIDENCE_PROBE_PATTERNS: RegExp[] = [
  /\.env(\.|$)/i,
  /^\/\.git(\/|$)/i,
  /^\/\.aws(\/|$)/i,
  /wp-config\.php/i,
  /_ignition\//i,
  /\.sql$/i,
  /\.php$/i, // esta app no corre PHP: cualquier .php es 100% ruido de scanner
  /smtp[_.-]?(backup|log)/i,
  /\.procmailrc/i,
  /config\.inc\.php/i,
];

function isHighConfidenceProbe(path: string): boolean {
  return HIGH_CONFIDENCE_PROBE_PATTERNS.some((pattern) => pattern.test(path));
}

interface IpActivity {
  windowStart: number;
  count: number;
  paths: string[];
  userAgents: Set<string>;
  bannedUntil: number;
}

const activity = new Map<string, IpActivity>();

function getBucket(ip: string): IpActivity {
  const now = Date.now();
  const existing = activity.get(ip);
  if (existing && now - existing.windowStart <= WINDOW_MS) {
    return existing;
  }

  const bucket: IpActivity = {
    windowStart: now,
    count: 0,
    paths: [],
    userAgents: new Set(),
    bannedUntil: existing?.bannedUntil ?? 0,
  };
  activity.set(ip, bucket);

  if (activity.size > MAX_TRACKED_IPS) {
    const oldestKey = activity.keys().next().value;
    if (oldestKey) activity.delete(oldestKey);
  }

  return bucket;
}

export function isBanned(ip: string): boolean {
  const bucket = activity.get(ip);
  return !!bucket && bucket.bannedUntil > Date.now();
}

export function recordSuspiciousRequest(
  ip: string,
  path: string,
  userAgent?: string
): void {
  const bucket = getBucket(ip);
  const weight = isHighConfidenceProbe(path) ? ALERT_THRESHOLD : 1;
  bucket.count += weight;
  if (bucket.paths.length < 5) bucket.paths.push(path);
  if (userAgent && bucket.userAgents.size < 3) bucket.userAgents.add(userAgent);

  if (bucket.count >= BAN_THRESHOLD) {
    bucket.bannedUntil = Date.now() + BAN_DURATION_MS;
  }

  if (bucket.count < ALERT_THRESHOLD) return;

  const banned = bucket.bannedUntil > Date.now();
  sendTelegramAlert({
    dedupeKey: `scan:${ip}`,
    message: [
      '🕵️ Posible escaneo automatizado detectado',
      '---------------------',
      `ip: ${ip}`,
      `ubicación: https://ipinfo.io/${ip}`,
      `hits (5min, ponderado): ${bucket.count}`,
      `rutas de muestra: ${bucket.paths.join(', ')}`,
      bucket.userAgents.size > 0
        ? `user-agent: ${[...bucket.userAgents].join(' | ')}`
        : 'user-agent: (no enviado)',
      banned
        ? `acción: IP bloqueada ${BAN_DURATION_MS / 60000}min`
        : 'acción: solo monitoreo',
    ].join('\n'),
  }).catch((error) => {
    logger.warn('Failed to send scanner-detection alert', error);
  });
}
