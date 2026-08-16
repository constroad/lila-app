import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(moduleDir, '../../.env');
const devEnvPath = path.join(moduleDir, '../../.env.development');

dotenv.config({ path: envPath });

if (process.env.NODE_ENV === 'development' && fs.existsSync(devEnvPath)) {
  dotenv.config({ path: devEnvPath, override: true });
}

const nodeEnv = process.env.NODE_ENV || 'development';
const cronJobsEnabledOverride = process.env.CRONJOBS_ENABLED;
const cronJobsEnabled =
  cronJobsEnabledOverride === undefined
    ? nodeEnv === 'production'
    : ['1', 'true', 'yes', 'on'].includes(
        cronJobsEnabledOverride.trim().toLowerCase()
      );

const trustProxyEnv = process.env.TRUST_PROXY;
const resolvedTrustProxy = trustProxyEnv === undefined
  ? (process.env.NODE_ENV === 'production' ? 1 : false)
  : trustProxyEnv === 'true'
    ? true
    : trustProxyEnv === 'false'
      ? false
      : (Number.isNaN(Number(trustProxyEnv)) ? true : Number(trustProxyEnv));

const storageRootEnv = process.env.FILE_STORAGE_ROOT;
const storageRoot = storageRootEnv || '/mnt/constroad-storage';
const defaultPdfTempDir = storageRootEnv
  ? path.join(storageRoot, 'temp', 'pdf-preview')
  : './data/pdf-temp';
