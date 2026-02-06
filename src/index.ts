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
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './api/docs/openapi.js';
import jobScheduler from './jobs/scheduler.v2.instance.js';
import pdfGenerator from './pdf/generator.service.js';
import connectionManager from './whatsapp/baileys/connection.manager.js';
import cron from 'node-cron';
import fs from 'fs-extra';

const app = express();

// Trust proxy to honor X-Forwarded-For when behind reverse proxies
app.set('trust proxy', config.security.trustProxy);

// Middleware de seguridad
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'blob:'],
      },
    },
  })
);

const corsOrigins = (process.env.LILA_APP_CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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
    allowedHeaders: ['Authorization', 'x-api-key', 'Content-Type', 'x-request-id'],
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

// Public file access (multi-tenant only - Fase 9)
app.use(
  '/files/companies',
  express.static(config.storage.root + '/companies', {
    fallthrough: false,
    index: false,
    dotfiles: 'deny',
    maxAge: '1h',
    immutable: true,
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
  const connections = connectionManager.getAllConnections();
  res.status(200).json({
    success: true,
    data: {
      activeSessions: connections.size,
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

    logger.info('Initializing Job Scheduler...');
    await jobScheduler.initialize();

    logger.info('Reconnecting saved WhatsApp sessions...');
    await connectionManager.reconnectSavedSessions();

    // 🛡️ Iniciar watchdog de recuperación automática de sesiones
    logger.info('Starting session recovery watchdog...');
    connectionManager.startSessionRecoveryWatchdog();

    cron.schedule('0 0 * * 0', async () => {
      try {
        await fs.emptyDir(config.pdf.tempDir);
        logger.info('✅ Cleared PDF temp directory');
      } catch (error) {
        logger.error('Failed to clear PDF temp directory:', error);
      }
    });

    // Iniciar servidor HTTP
    const server = app.listen(config.port, () => {
      logger.info(`✅ Server running on port ${config.port}`);
      logger.info(`📊 Environment: ${config.nodeEnv}`);
      logger.info(`📁 WhatsApp sessions dir: ${config.whatsapp.sessionDir}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`\n📴 Received ${signal}, shutting down gracefully...`);

      // Cerrar servidor HTTP
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Desconectar todas las sesiones de WhatsApp
          await connectionManager.disconnectAll();

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
