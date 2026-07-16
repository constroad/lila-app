// 🛡️ CRITICAL: Import console hijacking FIRST to prevent logging of sensitive data
import './utils/console-hijack.js';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import logger from './utils/logger.js';
import { config } from './config/environment.js';
import { apiLimiter } from './api/middlewares/rateLimiter.js';
import { mongoSanitize } from './middleware/mongo-sanitize.middleware.js';
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
import dispatchRoutes from './api/routes/dispatch.routes.js';
import publicRoutes from './api/routes/public.routes.js';
import cronRoutes from './api/routes/cron.routes.js';
import serviceManagementReportRoutes from './api/routes/service-management-report.routes.js';
import serviceMigrationRoutes from './api/routes/service-migration.routes.js';
import exportsRoutes from './api/routes/exports.routes.js';
import { resolveThumbnailRequestTarget } from './services/thumbnail-request.service.js';
import { materializeThumbnailInBackground } from './services/thumbnail.service.js';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './api/docs/openapi.js';
import jobScheduler from './jobs/scheduler.v2.instance.js';
import { shouldInitializeBackgroundJobs } from './jobs/executor.utils.js';
import pdfGenerator from './pdf/generator.service.js';
// 🔄 USING SIMPLE SESSIONS (notifications approach)
import { listSessions, endSession } from './whatsapp/baileys/sessions.simple.js';
import { restoreAllSessions } from './whatsapp/baileys/restore-sessions.simple.js';
import { startSocketLeaseLoop, releaseSocketLease } from './whatsapp/baileys/instance-lease.js';
import { startTelegramQueueFlusher } from './services/telegram-alert.service.js';
import { startDriverReminderFlusher } from './services/driver-arrival-reminder.service.js';
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

const isTrustedPortalOrigin = (origin: string): boolean => {
  try {
    const parsed = new URL(origin);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname.endsWith('constroad.com')
    );
  } catch {
    return false;
  }
};

const isAllowedCorsOrigin = (origin: string): boolean => {
  if (corsOrigins.includes(origin)) {
    return true;
  }

  if (corsOrigins.length === 0) {
    return isTrustedPortalOrigin(origin);
  }

  return isTrustedPortalOrigin(origin);
};

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
  if (isAllowedCorsOrigin(normalized)) return normalized;
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

const shouldDisableStaticCaching = (requestPath: string): boolean => {
  if (!requestPath) return false;
  try {
    const decoded = decodeURIComponent(requestPath);
    const normalized = path.posix
      .normalize(decoded.startsWith('/') ? decoded : `/${decoded}`)
      .toLowerCase();
    return normalized.includes('/vale/');
  } catch {
    return false;
  }
};