const defaultDriveCacheDir = storageRootEnv
  ? path.join(storageRoot, 'temp', 'drive-cache')
  : './data/drive-cache';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv,
  
  // WhatsApp
  whatsapp: {
    sessionDir: process.env.WHATSAPP_SESSION_DIR || './data/sessions',
    autoReconnect: process.env.WHATSAPP_AUTO_RECONNECT !== 'false',
    // Si WHATSAPP_RESTORE_SESSIONS=false, no restaura sesiones al arrancar.
    // En producción (NODE_ENV=production) por defecto true.
    // En development por defecto false: evita que un dev con el mismo Mongo de prod
    // kickee las sesiones productivas con código 440 al arrancar su instancia local.
    restoreSessions: process.env.WHATSAPP_RESTORE_SESSIONS === 'true' ||
      (process.env.NODE_ENV === 'production' && process.env.WHATSAPP_RESTORE_SESSIONS !== 'false'),
    // 3, que es con lo que corre producción. El default era 0 y había que
      // declararlo en cada máquina para obtener el comportamiento real.
      maxReconnectAttempts: parseInt(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS || '3', 10),
    qrTimeout: 60000, // 60 segundos
    aiEnabled: process.env.WHATSAPP_AI_ENABLED === 'true',
    aiTestNumber: process.env.WHATSAPP_AI_TEST_NUMBER || '51949376824',
    // Agente conversacional multi-vertical (WHATSAPP-AGENT-VERTICALS F1).
    // Kill-switch GLOBAL del listener messages.upsert nuevo; el gate real por
    // company vive en bot_configs (enabled + testNumbers). Default false:
    // el deploy es inerte hasta encenderlo explícitamente.
    agentEnabled: process.env.WHATSAPP_AGENT_ENABLED === 'true',
    baileysLogLevel: process.env.WHATSAPP_BAILEYS_LOG_LEVEL || 'fatal',
    // Lease process-level de sockets (candado anti doble-instancia / guerra 440).
    // Default habilitado; WHATSAPP_SOCKET_LEASE=false lo apaga (ej. entorno aislado
    // con Mongo propio). Ver whatsapp/baileys/instance-lease.ts.
    socketLease: process.env.WHATSAPP_SOCKET_LEASE !== 'false',
    // RLS de envío: cuando true exige auth de tenant + ownership de sender en /message
    // y BLOQUEA cross-tenant. Default false = solo identifica/avisa (backward-compatible).
    // Es un toggle de comportamiento por entorno (off en dev, on en prod tras validar logs),
    // por eso vive en env y no en constants. Ver SCALABILITY-MULTI-SESSION.spec §4.
    rlsEnforce: process.env.WHATSAPP_RLS_ENFORCE === 'true',
    // Send-proxy (SOLO dev): base URL del lila de PROD (incluye /api, ej.
    // https://host.ts.net/api). Con esto seteado, los envíos WhatsApp locales se
    // reenvían a prod en vez de abrir un socket propio (un número = un socket vivo).
    // whatsapp-proxy.service la ignora con warning si nodeEnv === 'production'.
    proxyTargetUrl: (process.env.WHATSAPP_PROXY_TARGET_URL || '').replace(/\/+$/, ''),
    // Sesiones LOCAL-ONLY (números separados por coma): su socket vive en la máquina
    // de DESARROLLO que las declara, como excepción al send-proxy (para cerrar el E2E
    // local: QR real + envíos reales del número de pruebas). La MISMA variable en el
    // env de PROD significa lo inverso: prod NO abre ni restaura esas sesiones (las
    // creds viven en el Mongo compartido; sin esta exclusión habría guerra 440).
    // Ver whatsapp/baileys/local-sessions.ts.
    localSessions: (process.env.WHATSAPP_LOCAL_SESSIONS || '')
      .split(',')
      .map((value) => value.trim().replace(/\D/g, ''))
      .filter(Boolean),
  },
  
  // Claude API
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },

  /**
   * Lectura de imágenes por LLM (Flota §11.3-11) — agnóstica al proveedor.
   * SIN `VISION_API_KEY` la feature queda apagada y el endpoint responde 503: el
   * flujo de tipear el peso a mano sigue igual. Ver docs/VISION-OCR-SETUP.md.
   */
  vision: {
    provider: process.env.VISION_PROVIDER || 'gemini',
    apiKey: process.env.VISION_API_KEY || '',
    model: process.env.VISION_MODEL || '',
    baseUrl: process.env.VISION_BASE_URL || '',
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    errorsChatId:
      process.env.TELEGRAM_ALERTS_CHAT_ID ||
      process.env.TELEGRAM_ERRORS_CHAT_ID ||
      '',
  },

  // MongoDB (Portal connection for quotas - MongoDB only)
  mongodb: {
    portalUri: process.env.PORTAL_MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017',
    sharedDb: process.env.PORTAL_SHARED_DB || 'constroad_db',
  },

  // Cron Jobs
  jobs: {
    storageFile: process.env.CRONJOBS_STORAGE || './data/cronjobs.json',
    checkInterval: 10000, // Verificar cada 10s
    // Seguridad anti-duplicados: por defecto solo producción programa cronjobs.
    // En local puede habilitarse de forma deliberada con CRONJOBS_ENABLED=true.
    enabled: cronJobsEnabled,
  },
  
  // PDF
  pdf: {
    templatesDir: process.env.PDF_TEMPLATES_DIR || './templates/pdf',
    uploadsDir: process.env.PDF_UPLOADS_DIR || './uploads',
    tempDir: process.env.PDF_TEMP_DIR || defaultPdfTempDir,
    tempPublicBaseUrl: process.env.PDF_TEMP_PUBLIC_BASE_URL || '/pdf-temp',
  },

  uploads: {
    directory: process.env.PDF_UPLOADS_DIR || './uploads',
  },

  // Multi-tenant storage (Fase 9)
  drive: {
    // 100 MB es el valor con el que corre producción desde siempre; el default
      // decía 25 y solo servía para que hubiera que declararlo en cada máquina.
      maxFileSizeMb: parseInt(process.env.DRIVE_MAX_FILE_SIZE_MB || '100', 10),
    cacheDir: process.env.DRIVE_CACHE_DIR || defaultDriveCacheDir,
  },

  // Storage root for multi-tenant files
  storage: {
    root: storageRoot,
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs',
  },

  // Portal integration (internal actions)
  portal: {
    baseUrl: process.env.PORTAL_BASE_URL || 'http://localhost:3000',
  },
  
  // Security
  security: {
    apiSecretKey: process.env.API_SECRET_KEY || 'dev-secret-key',
    jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret',
    rateLimitWindow: process.env.RATE_LIMIT_WINDOW || '5m',
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
    trustProxy: resolvedTrustProxy,
    // Límites por IP (anti-abuso). Ajustables por env. Para límites por TENANT
    // (producto/billing) ver SCALABILITY-MULTI-SESSION.spec §4.5 y QUOTAS spec.
    sessionRateMax: parseInt(process.env.SESSION_RATE_MAX || '5', 10), // sesiones/min
    jobsRateMax: parseInt(process.env.JOBS_RATE_MAX || '10', 10), // cron ops/min
    messageRateMax: parseInt(process.env.MESSAGE_RATE_MAX || '100', 10), // mensajes/min
  },
  
  // Features
  features: {
    enablePDF: true,
    enableCron: cronJobsEnabled,
    enableHotReload: true,
  },
};

export default config;
