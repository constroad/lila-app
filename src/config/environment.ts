import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(moduleDir, '../../.env');
const devEnvPath = path.join(moduleDir, '../../.env.development');

dotenv.config({ path: envPath });

if (process.env.NODE_ENV === 'development' || fs.existsSync(devEnvPath)) {
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

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // WhatsApp
  whatsapp: {
    sessionDir: process.env.WHATSAPP_SESSION_DIR || './data/sessions',
    autoReconnect: process.env.WHATSAPP_AUTO_RECONNECT !== 'false',
    maxReconnectAttempts: parseInt(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS || '0', 10),
    qrTimeout: 60000, // 60 segundos
    aiEnabled: process.env.WHATSAPP_AI_ENABLED === 'true',
    aiTestNumber: process.env.WHATSAPP_AI_TEST_NUMBER || '51949376824',
    baileysLogLevel: process.env.WHATSAPP_BAILEYS_LOG_LEVEL || 'fatal',
  },
  
  // Claude API
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    errorsChatId: process.env.TELEGRAM_ERRORS_CHAT_ID || '',
  },

  // MongoDB (Portal connection for quotas - MongoDB only)
  mongodb: {
    portalUri: process.env.PORTAL_MONGO_URI || process.env.MONGO_URI || 'mongodb://localhost:27017',
    sharedDb: process.env.PORTAL_SHARED_DB || 'shared_db',
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
    tempDir: process.env.PDF_TEMP_DIR || './data/pdf-temp',
    tempPublicBaseUrl: process.env.PDF_TEMP_PUBLIC_BASE_URL || '/pdf-temp',
  },

  // Multi-tenant storage (Fase 9)
  drive: {
    maxFileSizeMb: parseInt(process.env.DRIVE_MAX_FILE_SIZE_MB || '25', 10),
  },

  // Storage root for multi-tenant files
  storage: {
    root: process.env.FILE_STORAGE_ROOT || '/mnt/constroad-storage',
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
  },
  
  // Features
  features: {
    enablePDF: true,
    enableCron: true,
    enableHotReload: true,
  },
};

export default config;
