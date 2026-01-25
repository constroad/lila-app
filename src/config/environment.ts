import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env');
const devEnvPath = path.join(__dirname, '../../.env.development');

dotenv.config({ path: envPath });

if (process.env.NODE_ENV === 'development' || fs.existsSync(devEnvPath)) {
  dotenv.config({ path: devEnvPath, override: true });
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // WhatsApp
  whatsapp: {
    sessionDir: process.env.WHATSAPP_SESSION_DIR || './data/sessions',
    autoReconnect: process.env.WHATSAPP_AUTO_RECONNECT !== 'false',
    maxReconnectAttempts: parseInt(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS || '0', 10),
    qrTimeout: 60000, // 60 segundos
    aiEnabled: process.env.WHATSAPP_AI_ENABLED !== 'false',
    aiTestNumber: process.env.WHATSAPP_AI_TEST_NUMBER || '51949376824',
  },
  
  // Claude API
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
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

  // Drive (local storage)
  drive: {
    rootDir: process.env.DRIVE_ROOT_DIR || './data/drive',
    publicBaseUrl: process.env.DRIVE_PUBLIC_BASE_URL || '/files',
    maxFileSizeMb: parseInt(process.env.DRIVE_MAX_FILE_SIZE_MB || '25', 10),
    cacheDir: process.env.DRIVE_CACHE_DIR || './data/drive-cache',
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs',
  },
  
  // Security
  security: {
    apiSecretKey: process.env.API_SECRET_KEY || 'dev-secret-key',
    rateLimitWindow: process.env.RATE_LIMIT_WINDOW || '5m',
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '200', 10),
  },
  
  // Features
  features: {
    enablePDF: true,
    enableCron: true,
    enableHotReload: true,
  },
};

export default config;
