import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });
export const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    // WhatsApp
    whatsapp: {
        sessionDir: process.env.WHATSAPP_SESSION_DIR || './data/sessions',
        autoReconnect: process.env.WHATSAPP_AUTO_RECONNECT === 'true',
        maxReconnectAttempts: parseInt(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS || '5', 10),
        qrTimeout: 60000, // 60 segundos
    },
    // Claude API
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
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
    },
    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        dir: process.env.LOG_DIR || './logs',
    },
    // Security
    security: {
        apiSecretKey: process.env.API_SECRET_KEY || 'dev-secret-key',
        rateLimitWindow: process.env.RATE_LIMIT_WINDOW || '15m',
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },
    // Features
    features: {
        enablePDF: true,
        enableCron: true,
        enableHotReload: true,
    },
};
export default config;
//# sourceMappingURL=environment.js.map