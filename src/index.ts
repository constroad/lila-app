// 🛡️ CRITICAL: Import console hijacking FIRST to prevent logging of sensitive data
import './utils/console-hijack.js';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from './utils/logger.js';
import { config } from './config/environment.js';
import { apiLimiter } from './api/middlewares/rateLimiter.js';
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
} from './api/middlewares/errorHandler.js';
import sessionRoutes from './api/routes/session.routes.js';
import jobsRoutes from './api/routes/jobs.routes.v2.js';
import messageRoutes from './api/routes/message.routes.js';
import pdfRoutes from './api/routes/pdf.routes.js';
import driveRoutes from './api/routes/drive.routes.js';
import documentsRoutes from './api/routes/documents.routes.js';
import serviceManagementReportRoutes from './api/routes/service-management-report.routes.js';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './api/docs/openapi.js';
import jobScheduler from './jobs/scheduler.v2.instance.js';
import pdfGenerator from './pdf/generator.service.js';
// 🔄 USING SIMPLE SESSIONS (notifications approach)
import { listSessions, disconnectSession } from './whatsapp/baileys/sessions.simple.js';
import { restoreAllSessions } from './whatsapp/baileys/restore-sessions.simple.js';
import cron from 'node-cron';
import fs from 'fs-extra';
import path from 'path';

const app = express();

// Trust proxy to honor X-Forwarded-For when behind reverse proxies
app.set('trust proxy', config.security.trustProxy);

const corsOrigins = (process.env.LILA_APP_CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const frameAncestors = ["'self'", ...corsOrigins];

// Middleware de seguridad
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'blob:'],
        'frame-ancestors': frameAncestors,
      },
    },
  })
);

const resolveStaticCorsOrigin = (origin?: string | string[] | null): string | null => {
  if (!origin) return null;
  const normalized = Array.isArray(origin) ? origin[0] : origin;
  if (!normalized) return null;
  if (corsOrigins.length === 0) return normalized;
  if (corsOrigins.includes(normalized)) return normalized;
  return null;
};

const setStaticCorsHeaders = (req: express.Request, res: express.Response) => {
  const origin = resolveStaticCorsOrigin(req.headers.origin);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, x-api-key, x-request-id');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (corsOrigins.length === 0 || corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    allowedHeaders: [
      'Authorization',
      'x-api-key',
      'Content-Type',
      'x-request-id',
      'Tus-Resumable',
      'Upload-Length',
      'Upload-Offset',
      'Upload-Metadata',
      'Upload-Defer-Length',
      'Upload-Checksum',
      'Upload-Expires',
    ],
    exposedHeaders: [
      'Location',
      'Tus-Resumable',
      'Upload-Offset',
      'Upload-Length',
      'Upload-Expires',
    ],
  })
);

// Middleware de parseo
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Middleware de logging y rate limiting
app.use(requestLogger);
app.use(apiLimiter);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// API Routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/message', messageRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/service-management-report', serviceManagementReportRoutes);

// Public file access (multi-tenant only - Fase 9)
app.use(
  '/files/companies',
  express.static(config.storage.root + '/companies', {
    fallthrough: false,
    index: false,
    dotfiles: 'deny',
    maxAge: '1h',
    immutable: true,
    setHeaders: (res, _path, _stat) => {
      setStaticCorsHeaders(res.req as express.Request, res);
    },
  })
);

// Public PDF temp access
app.use(
  config.pdf.tempPublicBaseUrl,
  express.static(config.pdf.tempDir, {
    fallthrough: false,
    index: false,
    dotfiles: 'deny',
    maxAge: '1h',
    setHeaders: (res, _path, _stat) => {
      setStaticCorsHeaders(res.req as express.Request, res);
    },
  })
);

// Swagger UI
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'WhatsApp API v2',
  })
);

