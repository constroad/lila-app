import winston from 'winston';
import path from 'path';
import { config } from '../config/environment.js';

const logDir = config.logging.dir;

const safeStringify = (value: unknown, spacing: number = 0): string => {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (key, val) => {
      if (val instanceof Error) {
        return {
          message: val.message,
          stack: val.stack,
        };
      }
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[Circular]';
        }
        seen.add(val);
      }
      return val;
    },
    spacing
  );
};

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaKeys = Object.keys(meta).filter((key) => meta[key] !== undefined);
      const cleanLevel = String(level).replace(/\u001b\[[0-9;]*m/g, '').toLowerCase();
      const hasOnlyService = metaKeys.length === 1 && metaKeys[0] === 'service';
      const shouldPrettyPrint = cleanLevel === 'warn' || cleanLevel === 'error';
      const metaStr =
        metaKeys.length && !(cleanLevel === 'info' && hasOnlyService)
          ? shouldPrettyPrint
            ? `\n${safeStringify(meta, 2)}`
            : ` ${safeStringify(meta)}`
          : '';
      return `${timestamp} [${String(level).toUpperCase()}]: ${message}${metaStr}`;
    })
  ),
  defaultMeta: { service: 'lila-app' },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
});

// Agregar consola en desarrollo
if (config.nodeEnv === 'development') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaKeys = Object.keys(meta).filter((key) => meta[key] !== undefined);
          const cleanLevel = String(level).replace(/\u001b\[[0-9;]*m/g, '').toLowerCase();
          const hasOnlyService = metaKeys.length === 1 && metaKeys[0] === 'service';
          const shouldPrettyPrint = cleanLevel === 'warn' || cleanLevel === 'error';
          const metaStr =
            metaKeys.length && !(cleanLevel === 'info' && hasOnlyService)
              ? shouldPrettyPrint
                ? `\n${safeStringify(meta, 2)}`
                : ` ${safeStringify(meta)}`
              : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    })
  );
}

export default logger;
