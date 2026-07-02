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
  nodeEnv: process.env.NODE_ENV || 'development',
  
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
    maxReconnectAttempts: parseInt(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS || '0', 10),
    qrTimeout: 60000, // 60 segundos
    aiEnabled: process.env.WHATSAPP_AI_ENABLED === 'true',
    aiTestNumber: process.env.WHATSAPP_AI_TEST_NUMBER || '51949376824',
    baileysLogLevel: process.env.WHATSAPP_BAILEYS_LOG_LEVEL || 'fatal',
    // RLS de envío: cuando true exige auth de tenant + ownership de sender en /message
    // y BLOQUEA cross-tenant. Default false = solo identifica/avisa (backward-compatible).
    // Es un toggle de comportamiento por entorno (off en dev, on en prod tras validar logs),
    // por eso vive en env y no en constants. Ver SCALABILITY-MULTI-SESSION.spec §4.
    rlsEnforce: process.env.WHATSAPP_RLS_ENFORCE === 'true',
  },
  
  // Claude API
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
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
    maxFileSizeMb: parseInt(process.env.DRIVE_MAX_FILE_SIZE_MB || '25', 10),
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
    enableCron: true,
    enableHotReload: true,
  },
};

export default config;