// Status endpoint
app.get('/api/status', (req, res) => {
  const sessions = listSessions();
  res.status(200).json({
    success: true,
    data: {
      activeSessions: sessions.length,
      nodeEnv: config.nodeEnv,
      timestamp: new Date().toISOString(),
    },
  });
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Inicialización del servidor
async function startServer() {
  try {
    logger.info('🚀 Starting WhatsApp Server...');

    // Inicializar QuotaValidator (Fase 10 - MongoDB only)
    logger.info('Initializing Quota Validator...');
    const { quotaValidatorService } = await import('./services/quota-validator.service.js');
    try {
      await quotaValidatorService.connect();
      logger.info('✅ Quota Validator connected (MongoDB-only)');
    } catch (error) {
      logger.warn('Quota Validator initialization failed, quota validation will be disabled:', error);
    }

    // Inicializar servicios
    await pdfGenerator.initialize();
    await fs.ensureDir(config.pdf.tempDir);
    logger.info('🧾 PDF temp directory configured', {
      tempDir: config.pdf.tempDir,
      publicBaseUrl: config.pdf.tempPublicBaseUrl,
    });

    logger.info('Initializing Job Scheduler...');
    await jobScheduler.initialize();

    // 🔄 WhatsApp sessions (notifications approach)
    restoreAllSessions();

    const pdfTempMaxAgeHours = Number(process.env.PDF_TEMP_MAX_AGE_HOURS || 24);
    const pdfTempCleanupCron = process.env.PDF_TEMP_CLEANUP_CRON || '0 * * * *';

    const cleanupPdfTemp = async () => {
      try {
        const entries = await fs.readdir(config.pdf.tempDir);
        const now = Date.now();
        const maxAgeMs = pdfTempMaxAgeHours * 60 * 60 * 1000;
        const removals = entries.map(async (entry) => {
          const fullPath = path.join(config.pdf.tempDir, entry);
          const stat = await fs.stat(fullPath);
          if (!stat.isFile()) return;
          if (now - stat.mtimeMs > maxAgeMs) {
            await fs.remove(fullPath);
          }
        });
        await Promise.all(removals);
        logger.info('✅ Cleaned PDF temp directory', { maxAgeHours: pdfTempMaxAgeHours });
      } catch (error) {
        logger.error('Failed to clean PDF temp directory:', error);
      }
    };

    cron.schedule(pdfTempCleanupCron, cleanupPdfTemp);

    // Iniciar servidor HTTP
    const server = app.listen(config.port, () => {
      logger.info(`✅ Server running on port ${config.port}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      logger.info(`📁 WhatsApp sessions dir: ${config.whatsapp.sessionDir}`);
    });

    // Phase 1: Extend HTTP server timeouts for large uploads (no breaking changes)
    const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    server.timeout = UPLOAD_TIMEOUT_MS;
    server.keepAliveTimeout = UPLOAD_TIMEOUT_MS + 20000; // Must be > server.timeout
    server.headersTimeout = UPLOAD_TIMEOUT_MS + 30000; // Must be > keepAliveTimeout

    logger.info('⏱️ HTTP server timeouts configured for large uploads', {
      timeoutSeconds: server.timeout / 1000,
      keepAliveSeconds: server.keepAliveTimeout / 1000,
      headersSeconds: server.headersTimeout / 1000,
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`\n📴 Received ${signal}, shutting down gracefully...`);

      // Cerrar servidor HTTP
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Desconectar todas las sesiones de WhatsApp
          const sessions = listSessions();
          for (const sessionId of sessions) {
            try {
              await disconnectSession(sessionId);
            } catch (err) {
              logger.error(`Error disconnecting ${sessionId}:`, err);
            }
          }
          logger.info('All WhatsApp sessions disconnected');

          // Cerrar scheduler de jobs
          await jobScheduler.shutdown();

          // Cerrar PDF Generator
          await pdfGenerator.shutdown();

          // Cerrar QuotaValidator (Fase 10 - MongoDB only)
          const { quotaValidatorService } = await import('./services/quota-validator.service.js');
          await quotaValidatorService.disconnect();

          logger.info('✅ All services shut down successfully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown después de 30 segundos
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Error handling
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Iniciar si es módulo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export default app;