const applyCompaniesStaticHeaders = (req: express.Request, res: express.Response) => {
  setStaticCorsHeaders(req, res);
  if (!shouldDisableStaticCaching(req.path)) {
    return;
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

const isSafeThumbRequestPath = (requestPath: string): boolean => {
  if (!requestPath) return false;
  try {
    const decoded = decodeURIComponent(requestPath);
    const normalized = path.posix.normalize(decoded.startsWith('/') ? decoded : `/${decoded}`);
    return normalized.includes('/.thumbs/');
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (isAllowedCorsOrigin(origin)) {
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

// Sanitización anti NoSQL-injection (quita claves `$`/`.` de body/query/params)
app.use(mongoSanitize);

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
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/service-management-report', serviceManagementReportRoutes);
app.use('/api/service-migrations', serviceMigrationRoutes);
app.use('/api/exports', exportsRoutes);

const companiesRoot = `${config.storage.root}/companies`;
const companiesStaticHeaders = (res: express.Response) => {
  applyCompaniesStaticHeaders(res.req as express.Request, res);
};
const companiesFilesStatic = express.static(companiesRoot, {
  fallthrough: false,
  index: false,
  dotfiles: 'deny',
  maxAge: '1h',
  immutable: true,
  setHeaders: (res, _path, _stat) => {
    companiesStaticHeaders(res);
  },
});

// Public file access (multi-tenant only - Fase 9)
app.use('/files/companies', (req, res, next) => {
  if (isSafeThumbRequestPath(req.path)) {
    void resolveThumbnailRequestTarget(companiesRoot, req.path)
      .then((target) => {
        if (!target) {
          res.status(404).end();
          return;
        }

        // Fallback al original (thumb legacy/invalidado): servirlo esta vez,
        // pero MATERIALIZAR el thumb en background para que los siguientes
        // requests reciban el liviano (self-healing; ver thumbnail.service).
        if (target.source === 'original-fallback') {
          materializeThumbnailInBackground(target.absolutePath);
        }

        companiesStaticHeaders(res);
        res.sendFile(
          target.absolutePath,
          {
            maxAge: '1h',
            immutable: true,
            dotfiles: target.source === 'thumbnail' ? 'allow' : 'deny',
          },
          (error) => {
            if (error) next(error);
          }
        );
      })
      .catch(next);
    return;
  }
  companiesFilesStatic(req, res, next);
});

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
    // PERF (2026-07-13): el navegador Puppeteer se lanza PEREZOSAMENTE en la 1ª
    // generación de PDF — `ensureBrowser()` ya cubre TODAS las rutas de render
    // (generatePDF / generateFromHtml / fetchPrintedHtml / createPage). Lanzarlo
    // aquí bloqueaba el arranque 20-40s (launch de Chromium + su reintento), y
    // como `app.listen()` está más abajo, el 1er request tras un restart/idle
    // (p.ej. un GET /documents/schemas trivial) se comía TODO el warm-up → 40s.
    // Ref: PERFORMANCE-SCALABILITY.SPEC.md (cold-start del proceso, no del endpoint).
    await fs.ensureDir(config.pdf.tempDir);
    logger.info('🧾 PDF temp directory configured', {
      tempDir: config.pdf.tempDir,
      publicBaseUrl: config.pdf.tempPublicBaseUrl,
    });

    // 🔄 WhatsApp sessions (notifications approach)
    // Skipped in non-production unless WHATSAPP_RESTORE_SESSIONS=true to prevent
    // a dev machine with the same Mongo URI from kicking prod sessions (code 440 war).
    if (config.whatsapp.restoreSessions) {
      try {
        // Lease anti doble-instancia: si otro proceso vivo lo posee, este arranca
        // PASIVO (sin sockets) y toma el lease automáticamente si aquel muere.
        const isSocketHolder = await startSocketLeaseLoop();
        if (isSocketHolder) {
          await restoreAllSessions();
        } else if (
          config.nodeEnv !== 'production' &&
          config.whatsapp.localSessions.length > 0
        ) {
          // Dev sin lease (lo posee prod, Mongo compartido): restaurar SOLO las
          // sesiones LOCAL-ONLY — están exentas del lease porque prod las bloquea.
          logger.warn(
            '⏭ Sin socket lease: restaurando SOLO sesiones local-only ' +
              `(${config.whatsapp.localSessions.join(', ')}).`
          );
          await restoreAllSessions({ localOnly: true });
        } else {
          logger.warn('⏭ Restore de sesiones OMITIDO: otra instancia posee el socket lease.');
        }
      } catch (err) {
        logger.error('restoreAllSessions failed:', err);
      }
    } else if (
      config.nodeEnv !== 'production' &&
      config.whatsapp.localSessions.length > 0
    ) {
      // Sesiones LOCAL-ONLY (WHATSAPP_LOCAL_SESSIONS): restaurarlas SIEMPRE en dev,
      // aunque el auto-restore general esté apagado — si no, cada restart de dev
      // deja la sesión de pruebas muerta en silencio (los envíos caen al outbox y
      // nunca salen). Exentas del lease/proxy, no tocan sesiones de prod.
      try {
        logger.info(
          `♻️ Restaurando sesiones local-only (${config.whatsapp.localSessions.join(', ')})…`
        );
        await restoreAllSessions({ localOnly: true });
      } catch (err) {
        logger.error('restore de sesiones local-only falló:', err);
      }
    } else {
      logger.warn('⚠️ WhatsApp session auto-restore DISABLED (nodeEnv=%s). Set WHATSAPP_RESTORE_SESSIONS=true to enable.', config.nodeEnv);
    }

    const pdfTempMaxAgeHours = Number(process.env.PDF_TEMP_MAX_AGE_HOURS || 24);
    const pdfTempCleanupCron = process.env.PDF_TEMP_CLEANUP_CRON || '0 * * * *';
    const shouldRunBackgroundJobs = shouldInitializeBackgroundJobs(
      config.nodeEnv,
      config.jobs.enabled
    );

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

    if (shouldRunBackgroundJobs) {
      logger.info('Initializing Job Scheduler...');
      await jobScheduler.initialize();
      cron.schedule(pdfTempCleanupCron, cleanupPdfTemp);
    } else {
      const isDevelopment = config.nodeEnv.trim().toLowerCase() === 'development';
      const banner = [
        '',
        '╔══════════════════════════════════════════════════════════════════════╗',
        isDevelopment
          ? '║                    ⚠️  MODO DESARROLLO  ⚠️                         ║'
          : '║              ⚠️  CRONJOBS AUTOMÁTICOS DESACTIVADOS  ⚠️             ║',
        '║                                                                      ║',
        '║       LOS CRONJOBS AUTOMÁTICOS NO SE EJECUTARÁN EN ESTA INSTANCIA    ║',
        '║       Se evita así el doble envío junto con producción.              ║',
        '║                                                                      ║',
        '║       Override deliberado: CRONJOBS_ENABLED=true                     ║',
        '╚══════════════════════════════════════════════════════════════════════╝',
        '',
      ].join('\n');
      logger.warn(banner, {
        nodeEnv: config.nodeEnv,
        cronJobsEnabled: config.jobs.enabled,
      });
    }

    // Iniciar servidor HTTP
    const server = app.listen(config.port, () => {
      logger.info(`✅ Server running on port ${config.port}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      logger.info(`📁 WhatsApp sessions dir: ${config.whatsapp.sessionDir}`);
    });

    const stopTelegramQueueFlusher = startTelegramQueueFlusher();
    // F8-C: recordatorios "marca tu llegada" al chofer (ETA + 10%).
    const stopDriverReminderFlusher = startDriverReminderFlusher();

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

      // Stop background flushers early so they don't fire during shutdown
      stopTelegramQueueFlusher();
      stopDriverReminderFlusher();

      // Cerrar servidor HTTP
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Cerrar sockets sin hacer logout (preserva credenciales para próximo arranque)
          const sessions = listSessions();
          for (const sessionId of sessions) {
            try {
              await endSession(sessionId);
            } catch (err) {
              logger.error(`Error ending ${sessionId}:`, err);
            }
          }
          logger.info('All WhatsApp sessions closed (creds preserved)');

          // Soltar el lease para que el próximo arranque abra sockets al instante
          // (sin esperar el TTL de expiración).
          await releaseSocketLease();

          if (shouldRunBackgroundJobs) {
            await jobScheduler.shutdown();
          }

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
