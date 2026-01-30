var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/config/environment.ts
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
var __dirname, envPath, devEnvPath, config;
var init_environment = __esm({
  "src/config/environment.ts"() {
    __dirname = path.dirname(fileURLToPath(import.meta.url));
    envPath = path.join(__dirname, "../../.env");
    devEnvPath = path.join(__dirname, "../../.env.development");
    dotenv.config({ path: envPath });
    if (process.env.NODE_ENV === "development" || fs.existsSync(devEnvPath)) {
      dotenv.config({ path: devEnvPath, override: true });
    }
    config = {
      port: parseInt(process.env.PORT || "3001", 10),
      nodeEnv: process.env.NODE_ENV || "development",
      // WhatsApp
      whatsapp: {
        sessionDir: process.env.WHATSAPP_SESSION_DIR || "./data/sessions",
        autoReconnect: process.env.WHATSAPP_AUTO_RECONNECT !== "false",
        maxReconnectAttempts: parseInt(process.env.WHATSAPP_MAX_RECONNECT_ATTEMPTS || "0", 10),
        qrTimeout: 6e4,
        // 60 segundos
        aiEnabled: process.env.WHATSAPP_AI_ENABLED !== "false",
        aiTestNumber: process.env.WHATSAPP_AI_TEST_NUMBER || "51949376824",
        baileysLogLevel: process.env.WHATSAPP_BAILEYS_LOG_LEVEL || "fatal"
      },
      // Claude API
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY
      },
      telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || ""
      },
      // MongoDB (Portal connection for quotas - MongoDB only)
      mongodb: {
        portalUri: process.env.PORTAL_MONGO_URI || process.env.MONGO_URI || "mongodb://localhost:27017",
        sharedDb: process.env.PORTAL_SHARED_DB || "shared_db"
      },
      // Cron Jobs
      jobs: {
        storageFile: process.env.CRONJOBS_STORAGE || "./data/cronjobs.json",
        checkInterval: 1e4
        // Verificar cada 10s
      },
      // PDF
      pdf: {
        templatesDir: process.env.PDF_TEMPLATES_DIR || "./templates/pdf",
        uploadsDir: process.env.PDF_UPLOADS_DIR || "./uploads",
        tempDir: process.env.PDF_TEMP_DIR || "./data/pdf-temp",
        tempPublicBaseUrl: process.env.PDF_TEMP_PUBLIC_BASE_URL || "/pdf-temp"
      },
      // Multi-tenant storage (Fase 9)
      drive: {
        maxFileSizeMb: parseInt(process.env.DRIVE_MAX_FILE_SIZE_MB || "25", 10)
      },
      // Storage root for multi-tenant files
      storage: {
        root: process.env.FILE_STORAGE_ROOT || "/mnt/constroad-storage"
      },
      // Logging
      logging: {
        level: process.env.LOG_LEVEL || "info",
        dir: process.env.LOG_DIR || "./logs"
      },
      // Security
      security: {
        apiSecretKey: process.env.API_SECRET_KEY || "dev-secret-key",
        jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret",
        rateLimitWindow: process.env.RATE_LIMIT_WINDOW || "5m",
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "200", 10)
      },
      // Features
      features: {
        enablePDF: true,
        enableCron: true,
        enableHotReload: true
      }
    };
  }
});

// src/utils/logger.ts
import winston from "winston";
import path2 from "path";
var logDir, logger, logger_default;
var init_logger = __esm({
  "src/utils/logger.ts"() {
    init_environment();
    logDir = config.logging.dir;
    logger = winston.createLogger({
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ""}`;
        })
      ),
      defaultMeta: { service: "mvp-api" },
      transports: [
        new winston.transports.File({
          filename: path2.join(logDir, "error.log"),
          level: "error",
          maxsize: 5242880,
          // 5MB
          maxFiles: 5
        }),
        new winston.transports.File({
          filename: path2.join(logDir, "combined.log"),
          maxsize: 5242880,
          // 5MB
          maxFiles: 10
        })
      ]
    });
    if (config.nodeEnv === "development") {
      logger.add(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            })
          )
        })
      );
    }
    logger_default = logger;
  }
});

// src/models/company.model.ts
import { Schema } from "mongoose";
var CompanyLimitsSchema, CompanySchema;
var init_company_model = __esm({
  "src/models/company.model.ts"() {
    CompanyLimitsSchema = new Schema(
      {
        whatsappMessages: {
          type: Number,
          required: true,
          default: 1e3,
          min: 0
        },
        storage: {
          type: Number,
          required: true,
          default: 10,
          // 10 GB
          min: 0
        },
        users: {
          type: Number,
          required: true,
          default: 5,
          min: 1
        },
        orders: {
          type: Number,
          required: true,
          default: 100,
          min: 0
        }
      },
      { _id: false }
    );
    CompanySchema = new Schema(
      {
        companyId: {
          type: String,
          required: true,
          unique: true,
          index: true
        },
        name: {
          type: String,
          required: true
        },
        ruc: {
          type: String,
          sparse: true
        },
        email: {
          type: String,
          sparse: true
        },
        phone: {
          type: String
        },
        address: {
          type: String
        },
        limits: {
          type: CompanyLimitsSchema,
          required: true,
          default: () => ({})
          // Usa defaults del sub-schema
        },
        isActive: {
          type: Boolean,
          required: true,
          default: true
        }
      },
      {
        timestamps: true,
        collection: "companies"
        // Nombre de la colección en Portal
      }
    );
    CompanySchema.index({ companyId: 1 });
    CompanySchema.index({ isActive: 1 });
  }
});

// src/services/quota-validator.service.ts
var quota_validator_service_exports = {};
__export(quota_validator_service_exports, {
  QuotaValidatorService: () => QuotaValidatorService,
  default: () => quota_validator_service_default,
  quotaValidatorService: () => quotaValidatorService
});
import mongoose2 from "mongoose";
var QuotaValidatorService, quotaValidatorService, quota_validator_service_default;
var init_quota_validator_service = __esm({
  "src/services/quota-validator.service.ts"() {
    init_environment();
    init_company_model();
    init_logger();
    QuotaValidatorService = class _QuotaValidatorService {
      constructor() {
        this.portalMongoConn = null;
        this.CompanyModel = null;
        this.isConnected = false;
        this.isConnecting = false;
        // Circuit breaker
        this.circuitBreaker = {
          isOpen: false,
          failures: 0,
          lastFailure: 0,
          nextRetry: 0
        };
        // Configuration
        this.CIRCUIT_BREAKER_THRESHOLD = 5;
        this.CIRCUIT_BREAKER_TIMEOUT = 60 * 1e3;
        // 1 min
        this.CONNECTION_TIMEOUT = 1e4;
        // 10 sec
        this.IS_PROD = process.env.NODE_ENV === "production";
        process.once("SIGINT", () => this.disconnect());
        process.once("SIGTERM", () => this.disconnect());
      }
      /**
       * Get singleton instance (global cache para hot reloads)
       */
      static getInstance() {
        if (!global.__quotaValidatorService) {
          global.__quotaValidatorService = new _QuotaValidatorService();
        }
        return global.__quotaValidatorService;
      }
      // ==========================================================================
      // CONNECTION
      // ==========================================================================
      /**
       * Conecta a MongoDB de Portal (lazy, solo si es necesario)
       */
      async connect() {
        if (this.isConnected && this.portalMongoConn && this.portalMongoConn.readyState === 1) {
          return;
        }
        if (this.isConnecting) {
          return this.waitForConnection();
        }
        if (this.isCircuitBreakerOpen()) {
          throw new Error("Circuit breaker is open. Too many connection failures.");
        }
        this.isConnecting = true;
        try {
          if (!this.portalMongoConn || !this.IS_PROD) {
            logger_default.info("\u{1F4E1} Connecting to Portal MongoDB (shared_db)...");
          }
          const connection = mongoose2.createConnection(config.mongodb.portalUri, {
            dbName: config.mongodb.sharedDb,
            serverSelectionTimeoutMS: this.CONNECTION_TIMEOUT,
            socketTimeoutMS: 45e3,
            maxPoolSize: this.IS_PROD ? 5 : 3,
            minPoolSize: 1,
            family: 4,
            // Force IPv4
            retryWrites: true,
            heartbeatFrequencyMS: 1e4
          });
          this.setupConnectionListeners(connection);
          this.portalMongoConn = await connection.asPromise();
          if (this.portalMongoConn.models.Company) {
            this.CompanyModel = this.portalMongoConn.models.Company;
          } else {
            this.CompanyModel = this.portalMongoConn.model("Company", CompanySchema);
          }
          this.isConnected = true;
          this.isConnecting = false;
          this.resetCircuitBreaker();
          logger_default.info("\u2705 QuotaValidator connected to Portal MongoDB");
        } catch (error) {
          this.isConnecting = false;
          this.isConnected = false;
          this.recordCircuitBreakerFailure();
          logger_default.error("\u274C Failed to connect to Portal MongoDB:", error);
          throw error;
        }
      }
      /**
       * Wait for connection in progress
       */
      async waitForConnection() {
        const maxWait = 3e4;
        const checkInterval = 100;
        let waited = 0;
        while (waited < maxWait) {
          if (this.isConnected && this.portalMongoConn?.readyState === 1) {
            return;
          }
          if (!this.isConnecting) {
            throw new Error("Connection attempt failed");
          }
          await new Promise((resolve) => setTimeout(resolve, checkInterval));
          waited += checkInterval;
        }
        throw new Error("Connection timeout");
      }
      /**
       * Setup connection event listeners (evita duplicados)
       */
      setupConnectionListeners(conn) {
        conn.removeAllListeners("error");
        conn.removeAllListeners("disconnected");
        conn.removeAllListeners("reconnected");
        conn.on("error", (err) => {
          if (this.IS_PROD) {
            logger_default.error("\u274C Portal MongoDB error:", err.message);
          }
          this.isConnected = false;
        });
        conn.on("disconnected", () => {
          this.isConnected = false;
        });
        conn.on("reconnected", () => {
          this.isConnected = true;
          if (this.IS_PROD) {
            logger_default.info("\u{1F504} Portal MongoDB reconnected");
          }
        });
      }
      /**
       * Circuit breaker: Check if open
       */
      isCircuitBreakerOpen() {
        if (!this.circuitBreaker.isOpen) return false;
        if (Date.now() > this.circuitBreaker.nextRetry) {
          this.circuitBreaker.isOpen = false;
          this.circuitBreaker.failures = 0;
          logger_default.info("\u{1F513} Circuit breaker closed - retrying connections");
          return false;
        }
        return true;
      }
      /**
       * Circuit breaker: Record failure
       */
      recordCircuitBreakerFailure() {
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailure = Date.now();
        if (this.circuitBreaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
          this.circuitBreaker.isOpen = true;
          this.circuitBreaker.nextRetry = Date.now() + this.CIRCUIT_BREAKER_TIMEOUT;
          logger_default.error(
            `\u{1F512} Circuit breaker OPEN - Too many failures (${this.circuitBreaker.failures}). Will retry in ${this.CIRCUIT_BREAKER_TIMEOUT / 1e3}s`
          );
        }
      }
      /**
       * Circuit breaker: Reset
       */
      resetCircuitBreaker() {
        if (this.circuitBreaker.failures > 0 || this.circuitBreaker.isOpen) {
          this.circuitBreaker.isOpen = false;
          this.circuitBreaker.failures = 0;
          logger_default.info("\u2705 Circuit breaker reset");
        }
      }
      /**
       * Desconecta de MongoDB
       */
      async disconnect() {
        if (this.portalMongoConn) {
          try {
            await this.portalMongoConn.close();
            this.portalMongoConn = null;
            this.CompanyModel = null;
            this.isConnected = false;
            logger_default.info("\u{1F50C} QuotaValidator disconnected from Portal MongoDB");
          } catch (error) {
            logger_default.error("\u274C Error disconnecting QuotaValidator:", error);
          }
        }
      }
      /**
       * Verifica si está conectado y listo
       */
      isReady() {
        return this.isConnected && this.portalMongoConn !== null && this.portalMongoConn.readyState === 1;
      }
      // ==========================================================================
      // COMPANY HELPERS
      // ==========================================================================
      /**
       * Obtiene los datos de una empresa desde Portal MongoDB
       * (auto-conecta si es necesario)
       */
      async getCompany(companyId) {
        if (!this.isReady()) {
          await this.connect();
        }
        if (!this.CompanyModel) {
          throw new Error("QuotaValidator not initialized");
        }
        const company = await this.CompanyModel.findOne({ companyId, isActive: true });
        if (!company) {
          logger_default.warn(`Company not found or inactive: ${companyId}`);
          throw new Error(`Company not found: ${companyId}`);
        }
        return company;
      }
      /**
       * Obtiene el periodo actual (YYYY-MM)
       */
      getCurrentPeriod() {
        const now = /* @__PURE__ */ new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        return `${year}-${month}`;
      }
      // ==========================================================================
      // WHATSAPP QUOTA
      // ==========================================================================
      /**
       * Verifica si una empresa puede enviar un mensaje de WhatsApp
       * @param companyId ID de la empresa
       * @returns true si está permitido, false si excede el límite
       */
      async checkWhatsAppQuota(companyId) {
        try {
          const company = await this.getCompany(companyId);
          const limit = company.limits.whatsappMessages;
          const used = company.subscription?.usage?.whatsappMessages || 0;
          if (limit === -1) {
            return true;
          }
          const allowed = used < limit;
          if (!allowed) {
            logger_default.warn(`WhatsApp quota exceeded for ${companyId}: ${used}/${limit}`);
          }
          return allowed;
        } catch (error) {
          logger_default.error(`Error checking WhatsApp quota for ${companyId}:`, error);
          return true;
        }
      }
      /**
       * Obtiene información detallada de la quota de WhatsApp
       */
      async getWhatsAppQuotaInfo(companyId) {
        const company = await this.getCompany(companyId);
        const limit = company.limits.whatsappMessages;
        const current = company.subscription?.usage?.whatsappMessages || 0;
        if (limit === -1) {
          return {
            allowed: true,
            current,
            limit,
            remaining: -1,
            // Ilimitado
            period: this.getCurrentPeriod()
          };
        }
        const remaining = Math.max(0, limit - current);
        const allowed = current < limit;
        const period = this.getCurrentPeriod();
        return { allowed, current, limit, remaining, period };
      }
      /**
       * Incrementa el contador de mensajes de WhatsApp en MongoDB
       */
      async incrementWhatsAppUsage(companyId, count = 1) {
        if (!this.isReady()) {
          await this.connect();
        }
        if (!this.CompanyModel) {
          throw new Error("QuotaValidator not initialized");
        }
        const result = await this.CompanyModel.findOneAndUpdate(
          { companyId, isActive: true },
          { $inc: { "subscription.usage.whatsappMessages": count } },
          { new: true }
        );
        if (!result) {
          throw new Error(`Company not found: ${companyId}`);
        }
        const newValue = result.subscription?.usage?.whatsappMessages || 0;
        logger_default.debug(`WhatsApp usage for ${companyId}: ${newValue}`);
        return newValue;
      }
      // ==========================================================================
      // STORAGE QUOTA
      // ==========================================================================
      /**
       * Verifica si una empresa puede almacenar un archivo
       */
      async checkStorageQuota(companyId, fileSize) {
        try {
          const company = await this.getCompany(companyId);
          const limitGb = company.limits.storage;
          if (limitGb === -1) {
            return true;
          }
          const limitBytes = limitGb * 1024 * 1024 * 1024;
          const usedGb = company.subscription?.usage?.storage || 0;
          const usedBytes = usedGb * 1024 * 1024 * 1024;
          const allowed = usedBytes + fileSize <= limitBytes;
          if (!allowed) {
            logger_default.warn(
              `Storage quota exceeded for ${companyId}: ${this.formatBytes(usedBytes + fileSize)}/${limitGb} GB`
            );
          }
          return allowed;
        } catch (error) {
          logger_default.error(`Error checking storage quota for ${companyId}:`, error);
          return true;
        }
      }
      /**
       * Obtiene información detallada de la quota de almacenamiento
       */
      async getStorageQuotaInfo(companyId) {
        const company = await this.getCompany(companyId);
        const limitGb = company.limits.storage;
        const usedGb = company.subscription?.usage?.storage || 0;
        const current = usedGb * 1024 * 1024 * 1024;
        if (limitGb === -1) {
          return {
            allowed: true,
            current,
            limit: -1,
            remaining: -1,
            // Ilimitado
            period: this.getCurrentPeriod()
          };
        }
        const limit = limitGb * 1024 * 1024 * 1024;
        const remaining = Math.max(0, limit - current);
        const allowed = current < limit;
        const period = this.getCurrentPeriod();
        return { allowed, current, limit, remaining, period };
      }
      /**
       * Incrementa el contador de almacenamiento en MongoDB
       */
      async incrementStorageUsage(companyId, fileSize) {
        if (!this.isReady()) {
          await this.connect();
        }
        if (!this.CompanyModel) {
          throw new Error("QuotaValidator not initialized");
        }
        const fileSizeGb = fileSize / (1024 * 1024 * 1024);
        const result = await this.CompanyModel.findOneAndUpdate(
          { companyId, isActive: true },
          { $inc: { "subscription.usage.storage": fileSizeGb } },
          { new: true }
        );
        if (!result) {
          throw new Error(`Company not found: ${companyId}`);
        }
        const newValueGb = result.subscription?.usage?.storage || 0;
        const newValueBytes = newValueGb * 1024 * 1024 * 1024;
        logger_default.debug(`Storage usage for ${companyId}: ${newValueGb.toFixed(4)} GB`);
        return newValueBytes;
      }
      /**
       * Decrementa el contador de almacenamiento en MongoDB
       */
      async decrementStorageUsage(companyId, fileSize) {
        if (!this.isReady()) {
          await this.connect();
        }
        if (!this.CompanyModel) {
          throw new Error("QuotaValidator not initialized");
        }
        const fileSizeGb = fileSize / (1024 * 1024 * 1024);
        const result = await this.CompanyModel.findOneAndUpdate(
          { companyId, isActive: true },
          { $inc: { "subscription.usage.storage": -fileSizeGb } },
          { new: true }
        );
        if (!result) {
          throw new Error(`Company not found: ${companyId}`);
        }
        const newValueGb = result.subscription?.usage?.storage || 0;
        const newValueBytes = newValueGb * 1024 * 1024 * 1024;
        logger_default.debug(`Storage usage for ${companyId}: ${newValueGb.toFixed(4)} GB`);
        return newValueBytes;
      }
      // ==========================================================================
      // GENERAL QUOTA INFO
      // ==========================================================================
      /**
       * Obtiene información completa de todas las quotas
       */
      async getQuotaInfo(companyId) {
        const whatsappMessages = await this.getWhatsAppQuotaInfo(companyId);
        const storage = await this.getStorageQuotaInfo(companyId);
        return { whatsappMessages, storage };
      }
      // ==========================================================================
      // UTILITIES
      // ==========================================================================
      /**
       * Formatea bytes a formato legible
       */
      formatBytes(bytes) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
      }
    };
    quotaValidatorService = QuotaValidatorService.getInstance();
    quota_validator_service_default = quotaValidatorService;
  }
});

// node_modules/safe-buffer/index.js
var require_safe_buffer = __commonJS({
  "node_modules/safe-buffer/index.js"(exports, module) {
    var buffer = __require("buffer");
    var Buffer2 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer2.from && Buffer2.alloc && Buffer2.allocUnsafe && Buffer2.allocUnsafeSlow) {
      module.exports = buffer;
    } else {
      copyProps(buffer, exports);
      exports.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer2(arg, encodingOrOffset, length);
    }
    SafeBuffer.prototype = Object.create(Buffer2.prototype);
    copyProps(Buffer2, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer2(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer2(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer2(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  }
});

// node_modules/jws/lib/data-stream.js
var require_data_stream = __commonJS({
  "node_modules/jws/lib/data-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var Stream = __require("stream");
    var util = __require("util");
    function DataStream(data) {
      this.buffer = null;
      this.writable = true;
      this.readable = true;
      if (!data) {
        this.buffer = Buffer2.alloc(0);
        return this;
      }
      if (typeof data.pipe === "function") {
        this.buffer = Buffer2.alloc(0);
        data.pipe(this);
        return this;
      }
      if (data.length || typeof data === "object") {
        this.buffer = data;
        this.writable = false;
        process.nextTick(function() {
          this.emit("end", data);
          this.readable = false;
          this.emit("close");
        }.bind(this));
        return this;
      }
      throw new TypeError("Unexpected data type (" + typeof data + ")");
    }
    util.inherits(DataStream, Stream);
    DataStream.prototype.write = function write(data) {
      this.buffer = Buffer2.concat([this.buffer, Buffer2.from(data)]);
      this.emit("data", data);
    };
    DataStream.prototype.end = function end(data) {
      if (data)
        this.write(data);
      this.emit("end", data);
      this.emit("close");
      this.writable = false;
      this.readable = false;
    };
    module.exports = DataStream;
  }
});

// node_modules/ecdsa-sig-formatter/src/param-bytes-for-alg.js
var require_param_bytes_for_alg = __commonJS({
  "node_modules/ecdsa-sig-formatter/src/param-bytes-for-alg.js"(exports, module) {
    "use strict";
    function getParamSize(keySize) {
      var result = (keySize / 8 | 0) + (keySize % 8 === 0 ? 0 : 1);
      return result;
    }
    var paramBytesForAlg = {
      ES256: getParamSize(256),
      ES384: getParamSize(384),
      ES512: getParamSize(521)
    };
    function getParamBytesForAlg(alg) {
      var paramBytes = paramBytesForAlg[alg];
      if (paramBytes) {
        return paramBytes;
      }
      throw new Error('Unknown algorithm "' + alg + '"');
    }
    module.exports = getParamBytesForAlg;
  }
});

// node_modules/ecdsa-sig-formatter/src/ecdsa-sig-formatter.js
var require_ecdsa_sig_formatter = __commonJS({
  "node_modules/ecdsa-sig-formatter/src/ecdsa-sig-formatter.js"(exports, module) {
    "use strict";
    var Buffer2 = require_safe_buffer().Buffer;
    var getParamBytesForAlg = require_param_bytes_for_alg();
    var MAX_OCTET = 128;
    var CLASS_UNIVERSAL = 0;
    var PRIMITIVE_BIT = 32;
    var TAG_SEQ = 16;
    var TAG_INT = 2;
    var ENCODED_TAG_SEQ = TAG_SEQ | PRIMITIVE_BIT | CLASS_UNIVERSAL << 6;
    var ENCODED_TAG_INT = TAG_INT | CLASS_UNIVERSAL << 6;
    function base64Url(base64) {
      return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function signatureAsBuffer(signature) {
      if (Buffer2.isBuffer(signature)) {
        return signature;
      } else if ("string" === typeof signature) {
        return Buffer2.from(signature, "base64");
      }
      throw new TypeError("ECDSA signature must be a Base64 string or a Buffer");
    }
    function derToJose(signature, alg) {
      signature = signatureAsBuffer(signature);
      var paramBytes = getParamBytesForAlg(alg);
      var maxEncodedParamLength = paramBytes + 1;
      var inputLength = signature.length;
      var offset = 0;
      if (signature[offset++] !== ENCODED_TAG_SEQ) {
        throw new Error('Could not find expected "seq"');
      }
      var seqLength = signature[offset++];
      if (seqLength === (MAX_OCTET | 1)) {
        seqLength = signature[offset++];
      }
      if (inputLength - offset < seqLength) {
        throw new Error('"seq" specified length of "' + seqLength + '", only "' + (inputLength - offset) + '" remaining');
      }
      if (signature[offset++] !== ENCODED_TAG_INT) {
        throw new Error('Could not find expected "int" for "r"');
      }
      var rLength = signature[offset++];
      if (inputLength - offset - 2 < rLength) {
        throw new Error('"r" specified length of "' + rLength + '", only "' + (inputLength - offset - 2) + '" available');
      }
      if (maxEncodedParamLength < rLength) {
        throw new Error('"r" specified length of "' + rLength + '", max of "' + maxEncodedParamLength + '" is acceptable');
      }
      var rOffset = offset;
      offset += rLength;
      if (signature[offset++] !== ENCODED_TAG_INT) {
        throw new Error('Could not find expected "int" for "s"');
      }
      var sLength = signature[offset++];
      if (inputLength - offset !== sLength) {
        throw new Error('"s" specified length of "' + sLength + '", expected "' + (inputLength - offset) + '"');
      }
      if (maxEncodedParamLength < sLength) {
        throw new Error('"s" specified length of "' + sLength + '", max of "' + maxEncodedParamLength + '" is acceptable');
      }
      var sOffset = offset;
      offset += sLength;
      if (offset !== inputLength) {
        throw new Error('Expected to consume entire buffer, but "' + (inputLength - offset) + '" bytes remain');
      }
      var rPadding = paramBytes - rLength, sPadding = paramBytes - sLength;
      var dst = Buffer2.allocUnsafe(rPadding + rLength + sPadding + sLength);
      for (offset = 0; offset < rPadding; ++offset) {
        dst[offset] = 0;
      }
      signature.copy(dst, offset, rOffset + Math.max(-rPadding, 0), rOffset + rLength);
      offset = paramBytes;
      for (var o = offset; offset < o + sPadding; ++offset) {
        dst[offset] = 0;
      }
      signature.copy(dst, offset, sOffset + Math.max(-sPadding, 0), sOffset + sLength);
      dst = dst.toString("base64");
      dst = base64Url(dst);
      return dst;
    }
    function countPadding(buf, start, stop) {
      var padding = 0;
      while (start + padding < stop && buf[start + padding] === 0) {
        ++padding;
      }
      var needsSign = buf[start + padding] >= MAX_OCTET;
      if (needsSign) {
        --padding;
      }
      return padding;
    }
    function joseToDer(signature, alg) {
      signature = signatureAsBuffer(signature);
      var paramBytes = getParamBytesForAlg(alg);
      var signatureBytes = signature.length;
      if (signatureBytes !== paramBytes * 2) {
        throw new TypeError('"' + alg + '" signatures must be "' + paramBytes * 2 + '" bytes, saw "' + signatureBytes + '"');
      }
      var rPadding = countPadding(signature, 0, paramBytes);
      var sPadding = countPadding(signature, paramBytes, signature.length);
      var rLength = paramBytes - rPadding;
      var sLength = paramBytes - sPadding;
      var rsBytes = 1 + 1 + rLength + 1 + 1 + sLength;
      var shortLength = rsBytes < MAX_OCTET;
      var dst = Buffer2.allocUnsafe((shortLength ? 2 : 3) + rsBytes);
      var offset = 0;
      dst[offset++] = ENCODED_TAG_SEQ;
      if (shortLength) {
        dst[offset++] = rsBytes;
      } else {
        dst[offset++] = MAX_OCTET | 1;
        dst[offset++] = rsBytes & 255;
      }
      dst[offset++] = ENCODED_TAG_INT;
      dst[offset++] = rLength;
      if (rPadding < 0) {
        dst[offset++] = 0;
        offset += signature.copy(dst, offset, 0, paramBytes);
      } else {
        offset += signature.copy(dst, offset, rPadding, paramBytes);
      }
      dst[offset++] = ENCODED_TAG_INT;
      dst[offset++] = sLength;
      if (sPadding < 0) {
        dst[offset++] = 0;
        signature.copy(dst, offset, paramBytes);
      } else {
        signature.copy(dst, offset, paramBytes + sPadding);
      }
      return dst;
    }
    module.exports = {
      derToJose,
      joseToDer
    };
  }
});

// node_modules/buffer-equal-constant-time/index.js
var require_buffer_equal_constant_time = __commonJS({
  "node_modules/buffer-equal-constant-time/index.js"(exports, module) {
    "use strict";
    var Buffer2 = __require("buffer").Buffer;
    var SlowBuffer = __require("buffer").SlowBuffer;
    module.exports = bufferEq;
    function bufferEq(a, b) {
      if (!Buffer2.isBuffer(a) || !Buffer2.isBuffer(b)) {
        return false;
      }
      if (a.length !== b.length) {
        return false;
      }
      var c = 0;
      for (var i = 0; i < a.length; i++) {
        c |= a[i] ^ b[i];
      }
      return c === 0;
    }
    bufferEq.install = function() {
      Buffer2.prototype.equal = SlowBuffer.prototype.equal = function equal(that) {
        return bufferEq(this, that);
      };
    };
    var origBufEqual = Buffer2.prototype.equal;
    var origSlowBufEqual = SlowBuffer.prototype.equal;
    bufferEq.restore = function() {
      Buffer2.prototype.equal = origBufEqual;
      SlowBuffer.prototype.equal = origSlowBufEqual;
    };
  }
});

// node_modules/jwa/index.js
var require_jwa = __commonJS({
  "node_modules/jwa/index.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var crypto2 = __require("crypto");
    var formatEcdsa = require_ecdsa_sig_formatter();
    var util = __require("util");
    var MSG_INVALID_ALGORITHM = '"%s" is not a valid algorithm.\n  Supported algorithms are:\n  "HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512" and "none".';
    var MSG_INVALID_SECRET = "secret must be a string or buffer";
    var MSG_INVALID_VERIFIER_KEY = "key must be a string or a buffer";
    var MSG_INVALID_SIGNER_KEY = "key must be a string, a buffer or an object";
    var supportsKeyObjects = typeof crypto2.createPublicKey === "function";
    if (supportsKeyObjects) {
      MSG_INVALID_VERIFIER_KEY += " or a KeyObject";
      MSG_INVALID_SECRET += "or a KeyObject";
    }
    function checkIsPublicKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return;
      }
      if (!supportsKeyObjects) {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key !== "object") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.type !== "string") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.asymmetricKeyType !== "string") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
      if (typeof key.export !== "function") {
        throw typeError(MSG_INVALID_VERIFIER_KEY);
      }
    }
    function checkIsPrivateKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return;
      }
      if (typeof key === "object") {
        return;
      }
      throw typeError(MSG_INVALID_SIGNER_KEY);
    }
    function checkIsSecretKey(key) {
      if (Buffer2.isBuffer(key)) {
        return;
      }
      if (typeof key === "string") {
        return key;
      }
      if (!supportsKeyObjects) {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (typeof key !== "object") {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (key.type !== "secret") {
        throw typeError(MSG_INVALID_SECRET);
      }
      if (typeof key.export !== "function") {
        throw typeError(MSG_INVALID_SECRET);
      }
    }
    function fromBase64(base64) {
      return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function toBase64(base64url) {
      base64url = base64url.toString();
      var padding = 4 - base64url.length % 4;
      if (padding !== 4) {
        for (var i = 0; i < padding; ++i) {
          base64url += "=";
        }
      }
      return base64url.replace(/\-/g, "+").replace(/_/g, "/");
    }
    function typeError(template) {
      var args = [].slice.call(arguments, 1);
      var errMsg = util.format.bind(util, template).apply(null, args);
      return new TypeError(errMsg);
    }
    function bufferOrString(obj) {
      return Buffer2.isBuffer(obj) || typeof obj === "string";
    }
    function normalizeInput(thing) {
      if (!bufferOrString(thing))
        thing = JSON.stringify(thing);
      return thing;
    }
    function createHmacSigner(bits) {
      return function sign(thing, secret) {
        checkIsSecretKey(secret);
        thing = normalizeInput(thing);
        var hmac = crypto2.createHmac("sha" + bits, secret);
        var sig = (hmac.update(thing), hmac.digest("base64"));
        return fromBase64(sig);
      };
    }
    var bufferEqual;
    var timingSafeEqual = "timingSafeEqual" in crypto2 ? function timingSafeEqual2(a, b) {
      if (a.byteLength !== b.byteLength) {
        return false;
      }
      return crypto2.timingSafeEqual(a, b);
    } : function timingSafeEqual2(a, b) {
      if (!bufferEqual) {
        bufferEqual = require_buffer_equal_constant_time();
      }
      return bufferEqual(a, b);
    };
    function createHmacVerifier(bits) {
      return function verify(thing, signature, secret) {
        var computedSig = createHmacSigner(bits)(thing, secret);
        return timingSafeEqual(Buffer2.from(signature), Buffer2.from(computedSig));
      };
    }
    function createKeySigner(bits) {
      return function sign(thing, privateKey) {
        checkIsPrivateKey(privateKey);
        thing = normalizeInput(thing);
        var signer = crypto2.createSign("RSA-SHA" + bits);
        var sig = (signer.update(thing), signer.sign(privateKey, "base64"));
        return fromBase64(sig);
      };
    }
    function createKeyVerifier(bits) {
      return function verify(thing, signature, publicKey) {
        checkIsPublicKey(publicKey);
        thing = normalizeInput(thing);
        signature = toBase64(signature);
        var verifier = crypto2.createVerify("RSA-SHA" + bits);
        verifier.update(thing);
        return verifier.verify(publicKey, signature, "base64");
      };
    }
    function createPSSKeySigner(bits) {
      return function sign(thing, privateKey) {
        checkIsPrivateKey(privateKey);
        thing = normalizeInput(thing);
        var signer = crypto2.createSign("RSA-SHA" + bits);
        var sig = (signer.update(thing), signer.sign({
          key: privateKey,
          padding: crypto2.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto2.constants.RSA_PSS_SALTLEN_DIGEST
        }, "base64"));
        return fromBase64(sig);
      };
    }
    function createPSSKeyVerifier(bits) {
      return function verify(thing, signature, publicKey) {
        checkIsPublicKey(publicKey);
        thing = normalizeInput(thing);
        signature = toBase64(signature);
        var verifier = crypto2.createVerify("RSA-SHA" + bits);
        verifier.update(thing);
        return verifier.verify({
          key: publicKey,
          padding: crypto2.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto2.constants.RSA_PSS_SALTLEN_DIGEST
        }, signature, "base64");
      };
    }
    function createECDSASigner(bits) {
      var inner = createKeySigner(bits);
      return function sign() {
        var signature = inner.apply(null, arguments);
        signature = formatEcdsa.derToJose(signature, "ES" + bits);
        return signature;
      };
    }
    function createECDSAVerifer(bits) {
      var inner = createKeyVerifier(bits);
      return function verify(thing, signature, publicKey) {
        signature = formatEcdsa.joseToDer(signature, "ES" + bits).toString("base64");
        var result = inner(thing, signature, publicKey);
        return result;
      };
    }
    function createNoneSigner() {
      return function sign() {
        return "";
      };
    }
    function createNoneVerifier() {
      return function verify(thing, signature) {
        return signature === "";
      };
    }
    module.exports = function jwa(algorithm) {
      var signerFactories = {
        hs: createHmacSigner,
        rs: createKeySigner,
        ps: createPSSKeySigner,
        es: createECDSASigner,
        none: createNoneSigner
      };
      var verifierFactories = {
        hs: createHmacVerifier,
        rs: createKeyVerifier,
        ps: createPSSKeyVerifier,
        es: createECDSAVerifer,
        none: createNoneVerifier
      };
      var match = algorithm.match(/^(RS|PS|ES|HS)(256|384|512)$|^(none)$/);
      if (!match)
        throw typeError(MSG_INVALID_ALGORITHM, algorithm);
      var algo = (match[1] || match[3]).toLowerCase();
      var bits = match[2];
      return {
        sign: signerFactories[algo](bits),
        verify: verifierFactories[algo](bits)
      };
    };
  }
});

// node_modules/jws/lib/tostring.js
var require_tostring = __commonJS({
  "node_modules/jws/lib/tostring.js"(exports, module) {
    var Buffer2 = __require("buffer").Buffer;
    module.exports = function toString(obj) {
      if (typeof obj === "string")
        return obj;
      if (typeof obj === "number" || Buffer2.isBuffer(obj))
        return obj.toString();
      return JSON.stringify(obj);
    };
  }
});

// node_modules/jws/lib/sign-stream.js
var require_sign_stream = __commonJS({
  "node_modules/jws/lib/sign-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var DataStream = require_data_stream();
    var jwa = require_jwa();
    var Stream = __require("stream");
    var toString = require_tostring();
    var util = __require("util");
    function base64url(string, encoding) {
      return Buffer2.from(string, encoding).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    }
    function jwsSecuredInput(header, payload, encoding) {
      encoding = encoding || "utf8";
      var encodedHeader = base64url(toString(header), "binary");
      var encodedPayload = base64url(toString(payload), encoding);
      return util.format("%s.%s", encodedHeader, encodedPayload);
    }
    function jwsSign(opts) {
      var header = opts.header;
      var payload = opts.payload;
      var secretOrKey = opts.secret || opts.privateKey;
      var encoding = opts.encoding;
      var algo = jwa(header.alg);
      var securedInput = jwsSecuredInput(header, payload, encoding);
      var signature = algo.sign(securedInput, secretOrKey);
      return util.format("%s.%s", securedInput, signature);
    }
    function SignStream(opts) {
      var secret = opts.secret;
      secret = secret == null ? opts.privateKey : secret;
      secret = secret == null ? opts.key : secret;
      if (/^hs/i.test(opts.header.alg) === true && secret == null) {
        throw new TypeError("secret must be a string or buffer or a KeyObject");
      }
      var secretStream = new DataStream(secret);
      this.readable = true;
      this.header = opts.header;
      this.encoding = opts.encoding;
      this.secret = this.privateKey = this.key = secretStream;
      this.payload = new DataStream(opts.payload);
      this.secret.once("close", function() {
        if (!this.payload.writable && this.readable)
          this.sign();
      }.bind(this));
      this.payload.once("close", function() {
        if (!this.secret.writable && this.readable)
          this.sign();
      }.bind(this));
    }
    util.inherits(SignStream, Stream);
    SignStream.prototype.sign = function sign() {
      try {
        var signature = jwsSign({
          header: this.header,
          payload: this.payload.buffer,
          secret: this.secret.buffer,
          encoding: this.encoding
        });
        this.emit("done", signature);
        this.emit("data", signature);
        this.emit("end");
        this.readable = false;
        return signature;
      } catch (e) {
        this.readable = false;
        this.emit("error", e);
        this.emit("close");
      }
    };
    SignStream.sign = jwsSign;
    module.exports = SignStream;
  }
});

// node_modules/jws/lib/verify-stream.js
var require_verify_stream = __commonJS({
  "node_modules/jws/lib/verify-stream.js"(exports, module) {
    var Buffer2 = require_safe_buffer().Buffer;
    var DataStream = require_data_stream();
    var jwa = require_jwa();
    var Stream = __require("stream");
    var toString = require_tostring();
    var util = __require("util");
    var JWS_REGEX = /^[a-zA-Z0-9\-_]+?\.[a-zA-Z0-9\-_]+?\.([a-zA-Z0-9\-_]+)?$/;
    function isObject(thing) {
      return Object.prototype.toString.call(thing) === "[object Object]";
    }
    function safeJsonParse(thing) {
      if (isObject(thing))
        return thing;
      try {
        return JSON.parse(thing);
      } catch (e) {
        return void 0;
      }
    }
    function headerFromJWS(jwsSig) {
      var encodedHeader = jwsSig.split(".", 1)[0];
      return safeJsonParse(Buffer2.from(encodedHeader, "base64").toString("binary"));
    }
    function securedInputFromJWS(jwsSig) {
      return jwsSig.split(".", 2).join(".");
    }
    function signatureFromJWS(jwsSig) {
      return jwsSig.split(".")[2];
    }
    function payloadFromJWS(jwsSig, encoding) {
      encoding = encoding || "utf8";
      var payload = jwsSig.split(".")[1];
      return Buffer2.from(payload, "base64").toString(encoding);
    }
    function isValidJws(string) {
      return JWS_REGEX.test(string) && !!headerFromJWS(string);
    }
    function jwsVerify(jwsSig, algorithm, secretOrKey) {
      if (!algorithm) {
        var err = new Error("Missing algorithm parameter for jws.verify");
        err.code = "MISSING_ALGORITHM";
        throw err;
      }
      jwsSig = toString(jwsSig);
      var signature = signatureFromJWS(jwsSig);
      var securedInput = securedInputFromJWS(jwsSig);
      var algo = jwa(algorithm);
      return algo.verify(securedInput, signature, secretOrKey);
    }
    function jwsDecode(jwsSig, opts) {
      opts = opts || {};
      jwsSig = toString(jwsSig);
      if (!isValidJws(jwsSig))
        return null;
      var header = headerFromJWS(jwsSig);
      if (!header)
        return null;
      var payload = payloadFromJWS(jwsSig);
      if (header.typ === "JWT" || opts.json)
        payload = JSON.parse(payload, opts.encoding);
      return {
        header,
        payload,
        signature: signatureFromJWS(jwsSig)
      };
    }
    function VerifyStream(opts) {
      opts = opts || {};
      var secretOrKey = opts.secret;
      secretOrKey = secretOrKey == null ? opts.publicKey : secretOrKey;
      secretOrKey = secretOrKey == null ? opts.key : secretOrKey;
      if (/^hs/i.test(opts.algorithm) === true && secretOrKey == null) {
        throw new TypeError("secret must be a string or buffer or a KeyObject");
      }
      var secretStream = new DataStream(secretOrKey);
      this.readable = true;
      this.algorithm = opts.algorithm;
      this.encoding = opts.encoding;
      this.secret = this.publicKey = this.key = secretStream;
      this.signature = new DataStream(opts.signature);
      this.secret.once("close", function() {
        if (!this.signature.writable && this.readable)
          this.verify();
      }.bind(this));
      this.signature.once("close", function() {
        if (!this.secret.writable && this.readable)
          this.verify();
      }.bind(this));
    }
    util.inherits(VerifyStream, Stream);
    VerifyStream.prototype.verify = function verify() {
      try {
        var valid = jwsVerify(this.signature.buffer, this.algorithm, this.key.buffer);
        var obj = jwsDecode(this.signature.buffer, this.encoding);
        this.emit("done", valid, obj);
        this.emit("data", valid);
        this.emit("end");
        this.readable = false;
        return valid;
      } catch (e) {
        this.readable = false;
        this.emit("error", e);
        this.emit("close");
      }
    };
    VerifyStream.decode = jwsDecode;
    VerifyStream.isValid = isValidJws;
    VerifyStream.verify = jwsVerify;
    module.exports = VerifyStream;
  }
});

// node_modules/jws/index.js
var require_jws = __commonJS({
  "node_modules/jws/index.js"(exports) {
    var SignStream = require_sign_stream();
    var VerifyStream = require_verify_stream();
    var ALGORITHMS = [
      "HS256",
      "HS384",
      "HS512",
      "RS256",
      "RS384",
      "RS512",
      "PS256",
      "PS384",
      "PS512",
      "ES256",
      "ES384",
      "ES512"
    ];
    exports.ALGORITHMS = ALGORITHMS;
    exports.sign = SignStream.sign;
    exports.verify = VerifyStream.verify;
    exports.decode = VerifyStream.decode;
    exports.isValid = VerifyStream.isValid;
    exports.createSign = function createSign(opts) {
      return new SignStream(opts);
    };
    exports.createVerify = function createVerify(opts) {
      return new VerifyStream(opts);
    };
  }
});

// node_modules/jsonwebtoken/decode.js
var require_decode = __commonJS({
  "node_modules/jsonwebtoken/decode.js"(exports, module) {
    var jws = require_jws();
    module.exports = function(jwt2, options) {
      options = options || {};
      var decoded = jws.decode(jwt2, options);
      if (!decoded) {
        return null;
      }
      var payload = decoded.payload;
      if (typeof payload === "string") {
        try {
          var obj = JSON.parse(payload);
          if (obj !== null && typeof obj === "object") {
            payload = obj;
          }
        } catch (e) {
        }
      }
      if (options.complete === true) {
        return {
          header: decoded.header,
          payload,
          signature: decoded.signature
        };
      }
      return payload;
    };
  }
});

// node_modules/jsonwebtoken/lib/JsonWebTokenError.js
var require_JsonWebTokenError = __commonJS({
  "node_modules/jsonwebtoken/lib/JsonWebTokenError.js"(exports, module) {
    var JsonWebTokenError = function(message, error) {
      Error.call(this, message);
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
      this.name = "JsonWebTokenError";
      this.message = message;
      if (error) this.inner = error;
    };
    JsonWebTokenError.prototype = Object.create(Error.prototype);
    JsonWebTokenError.prototype.constructor = JsonWebTokenError;
    module.exports = JsonWebTokenError;
  }
});

// node_modules/jsonwebtoken/lib/NotBeforeError.js
var require_NotBeforeError = __commonJS({
  "node_modules/jsonwebtoken/lib/NotBeforeError.js"(exports, module) {
    var JsonWebTokenError = require_JsonWebTokenError();
    var NotBeforeError = function(message, date) {
      JsonWebTokenError.call(this, message);
      this.name = "NotBeforeError";
      this.date = date;
    };
    NotBeforeError.prototype = Object.create(JsonWebTokenError.prototype);
    NotBeforeError.prototype.constructor = NotBeforeError;
    module.exports = NotBeforeError;
  }
});

// node_modules/jsonwebtoken/lib/TokenExpiredError.js
var require_TokenExpiredError = __commonJS({
  "node_modules/jsonwebtoken/lib/TokenExpiredError.js"(exports, module) {
    var JsonWebTokenError = require_JsonWebTokenError();
    var TokenExpiredError = function(message, expiredAt) {
      JsonWebTokenError.call(this, message);
      this.name = "TokenExpiredError";
      this.expiredAt = expiredAt;
    };
    TokenExpiredError.prototype = Object.create(JsonWebTokenError.prototype);
    TokenExpiredError.prototype.constructor = TokenExpiredError;
    module.exports = TokenExpiredError;
  }
});

// node_modules/ms/index.js
var require_ms = __commonJS({
  "node_modules/ms/index.js"(exports, module) {
    var s = 1e3;
    var m = s * 60;
    var h = m * 60;
    var d = h * 24;
    var w = d * 7;
    var y = d * 365.25;
    module.exports = function(val, options) {
      options = options || {};
      var type = typeof val;
      if (type === "string" && val.length > 0) {
        return parse(val);
      } else if (type === "number" && isFinite(val)) {
        return options.long ? fmtLong(val) : fmtShort(val);
      }
      throw new Error(
        "val is not a non-empty string or a valid number. val=" + JSON.stringify(val)
      );
    };
    function parse(str) {
      str = String(str);
      if (str.length > 100) {
        return;
      }
      var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        str
      );
      if (!match) {
        return;
      }
      var n = parseFloat(match[1]);
      var type = (match[2] || "ms").toLowerCase();
      switch (type) {
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
          return n * y;
        case "weeks":
        case "week":
        case "w":
          return n * w;
        case "days":
        case "day":
        case "d":
          return n * d;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
          return n * h;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
          return n * m;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
          return n * s;
        case "milliseconds":
        case "millisecond":
        case "msecs":
        case "msec":
        case "ms":
          return n;
        default:
          return void 0;
      }
    }
    function fmtShort(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return Math.round(ms / d) + "d";
      }
      if (msAbs >= h) {
        return Math.round(ms / h) + "h";
      }
      if (msAbs >= m) {
        return Math.round(ms / m) + "m";
      }
      if (msAbs >= s) {
        return Math.round(ms / s) + "s";
      }
      return ms + "ms";
    }
    function fmtLong(ms) {
      var msAbs = Math.abs(ms);
      if (msAbs >= d) {
        return plural(ms, msAbs, d, "day");
      }
      if (msAbs >= h) {
        return plural(ms, msAbs, h, "hour");
      }
      if (msAbs >= m) {
        return plural(ms, msAbs, m, "minute");
      }
      if (msAbs >= s) {
        return plural(ms, msAbs, s, "second");
      }
      return ms + " ms";
    }
    function plural(ms, msAbs, n, name) {
      var isPlural = msAbs >= n * 1.5;
      return Math.round(ms / n) + " " + name + (isPlural ? "s" : "");
    }
  }
});

// node_modules/jsonwebtoken/lib/timespan.js
var require_timespan = __commonJS({
  "node_modules/jsonwebtoken/lib/timespan.js"(exports, module) {
    var ms = require_ms();
    module.exports = function(time, iat) {
      var timestamp = iat || Math.floor(Date.now() / 1e3);
      if (typeof time === "string") {
        var milliseconds = ms(time);
        if (typeof milliseconds === "undefined") {
          return;
        }
        return Math.floor(timestamp + milliseconds / 1e3);
      } else if (typeof time === "number") {
        return timestamp + time;
      } else {
        return;
      }
    };
  }
});

// node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "node_modules/semver/internal/constants.js"(exports, module) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "node_modules/semver/internal/debug.js"(exports, module) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module.exports = debug;
  }
});

// node_modules/semver/internal/re.js
var require_re = __commonJS({
  "node_modules/semver/internal/re.js"(exports, module) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports = module.exports = {};
    var re = exports.re = [];
    var safeRe = exports.safeRe = [];
    var src = exports.src = [];
    var safeSrc = exports.safeSrc = [];
    var t = exports.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "node_modules/semver/internal/parse-options.js"(exports, module) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module.exports = parseOptions;
  }
});

// node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "node_modules/semver/internal/identifiers.js"(exports, module) {
    "use strict";
    var numeric = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric.test(a);
      const bnum = numeric.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "node_modules/semver/classes/semver.js"(exports, module) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match || match[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (compareIdentifiers(this.prerelease[0], identifier) === 0) {
                if (isNaN(this.prerelease[1])) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module.exports = SemVer;
  }
});

// node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "node_modules/semver/functions/parse.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module.exports = parse;
  }
});

// node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "node_modules/semver/functions/valid.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var valid = (version, options) => {
      const v = parse(version, options);
      return v ? v.version : null;
    };
    module.exports = valid;
  }
});

// node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "node_modules/semver/functions/clean.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var clean = (version, options) => {
      const s = parse(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module.exports = clean;
  }
});

// node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "node_modules/semver/functions/inc.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module.exports = inc;
  }
});

// node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "node_modules/semver/functions/diff.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse(version1, null, true);
      const v2 = parse(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module.exports = diff;
  }
});

// node_modules/semver/functions/major.js
var require_major = __commonJS({
  "node_modules/semver/functions/major.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module.exports = major;
  }
});

// node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "node_modules/semver/functions/minor.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module.exports = minor;
  }
});

// node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "node_modules/semver/functions/patch.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module.exports = patch;
  }
});

// node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "node_modules/semver/functions/prerelease.js"(exports, module) {
    "use strict";
    var parse = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module.exports = prerelease;
  }
});

// node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "node_modules/semver/functions/compare.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module.exports = compare;
  }
});

// node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "node_modules/semver/functions/rcompare.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var rcompare = (a, b, loose) => compare(b, a, loose);
    module.exports = rcompare;
  }
});

// node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "node_modules/semver/functions/compare-loose.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var compareLoose = (a, b) => compare(a, b, true);
    module.exports = compareLoose;
  }
});

// node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "node_modules/semver/functions/compare-build.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module.exports = compareBuild;
  }
});

// node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "node_modules/semver/functions/sort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module.exports = sort;
  }
});

// node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "node_modules/semver/functions/rsort.js"(exports, module) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module.exports = rsort;
  }
});

// node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "node_modules/semver/functions/gt.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var gt = (a, b, loose) => compare(a, b, loose) > 0;
    module.exports = gt;
  }
});

// node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "node_modules/semver/functions/lt.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var lt = (a, b, loose) => compare(a, b, loose) < 0;
    module.exports = lt;
  }
});

// node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "node_modules/semver/functions/eq.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var eq = (a, b, loose) => compare(a, b, loose) === 0;
    module.exports = eq;
  }
});

// node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "node_modules/semver/functions/neq.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var neq = (a, b, loose) => compare(a, b, loose) !== 0;
    module.exports = neq;
  }
});

// node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "node_modules/semver/functions/gte.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var gte = (a, b, loose) => compare(a, b, loose) >= 0;
    module.exports = gte;
  }
});

// node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "node_modules/semver/functions/lte.js"(exports, module) {
    "use strict";
    var compare = require_compare();
    var lte = (a, b, loose) => compare(a, b, loose) <= 0;
    module.exports = lte;
  }
});

// node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "node_modules/semver/functions/cmp.js"(exports, module) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte = require_gte();
    var lt = require_lt();
    var lte = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module.exports = cmp;
  }
});

// node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "node_modules/semver/functions/coerce.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var parse = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match = null;
      if (!options.rtl) {
        match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
          if (!match || next.index + next[0].length !== match.index + match[0].length) {
            match = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match === null) {
        return null;
      }
      const major = match[2];
      const minor = match[3] || "0";
      const patch = match[4] || "0";
      const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
      const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
      return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module.exports = coerce;
  }
});

// node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "node_modules/semver/internal/lrucache.js"(exports, module) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module.exports = LRUCache;
  }
});

// node_modules/semver/classes/range.js
var require_range = __commonJS({
  "node_modules/semver/classes/range.js"(exports, module) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range, options) {
        options = parseOptions(options);
        if (range instanceof _Range) {
          if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
            return range;
          } else {
            return new _Range(range.raw, options);
          }
        }
        if (range instanceof Comparator) {
          this.raw = range.value;
          this.set = [[range]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range) {
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range);
        range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range);
        range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range);
        range = range.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range);
        let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range, options) {
        if (!(range instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}${z} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}${z} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "node_modules/semver/classes/comparator.js"(exports, module) {
    "use strict";
    var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "node_modules/semver/functions/satisfies.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var satisfies = (version, range, options) => {
      try {
        range = new Range(range, options);
      } catch (er) {
        return false;
      }
      return range.test(version);
    };
    module.exports = satisfies;
  }
});

// node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "node_modules/semver/ranges/to-comparators.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module.exports = toComparators;
  }
});

// node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "node_modules/semver/ranges/max-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module.exports = maxSatisfying;
  }
});

// node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "node_modules/semver/ranges/min-satisfying.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module.exports = minSatisfying;
  }
});

// node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "node_modules/semver/ranges/min-version.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range, loose) => {
      range = new Range(range, loose);
      let minver = new SemVer("0.0.0");
      if (range.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range.test(minver)) {
        return minver;
      }
      return null;
    };
    module.exports = minVersion;
  }
});

// node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "node_modules/semver/ranges/valid.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var validRange = (range, options) => {
      try {
        return new Range(range, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module.exports = validRange;
  }
});

// node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "node_modules/semver/ranges/outside.js"(exports, module) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte = require_lte();
    var gte = require_gte();
    var outside = (version, range, hilo, options) => {
      version = new SemVer(version, options);
      range = new Range(range, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range, options)) {
        return false;
      }
      for (let i = 0; i < range.set.length; ++i) {
        const comparators = range.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module.exports = outside;
  }
});

// node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "node_modules/semver/ranges/gtr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range, options) => outside(version, range, ">", options);
    module.exports = gtr;
  }
});

// node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "node_modules/semver/ranges/ltr.js"(exports, module) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range, options) => outside(version, range, "<", options);
    module.exports = ltr;
  }
});

// node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "node_modules/semver/ranges/intersects.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module.exports = intersects;
  }
});

// node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "node_modules/semver/ranges/simplify.js"(exports, module) {
    "use strict";
    var satisfies = require_satisfies();
    var compare = require_compare();
    module.exports = (versions, range, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare(a, b, options));
      for (const version of v) {
        const included = satisfies(version, range, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range.raw === "string" ? range.raw : String(range);
      return simplified.length < original.length ? simplified : range;
    };
  }
});

// node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "node_modules/semver/ranges/subset.js"(exports, module) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !satisfies(gt.semver, String(c), options)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !satisfies(lt.semver, String(c), options)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module.exports = subset;
  }
});

// node_modules/semver/index.js
var require_semver2 = __commonJS({
  "node_modules/semver/index.js"(exports, module) {
    "use strict";
    var internalRe = require_re();
    var constants = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte = require_gte();
    var lte = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module.exports = {
      parse,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte,
      lte,
      cmp,
      coerce,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// node_modules/jsonwebtoken/lib/asymmetricKeyDetailsSupported.js
var require_asymmetricKeyDetailsSupported = __commonJS({
  "node_modules/jsonwebtoken/lib/asymmetricKeyDetailsSupported.js"(exports, module) {
    var semver = require_semver2();
    module.exports = semver.satisfies(process.version, ">=15.7.0");
  }
});

// node_modules/jsonwebtoken/lib/rsaPssKeyDetailsSupported.js
var require_rsaPssKeyDetailsSupported = __commonJS({
  "node_modules/jsonwebtoken/lib/rsaPssKeyDetailsSupported.js"(exports, module) {
    var semver = require_semver2();
    module.exports = semver.satisfies(process.version, ">=16.9.0");
  }
});

// node_modules/jsonwebtoken/lib/validateAsymmetricKey.js
var require_validateAsymmetricKey = __commonJS({
  "node_modules/jsonwebtoken/lib/validateAsymmetricKey.js"(exports, module) {
    var ASYMMETRIC_KEY_DETAILS_SUPPORTED = require_asymmetricKeyDetailsSupported();
    var RSA_PSS_KEY_DETAILS_SUPPORTED = require_rsaPssKeyDetailsSupported();
    var allowedAlgorithmsForKeys = {
      "ec": ["ES256", "ES384", "ES512"],
      "rsa": ["RS256", "PS256", "RS384", "PS384", "RS512", "PS512"],
      "rsa-pss": ["PS256", "PS384", "PS512"]
    };
    var allowedCurves = {
      ES256: "prime256v1",
      ES384: "secp384r1",
      ES512: "secp521r1"
    };
    module.exports = function(algorithm, key) {
      if (!algorithm || !key) return;
      const keyType = key.asymmetricKeyType;
      if (!keyType) return;
      const allowedAlgorithms = allowedAlgorithmsForKeys[keyType];
      if (!allowedAlgorithms) {
        throw new Error(`Unknown key type "${keyType}".`);
      }
      if (!allowedAlgorithms.includes(algorithm)) {
        throw new Error(`"alg" parameter for "${keyType}" key type must be one of: ${allowedAlgorithms.join(", ")}.`);
      }
      if (ASYMMETRIC_KEY_DETAILS_SUPPORTED) {
        switch (keyType) {
          case "ec":
            const keyCurve = key.asymmetricKeyDetails.namedCurve;
            const allowedCurve = allowedCurves[algorithm];
            if (keyCurve !== allowedCurve) {
              throw new Error(`"alg" parameter "${algorithm}" requires curve "${allowedCurve}".`);
            }
            break;
          case "rsa-pss":
            if (RSA_PSS_KEY_DETAILS_SUPPORTED) {
              const length = parseInt(algorithm.slice(-3), 10);
              const { hashAlgorithm, mgf1HashAlgorithm, saltLength } = key.asymmetricKeyDetails;
              if (hashAlgorithm !== `sha${length}` || mgf1HashAlgorithm !== hashAlgorithm) {
                throw new Error(`Invalid key for this operation, its RSA-PSS parameters do not meet the requirements of "alg" ${algorithm}.`);
              }
              if (saltLength !== void 0 && saltLength > length >> 3) {
                throw new Error(`Invalid key for this operation, its RSA-PSS parameter saltLength does not meet the requirements of "alg" ${algorithm}.`);
              }
            }
            break;
        }
      }
    };
  }
});

// node_modules/jsonwebtoken/lib/psSupported.js
var require_psSupported = __commonJS({
  "node_modules/jsonwebtoken/lib/psSupported.js"(exports, module) {
    var semver = require_semver2();
    module.exports = semver.satisfies(process.version, "^6.12.0 || >=8.0.0");
  }
});

// node_modules/jsonwebtoken/verify.js
var require_verify = __commonJS({
  "node_modules/jsonwebtoken/verify.js"(exports, module) {
    var JsonWebTokenError = require_JsonWebTokenError();
    var NotBeforeError = require_NotBeforeError();
    var TokenExpiredError = require_TokenExpiredError();
    var decode = require_decode();
    var timespan = require_timespan();
    var validateAsymmetricKey = require_validateAsymmetricKey();
    var PS_SUPPORTED = require_psSupported();
    var jws = require_jws();
    var { KeyObject, createSecretKey, createPublicKey } = __require("crypto");
    var PUB_KEY_ALGS = ["RS256", "RS384", "RS512"];
    var EC_KEY_ALGS = ["ES256", "ES384", "ES512"];
    var RSA_KEY_ALGS = ["RS256", "RS384", "RS512"];
    var HS_ALGS = ["HS256", "HS384", "HS512"];
    if (PS_SUPPORTED) {
      PUB_KEY_ALGS.splice(PUB_KEY_ALGS.length, 0, "PS256", "PS384", "PS512");
      RSA_KEY_ALGS.splice(RSA_KEY_ALGS.length, 0, "PS256", "PS384", "PS512");
    }
    module.exports = function(jwtString, secretOrPublicKey, options, callback) {
      if (typeof options === "function" && !callback) {
        callback = options;
        options = {};
      }
      if (!options) {
        options = {};
      }
      options = Object.assign({}, options);
      let done;
      if (callback) {
        done = callback;
      } else {
        done = function(err, data) {
          if (err) throw err;
          return data;
        };
      }
      if (options.clockTimestamp && typeof options.clockTimestamp !== "number") {
        return done(new JsonWebTokenError("clockTimestamp must be a number"));
      }
      if (options.nonce !== void 0 && (typeof options.nonce !== "string" || options.nonce.trim() === "")) {
        return done(new JsonWebTokenError("nonce must be a non-empty string"));
      }
      if (options.allowInvalidAsymmetricKeyTypes !== void 0 && typeof options.allowInvalidAsymmetricKeyTypes !== "boolean") {
        return done(new JsonWebTokenError("allowInvalidAsymmetricKeyTypes must be a boolean"));
      }
      const clockTimestamp = options.clockTimestamp || Math.floor(Date.now() / 1e3);
      if (!jwtString) {
        return done(new JsonWebTokenError("jwt must be provided"));
      }
      if (typeof jwtString !== "string") {
        return done(new JsonWebTokenError("jwt must be a string"));
      }
      const parts = jwtString.split(".");
      if (parts.length !== 3) {
        return done(new JsonWebTokenError("jwt malformed"));
      }
      let decodedToken;
      try {
        decodedToken = decode(jwtString, { complete: true });
      } catch (err) {
        return done(err);
      }
      if (!decodedToken) {
        return done(new JsonWebTokenError("invalid token"));
      }
      const header = decodedToken.header;
      let getSecret;
      if (typeof secretOrPublicKey === "function") {
        if (!callback) {
          return done(new JsonWebTokenError("verify must be called asynchronous if secret or public key is provided as a callback"));
        }
        getSecret = secretOrPublicKey;
      } else {
        getSecret = function(header2, secretCallback) {
          return secretCallback(null, secretOrPublicKey);
        };
      }
      return getSecret(header, function(err, secretOrPublicKey2) {
        if (err) {
          return done(new JsonWebTokenError("error in secret or public key callback: " + err.message));
        }
        const hasSignature = parts[2].trim() !== "";
        if (!hasSignature && secretOrPublicKey2) {
          return done(new JsonWebTokenError("jwt signature is required"));
        }
        if (hasSignature && !secretOrPublicKey2) {
          return done(new JsonWebTokenError("secret or public key must be provided"));
        }
        if (!hasSignature && !options.algorithms) {
          return done(new JsonWebTokenError('please specify "none" in "algorithms" to verify unsigned tokens'));
        }
        if (secretOrPublicKey2 != null && !(secretOrPublicKey2 instanceof KeyObject)) {
          try {
            secretOrPublicKey2 = createPublicKey(secretOrPublicKey2);
          } catch (_) {
            try {
              secretOrPublicKey2 = createSecretKey(typeof secretOrPublicKey2 === "string" ? Buffer.from(secretOrPublicKey2) : secretOrPublicKey2);
            } catch (_2) {
              return done(new JsonWebTokenError("secretOrPublicKey is not valid key material"));
            }
          }
        }
        if (!options.algorithms) {
          if (secretOrPublicKey2.type === "secret") {
            options.algorithms = HS_ALGS;
          } else if (["rsa", "rsa-pss"].includes(secretOrPublicKey2.asymmetricKeyType)) {
            options.algorithms = RSA_KEY_ALGS;
          } else if (secretOrPublicKey2.asymmetricKeyType === "ec") {
            options.algorithms = EC_KEY_ALGS;
          } else {
            options.algorithms = PUB_KEY_ALGS;
          }
        }
        if (options.algorithms.indexOf(decodedToken.header.alg) === -1) {
          return done(new JsonWebTokenError("invalid algorithm"));
        }
        if (header.alg.startsWith("HS") && secretOrPublicKey2.type !== "secret") {
          return done(new JsonWebTokenError(`secretOrPublicKey must be a symmetric key when using ${header.alg}`));
        } else if (/^(?:RS|PS|ES)/.test(header.alg) && secretOrPublicKey2.type !== "public") {
          return done(new JsonWebTokenError(`secretOrPublicKey must be an asymmetric key when using ${header.alg}`));
        }
        if (!options.allowInvalidAsymmetricKeyTypes) {
          try {
            validateAsymmetricKey(header.alg, secretOrPublicKey2);
          } catch (e) {
            return done(e);
          }
        }
        let valid;
        try {
          valid = jws.verify(jwtString, decodedToken.header.alg, secretOrPublicKey2);
        } catch (e) {
          return done(e);
        }
        if (!valid) {
          return done(new JsonWebTokenError("invalid signature"));
        }
        const payload = decodedToken.payload;
        if (typeof payload.nbf !== "undefined" && !options.ignoreNotBefore) {
          if (typeof payload.nbf !== "number") {
            return done(new JsonWebTokenError("invalid nbf value"));
          }
          if (payload.nbf > clockTimestamp + (options.clockTolerance || 0)) {
            return done(new NotBeforeError("jwt not active", new Date(payload.nbf * 1e3)));
          }
        }
        if (typeof payload.exp !== "undefined" && !options.ignoreExpiration) {
          if (typeof payload.exp !== "number") {
            return done(new JsonWebTokenError("invalid exp value"));
          }
          if (clockTimestamp >= payload.exp + (options.clockTolerance || 0)) {
            return done(new TokenExpiredError("jwt expired", new Date(payload.exp * 1e3)));
          }
        }
        if (options.audience) {
          const audiences = Array.isArray(options.audience) ? options.audience : [options.audience];
          const target = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
          const match = target.some(function(targetAudience) {
            return audiences.some(function(audience) {
              return audience instanceof RegExp ? audience.test(targetAudience) : audience === targetAudience;
            });
          });
          if (!match) {
            return done(new JsonWebTokenError("jwt audience invalid. expected: " + audiences.join(" or ")));
          }
        }
        if (options.issuer) {
          const invalid_issuer = typeof options.issuer === "string" && payload.iss !== options.issuer || Array.isArray(options.issuer) && options.issuer.indexOf(payload.iss) === -1;
          if (invalid_issuer) {
            return done(new JsonWebTokenError("jwt issuer invalid. expected: " + options.issuer));
          }
        }
        if (options.subject) {
          if (payload.sub !== options.subject) {
            return done(new JsonWebTokenError("jwt subject invalid. expected: " + options.subject));
          }
        }
        if (options.jwtid) {
          if (payload.jti !== options.jwtid) {
            return done(new JsonWebTokenError("jwt jwtid invalid. expected: " + options.jwtid));
          }
        }
        if (options.nonce) {
          if (payload.nonce !== options.nonce) {
            return done(new JsonWebTokenError("jwt nonce invalid. expected: " + options.nonce));
          }
        }
        if (options.maxAge) {
          if (typeof payload.iat !== "number") {
            return done(new JsonWebTokenError("iat required when maxAge is specified"));
          }
          const maxAgeTimestamp = timespan(options.maxAge, payload.iat);
          if (typeof maxAgeTimestamp === "undefined") {
            return done(new JsonWebTokenError('"maxAge" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'));
          }
          if (clockTimestamp >= maxAgeTimestamp + (options.clockTolerance || 0)) {
            return done(new TokenExpiredError("maxAge exceeded", new Date(maxAgeTimestamp * 1e3)));
          }
        }
        if (options.complete === true) {
          const signature = decodedToken.signature;
          return done(null, {
            header,
            payload,
            signature
          });
        }
        return done(null, payload);
      });
    };
  }
});

// node_modules/lodash.includes/index.js
var require_lodash = __commonJS({
  "node_modules/lodash.includes/index.js"(exports, module) {
    var INFINITY = 1 / 0;
    var MAX_SAFE_INTEGER = 9007199254740991;
    var MAX_INTEGER = 17976931348623157e292;
    var NAN = 0 / 0;
    var argsTag = "[object Arguments]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var reTrim = /^\s+|\s+$/g;
    var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
    var reIsBinary = /^0b[01]+$/i;
    var reIsOctal = /^0o[0-7]+$/i;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    var freeParseInt = parseInt;
    function arrayMap(array, iteratee) {
      var index = -1, length = array ? array.length : 0, result = Array(length);
      while (++index < length) {
        result[index] = iteratee(array[index], index, array);
      }
      return result;
    }
    function baseFindIndex(array, predicate, fromIndex, fromRight) {
      var length = array.length, index = fromIndex + (fromRight ? 1 : -1);
      while (fromRight ? index-- : ++index < length) {
        if (predicate(array[index], index, array)) {
          return index;
        }
      }
      return -1;
    }
    function baseIndexOf(array, value, fromIndex) {
      if (value !== value) {
        return baseFindIndex(array, baseIsNaN, fromIndex);
      }
      var index = fromIndex - 1, length = array.length;
      while (++index < length) {
        if (array[index] === value) {
          return index;
        }
      }
      return -1;
    }
    function baseIsNaN(value) {
      return value !== value;
    }
    function baseTimes(n, iteratee) {
      var index = -1, result = Array(n);
      while (++index < n) {
        result[index] = iteratee(index);
      }
      return result;
    }
    function baseValues(object, props) {
      return arrayMap(props, function(key) {
        return object[key];
      });
    }
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    var objectProto = Object.prototype;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectToString = objectProto.toString;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var nativeKeys = overArg(Object.keys, Object);
    var nativeMax = Math.max;
    function arrayLikeKeys(value, inherited) {
      var result = isArray(value) || isArguments(value) ? baseTimes(value.length, String) : [];
      var length = result.length, skipIndexes = !!length;
      for (var key in value) {
        if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && (key == "length" || isIndex(key, length)))) {
          result.push(key);
        }
      }
      return result;
    }
    function baseKeys(object) {
      if (!isPrototype(object)) {
        return nativeKeys(object);
      }
      var result = [];
      for (var key in Object(object)) {
        if (hasOwnProperty.call(object, key) && key != "constructor") {
          result.push(key);
        }
      }
      return result;
    }
    function isIndex(value, length) {
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (typeof value == "number" || reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    function isPrototype(value) {
      var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
      return value === proto;
    }
    function includes(collection, value, fromIndex, guard) {
      collection = isArrayLike(collection) ? collection : values(collection);
      fromIndex = fromIndex && !guard ? toInteger(fromIndex) : 0;
      var length = collection.length;
      if (fromIndex < 0) {
        fromIndex = nativeMax(length + fromIndex, 0);
      }
      return isString(collection) ? fromIndex <= length && collection.indexOf(value, fromIndex) > -1 : !!length && baseIndexOf(collection, value, fromIndex) > -1;
    }
    function isArguments(value) {
      return isArrayLikeObject(value) && hasOwnProperty.call(value, "callee") && (!propertyIsEnumerable.call(value, "callee") || objectToString.call(value) == argsTag);
    }
    var isArray = Array.isArray;
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    function isArrayLikeObject(value) {
      return isObjectLike(value) && isArrayLike(value);
    }
    function isFunction(value) {
      var tag = isObject(value) ? objectToString.call(value) : "";
      return tag == funcTag || tag == genTag;
    }
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isString(value) {
      return typeof value == "string" || !isArray(value) && isObjectLike(value) && objectToString.call(value) == stringTag;
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    function toFinite(value) {
      if (!value) {
        return value === 0 ? value : 0;
      }
      value = toNumber(value);
      if (value === INFINITY || value === -INFINITY) {
        var sign = value < 0 ? -1 : 1;
        return sign * MAX_INTEGER;
      }
      return value === value ? value : 0;
    }
    function toInteger(value) {
      var result = toFinite(value), remainder = result % 1;
      return result === result ? remainder ? result - remainder : result : 0;
    }
    function toNumber(value) {
      if (typeof value == "number") {
        return value;
      }
      if (isSymbol(value)) {
        return NAN;
      }
      if (isObject(value)) {
        var other = typeof value.valueOf == "function" ? value.valueOf() : value;
        value = isObject(other) ? other + "" : other;
      }
      if (typeof value != "string") {
        return value === 0 ? value : +value;
      }
      value = value.replace(reTrim, "");
      var isBinary = reIsBinary.test(value);
      return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
    }
    function keys(object) {
      return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
    }
    function values(object) {
      return object ? baseValues(object, keys(object)) : [];
    }
    module.exports = includes;
  }
});

// node_modules/lodash.isboolean/index.js
var require_lodash2 = __commonJS({
  "node_modules/lodash.isboolean/index.js"(exports, module) {
    var boolTag = "[object Boolean]";
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    function isBoolean(value) {
      return value === true || value === false || isObjectLike(value) && objectToString.call(value) == boolTag;
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    module.exports = isBoolean;
  }
});

// node_modules/lodash.isinteger/index.js
var require_lodash3 = __commonJS({
  "node_modules/lodash.isinteger/index.js"(exports, module) {
    var INFINITY = 1 / 0;
    var MAX_INTEGER = 17976931348623157e292;
    var NAN = 0 / 0;
    var symbolTag = "[object Symbol]";
    var reTrim = /^\s+|\s+$/g;
    var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
    var reIsBinary = /^0b[01]+$/i;
    var reIsOctal = /^0o[0-7]+$/i;
    var freeParseInt = parseInt;
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    function isInteger(value) {
      return typeof value == "number" && value == toInteger(value);
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    function toFinite(value) {
      if (!value) {
        return value === 0 ? value : 0;
      }
      value = toNumber(value);
      if (value === INFINITY || value === -INFINITY) {
        var sign = value < 0 ? -1 : 1;
        return sign * MAX_INTEGER;
      }
      return value === value ? value : 0;
    }
    function toInteger(value) {
      var result = toFinite(value), remainder = result % 1;
      return result === result ? remainder ? result - remainder : result : 0;
    }
    function toNumber(value) {
      if (typeof value == "number") {
        return value;
      }
      if (isSymbol(value)) {
        return NAN;
      }
      if (isObject(value)) {
        var other = typeof value.valueOf == "function" ? value.valueOf() : value;
        value = isObject(other) ? other + "" : other;
      }
      if (typeof value != "string") {
        return value === 0 ? value : +value;
      }
      value = value.replace(reTrim, "");
      var isBinary = reIsBinary.test(value);
      return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
    }
    module.exports = isInteger;
  }
});

// node_modules/lodash.isnumber/index.js
var require_lodash4 = __commonJS({
  "node_modules/lodash.isnumber/index.js"(exports, module) {
    var numberTag = "[object Number]";
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isNumber(value) {
      return typeof value == "number" || isObjectLike(value) && objectToString.call(value) == numberTag;
    }
    module.exports = isNumber;
  }
});

// node_modules/lodash.isplainobject/index.js
var require_lodash5 = __commonJS({
  "node_modules/lodash.isplainobject/index.js"(exports, module) {
    var objectTag = "[object Object]";
    function isHostObject(value) {
      var result = false;
      if (value != null && typeof value.toString != "function") {
        try {
          result = !!(value + "");
        } catch (e) {
        }
      }
      return result;
    }
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var funcToString = funcProto.toString;
    var hasOwnProperty = objectProto.hasOwnProperty;
    var objectCtorString = funcToString.call(Object);
    var objectToString = objectProto.toString;
    var getPrototype = overArg(Object.getPrototypeOf, Object);
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isPlainObject(value) {
      if (!isObjectLike(value) || objectToString.call(value) != objectTag || isHostObject(value)) {
        return false;
      }
      var proto = getPrototype(value);
      if (proto === null) {
        return true;
      }
      var Ctor = hasOwnProperty.call(proto, "constructor") && proto.constructor;
      return typeof Ctor == "function" && Ctor instanceof Ctor && funcToString.call(Ctor) == objectCtorString;
    }
    module.exports = isPlainObject;
  }
});

// node_modules/lodash.isstring/index.js
var require_lodash6 = __commonJS({
  "node_modules/lodash.isstring/index.js"(exports, module) {
    var stringTag = "[object String]";
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    var isArray = Array.isArray;
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isString(value) {
      return typeof value == "string" || !isArray(value) && isObjectLike(value) && objectToString.call(value) == stringTag;
    }
    module.exports = isString;
  }
});

// node_modules/lodash.once/index.js
var require_lodash7 = __commonJS({
  "node_modules/lodash.once/index.js"(exports, module) {
    var FUNC_ERROR_TEXT = "Expected a function";
    var INFINITY = 1 / 0;
    var MAX_INTEGER = 17976931348623157e292;
    var NAN = 0 / 0;
    var symbolTag = "[object Symbol]";
    var reTrim = /^\s+|\s+$/g;
    var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
    var reIsBinary = /^0b[01]+$/i;
    var reIsOctal = /^0o[0-7]+$/i;
    var freeParseInt = parseInt;
    var objectProto = Object.prototype;
    var objectToString = objectProto.toString;
    function before(n, func) {
      var result;
      if (typeof func != "function") {
        throw new TypeError(FUNC_ERROR_TEXT);
      }
      n = toInteger(n);
      return function() {
        if (--n > 0) {
          result = func.apply(this, arguments);
        }
        if (n <= 1) {
          func = void 0;
        }
        return result;
      };
    }
    function once(func) {
      return before(2, func);
    }
    function isObject(value) {
      var type = typeof value;
      return !!value && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return !!value && typeof value == "object";
    }
    function isSymbol(value) {
      return typeof value == "symbol" || isObjectLike(value) && objectToString.call(value) == symbolTag;
    }
    function toFinite(value) {
      if (!value) {
        return value === 0 ? value : 0;
      }
      value = toNumber(value);
      if (value === INFINITY || value === -INFINITY) {
        var sign = value < 0 ? -1 : 1;
        return sign * MAX_INTEGER;
      }
      return value === value ? value : 0;
    }
    function toInteger(value) {
      var result = toFinite(value), remainder = result % 1;
      return result === result ? remainder ? result - remainder : result : 0;
    }
    function toNumber(value) {
      if (typeof value == "number") {
        return value;
      }
      if (isSymbol(value)) {
        return NAN;
      }
      if (isObject(value)) {
        var other = typeof value.valueOf == "function" ? value.valueOf() : value;
        value = isObject(other) ? other + "" : other;
      }
      if (typeof value != "string") {
        return value === 0 ? value : +value;
      }
      value = value.replace(reTrim, "");
      var isBinary = reIsBinary.test(value);
      return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
    }
    module.exports = once;
  }
});

// node_modules/jsonwebtoken/sign.js
var require_sign = __commonJS({
  "node_modules/jsonwebtoken/sign.js"(exports, module) {
    var timespan = require_timespan();
    var PS_SUPPORTED = require_psSupported();
    var validateAsymmetricKey = require_validateAsymmetricKey();
    var jws = require_jws();
    var includes = require_lodash();
    var isBoolean = require_lodash2();
    var isInteger = require_lodash3();
    var isNumber = require_lodash4();
    var isPlainObject = require_lodash5();
    var isString = require_lodash6();
    var once = require_lodash7();
    var { KeyObject, createSecretKey, createPrivateKey } = __require("crypto");
    var SUPPORTED_ALGS = ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "HS256", "HS384", "HS512", "none"];
    if (PS_SUPPORTED) {
      SUPPORTED_ALGS.splice(3, 0, "PS256", "PS384", "PS512");
    }
    var sign_options_schema = {
      expiresIn: { isValid: function(value) {
        return isInteger(value) || isString(value) && value;
      }, message: '"expiresIn" should be a number of seconds or string representing a timespan' },
      notBefore: { isValid: function(value) {
        return isInteger(value) || isString(value) && value;
      }, message: '"notBefore" should be a number of seconds or string representing a timespan' },
      audience: { isValid: function(value) {
        return isString(value) || Array.isArray(value);
      }, message: '"audience" must be a string or array' },
      algorithm: { isValid: includes.bind(null, SUPPORTED_ALGS), message: '"algorithm" must be a valid string enum value' },
      header: { isValid: isPlainObject, message: '"header" must be an object' },
      encoding: { isValid: isString, message: '"encoding" must be a string' },
      issuer: { isValid: isString, message: '"issuer" must be a string' },
      subject: { isValid: isString, message: '"subject" must be a string' },
      jwtid: { isValid: isString, message: '"jwtid" must be a string' },
      noTimestamp: { isValid: isBoolean, message: '"noTimestamp" must be a boolean' },
      keyid: { isValid: isString, message: '"keyid" must be a string' },
      mutatePayload: { isValid: isBoolean, message: '"mutatePayload" must be a boolean' },
      allowInsecureKeySizes: { isValid: isBoolean, message: '"allowInsecureKeySizes" must be a boolean' },
      allowInvalidAsymmetricKeyTypes: { isValid: isBoolean, message: '"allowInvalidAsymmetricKeyTypes" must be a boolean' }
    };
    var registered_claims_schema = {
      iat: { isValid: isNumber, message: '"iat" should be a number of seconds' },
      exp: { isValid: isNumber, message: '"exp" should be a number of seconds' },
      nbf: { isValid: isNumber, message: '"nbf" should be a number of seconds' }
    };
    function validate(schema, allowUnknown, object, parameterName) {
      if (!isPlainObject(object)) {
        throw new Error('Expected "' + parameterName + '" to be a plain object.');
      }
      Object.keys(object).forEach(function(key) {
        const validator = schema[key];
        if (!validator) {
          if (!allowUnknown) {
            throw new Error('"' + key + '" is not allowed in "' + parameterName + '"');
          }
          return;
        }
        if (!validator.isValid(object[key])) {
          throw new Error(validator.message);
        }
      });
    }
    function validateOptions(options) {
      return validate(sign_options_schema, false, options, "options");
    }
    function validatePayload(payload) {
      return validate(registered_claims_schema, true, payload, "payload");
    }
    var options_to_payload = {
      "audience": "aud",
      "issuer": "iss",
      "subject": "sub",
      "jwtid": "jti"
    };
    var options_for_objects = [
      "expiresIn",
      "notBefore",
      "noTimestamp",
      "audience",
      "issuer",
      "subject",
      "jwtid"
    ];
    module.exports = function(payload, secretOrPrivateKey, options, callback) {
      if (typeof options === "function") {
        callback = options;
        options = {};
      } else {
        options = options || {};
      }
      const isObjectPayload = typeof payload === "object" && !Buffer.isBuffer(payload);
      const header = Object.assign({
        alg: options.algorithm || "HS256",
        typ: isObjectPayload ? "JWT" : void 0,
        kid: options.keyid
      }, options.header);
      function failure(err) {
        if (callback) {
          return callback(err);
        }
        throw err;
      }
      if (!secretOrPrivateKey && options.algorithm !== "none") {
        return failure(new Error("secretOrPrivateKey must have a value"));
      }
      if (secretOrPrivateKey != null && !(secretOrPrivateKey instanceof KeyObject)) {
        try {
          secretOrPrivateKey = createPrivateKey(secretOrPrivateKey);
        } catch (_) {
          try {
            secretOrPrivateKey = createSecretKey(typeof secretOrPrivateKey === "string" ? Buffer.from(secretOrPrivateKey) : secretOrPrivateKey);
          } catch (_2) {
            return failure(new Error("secretOrPrivateKey is not valid key material"));
          }
        }
      }
      if (header.alg.startsWith("HS") && secretOrPrivateKey.type !== "secret") {
        return failure(new Error(`secretOrPrivateKey must be a symmetric key when using ${header.alg}`));
      } else if (/^(?:RS|PS|ES)/.test(header.alg)) {
        if (secretOrPrivateKey.type !== "private") {
          return failure(new Error(`secretOrPrivateKey must be an asymmetric key when using ${header.alg}`));
        }
        if (!options.allowInsecureKeySizes && !header.alg.startsWith("ES") && secretOrPrivateKey.asymmetricKeyDetails !== void 0 && //KeyObject.asymmetricKeyDetails is supported in Node 15+
        secretOrPrivateKey.asymmetricKeyDetails.modulusLength < 2048) {
          return failure(new Error(`secretOrPrivateKey has a minimum key size of 2048 bits for ${header.alg}`));
        }
      }
      if (typeof payload === "undefined") {
        return failure(new Error("payload is required"));
      } else if (isObjectPayload) {
        try {
          validatePayload(payload);
        } catch (error) {
          return failure(error);
        }
        if (!options.mutatePayload) {
          payload = Object.assign({}, payload);
        }
      } else {
        const invalid_options = options_for_objects.filter(function(opt) {
          return typeof options[opt] !== "undefined";
        });
        if (invalid_options.length > 0) {
          return failure(new Error("invalid " + invalid_options.join(",") + " option for " + typeof payload + " payload"));
        }
      }
      if (typeof payload.exp !== "undefined" && typeof options.expiresIn !== "undefined") {
        return failure(new Error('Bad "options.expiresIn" option the payload already has an "exp" property.'));
      }
      if (typeof payload.nbf !== "undefined" && typeof options.notBefore !== "undefined") {
        return failure(new Error('Bad "options.notBefore" option the payload already has an "nbf" property.'));
      }
      try {
        validateOptions(options);
      } catch (error) {
        return failure(error);
      }
      if (!options.allowInvalidAsymmetricKeyTypes) {
        try {
          validateAsymmetricKey(header.alg, secretOrPrivateKey);
        } catch (error) {
          return failure(error);
        }
      }
      const timestamp = payload.iat || Math.floor(Date.now() / 1e3);
      if (options.noTimestamp) {
        delete payload.iat;
      } else if (isObjectPayload) {
        payload.iat = timestamp;
      }
      if (typeof options.notBefore !== "undefined") {
        try {
          payload.nbf = timespan(options.notBefore, timestamp);
        } catch (err) {
          return failure(err);
        }
        if (typeof payload.nbf === "undefined") {
          return failure(new Error('"notBefore" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'));
        }
      }
      if (typeof options.expiresIn !== "undefined" && typeof payload === "object") {
        try {
          payload.exp = timespan(options.expiresIn, timestamp);
        } catch (err) {
          return failure(err);
        }
        if (typeof payload.exp === "undefined") {
          return failure(new Error('"expiresIn" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'));
        }
      }
      Object.keys(options_to_payload).forEach(function(key) {
        const claim = options_to_payload[key];
        if (typeof options[key] !== "undefined") {
          if (typeof payload[claim] !== "undefined") {
            return failure(new Error('Bad "options.' + key + '" option. The payload already has an "' + claim + '" property.'));
          }
          payload[claim] = options[key];
        }
      });
      const encoding = options.encoding || "utf8";
      if (typeof callback === "function") {
        callback = callback && once(callback);
        jws.createSign({
          header,
          privateKey: secretOrPrivateKey,
          payload,
          encoding
        }).once("error", callback).once("done", function(signature) {
          if (!options.allowInsecureKeySizes && /^(?:RS|PS)/.test(header.alg) && signature.length < 256) {
            return callback(new Error(`secretOrPrivateKey has a minimum key size of 2048 bits for ${header.alg}`));
          }
          callback(null, signature);
        });
      } else {
        let signature = jws.sign({ header, payload, secret: secretOrPrivateKey, encoding });
        if (!options.allowInsecureKeySizes && /^(?:RS|PS)/.test(header.alg) && signature.length < 256) {
          throw new Error(`secretOrPrivateKey has a minimum key size of 2048 bits for ${header.alg}`);
        }
        return signature;
      }
    };
  }
});

// node_modules/jsonwebtoken/index.js
var require_jsonwebtoken = __commonJS({
  "node_modules/jsonwebtoken/index.js"(exports, module) {
    module.exports = {
      decode: require_decode(),
      verify: require_verify(),
      sign: require_sign(),
      JsonWebTokenError: require_JsonWebTokenError(),
      NotBeforeError: require_NotBeforeError(),
      TokenExpiredError: require_TokenExpiredError()
    };
  }
});

// src/index.ts
init_logger();
init_environment();
import express from "express";
import cors from "cors";
import helmet from "helmet";

// src/api/middlewares/rateLimiter.ts
init_environment();
import rateLimit from "express-rate-limit";
var apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1e3,
  // 5 minutos
  max: config.security.rateLimitMax,
  // límite de requests por ventana
  message: "Demasiadas solicitudes desde esta IP, intenta m\xE1s tarde",
  standardHeaders: true,
  // Retornar información del rate limit en los `RateLimit-*` headers
  legacyHeaders: false,
  // Deshabilitar los headers `X-RateLimit-*`
  skip: (req) => {
    if (req.headers["x-api-key"] === process.env.API_SECRET_KEY) {
      return true;
    }
    const host = (req.hostname || req.get("host") || "").toLowerCase();
    if (host.endsWith("constroad.com") || host === "localhost:3000") {
      return true;
    }
    const origin = (req.get("origin") || req.get("referer") || "").toLowerCase();
    if (!origin) {
      return false;
    }
    try {
      const parsed = new URL(origin);
      return parsed.hostname.endsWith("constroad.com") || parsed.hostname === "localhost" && parsed.port === "3000";
    } catch {
      return origin.includes("constroad.com") || origin.includes("localhost:3000");
    }
  }
});
var sessionLimiter = rateLimit({
  windowMs: 1 * 60 * 1e3,
  // 1 minuto
  max: 5,
  // máximo 5 conexiones por minuto
  keyGenerator: (req) => {
    return req.body?.phoneNumber || req.ip || "unknown";
  }
});
var jobsLimiter = rateLimit({
  windowMs: 60 * 1e3,
  // 1 minuto
  max: 10
});
var messageLimiter = rateLimit({
  windowMs: 60 * 1e3,
  // 1 minuto
  max: 100,
  keyGenerator: (req) => {
    return req.body?.chatId || req.ip || "unknown";
  }
});

// src/api/middlewares/errorHandler.ts
init_logger();

// src/config/constants.ts
var CONVERSATION_TIMEOUT = 30 * 60 * 1e3;
var QR_EXPIRY_TIME = 60 * 1e3;
var HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  REQUEST_TOO_LONG: 413,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};
var CLAUDE_MODEL = "claude-sonnet-4-20250514";
var CLAUDE_MAX_TOKENS = 1024;

// src/api/middlewares/errorHandler.ts
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_ERROR;
  const message = err.message || "Internal Server Error";
  logger_default.error("Error:", {
    statusCode,
    message,
    path: req.path,
    method: req.method,
    details: err.details
  });
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      ...process.env.NODE_ENV === "development" && { stack: err.stack }
    }
  });
}
function notFoundHandler(req, res, next) {
  if (req.path.includes("_next/") || req.path.includes("/__webpack")) {
    return res.status(404).end();
  }
  const error = new Error(`Route not found: ${req.path}`);
  error.statusCode = HTTP_STATUS.NOT_FOUND;
  next(error);
}
function requestLogger(req, res, next) {
  const startTime = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    logger_default.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
}

// src/api/routes/session.routes.ts
import { Router } from "express";

// src/api/controllers/session.controller.ts
import qrcode from "qrcode";

// src/whatsapp/baileys/connection.manager.ts
init_logger();
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import { isBoom } from "@hapi/boom";
import fs3 from "fs-extra";
import path6 from "path";
import pino from "pino";

// src/whatsapp/ai-agent/message.listener.ts
init_logger();

// src/whatsapp/ai-agent/agent.service.ts
init_logger();
import Anthropic from "@anthropic-ai/sdk";

// src/whatsapp/ai-agent/prompts/asphalt-sales.prompt.ts
var SYSTEM_PROMPT = `# TU IDENTIDAD

Eres **Mar\xEDa**, asesora comercial experta de **CONSTROAD**, empresa l\xEDder en servicios de asfalto en Per\xFA con m\xE1s de 15 a\xF1os de experiencia.

---

## TU PERSONALIDAD

- **Profesional pero c\xE1lida**: Mantienes un equilibrio entre seriedad y cercan\xEDa
- **Proactiva**: No esperas a que te pregunten todo, gu\xEDas la conversaci\xF3n
- **Paciente**: Entiendes que no todos conocen de asfalto, explicas con claridad
- **Emp\xE1tica**: Te pones en el lugar del cliente y entiendes sus necesidades
- **Natural**: Hablas como una persona real, no como un robot
- **Peruana**: Usas expresiones locales apropiadas sin caer en informalidad excesiva

**Ejemplos de tu estilo:**
- \u2705 "\xA1Claro que s\xED! Con gusto te ayudo con eso"
- \u2705 "Perfecto, d\xE9jame hacerte un par de preguntas para darte la mejor opci\xF3n"
- \u2705 "Entiendo tu situaci\xF3n, es muy com\xFAn en proyectos como el tuyo"
- \u274C "Procedo a solicitar informaci\xF3n" (muy rob\xF3tico)
- \u274C "Perfecto perfecto perfecto" (muy repetitivo)

---

## TU MISI\xD3N PRINCIPAL

Ayudar a los clientes a encontrar la mejor soluci\xF3n de asfalto para su proyecto, recopilando informaci\xF3n clave de manera **natural, conversacional y eficiente**.

**No eres un formulario con patas**, eres una asesora que:
1. Escucha activamente
2. Hace preguntas inteligentes
3. Adapta la conversaci\xF3n al cliente
4. Recopila informaci\xF3n de forma org\xE1nica
5. Deriva cuando es necesario

---

# SERVICIOS QUE OFRECES

## 1. \u{1F6E3}\uFE0F VENTA DE ASFALTO

### Tipos disponibles:

#### **Asfalto en Caliente**
- El m\xE1s com\xFAn y vers\xE1til
- Ideal para tr\xE1fico vehicular
- Se aplica a temperaturas de 150-160\xB0C
- Mejor adherencia y durabilidad

#### **Asfalto en Fr\xEDo**
- Para reparaciones y parches
- Ideal para climas fr\xEDos o lluviosos
- No requiere maquinaria especializada
- Aplicaci\xF3n m\xE1s sencilla

#### **Asfalto Modificado**
- Mayor durabilidad (pol\xEDmeros)
- Para alto tr\xE1fico o condiciones extremas
- M\xE1s resistente a deformaciones
- Ideal para zonas industriales o avenidas principales

### Espesores disponibles:
- **1 pulgada (2.54 cm)**: Tr\xE1fico ligero, patios, estacionamientos peque\xF1os
- **2 pulgadas (5.08 cm)**: Tr\xE1fico medio, calles residenciales, estacionamientos
- **3 pulgadas (7.62 cm)**: Tr\xE1fico pesado, v\xEDas principales, zonas industriales

### Informaci\xF3n que necesitas recopilar:

1. **Tipo de proyecto** (para recomendar el asfalto adecuado)
   - "\xBFEs para una v\xEDa, estacionamiento, patio industrial, o qu\xE9 tipo de proyecto?"
   
2. **Tipo de tr\xE1fico esperado**
   - "\xBFQu\xE9 tipo de veh\xEDculos van a circular? \xBFAutos, camiones, maquinaria pesada?"
   
3. **Tipo de asfalto** (despu\xE9s de entender su necesidad)
   - Recomienda bas\xE1ndote en su proyecto
   
4. **Espesor requerido**
   - Sugiere seg\xFAn el tipo de tr\xE1fico
   
5. **Modalidad de entrega**
   - "\xBFLo necesitas puesto en planta (lo recoges t\xFA) o puesto en obra (te lo llevamos)?"
   - Si es en obra: "\xBFA qu\xE9 distrito o ubicaci\xF3n exacta ser\xEDa?"
   
6. **Cantidad aproximada**
   - "\xBFCu\xE1ntos metros c\xFAbicos aproximadamente? Si no est\xE1s seguro, \xBFcu\xE1l es el \xE1rea en m\xB2?"

---

## 2. \u{1F6A7} COLOCACI\xD3N DE ASFALTO

### Informaci\xF3n que necesitas recopilar:

#### **1. \xC1rea y ubicaci\xF3n**
- "\xBFCu\xE1ntos metros cuadrados necesitas asfaltar?"
- "\xBFEn qu\xE9 distrito o ubicaci\xF3n exacta ser\xEDa la obra?"

#### **2. Espesor del asfalto**
- Sugiere seg\xFAn el uso

#### **3. Estado de la base**
- "\xBFYa cuentas con la base preparada o es terreno natural?"
- "\xBFEs una base nueva o es un pavimento existente que quieres recubrir?"

#### **4. Imprimaci\xF3n (preparaci\xF3n de superficie)**

 - "\xBFDeseas realizar imprimaci\xF3n en la obra?"
**Si es base nueva:**
- Se requiere imprimaci\xF3n con **MC-30** (asfalto l\xEDquido de curado medio)
- "Para bases nuevas necesitamos aplicar MC-30 como imprimante"

**Si es pavimento existente:**
- Se requiere **riego de liga** (emulsi\xF3n asf\xE1ltica)
- "Como es sobre pavimento existente, aplicaremos riego de liga para que adhiera mejor"
 - Pregunta si desea aplicar con **bast\xF3n** o **barra** (la barra se usa cuando piden control de tasa de dosificaci\xF3n)

#### **5. Fresado (opcional)**
- "\xBFNecesitas que removamos el asfalto viejo antes?"

#### **6. Tipo de terreno**
- "\xBFC\xF3mo es el \xE1rea? \xBFEs una pendiente, es plano tiro largo o son calles?"

---

## 3. \u{1F69B} SERVICIO DE TRANSPORTE

### Informaci\xF3n que necesitas:

1. **Punto de carga**: "\xBFDe d\xF3nde necesitas que recojamos el asfalto?"
2. **Punto de descarga**: "\xBFA d\xF3nde hay que llevarlo?"
3. **Tipo de asfalto**: "\xBFQu\xE9 tipo de asfalto vamos a transportar?"
4. **Cantidad**: "\xBFCu\xE1ntos metros c\xFAbicos (m3) son?"
5. **Consideraciones**: "\xBFHay restricci\xF3n de horario o zona de dif\xEDcil acceso?"

---

## 4. \u{1F3ED} SERVICIO DE FABRICACI\xD3N

**Para este servicio especializado, deriva INMEDIATAMENTE a un ingeniero.**

---

# REGLAS DE CONVERSACI\xD3N

## \u2705 SIEMPRE DEBES:

1. **Hacer preguntas inteligentes y contextuales**
   - M\xE1ximo 2-3 preguntas por mensaje
   - Adapta las preguntas seg\xFAn las respuestas previas

2. **Confirmar informaci\xF3n importante**
   - "Perfecto, entonces son 500 m\xB2 en San Isidro. \xBFEs correcto?"

3. **Celebrar el progreso**
   - "\xA1Perfecto!", "\xA1Excelente!", "\xA1Genial, vamos bien!"

4. **Adaptar tu lenguaje al cliente**
   - Cliente t\xE9cnico \u2192 M\xE1s t\xE9rminos especializados
   - Cliente general \u2192 Explicaciones simples

---

## \u274C NUNCA DEBES:

1. **Inventar informaci\xF3n**
   - \u274C No des precios espec\xEDficos
   - \u274C No prometas fechas exactas
   - \u274C No ofrezcas descuentos

2. **Ser rob\xF3tico**
   - \u274C "Procedo a recopilar datos"
   - \u2705 "Perfecto, d\xE9jame hacerte un par de preguntas"

3. **Abrumar con preguntas**
   - \u274C 5-6 preguntas en un mensaje
   - \u2705 2-3 preguntas m\xE1ximo

4. **Ignorar el contexto previo**
   - Si el cliente ya dijo algo, no lo vuelvas a preguntar

---

# DERIVACI\xD3N A HUMANO

## \u{1F6A8} Deriva INMEDIATAMENTE si:

1. El cliente lo pide expl\xEDcitamente
2. El cliente est\xE1 molesto o insatisfecho
3. Preguntas muy t\xE9cnicas o legales
4. Temas fuera de tu alcance
5. Servicios especializados (fabricaci\xF3n)

**Frase de derivaci\xF3n:**
"Entiendo tu situaci\xF3n. Perm\xEDteme conectarte con un supervisor que te podr\xE1 ayudar mejor. \xBFMe compartes tu n\xFAmero de contacto?"

---

# HORARIOS Y DISPONIBILIDAD

## Horario de atenci\xF3n:
- **Lunes a Viernes**: 8:00 AM - 6:00 PM
- **S\xE1bados**: 8:00 AM - 1:00 PM
- **Domingos**: Cerrado

**Mensaje fuera de horario:**
"\xA1Hola! Gracias por contactar a CONSTROAD \u{1F60A}. Te escribo fuera de nuestro horario de atenci\xF3n (Lunes a Viernes 8 AM - 6 PM, S\xE1bados 8 AM - 1 PM). Te responder\xE9 en cuanto abramos ma\xF1ana. \xA1Que tengas excelente [noche/fin de semana]!"

---

# FLUJO CONVERSACIONAL

## Fase 1: SALUDO Y APERTURA

"\xA1Hola! Soy Mar\xEDa de CONSTROAD \u{1F44B} \xBFEn qu\xE9 te puedo ayudar hoy? Trabajamos en venta de asfalto, colocaci\xF3n, transporte y fabricaci\xF3n de mezclas."

## Fase 2: IDENTIFICACI\xD3N DEL SERVICIO

Escucha y confirma: "Perfecto, veo que necesitas [servicio]. Te voy a hacer algunas preguntas para que el equipo te prepare la mejor cotizaci\xF3n."

## Fase 3: RECOPILACI\xD3N DE INFORMACI\xD3N

- 2-3 preguntas m\xE1ximo por mensaje
- Pregunta lo m\xE1s relevante primero
- Adapta seg\xFAn las respuestas
- Confirma informaci\xF3n importante

## Fase 4: RESUMEN Y CONFIRMACI\xD3N

"Perfecto, d\xE9jame confirmar que tengo todo claro: \u2705 [Resumen]. \xBFEs correcto? \xBFAlgo m\xE1s?"

## Fase 5: CIERRE

"\xA1Excelente! Con esta informaci\xF3n nuestro equipo te preparar\xE1 una cotizaci\xF3n. Un asesor se contactar\xE1 en las pr\xF3ximas 2 horas. \xBFTe parece?"

---

# RECUERDA:

Eres Mar\xEDa, eres humana, eres emp\xE1tica, eres experta, y est\xE1s aqu\xED para AYUDAR. No solo recopiles datos, crea una conexi\xF3n con el cliente. S\xE9 natural, s\xE9 c\xE1lida, s\xE9 profesional.`;
function getUserContextPrompt(conversation) {
  const progress = getProgressSummary(conversation);
  const recentMessages = conversation.messageHistory.slice(-6).map((m) => `${m.role === "user" ? "Cliente" : "T\xFA"}: ${m.content}`).join("\n");
  return `
## CONTEXTO DE LA CONVERSACI\xD3N ACTUAL:

**Cliente:** ${conversation.chatId}
**Servicio identificado:** ${conversation.service || "No identificado a\xFAn"}
**Estado:** ${conversation.state}

**Informaci\xF3n recopilada:**
${JSON.stringify(conversation.collectedData, null, 2)}

**Progreso:** ${progress}

**\xDAltimos mensajes:**
${recentMessages}

---

Bas\xE1ndote en este contexto, responde al \xFAltimo mensaje del cliente de manera natural y contin\xFAa recopilando la informaci\xF3n que falta. Recuerda: \xA1Eres Mar\xEDa! S\xE9 natural, emp\xE1tica y profesional.
`;
}
function getProgressSummary(conversation) {
  const data = conversation.collectedData;
  const service = conversation.service;
  if (!service) return "A\xFAn no se identific\xF3 el servicio";
  const required = getRequiredFields(service);
  const collected = Object.keys(data).filter((k) => data[k]).length;
  const total = required.length;
  return `${collected}/${total} datos recopilados`;
}
function getRequiredFields(service) {
  const fields = {
    venta: ["tipoAsfalto", "espesor", "ubicacion", "cantidad"],
    colocacion: ["espesor", "ubicacion", "area", "imprimacion", "tipoTerreno"],
    transporte: ["puntoCarga", "puntoDescarga", "tipoAsfalto", "cantidad"],
    fabricacion: ["nombreContacto", "telefono"]
  };
  return fields[service] || [];
}

// src/whatsapp/ai-agent/agent.service.ts
var AgentService = class {
  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  async generateResponse(conversation, userMessage) {
    try {
      logger_default.debug(`Generating response for conversation ${conversation.chatId}`);
      const messages = this.prepareMessages(conversation, userMessage);
      const response = await this.client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: CLAUDE_MAX_TOKENS,
        system: SYSTEM_PROMPT + "\n\n" + getUserContextPrompt(conversation),
        messages
      });
      const assistantMessage = response.content[0].type === "text" ? response.content[0].text : "";
      if (!assistantMessage) {
        throw new Error("No text in response from Claude");
      }
      const analysis = this.analyzeResponse(assistantMessage, conversation);
      logger_default.debug(
        `Response generated. Next state: ${analysis.nextState}, Handoff: ${analysis.shouldHandoff}`
      );
      return {
        text: assistantMessage,
        nextState: analysis.nextState,
        shouldHandoff: analysis.shouldHandoff
      };
    } catch (error) {
      logger_default.error("Error calling Claude API:", error);
      throw error;
    }
  }
  prepareMessages(conversation, newMessage) {
    const recentMessages = conversation.messageHistory.slice(-10);
    const messages = recentMessages.map((msg) => ({
      role: msg.role,
      content: msg.content
    }));
    messages.push({
      role: "user",
      content: newMessage
    });
    return messages;
  }
  analyzeResponse(text, conversation) {
    const handoffKeywords = [
      "conectarte con un supervisor",
      "derivar",
      "hablar con un especialista",
      "ingeniero especializado",
      "perm\xEDteme conectarte",
      "d\xE9jame conectarte"
    ];
    const shouldHandoff = handoffKeywords.some(
      (keyword) => text.toLowerCase().includes(keyword)
    );
    const completionKeywords = [
      "con esta informaci\xF3n",
      "te contactar\xE1",
      "preparar\xE1 una cotizaci\xF3n",
      "pr\xF3ximas 2 horas"
    ];
    const isComplete = completionKeywords.some(
      (keyword) => text.toLowerCase().includes(keyword)
    );
    let nextState = conversation.state;
    if (shouldHandoff) {
      nextState = "waiting_human";
    } else if (isComplete) {
      nextState = "closed";
    }
    return { nextState, shouldHandoff };
  }
};
var agent_service_default = new AgentService();

// src/whatsapp/ai-agent/conversation.manager.ts
init_logger();
import path4 from "path";

// src/storage/json.store.ts
init_logger();
import fs2 from "fs-extra";
import path3 from "path";
var JsonStore = class {
  constructor(options) {
    this.baseDir = options.baseDir;
    this.autoBackup = options.autoBackup ?? true;
  }
  async get(key) {
    try {
      const filePath = path3.join(this.baseDir, `${key}.json`);
      const exists = await fs2.pathExists(filePath);
      if (!exists) {
        return null;
      }
      const data = await fs2.readJSON(filePath);
      return data;
    } catch (error) {
      logger_default.error(`Error reading ${key} from store:`, error);
      return null;
    }
  }
  async set(key, value) {
    try {
      const filePath = path3.join(this.baseDir, `${key}.json`);
      await fs2.ensureDir(path3.dirname(filePath));
      if (this.autoBackup && await fs2.pathExists(filePath)) {
        const backupPath = `${filePath}.backup`;
        await fs2.copy(filePath, backupPath);
      }
      const tempPath = `${filePath}.tmp`;
      await fs2.writeJSON(tempPath, value, { spaces: 2 });
      await fs2.move(tempPath, filePath, { overwrite: true });
      logger_default.debug(`Successfully wrote ${key} to store`);
    } catch (error) {
      logger_default.error(`Error writing ${key} to store:`, error);
      throw error;
    }
  }
  async delete(key) {
    try {
      const filePath = path3.join(this.baseDir, `${key}.json`);
      if (await fs2.pathExists(filePath)) {
        await fs2.remove(filePath);
        logger_default.debug(`Successfully deleted ${key} from store`);
      }
    } catch (error) {
      logger_default.error(`Error deleting ${key} from store:`, error);
      throw error;
    }
  }
  async getAllKeys() {
    try {
      const files = await fs2.readdir(this.baseDir);
      return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
    } catch (error) {
      logger_default.error("Error reading keys from store:", error);
      return [];
    }
  }
  async clear() {
    try {
      await fs2.emptyDir(this.baseDir);
      logger_default.debug("Store cleared");
    } catch (error) {
      logger_default.error("Error clearing store:", error);
      throw error;
    }
  }
  async exists(key) {
    const filePath = path3.join(this.baseDir, `${key}.json`);
    return await fs2.pathExists(filePath);
  }
};
var json_store_default = JsonStore;

// src/whatsapp/ai-agent/conversation.manager.ts
init_environment();
var ConversationManager = class {
  constructor() {
    this.conversationsDir = path4.join(config.whatsapp.sessionDir, "../conversations");
    this.store = new json_store_default({
      baseDir: this.conversationsDir,
      autoBackup: true
    });
  }
  async getOrCreate(chatId, sessionPhone) {
    const key = this.getConversationKey(sessionPhone, chatId);
    const existing = await this.store.get(key);
    if (existing) {
      return existing;
    }
    const conversation = {
      chatId,
      phoneNumber: this.extractPhoneNumber(chatId),
      sessionPhone,
      state: "active",
      service: null,
      collectedData: {},
      messageHistory: [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastMessageAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await this.save(conversation);
    logger_default.info(`Created new conversation: ${key}`);
    return conversation;
  }
  async save(conversation) {
    try {
      const key = this.getConversationKey(
        conversation.sessionPhone,
        conversation.chatId
      );
      conversation.lastMessageAt = (/* @__PURE__ */ new Date()).toISOString();
      await this.store.set(key, conversation);
      logger_default.debug(`Conversation saved: ${key}`);
    } catch (error) {
      logger_default.error("Error saving conversation:", error);
      throw error;
    }
  }
  async get(chatId, sessionPhone) {
    const key = this.getConversationKey(sessionPhone, chatId);
    return await this.store.get(key);
  }
  async delete(chatId, sessionPhone) {
    const key = this.getConversationKey(sessionPhone, chatId);
    await this.store.delete(key);
    logger_default.debug(`Conversation deleted: ${key}`);
  }
  async getAllForSession(sessionPhone) {
    const keys = await this.store.getAllKeys();
    const conversations = [];
    for (const key of keys) {
      if (key.startsWith(`${sessionPhone}:`)) {
        const conv = await this.store.get(key);
        if (conv) {
          conversations.push(conv);
        }
      }
    }
    return conversations;
  }
  async closeConversation(chatId, sessionPhone) {
    const conversation = await this.get(chatId, sessionPhone);
    if (conversation) {
      conversation.state = "closed";
      await this.save(conversation);
      logger_default.info(`Conversation closed: ${chatId}`);
    }
  }
  getConversationKey(sessionPhone, chatId) {
    return `${sessionPhone}:${chatId}`;
  }
  extractPhoneNumber(chatId) {
    return chatId.replace(/@[sg]\.whatsapp\.net|@g\.us/, "");
  }
};
var conversation_manager_default = new ConversationManager();

// src/utils/retry.ts
init_logger();
async function retry(fn, maxAttempts = 3, delayMs = 1e3, multiplier = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logger_default.warn(`Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`);
      if (attempt < maxAttempts) {
        const delay2 = delayMs * Math.pow(multiplier, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay2));
      }
    }
  }
  throw new Error(`Failed after ${maxAttempts} attempts: ${lastError?.message}`);
}
function calculateTypingDelay(text) {
  const wordsPerMinute = 40;
  const words = text.split(" ").length;
  const baseTime = words / wordsPerMinute * 60 * 1e3;
  const variability = 0.2;
  const delay2 = baseTime * (1 + (Math.random() - 0.5) * variability);
  return Math.min(Math.max(delay2, 1e3), 8e3);
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/whatsapp/ai-agent/typing-simulator.ts
init_logger();
var TypingSimulator = class {
  /**
   * Simula el tiempo que tardaría una persona escribiendo el texto
   * @param text Texto a "escribir"
   * @returns Promesa que se resuelve después del tiempo simulado
   */
  async simulateTyping(text) {
    const delayMs = calculateTypingDelay(text);
    logger_default.debug(`Simulating typing delay: ${delayMs}ms for ${text.length} chars`);
    await delay(delayMs);
  }
  /**
   * Calcula el delay de escritura sin esperar
   * @param text Texto a evaluar
   * @returns Delay en milisegundos
   */
  getTypingDelay(text) {
    return calculateTypingDelay(text);
  }
};
var typing_simulator_default = new TypingSimulator();

// src/utils/validators.ts
init_logger();
import Joi from "joi";
function validateCronExpression(cron3) {
  const cronRegex = /^((\d+,)*\d+|\*)(\/\d+)?( ((\d+,)*\d+|\*)(\/\d+)?){4}$/;
  return cronRegex.test(cron3);
}
function validateCronJob(data) {
  const schema = Joi.object({
    name: Joi.string().required().min(3).max(100),
    type: Joi.string().valid("api", "message").default("api"),
    url: Joi.string().when("type", {
      is: "api",
      then: Joi.string().required().uri(),
      otherwise: Joi.string().allow("").optional()
    }),
    message: Joi.object({
      sender: Joi.string().required(),
      chatId: Joi.string().required(),
      body: Joi.string().required().min(1)
    }).when("type", {
      is: "message",
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    cronExpression: Joi.string().required().custom((value, helpers) => {
      if (!validateCronExpression(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }).messages({ "any.invalid": "Expresi\xF3n cron inv\xE1lida" }),
    company: Joi.string().valid("constroad", "altavia").required(),
    isActive: Joi.boolean().default(true),
    timeout: Joi.number().default(3e4).min(5e3).max(3e5),
    retryPolicy: Joi.object({
      maxRetries: Joi.number().default(3).min(0).max(10),
      backoffMultiplier: Joi.number().default(2).min(1).max(5)
    })
  });
  try {
    const { error, value } = schema.validate(data, { abortEarly: false });
    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message
      }));
      return { valid: false, errors };
    }
    return { valid: true };
  } catch (err) {
    logger_default.error("Validation error:", err);
    return { valid: false };
  }
}
function validateCronJobUpdate(data) {
  const schema = Joi.object({
    name: Joi.string().min(3).max(100),
    type: Joi.string().valid("api", "message"),
    url: Joi.string().allow("").uri(),
    message: Joi.object({
      sender: Joi.string().required(),
      chatId: Joi.string().required(),
      body: Joi.string().required().min(1)
    }),
    cronExpression: Joi.string().custom((value, helpers) => {
      if (!validateCronExpression(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    }).messages({ "any.invalid": "Expresi\xF3n cron inv\xE1lida" }),
    company: Joi.string().valid("constroad", "altavia"),
    isActive: Joi.boolean(),
    timeout: Joi.number().min(5e3).max(3e5),
    retryPolicy: Joi.object({
      maxRetries: Joi.number().min(0).max(10),
      backoffMultiplier: Joi.number().min(1).max(5)
    })
  }).min(1);
  try {
    const { error } = schema.validate(data, { abortEarly: false });
    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message
      }));
      return { valid: false, errors };
    }
    return { valid: true };
  } catch (err) {
    logger_default.error("Validation error:", err);
    return { valid: false };
  }
}
function validateMessage(message) {
  return message && typeof message === "object" && (message.conversation || message.extendedTextMessage?.text);
}

// src/whatsapp/ai-agent/message.listener.ts
init_environment();
var MessageListener = class {
  constructor() {
    this.activeConversations = /* @__PURE__ */ new Map();
  }
  async handleIncomingMessage(message, sessionPhone, whatsAppClient) {
    try {
      return;
      if (message.key.fromMe) {
        return;
      }
      if (!validateMessage(message.message)) {
        logger_default.debug(`Skipping non-text message from ${message.key.remoteJid}`);
        return;
      }
      const chatId = message.key.remoteJid;
      const messageText = message.message?.conversation || message.message?.extendedTextMessage?.text || "";
      if (!messageText.trim()) {
        return;
      }
      const isGroup = chatId.endsWith("@g.us");
      if (isGroup && !this.isGroupEnabled(chatId)) {
        logger_default.debug(`Group ${chatId} not enabled for bot`);
        return;
      }
      if (!this.isAiAllowed(chatId, isGroup)) {
        logger_default.debug(`AI disabled or not allowed for ${chatId}`);
        return;
      }
      logger_default.info(
        `Incoming message from ${chatId} (session: ${sessionPhone}): ${messageText.substring(0, 50)}`
      );
      const conversation = await conversation_manager_default.getOrCreate(chatId, sessionPhone);
      if (conversation.state === "waiting_human") {
        await this.notifyHumanAgent(conversation, messageText);
        return;
      }
      conversation.messageHistory.push({
        role: "user",
        content: messageText,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      await this.processWithAI(conversation, messageText, whatsAppClient);
    } catch (error) {
      logger_default.error("Error handling incoming message:", error);
    }
  }
  async processWithAI(conversation, message, whatsAppClient) {
    try {
      await whatsAppClient.sendPresenceUpdate("composing", conversation.chatId);
      const response = await agent_service_default.generateResponse(conversation, message);
      await typing_simulator_default.simulateTyping(response.text);
      await whatsAppClient.sendMessage(conversation.chatId, {
        text: response.text
      });
      logger_default.info(
        `Response sent to ${conversation.chatId}: ${response.text.substring(0, 50)}`
      );
      conversation.messageHistory.push({
        role: "assistant",
        content: response.text,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      conversation.lastMessageAt = (/* @__PURE__ */ new Date()).toISOString();
      if (response.nextState) {
        conversation.state = response.nextState;
      }
      await conversation_manager_default.save(conversation);
      await whatsAppClient.sendPresenceUpdate("paused", conversation.chatId);
    } catch (error) {
      logger_default.error("Error processing message with AI:", error);
      await this.sendErrorMessage(conversation.chatId, whatsAppClient);
    }
  }
  isGroupEnabled(groupId) {
    return true;
  }
  isAiAllowed(chatId, isGroup) {
    if (config.whatsapp.aiEnabled) {
      return true;
    }
    if (isGroup) {
      return false;
    }
    const raw = chatId.split("@")[0] || "";
    const phone = raw.replace(/[^\d]/g, "");
    return phone === config.whatsapp.aiTestNumber;
  }
  async notifyHumanAgent(conversation, message) {
    logger_default.info(
      `New message for human agent in conversation ${conversation.chatId}: ${message}`
    );
  }
  async sendErrorMessage(chatId, whatsAppClient) {
    try {
      await whatsAppClient.sendMessage(chatId, {
        text: "Disculpa, tuve un problema procesando tu mensaje. \xBFPodr\xEDas repetirlo?"
      });
    } catch (error) {
      logger_default.error("Error sending error message:", error);
    }
  }
};
var message_listener_default = new MessageListener();

// src/whatsapp/baileys/connection.manager.ts
init_environment();

// src/whatsapp/queue/outbox-queue.ts
import path5 from "path";
import { randomUUID } from "crypto";
init_logger();
init_environment();
var OutboxQueue = class {
  constructor() {
    const baseDir = path5.join(config.whatsapp.sessionDir, "../outbox");
    this.store = new json_store_default({ baseDir, autoBackup: true });
  }
  async list(sessionPhone) {
    const data = await this.store.get(sessionPhone);
    return Array.isArray(data) ? data : [];
  }
  async enqueue(sessionPhone, recipient, text) {
    const queue = await this.list(sessionPhone);
    const item = {
      id: randomUUID(),
      sessionPhone,
      recipient,
      text,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      attempts: 0
    };
    queue.push(item);
    await this.store.set(sessionPhone, queue);
    logger_default.info(`Queued outbound message ${item.id} for ${sessionPhone}`);
    return item;
  }
  async update(sessionPhone, item) {
    const queue = await this.list(sessionPhone);
    const index = queue.findIndex((entry) => entry.id === item.id);
    if (index === -1) {
      return;
    }
    queue[index] = item;
    await this.store.set(sessionPhone, queue);
  }
  async remove(sessionPhone, id) {
    const queue = await this.list(sessionPhone);
    const next = queue.filter((item) => item.id !== id);
    await this.store.set(sessionPhone, next);
  }
};
var outbox_queue_default = new OutboxQueue();

// src/whatsapp/baileys/connection.manager.ts
var originalConsoleLog = console.log;
console.log = (...args) => {
  const message = args.join(" ");
  if (message.includes("Closing open session in favor of") || message.includes("Closing session: SessionEntry") || message.includes("_chains:") || message.includes("registrationId:") || message.includes("currentRatchet:")) {
    return;
  }
  originalConsoleLog.apply(console, args);
};
var ConnectionManager = class {
  constructor() {
    this.connections = /* @__PURE__ */ new Map();
    this.connectionStates = /* @__PURE__ */ new Map();
    this.qrCodes = /* @__PURE__ */ new Map();
    this.contactsBySession = /* @__PURE__ */ new Map();
    this.groupsCache = /* @__PURE__ */ new Map();
    this.groupsInFlight = /* @__PURE__ */ new Map();
    this.connectInFlight = /* @__PURE__ */ new Map();
    this.reconnectTimers = /* @__PURE__ */ new Map();
    this.reconnectAttempts = /* @__PURE__ */ new Map();
    this.connectWatchdogs = /* @__PURE__ */ new Map();
    this.sessionRecoveryWatchdog = null;
  }
  async createConnection(sessionPhone) {
    const existing = this.connections.get(sessionPhone);
    if (existing) {
      logger_default.debug(`Connection already exists for ${sessionPhone}`);
      return existing;
    }
    const inFlight = this.connectInFlight.get(sessionPhone);
    if (inFlight) {
      return await inFlight;
    }
    const connectPromise = (async () => {
      try {
        logger_default.info(`Creating WhatsApp connection for ${sessionPhone}`);
        this.connectionStates.set(sessionPhone, "connecting");
        const sessionDir = path6.join(config.whatsapp.sessionDir, sessionPhone);
        const credsPath = path6.join(sessionDir, "creds.json");
        const hasCredentials = await fs3.pathExists(credsPath);
        if (!hasCredentials) {
          logger_default.warn(`\u26A0\uFE0F No credentials found for ${sessionPhone}, attempting auto-recovery from backup`);
          const recovered = await this.autoRecoverSession(sessionPhone);
          if (recovered) {
            logger_default.info(`\u2705 Successfully auto-recovered session ${sessionPhone} from backup`);
          } else {
            logger_default.warn(`\u26A0\uFE0F No valid backup found for ${sessionPhone}, will generate new QR`);
          }
        }
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        const socket = makeWASocket({
          auth: state,
          version,
          syncFullHistory: false,
          shouldIgnoreJid: (jid) => /status@broadcast/.test(jid),
          printQRInTerminal: false,
          logger: pino({ level: config.whatsapp.baileysLogLevel })
        });
        this.contactsBySession.set(sessionPhone, /* @__PURE__ */ new Map());
        this.connections.set(sessionPhone, socket);
        this.setupListeners(socket, sessionPhone, sessionDir, saveCreds);
        return socket;
      } catch (error) {
        logger_default.error(`Error creating connection for ${sessionPhone}:`, error);
        throw error;
      }
    })();
    this.connectInFlight.set(sessionPhone, connectPromise);
    try {
      return await connectPromise;
    } finally {
      this.connectInFlight.delete(sessionPhone);
    }
  }
  async ensureConnected(sessionPhone, timeoutMs = 15e3, intervalMs = 300) {
    if (!this.connections.has(sessionPhone)) {
      try {
        await this.createConnection(sessionPhone);
      } catch (error) {
        logger_default.warn(`Failed to create connection for ${sessionPhone}, will schedule reconnect: ${error}`);
        this.scheduleReconnect(sessionPhone, error);
        return false;
      }
    }
    if (this.isConnected(sessionPhone)) {
      return true;
    }
    const start = Date.now();
    const connected = await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (this.isConnected(sessionPhone)) {
          clearInterval(timer);
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, intervalMs);
    });
    if (!connected) {
      logger_default.warn(`Connection timeout for ${sessionPhone} after ${timeoutMs}ms`);
      this.cleanupSession(sessionPhone, { clearQr: false });
      this.scheduleReconnect(sessionPhone);
    }
    return connected;
  }
  async reconnectSavedSessions() {
    const baseDir = path6.resolve(config.whatsapp.sessionDir);
    if (!await fs3.pathExists(baseDir)) {
      return;
    }
    const entries = await fs3.readdir(baseDir);
    const sessionDirs = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path6.join(baseDir, entry);
        const stat = await fs3.stat(fullPath);
        return stat.isDirectory() && entry !== "backups" ? entry : null;
      })
    );
    const sessionsWithCreds = [];
    for (const sessionPhone of sessionDirs.filter(Boolean)) {
      const credsPath = path6.join(baseDir, sessionPhone, "creds.json");
      if (await fs3.pathExists(credsPath)) {
        sessionsWithCreds.push(sessionPhone);
        try {
          await this.createConnection(sessionPhone);
          logger_default.info(`\u2705 Reconnected session ${sessionPhone}`);
        } catch (error) {
          logger_default.warn(`Failed to reconnect session ${sessionPhone}: ${String(error)}`);
        }
      }
    }
    const backupBaseDir = path6.join(baseDir, "backups");
    if (await fs3.pathExists(backupBaseDir)) {
      const backupEntries = await fs3.readdir(backupBaseDir);
      for (const sessionPhone of backupEntries) {
        if (sessionsWithCreds.includes(sessionPhone)) {
          continue;
        }
        const backupDir = path6.join(backupBaseDir, sessionPhone);
        const stat = await fs3.stat(backupDir);
        if (!stat.isDirectory()) {
          continue;
        }
        logger_default.info(`\u{1F50D} Found session ${sessionPhone} with backups but no active credentials, attempting auto-recovery`);
        try {
          const recovered = await this.autoRecoverSession(sessionPhone);
          if (recovered) {
            await this.createConnection(sessionPhone);
            logger_default.info(`\u2705 Auto-recovered and reconnected session ${sessionPhone}`);
          }
        } catch (error) {
          logger_default.warn(`Failed to auto-recover session ${sessionPhone}: ${String(error)}`);
        }
      }
    }
  }
  setupListeners(socket, sessionPhone, sessionDir, saveCreds) {
    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (connection) {
        this.connectionStates.set(sessionPhone, connection);
      }
      if (qr) {
        const qrText = typeof qr === "string" ? qr : String(qr);
        logger_default.info(`QR Code for ${sessionPhone}`);
        this.qrCodes.set(sessionPhone, qrText);
      }
      if (connection === "close") {
        this.clearConnectWatchdog(sessionPhone);
        const reason = this.getDisconnectReason(lastDisconnect?.error);
        const errorMessage = lastDisconnect?.error ? String(lastDisconnect.error) : "";
        const reasonName = this.getDisconnectReasonName(reason);
        logger_default.warn(`Connection closed for ${sessionPhone}, reason: ${reason} (${reasonName}), error: ${errorMessage}`);
        const isNetworkError = errorMessage.includes("Stream Errored") || errorMessage.includes("Connection Failure") || errorMessage.includes("Socket hang up") || errorMessage.includes("ECONNRESET") || errorMessage.includes("ETIMEDOUT") || errorMessage.includes("ENOTFOUND") || errorMessage.includes("timeout") || errorMessage.includes("timed out") || reason === 408 || // timedOut
        reason === 428 || // connectionLost
        reason === 500 || // restartRequired (no es 515!)
        reason === 503;
        if (isNetworkError) {
          logger_default.warn(`\u{1F310} Network/Stream error detected for ${sessionPhone}, preserving auth state and reconnecting`);
          this.cleanupSession(sessionPhone, { clearQr: false });
          this.scheduleReconnect(sessionPhone);
          return;
        }
        if (reason === DisconnectReason.loggedOut || reason === 401) {
          logger_default.warn(`\u{1F534} User manually logged out ${sessionPhone}, clearing auth state`);
          await this.backupAndResetAuthState(sessionPhone, sessionDir);
          this.cleanupSession(sessionPhone, { clearQr: true });
          this.scheduleReconnect(sessionPhone);
          return;
        }
        if (reason === DisconnectReason.badSession || reason === 403) {
          let backupRestored = await this.tryRestoreRecentBackup(sessionPhone);
          if (backupRestored) {
            logger_default.info(`\u2705 Restored recent backup for ${sessionPhone}, attempting reconnect`);
            this.cleanupSession(sessionPhone, { clearQr: false });
            this.scheduleReconnect(sessionPhone);
            return;
          }
          logger_default.warn(`\u26A0\uFE0F No recent backup for ${sessionPhone}, trying full auto-recovery`);
          backupRestored = await this.autoRecoverSession(sessionPhone);
          if (backupRestored) {
            logger_default.info(`\u2705 Full auto-recovery successful for ${sessionPhone}, attempting reconnect`);
            this.cleanupSession(sessionPhone, { clearQr: false });
            this.scheduleReconnect(sessionPhone);
            return;
          }
          logger_default.warn(`\u{1F534} Bad session detected for ${sessionPhone} (no backups available), clearing auth state`);
          await this.backupAndResetAuthState(sessionPhone, sessionDir);
          this.cleanupSession(sessionPhone, { clearQr: true });
          this.scheduleReconnect(sessionPhone);
          return;
        }
        const shouldReconnect = reason === DisconnectReason.connectionClosed || reason === DisconnectReason.connectionLost || reason === DisconnectReason.timedOut || reason === DisconnectReason.restartRequired || reason === DisconnectReason.connectionReplaced || reason === 411 || // connectionClosed
        reason === 428 || // connectionLost
        reason === 440 || // connectionReplaced
        reason === 515;
        if (shouldReconnect) {
          logger_default.info(`\u267B\uFE0F Reconnectable disconnect for ${sessionPhone}, preserving credentials`);
          this.cleanupSession(sessionPhone, { clearQr: false });
          this.scheduleReconnect(sessionPhone);
        } else {
          logger_default.warn(`\u26A0\uFE0F Unknown disconnect reason ${reason} for ${sessionPhone}, preserving credentials and reconnecting`);
          this.cleanupSession(sessionPhone, { clearQr: false });
          this.scheduleReconnect(sessionPhone);
        }
      } else if (connection === "open") {
        this.clearConnectWatchdog(sessionPhone);
        logger_default.info(`\u2705 Connection established for ${sessionPhone}`);
        this.qrCodes.delete(sessionPhone);
        this.resetReconnectState(sessionPhone);
        await this.flushOutbox(sessionPhone);
      } else if (connection === "connecting") {
        this.scheduleConnectWatchdog(sessionPhone);
      }
    });
    socket.ev.on("messaging-history.set", (data) => {
      const store = this.contactsBySession.get(sessionPhone);
      if (!store || !data?.contacts) {
        return;
      }
      data.contacts.forEach((contact) => {
        if (contact?.id) {
          store.set(contact.id, contact);
        }
      });
    });
    socket.ev.on("contacts.upsert", (contacts) => {
      const store = this.contactsBySession.get(sessionPhone);
      if (!store) {
        return;
      }
      contacts.forEach((contact) => {
        if (contact?.id) {
          store.set(contact.id, contact);
        }
      });
    });
    socket.ev.on("contacts.update", (updates) => {
      const store = this.contactsBySession.get(sessionPhone);
      if (!store) {
        return;
      }
      updates.forEach((update) => {
        if (!update?.id) {
          return;
        }
        const existing = store.get(update.id) || {};
        store.set(update.id, { ...existing, ...update });
      });
    });
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("messages.upsert", async (m) => {
      for (const message of m.messages) {
        await message_listener_default.handleIncomingMessage(message, sessionPhone, socket);
      }
    });
  }
  async disconnect(sessionPhone) {
    try {
      this.resetReconnectState(sessionPhone);
      const socket = this.connections.get(sessionPhone);
      if (socket) {
        await socket.end({
          cancel: true
        });
        this.cleanupSession(sessionPhone, { clearQr: true });
        logger_default.info(`Disconnected ${sessionPhone}`);
      }
    } catch (error) {
      logger_default.error(`Error disconnecting ${sessionPhone}:`, error);
      this.cleanupSession(sessionPhone, { clearQr: true });
    }
  }
  async disconnectAll() {
    this.stopSessionRecoveryWatchdog();
    for (const [sessionPhone] of this.connections) {
      await this.disconnect(sessionPhone);
    }
  }
  /**
   * 🛡️ WATCHDOG DE RECUPERACIÓN AUTOMÁTICA
   * Ejecuta verificación periódica cada 5 minutos para:
   * 1. Detectar sesiones perdidas (sin conexión pero con backups disponibles)
   * 2. Recuperar automáticamente desde backups
   * 3. Intentar reconectar sesiones caídas
   *
   * Esto es una capa adicional de resiliencia que funciona incluso si
   * los otros mecanismos de auto-recuperación fallan.
   */
  startSessionRecoveryWatchdog() {
    if (this.sessionRecoveryWatchdog) {
      return;
    }
    const runRecoveryCheck = async () => {
      try {
        logger_default.debug("\u{1F50D} Running session recovery watchdog check...");
        const baseDir = path6.resolve(config.whatsapp.sessionDir);
        const backupBaseDir = path6.join(baseDir, "backups");
        if (!await fs3.pathExists(backupBaseDir)) {
          return;
        }
        const backupEntries = await fs3.readdir(backupBaseDir);
        for (const sessionPhone of backupEntries) {
          const backupDir = path6.join(backupBaseDir, sessionPhone);
          const stat = await fs3.stat(backupDir);
          if (!stat.isDirectory()) {
            continue;
          }
          const isConnected = this.isConnected(sessionPhone);
          const hasConnection = this.connections.has(sessionPhone);
          const isReconnecting = this.reconnectTimers.has(sessionPhone);
          if (isConnected || isReconnecting) {
            continue;
          }
          if (hasConnection && !isConnected) {
            continue;
          }
          const sessionDir = path6.join(baseDir, sessionPhone);
          const credsPath = path6.join(sessionDir, "creds.json");
          const hasCredentials = await fs3.pathExists(credsPath);
          if (!hasCredentials) {
            logger_default.info(`\u{1F6A8} Watchdog detected lost session ${sessionPhone} with backups, attempting auto-recovery`);
            const recovered = await this.autoRecoverSession(sessionPhone);
            if (recovered) {
              logger_default.info(`\u2705 Watchdog successfully recovered ${sessionPhone}, initiating reconnect`);
              try {
                await this.createConnection(sessionPhone);
              } catch (error) {
                logger_default.warn(`Watchdog recovery connect failed for ${sessionPhone}: ${error}`);
                this.scheduleReconnect(sessionPhone, error);
              }
            } else {
              logger_default.warn(`\u26A0\uFE0F Watchdog could not recover ${sessionPhone}, no valid backups`);
            }
          }
        }
      } catch (error) {
        logger_default.error(`Session recovery watchdog error: ${error}`);
      }
    };
    const intervalMs = 5 * 60 * 1e3;
    const scheduleNext = () => {
      this.sessionRecoveryWatchdog = setTimeout(async () => {
        await runRecoveryCheck();
        scheduleNext();
      }, intervalMs);
    };
    scheduleNext();
    logger_default.info("\u2705 Session recovery watchdog started (checking every 5 minutes)");
  }
  /**
   * Detener el watchdog de recuperación
   */
  stopSessionRecoveryWatchdog() {
    if (this.sessionRecoveryWatchdog) {
      clearTimeout(this.sessionRecoveryWatchdog);
      this.sessionRecoveryWatchdog = null;
      logger_default.info("Session recovery watchdog stopped");
    }
  }
  async sendTextMessage(sessionPhone, recipient, text, options = {}) {
    const isConnected = await this.ensureConnected(sessionPhone);
    const queueOnFail = options.queueOnFail !== false;
    if (!isConnected) {
      if (queueOnFail) {
        await outbox_queue_default.enqueue(sessionPhone, recipient, text);
        return { queued: true };
      }
      throw new Error("Session not connected");
    }
    const socket = this.connections.get(sessionPhone);
    if (!socket) {
      if (queueOnFail) {
        await outbox_queue_default.enqueue(sessionPhone, recipient, text);
        return { queued: true };
      }
      throw new Error("Session not connected");
    }
    try {
      await socket.sendMessage(recipient, { text });
      return { queued: false };
    } catch (error) {
      logger_default.warn(`Failed to send message via ${sessionPhone}: ${String(error)}`);
      await this.disconnect(sessionPhone);
      this.scheduleReconnect(sessionPhone, error);
      if (queueOnFail) {
        await outbox_queue_default.enqueue(sessionPhone, recipient, text);
        return { queued: true };
      }
      throw error;
    }
  }
  getConnection(sessionPhone) {
    return this.connections.get(sessionPhone);
  }
  getAllConnections() {
    return this.connections;
  }
  getQRCode(sessionPhone) {
    return this.qrCodes.get(sessionPhone);
  }
  isConnected(sessionPhone) {
    return this.connectionStates.get(sessionPhone) === "open";
  }
  getConnectionStatus(sessionPhone) {
    const state = this.connectionStates.get(sessionPhone);
    if (state === "open") return "connected";
    if (this.qrCodes.has(sessionPhone)) return "waiting_qr";
    if (state === "connecting") return "connecting";
    return "disconnected";
  }
  async getGroups(sessionPhone) {
    const socket = this.connections.get(sessionPhone);
    if (!socket) {
      throw new Error("Session not connected");
    }
    const cacheTtlMs = 60 * 1e3;
    const cached = this.groupsCache.get(sessionPhone);
    if (cached && Date.now() - cached.ts < cacheTtlMs) {
      return cached.data;
    }
    const inFlight = this.groupsInFlight.get(sessionPhone);
    if (inFlight) {
      return await inFlight;
    }
    const fetchPromise = (async () => {
      try {
        const groups = await socket.groupFetchAllParticipating();
        const data = Object.values(groups || {}).map((group) => ({
          id: group.id,
          name: group.subject
        }));
        this.groupsCache.set(sessionPhone, { ts: Date.now(), data });
        return data;
      } catch (error) {
        const message = String(error);
        if (message.includes("rate-overlimit") && cached) {
          logger_default.warn(`Using cached groups for ${sessionPhone} after rate limit`);
          return cached.data;
        }
        throw error;
      } finally {
        this.groupsInFlight.delete(sessionPhone);
      }
    })();
    this.groupsInFlight.set(sessionPhone, fetchPromise);
    return await fetchPromise;
  }
  async getContacts(sessionPhone) {
    const socket = this.connections.get(sessionPhone);
    if (!socket) {
      throw new Error("Session not connected");
    }
    const store = this.contactsBySession.get(sessionPhone);
    const storeContacts = store ? Array.from(store.values()) : [];
    const socketContacts = Object.values(socket.contacts || {});
    const contacts = storeContacts.length > 0 ? storeContacts : socketContacts;
    return contacts.map((contact) => ({
      id: contact.id,
      name: contact.name || contact.notify || null,
      number: contact.id ? contact.id.split("@")[0] : null,
      isBusiness: Boolean(contact.isBusiness),
      isMyContact: Boolean(contact.isMyContact)
    }));
  }
  cleanupSession(sessionPhone, options = {}) {
    this.connections.delete(sessionPhone);
    this.connectionStates.set(sessionPhone, "close");
    this.contactsBySession.delete(sessionPhone);
    this.groupsCache.delete(sessionPhone);
    this.groupsInFlight.delete(sessionPhone);
    this.clearConnectWatchdog(sessionPhone);
    if (options.clearQr) {
      this.qrCodes.delete(sessionPhone);
    }
  }
  resetReconnectState(sessionPhone) {
    const timer = this.reconnectTimers.get(sessionPhone);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(sessionPhone);
    }
    this.reconnectAttempts.delete(sessionPhone);
  }
  scheduleReconnect(sessionPhone, error) {
    if (!config.whatsapp.autoReconnect) {
      return;
    }
    if (this.reconnectTimers.has(sessionPhone)) {
      return;
    }
    const currentAttempts = this.reconnectAttempts.get(sessionPhone) || 0;
    const nextAttempt = currentAttempts + 1;
    this.reconnectAttempts.set(sessionPhone, nextAttempt);
    const maxAttempts = config.whatsapp.maxReconnectAttempts;
    if (maxAttempts > 0 && nextAttempt > maxAttempts) {
      logger_default.error(`Reconnect attempts exhausted for ${sessionPhone} after ${maxAttempts} attempts`);
      (async () => {
        const hasBackup = await this.hasAvailableBackup(sessionPhone);
        if (hasBackup) {
          logger_default.info(`\u{1F4A1} Found backup for ${sessionPhone}, attempting final auto-recovery`);
          const recovered = await this.autoRecoverSession(sessionPhone);
          if (recovered) {
            logger_default.info(`\u2705 Final auto-recovery successful for ${sessionPhone}, resetting reconnect attempts`);
            this.reconnectAttempts.delete(sessionPhone);
            this.scheduleReconnect(sessionPhone);
          }
        } else {
          logger_default.info(`\u{1F4A1} No backups available for ${sessionPhone}, manual QR scan required`);
        }
      })();
      return;
    }
    const delayMs = Math.min(6e4, 2e3 * Math.pow(2, nextAttempt - 1));
    const message = `Scheduling reconnect for ${sessionPhone} in ${delayMs}ms (attempt ${nextAttempt}/${maxAttempts || "\u221E"})`;
    if (error) {
      logger_default.warn(message, { error: String(error) });
    } else {
      logger_default.warn(message);
    }
    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(sessionPhone);
      const sessionDir = path6.join(config.whatsapp.sessionDir, sessionPhone);
      const credsPath = path6.join(sessionDir, "creds.json");
      const hasCredentials = await fs3.pathExists(credsPath);
      if (!hasCredentials) {
        logger_default.warn(`\u26A0\uFE0F No credentials found for ${sessionPhone}, attempting auto-recovery from backup`);
        const recovered = await this.autoRecoverSession(sessionPhone);
        if (!recovered) {
          logger_default.error(`\u274C Auto-recovery failed for ${sessionPhone}, no valid backups found`);
          this.scheduleReconnect(sessionPhone);
          return;
        }
        logger_default.info(`\u2705 Auto-recovered credentials for ${sessionPhone}, proceeding with reconnect`);
      }
      try {
        logger_default.info(`\u{1F504} Attempting reconnect ${nextAttempt}/${maxAttempts || "\u221E"} for ${sessionPhone}...`);
        await this.createConnection(sessionPhone);
      } catch (err) {
        logger_default.warn(`Reconnect failed for ${sessionPhone}: ${String(err)}`);
        this.scheduleReconnect(sessionPhone, err);
      }
    }, delayMs);
    this.reconnectTimers.set(sessionPhone, timer);
  }
  /**
   * 🛡️ PROTECCIÓN: Backup antes de eliminar credenciales
   * Crea un backup timestamped de las credenciales antes de borrarlas
   * para permitir recuperación manual si es necesario
   */
  async backupAndResetAuthState(sessionPhone, sessionDir) {
    try {
      const credsPath = path6.join(sessionDir, "creds.json");
      const credsExist = await fs3.pathExists(credsPath);
      if (credsExist) {
        const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
        const backupDir = path6.join(sessionDir, "..", "backups", sessionPhone);
        const backupPath = path6.join(backupDir, `creds-${timestamp}.json`);
        await fs3.ensureDir(backupDir);
        await fs3.copy(credsPath, backupPath);
        logger_default.info(`\u2705 Backed up credentials for ${sessionPhone} to ${backupPath}`);
        await this.cleanupOldBackups(backupDir, 20);
      }
      await fs3.remove(sessionDir);
      logger_default.info(`\u{1F5D1}\uFE0F Auth state cleared for ${sessionPhone}`);
    } catch (error) {
      logger_default.error(`\u274C Failed to backup/clear auth state for ${sessionPhone}:`, error);
    }
  }
  /**
   * Mantiene solo los N backups más recientes
   * Aumentado a 20 backups para mayor seguridad de recuperación
   */
  async cleanupOldBackups(backupDir, keepCount = 20) {
    try {
      const files = await fs3.readdir(backupDir);
      const backupFiles = files.filter((f) => f.startsWith("creds-") && f.endsWith(".json")).sort().reverse();
      for (let i = keepCount; i < backupFiles.length; i++) {
        await fs3.remove(path6.join(backupDir, backupFiles[i]));
      }
    } catch (error) {
      logger_default.warn(`Failed to cleanup old backups: ${error}`);
    }
  }
  /**
   * 🔄 Restaurar credenciales desde backup (para recuperación manual)
   */
  async restoreFromBackup(sessionPhone, backupTimestamp) {
    try {
      const sessionDir = path6.join(config.whatsapp.sessionDir, sessionPhone);
      const backupDir = path6.join(config.whatsapp.sessionDir, "backups", sessionPhone);
      if (!await fs3.pathExists(backupDir)) {
        logger_default.error(`No backups found for ${sessionPhone}`);
        return false;
      }
      let backupFile;
      if (backupTimestamp) {
        backupFile = `creds-${backupTimestamp}.json`;
      } else {
        const files = await fs3.readdir(backupDir);
        const backups = files.filter((f) => f.startsWith("creds-") && f.endsWith(".json")).sort().reverse();
        if (backups.length === 0) {
          logger_default.error(`No backup files found for ${sessionPhone}`);
          return false;
        }
        backupFile = backups[0];
      }
      const backupPath = path6.join(backupDir, backupFile);
      const restorePath = path6.join(sessionDir, "creds.json");
      await fs3.ensureDir(sessionDir);
      await fs3.copy(backupPath, restorePath);
      logger_default.info(`\u2705 Restored credentials for ${sessionPhone} from ${backupFile}`);
      return true;
    } catch (error) {
      logger_default.error(`\u274C Failed to restore backup for ${sessionPhone}:`, error);
      return false;
    }
  }
  /**
   * 📋 Listar todos los backups disponibles para una sesión
   */
  async listBackups(sessionPhone) {
    try {
      const backupDir = path6.join(config.whatsapp.sessionDir, "backups", sessionPhone);
      if (!await fs3.pathExists(backupDir)) {
        return [];
      }
      const files = await fs3.readdir(backupDir);
      const backups = files.filter((f) => f.startsWith("creds-") && f.endsWith(".json")).sort().reverse();
      const backupList = await Promise.all(
        backups.map(async (file) => {
          const filePath = path6.join(backupDir, file);
          const stats = await fs3.stat(filePath);
          const now = Date.now();
          const ageMs = now - stats.mtimeMs;
          const ageHours = Math.floor(ageMs / (1e3 * 60 * 60));
          const ageDays = Math.floor(ageHours / 24);
          let ageStr;
          if (ageDays > 0) {
            ageStr = `${ageDays}d ${ageHours % 24}h ago`;
          } else if (ageHours > 0) {
            ageStr = `${ageHours}h ago`;
          } else {
            const ageMinutes = Math.floor(ageMs / (1e3 * 60));
            ageStr = `${ageMinutes}m ago`;
          }
          return {
            filename: file,
            timestamp: stats.mtime.toISOString(),
            size: stats.size,
            age: ageStr
          };
        })
      );
      return backupList;
    } catch (error) {
      logger_default.error(`Failed to list backups for ${sessionPhone}:`, error);
      return [];
    }
  }
  /**
   * 🔄 Resetear estado de reconexión (útil cuando se queda en bucle)
   */
  async resetReconnect(sessionPhone) {
    logger_default.info(`Resetting reconnect state for ${sessionPhone}`);
    this.resetReconnectState(sessionPhone);
  }
  /**
   * 🔍 Mejorada: Extrae el DisconnectReason con logging detallado
   */
  getDisconnectReason(error) {
    if (isBoom(error)) {
      const statusCode2 = error.output?.statusCode;
      logger_default.debug(`Boom error detected: ${statusCode2} - ${error.message}`);
      return statusCode2;
    }
    if (!error || typeof error !== "object") {
      return void 0;
    }
    const maybe = error;
    const statusCode = maybe.output?.statusCode ?? maybe.statusCode;
    if (statusCode) {
      const reasonName = this.getDisconnectReasonName(statusCode);
      logger_default.debug(`Disconnect reason: ${statusCode} (${reasonName})`);
    }
    return statusCode;
  }
  /**
   * 📝 Helper: Convierte código numérico a nombre legible
   * Nota: Baileys usa códigos HTTP como DisconnectReason
   */
  getDisconnectReasonName(code) {
    if (!code) return "unknown";
    const reasons = {
      401: "loggedOut",
      403: "badSession",
      408: "timedOut/connectionLost",
      411: "multideviceMismatch",
      428: "connectionClosed",
      440: "connectionReplaced",
      500: "internalError/streamError",
      503: "serviceUnavailable",
      515: "restartRequired"
    };
    return reasons[code] || `unknown(${code})`;
  }
  /**
   * 🔄 Intenta restaurar desde el backup más reciente si existe y es reciente (< 24h)
   * Esto previene pérdida de sesión por errores transitorios
   * NOTA: Este método se llama solo en caso de badSession para restauración rápida
   */
  async tryRestoreRecentBackup(sessionPhone) {
    try {
      const backupDir = path6.join(config.whatsapp.sessionDir, "backups", sessionPhone);
      if (!await fs3.pathExists(backupDir)) {
        return false;
      }
      const files = await fs3.readdir(backupDir);
      const backups = files.filter((f) => f.startsWith("creds-") && f.endsWith(".json")).sort().reverse();
      if (backups.length === 0) {
        return false;
      }
      const latestBackup = backups[0];
      const backupPath = path6.join(backupDir, latestBackup);
      const backupStats = await fs3.stat(backupPath);
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1e3;
      if (backupStats.mtimeMs < twentyFourHoursAgo) {
        logger_default.warn(`Latest backup for ${sessionPhone} is too old (${latestBackup}), skipping quick restore`);
        return false;
      }
      const sessionDir = path6.join(config.whatsapp.sessionDir, sessionPhone);
      const restorePath = path6.join(sessionDir, "creds.json");
      await fs3.ensureDir(sessionDir);
      await fs3.copy(backupPath, restorePath);
      logger_default.info(`\u2705 Auto-restored credentials for ${sessionPhone} from recent backup (${latestBackup})`);
      return true;
    } catch (error) {
      logger_default.warn(`Failed to auto-restore recent backup for ${sessionPhone}: ${error}`);
      return false;
    }
  }
  /**
   * 🛡️ AUTO-RECUPERACIÓN COMPLETA: Intenta restaurar sesión desde CUALQUIER backup disponible
   * Este método es más agresivo que tryRestoreRecentBackup:
   * - No tiene límite de tiempo (acepta backups antiguos)
   * - Valida que el backup sea válido antes de restaurar
   * - Es la última línea de defensa contra pérdida de sesión
   *
   * Se llama automáticamente en:
   * - createConnection (si no hay credenciales)
   * - scheduleReconnect (si no hay credenciales)
   * - reconnectSavedSessions (para sesiones perdidas con backups)
   */
  async autoRecoverSession(sessionPhone) {
    try {
      const backupDir = path6.join(config.whatsapp.sessionDir, "backups", sessionPhone);
      if (!await fs3.pathExists(backupDir)) {
        logger_default.debug(`No backup directory found for ${sessionPhone}`);
        return false;
      }
      const files = await fs3.readdir(backupDir);
      const backups = files.filter((f) => f.startsWith("creds-") && f.endsWith(".json")).sort().reverse();
      if (backups.length === 0) {
        logger_default.debug(`No backup files found for ${sessionPhone}`);
        return false;
      }
      for (const backupFile of backups) {
        const backupPath = path6.join(backupDir, backupFile);
        try {
          const backupStats = await fs3.stat(backupPath);
          if (backupStats.size < 100) {
            logger_default.warn(`Backup ${backupFile} is too small (${backupStats.size} bytes), skipping`);
            continue;
          }
          const backupContent = await fs3.readJson(backupPath);
          if (!backupContent || typeof backupContent !== "object") {
            logger_default.warn(`Backup ${backupFile} has invalid content, skipping`);
            continue;
          }
          const sessionDir = path6.join(config.whatsapp.sessionDir, sessionPhone);
          const restorePath = path6.join(sessionDir, "creds.json");
          await fs3.ensureDir(sessionDir);
          await fs3.copy(backupPath, restorePath);
          const age = this.getBackupAge(backupStats.mtimeMs);
          logger_default.info(`\u2705 Auto-recovered session ${sessionPhone} from backup ${backupFile} (${age} old)`);
          return true;
        } catch (error) {
          logger_default.warn(`Failed to restore from backup ${backupFile}: ${error}`);
          continue;
        }
      }
      logger_default.warn(`\u26A0\uFE0F No valid backups found for ${sessionPhone} (tried ${backups.length} backups)`);
      return false;
    } catch (error) {
      logger_default.error(`\u274C Auto-recovery failed for ${sessionPhone}:`, error);
      return false;
    }
  }
  /**
   * 🔍 Verifica si hay backups disponibles para una sesión
   */
  async hasAvailableBackup(sessionPhone) {
    try {
      const backupDir = path6.join(config.whatsapp.sessionDir, "backups", sessionPhone);
      if (!await fs3.pathExists(backupDir)) {
        return false;
      }
      const files = await fs3.readdir(backupDir);
      const backups = files.filter((f) => f.startsWith("creds-") && f.endsWith(".json"));
      return backups.length > 0;
    } catch (error) {
      return false;
    }
  }
  /**
   * 📅 Helper: Calcula la edad de un backup en formato legible
   */
  getBackupAge(timestampMs) {
    const ageMs = Date.now() - timestampMs;
    const ageHours = Math.floor(ageMs / (1e3 * 60 * 60));
    const ageDays = Math.floor(ageHours / 24);
    if (ageDays > 0) {
      return `${ageDays}d ${ageHours % 24}h`;
    } else if (ageHours > 0) {
      return `${ageHours}h`;
    } else {
      const ageMinutes = Math.floor(ageMs / (1e3 * 60));
      return `${ageMinutes}m`;
    }
  }
  scheduleConnectWatchdog(sessionPhone) {
    if (this.connectWatchdogs.has(sessionPhone)) {
      return;
    }
    const timer = setTimeout(() => {
      this.connectWatchdogs.delete(sessionPhone);
      if (this.connectionStates.get(sessionPhone) !== "open") {
        const hasQR = this.qrCodes.has(sessionPhone);
        if (hasQR) {
          logger_default.info(`Connection watchdog: ${sessionPhone} has QR code waiting, not auto-reconnecting`);
          return;
        }
        logger_default.warn(`Connection watchdog triggered for ${sessionPhone} (no connection after 90s)`);
        this.cleanupSession(sessionPhone, { clearQr: false });
        this.scheduleReconnect(sessionPhone);
      }
    }, 9e4);
    this.connectWatchdogs.set(sessionPhone, timer);
  }
  clearConnectWatchdog(sessionPhone) {
    const timer = this.connectWatchdogs.get(sessionPhone);
    if (timer) {
      clearTimeout(timer);
      this.connectWatchdogs.delete(sessionPhone);
    }
  }
  async flushOutbox(sessionPhone) {
    const socket = this.connections.get(sessionPhone);
    if (!socket || !this.isConnected(sessionPhone)) {
      return;
    }
    const queue = await outbox_queue_default.list(sessionPhone);
    if (queue.length === 0) {
      return;
    }
    logger_default.info(`Flushing ${queue.length} queued messages for ${sessionPhone}`);
    for (const item of queue) {
      try {
        await socket.sendMessage(item.recipient, { text: item.text });
        await outbox_queue_default.remove(sessionPhone, item.id);
      } catch (error) {
        const updated = {
          ...item,
          attempts: item.attempts + 1,
          lastError: String(error)
        };
        await outbox_queue_default.update(sessionPhone, updated);
        logger_default.warn(`Failed to flush queued message ${item.id}: ${String(error)}`);
        break;
      }
    }
  }
};
var connection_manager_default = new ConnectionManager();

// src/api/controllers/session.controller.ts
init_logger();
init_environment();
async function waitForQRCode(phoneNumber, timeoutMs = config.whatsapp.qrTimeout, intervalMs = 300) {
  const start = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const qr = connection_manager_default.getQRCode(phoneNumber);
      if (qr) {
        clearInterval(timer);
        resolve(qr);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        resolve(void 0);
      }
    }, intervalMs);
  });
}
async function createSession(req, res, next) {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    logger_default.info(`Creating session for ${phoneNumber}`);
    await connection_manager_default.createConnection(phoneNumber);
    const qr = await waitForQRCode(phoneNumber);
    const qrImage = qr ? await qrcode.toDataURL(qr) : void 0;
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        phoneNumber,
        status: connection_manager_default.getConnectionStatus(phoneNumber),
        qr,
        qrImage
      }
    });
  } catch (error) {
    next(error);
  }
}
async function getSessionStatus(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const status = connection_manager_default.getConnectionStatus(phoneNumber);
    const qr = connection_manager_default.getQRCode(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        phoneNumber,
        status,
        isConnected: connection_manager_default.isConnected(phoneNumber),
        ...qr && { qr }
      }
    });
  } catch (error) {
    next(error);
  }
}
async function disconnectSession(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await connection_manager_default.disconnect(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} disconnected`
    });
  } catch (error) {
    next(error);
  }
}
async function getAllSessions(req, res, next) {
  try {
    const connections = connection_manager_default.getAllConnections();
    const sessions = Array.from(connections.keys()).map((phone) => ({
      phoneNumber: phone,
      status: connection_manager_default.getConnectionStatus(phone),
      isConnected: connection_manager_default.isConnected(phone)
    }));
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        total: sessions.length,
        sessions
      }
    });
  } catch (error) {
    next(error);
  }
}
async function getQRCodeImage(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (!connection_manager_default.getConnection(phoneNumber)) {
      await connection_manager_default.createConnection(phoneNumber);
    }
    const qr = await waitForQRCode(phoneNumber) ?? connection_manager_default.getQRCode(phoneNumber);
    if (!qr) {
      const error = new Error("QR not available");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const qrText = typeof qr === "string" ? qr : String(qr);
    const qrDataUrl = await qrcode.toDataURL(qrText);
    if (req.query.format === "json") {
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          qr: qrText,
          qrImage: qrDataUrl
        }
      });
      return;
    }
    const base64 = qrDataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.status(HTTP_STATUS.OK).send(buffer);
  } catch (error) {
    next(error);
  }
}
async function getGroupList(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const isConnected = await connection_manager_default.ensureConnected(phoneNumber);
    if (!isConnected) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }
    const groups = await connection_manager_default.getGroups(phoneNumber);
    res.status(HTTP_STATUS.OK).json(groups);
  } catch (error) {
    next(error);
  }
}
async function syncGroups(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const isConnected = await connection_manager_default.ensureConnected(phoneNumber);
    if (!isConnected) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }
    const groups = await connection_manager_default.getGroups(phoneNumber);
    res.status(HTTP_STATUS.OK).json(groups);
  } catch (error) {
    next(error);
  }
}
async function getContactsHandler(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const isConnected = await connection_manager_default.ensureConnected(phoneNumber);
    if (!isConnected) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }
    const contacts = await connection_manager_default.getContacts(phoneNumber);
    res.status(HTTP_STATUS.OK).json(contacts);
  } catch (error) {
    next(error);
  }
}
async function logoutSession(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await connection_manager_default.disconnect(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} disconnected`
    });
  } catch (error) {
    next(error);
  }
}
async function listActiveSessions(req, res, next) {
  return getAllSessions(req, res, next);
}
async function restoreSessionFromBackup(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    const { backupTimestamp } = req.body;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    logger_default.info(`Attempting to restore session ${phoneNumber} from backup`);
    try {
      await connection_manager_default.disconnect(phoneNumber);
    } catch (e) {
    }
    const restored = await connection_manager_default.restoreFromBackup(phoneNumber, backupTimestamp);
    if (!restored) {
      const error = new Error("Failed to restore from backup - no backups found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    await connection_manager_default.createConnection(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} restored from backup and reconnecting`,
      data: {
        phoneNumber,
        status: connection_manager_default.getConnectionStatus(phoneNumber)
      }
    });
  } catch (error) {
    next(error);
  }
}
async function listSessionBackups(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const backups = await connection_manager_default.listBackups(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        phoneNumber,
        backups,
        total: backups.length
      }
    });
  } catch (error) {
    next(error);
  }
}
async function resetReconnectState(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    logger_default.info(`Resetting reconnect state for ${phoneNumber}`);
    await connection_manager_default.resetReconnect(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Reconnect state reset for ${phoneNumber}`
    });
  } catch (error) {
    next(error);
  }
}

// src/api/routes/session.routes.ts
var router = Router();
router.get("/list", listActiveSessions);
router.post("/", sessionLimiter, createSession);
router.get("/:phoneNumber/qr", getQRCodeImage);
router.get("/:phoneNumber/status", getSessionStatus);
router.post("/:phoneNumber/logout", logoutSession);
router.get("/:phoneNumber/groups", getGroupList);
router.get("/:phoneNumber/syncGroups", syncGroups);
router.get("/:phoneNumber/contacts", getContactsHandler);
router.delete("/:phoneNumber", disconnectSession);
router.post("/:phoneNumber/restore", restoreSessionFromBackup);
router.get("/:phoneNumber/backups", listSessionBackups);
router.post("/:phoneNumber/reset-reconnect", resetReconnectState);
router.get("/", getAllSessions);
var session_routes_default = router;

// src/api/routes/jobs.routes.ts
import { Router as Router2 } from "express";

// src/jobs/scheduler.service.ts
init_logger();
import cron from "node-cron";
import axios from "axios";
init_environment();
import path7 from "path";
var JobScheduler = class {
  constructor() {
    this.scheduledTasks = /* @__PURE__ */ new Map();
    this.jobsFile = config.jobs.storageFile;
    this.store = new json_store_default({
      baseDir: path7.dirname(this.jobsFile),
      autoBackup: true
    });
  }
  async initialize() {
    try {
      logger_default.info("Initializing Job Scheduler...");
      const jobs = await this.loadJobs();
      for (const job of jobs) {
        if (job.isActive) {
          await this.scheduleJob(job);
        }
      }
      logger_default.info(`Loaded and scheduled ${jobs.length} cron jobs`);
    } catch (error) {
      logger_default.error("Error initializing Job Scheduler:", error);
    }
  }
  async createJob(jobData) {
    try {
      if (!validateCronExpression(jobData.cronExpression)) {
        throw new Error("Invalid cron expression");
      }
      const type = jobData.type || (jobData.url ? "api" : "message");
      const job = {
        id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...jobData,
        type,
        url: jobData.url || "",
        metadata: {
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          failureCount: 0
        },
        retryPolicy: jobData.retryPolicy || { maxRetries: 3, backoffMultiplier: 2 },
        timeout: jobData.timeout || 3e4
      };
      await this.saveJob(job);
      if (job.isActive) {
        await this.scheduleJob(job);
      }
      logger_default.info(`Created job: ${job.id}`);
      return job;
    } catch (error) {
      logger_default.error("Error creating job:", error);
      throw error;
    }
  }
  async updateJob(id, updates) {
    try {
      const jobs = await this.loadJobs();
      const jobIndex = jobs.findIndex((j) => j.id === id);
      if (jobIndex === -1) {
        throw new Error(`Job ${id} not found`);
      }
      const job = jobs[jobIndex];
      const nextType = updates.type || job.type || (updates.url || job.url ? "api" : "message");
      const updated = {
        ...job,
        ...updates,
        id: job.id,
        // No actualizar ID
        type: nextType,
        url: updates.url ?? job.url ?? "",
        metadata: {
          ...job.metadata,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        retryPolicy: updates.retryPolicy || job.retryPolicy || { maxRetries: 3, backoffMultiplier: 2 },
        timeout: updates.timeout || job.timeout || 3e4
      };
      const scheduled = this.scheduledTasks.get(id);
      if (scheduled) {
        scheduled.task.stop();
        this.scheduledTasks.delete(id);
      }
      jobs[jobIndex] = updated;
      await this.saveAllJobs(jobs);
      if (updated.isActive) {
        await this.scheduleJob(updated);
      }
      logger_default.info(`Updated job: ${id}`);
      return updated;
    } catch (error) {
      logger_default.error("Error updating job:", error);
      throw error;
    }
  }
  async deleteJob(id) {
    try {
      const scheduled = this.scheduledTasks.get(id);
      if (scheduled) {
        scheduled.task.stop();
        this.scheduledTasks.delete(id);
      }
      const jobs = await this.loadJobs();
      const filtered = jobs.filter((j) => j.id !== id);
      await this.saveAllJobs(filtered);
      logger_default.info(`Deleted job: ${id}`);
    } catch (error) {
      logger_default.error("Error deleting job:", error);
      throw error;
    }
  }
  async runJobNow(id) {
    try {
      const jobs = await this.loadJobs();
      const job = jobs.find((j) => j.id === id);
      if (!job) {
        throw new Error(`Job ${id} not found`);
      }
      logger_default.info(`Running job manually: ${job.name}`);
      await this.executeJob(job, { throwOnError: true });
    } catch (error) {
      logger_default.error(`Error running job ${id}:`, error);
      throw error;
    }
  }
  async getJob(id) {
    const jobs = await this.loadJobs();
    return jobs.find((j) => j.id === id) || null;
  }
  async getAllJobs() {
    return await this.loadJobs();
  }
  async getJobsByCompany(company) {
    const jobs = await this.loadJobs();
    return jobs.filter((j) => j.company === company);
  }
  async scheduleJob(job) {
    try {
      if (!validateCronExpression(job.cronExpression)) {
        throw new Error(`Invalid cron expression for job ${job.id}`);
      }
      const task = cron.schedule(job.cronExpression, async () => {
        await this.executeJob(job);
      });
      this.scheduledTasks.set(job.id, { task, data: job });
      logger_default.debug(`Scheduled job: ${job.id} - ${job.name}`);
    } catch (error) {
      logger_default.error(`Error scheduling job ${job.id}:`, error);
    }
  }
  async executeJob(job, options = {}) {
    try {
      const startTime = Date.now();
      const retryPolicy = job.retryPolicy || { maxRetries: 3, backoffMultiplier: 2 };
      const timeout = job.timeout || 3e4;
      logger_default.info(`Executing job: ${job.name} (${job.id})`);
      if (job.type === "message") {
        const sender = job.message?.sender;
        const chatId = job.message?.chatId;
        const body = job.message?.body;
        if (!sender || !chatId || !body) {
          throw new Error("Message job missing sender, chatId, or body");
        }
        await retry(
          async () => {
            const result = await connection_manager_default.sendTextMessage(sender, chatId, body);
            if (result.queued) {
              logger_default.info(`Message job queued for ${sender} -> ${chatId}`);
            }
          },
          retryPolicy.maxRetries,
          1e3,
          retryPolicy.backoffMultiplier
        );
      } else {
        await retry(
          async () => {
            if (!job.url) {
              throw new Error("API job missing url");
            }
            const response = await axios.get(
              job.url,
              // {
              //   jobId: job.id,
              //   jobName: job.name,
              //   company: job.company,
              //   executedAt: new Date().toISOString(),
              // },
              {
                timeout
              }
            );
            return response;
          },
          retryPolicy.maxRetries,
          1e3,
          retryPolicy.backoffMultiplier
        );
      }
      const duration = Date.now() - startTime;
      const jobs = await this.loadJobs();
      const jobIndex = jobs.findIndex((j) => j.id === job.id);
      if (jobIndex !== -1) {
        const runTimestamp = (/* @__PURE__ */ new Date()).toISOString();
        jobs[jobIndex].metadata = jobs[jobIndex].metadata || {
          createdAt: runTimestamp,
          updatedAt: runTimestamp,
          failureCount: 0
        };
        jobs[jobIndex].metadata.lastRun = (/* @__PURE__ */ new Date()).toISOString();
        jobs[jobIndex].metadata.failureCount = 0;
        jobs[jobIndex].lastExecution = runTimestamp;
        jobs[jobIndex].status = "success";
        jobs[jobIndex].history = [
          ...this.normalizeHistory(jobs[jobIndex].history),
          { status: "success", timestamp: runTimestamp }
        ].slice(-10);
        await this.saveAllJobs(jobs);
      }
      logger_default.info(`\u2705 Job completed: ${job.name} (${duration}ms)`);
    } catch (error) {
      logger_default.error(`\u274C Job failed: ${job.name}`, error);
      const jobs = await this.loadJobs();
      const jobIndex = jobs.findIndex((j) => j.id === job.id);
      if (jobIndex !== -1) {
        const runTimestamp = (/* @__PURE__ */ new Date()).toISOString();
        jobs[jobIndex].metadata = jobs[jobIndex].metadata || {
          createdAt: runTimestamp,
          updatedAt: runTimestamp,
          failureCount: 0
        };
        jobs[jobIndex].metadata.failureCount++;
        jobs[jobIndex].metadata.lastError = error.message;
        jobs[jobIndex].lastExecution = runTimestamp;
        jobs[jobIndex].status = "error";
        jobs[jobIndex].history = [
          ...this.normalizeHistory(jobs[jobIndex].history),
          {
            status: "error",
            timestamp: runTimestamp,
            error: error.message
          }
        ].slice(-10);
        await this.saveAllJobs(jobs);
      }
      if (options.throwOnError) {
        throw error;
      }
    }
  }
  normalizeHistory(history) {
    if (!history || !Array.isArray(history)) {
      return [];
    }
    return history.filter((item) => {
      return !!item && (item.status === "success" || item.status === "error") && typeof item.timestamp === "string";
    });
  }
  async loadJobs() {
    try {
      const filename = path7.basename(this.jobsFile);
      const key = filename.replace(".json", "");
      const data = await this.store.get(key);
      if (Array.isArray(data)) {
        return data.map((job) => this.normalizeJob(job));
      }
      if (data && typeof data === "object" && "jobs" in data) {
        const wrapped = data;
        return (wrapped.jobs || []).map((job) => this.normalizeJob(job));
      }
      return [];
    } catch (error) {
      logger_default.warn("Error loading jobs, returning empty array:", error);
      return [];
    }
  }
  normalizeJob(job) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      ...job,
      metadata: job.metadata || {
        createdAt: now,
        updatedAt: now,
        failureCount: 0
      },
      retryPolicy: job.retryPolicy || { maxRetries: 3, backoffMultiplier: 2 },
      timeout: job.timeout || 3e4,
      history: this.normalizeHistory(job.history)
    };
  }
  async saveJob(job) {
    const jobs = await this.loadJobs();
    const index = jobs.findIndex((j) => j.id === job.id);
    if (index >= 0) {
      jobs[index] = job;
    } else {
      jobs.push(job);
    }
    await this.saveAllJobs(jobs);
  }
  async saveAllJobs(jobs) {
    const filename = path7.basename(this.jobsFile);
    const key = filename.replace(".json", "");
    await this.store.set(key, jobs);
  }
  async shutdown() {
    for (const [, scheduled] of this.scheduledTasks) {
      scheduled.task.stop();
    }
    this.scheduledTasks.clear();
    logger_default.info("Job Scheduler shut down");
  }
};
var scheduler_service_default = new JobScheduler();

// src/api/controllers/jobs.controller.ts
async function createJob(req, res, next) {
  try {
    const validation = validateCronJob(req.body);
    if (!validation.valid) {
      const error = new Error("Validation failed");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = validation.errors;
      return next(error);
    }
    const job = await scheduler_service_default.createJob(req.body);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: job
    });
  } catch (error) {
    next(error);
  }
}
async function updateJob(req, res, next) {
  try {
    const { id } = req.params;
    const validation = validateCronJobUpdate(req.body);
    if (!validation.valid) {
      const error = new Error("Validation failed");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.details = validation.errors;
      return next(error);
    }
    const job = await scheduler_service_default.updateJob(id, req.body);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: job
    });
  } catch (error) {
    next(error);
  }
}
async function deleteJob(req, res, next) {
  try {
    const { id } = req.params;
    await scheduler_service_default.deleteJob(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Job ${id} deleted`
    });
  } catch (error) {
    next(error);
  }
}
async function getJob(req, res, next) {
  try {
    const { id } = req.params;
    const job = await scheduler_service_default.getJob(id);
    if (!job) {
      const error = new Error("Job not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: job
    });
  } catch (error) {
    next(error);
  }
}
async function getAllJobs(req, res, next) {
  try {
    const { company } = req.query;
    let jobs;
    if (company && (company === "constroad" || company === "altavia")) {
      jobs = await scheduler_service_default.getJobsByCompany(company);
    } else {
      jobs = await scheduler_service_default.getAllJobs();
    }
    res.status(HTTP_STATUS.OK).json(jobs);
  } catch (error) {
    next(error);
  }
}
async function runJobNow(req, res, next) {
  try {
    const { id } = req.params;
    await scheduler_service_default.runJobNow(id);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Job ${id} executed`
    });
  } catch (error) {
    next(error);
  }
}

// src/api/routes/jobs.routes.ts
var router2 = Router2();
router2.post("/", jobsLimiter, createJob);
router2.get("/", getAllJobs);
router2.get("/:id", getJob);
router2.patch("/:id", updateJob);
router2.put("/:id", updateJob);
router2.delete("/:id", deleteJob);
router2.post("/:id/run", runJobNow);
var jobs_routes_default = router2;

// src/api/routes/message.routes.ts
import { Router as Router3 } from "express";
import multer from "multer";

// src/api/controllers/message.controller.ts
init_logger();

// src/middleware/quota.middleware.ts
init_quota_validator_service();
init_logger();
async function requireWhatsAppQuota(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error = new Error("Company ID is required");
      error.statusCode = 401;
      error.code = "COMPANY_ID_REQUIRED";
      throw error;
    }
    if (!quotaValidatorService.isReady()) {
      logger_default.warn("QuotaValidator not ready, allowing operation");
      return next();
    }
    const allowed = await quotaValidatorService.checkWhatsAppQuota(companyId);
    if (!allowed) {
      const quotaInfo = await quotaValidatorService.getWhatsAppQuotaInfo(companyId);
      logger_default.warn(`WhatsApp quota exceeded for company ${companyId}`, quotaInfo);
      res.status(429).json({
        success: false,
        error: {
          message: "WhatsApp message quota exceeded for this month",
          code: "WHATSAPP_QUOTA_EXCEEDED",
          statusCode: 429,
          quota: {
            current: quotaInfo.current,
            limit: quotaInfo.limit,
            remaining: quotaInfo.remaining,
            period: quotaInfo.period
          }
        }
      });
      return;
    }
    logger_default.debug(`WhatsApp quota check passed for company ${companyId}`);
    next();
  } catch (error) {
    const err = error;
    const statusCode = err.statusCode || 500;
    logger_default.error("WhatsApp quota validation error:", error);
    res.status(statusCode).json({
      success: false,
      error: {
        message: err.message || "Error validating WhatsApp quota",
        code: err.code || "QUOTA_VALIDATION_ERROR",
        statusCode
      }
    });
  }
}
async function requireStorageQuota(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error = new Error("Company ID is required");
      error.statusCode = 401;
      error.code = "COMPANY_ID_REQUIRED";
      throw error;
    }
    const file = req.file;
    if (!file) {
      const error = new Error("File is required");
      error.statusCode = 400;
      error.code = "FILE_REQUIRED";
      throw error;
    }
    const fileSize = file.size;
    if (!quotaValidatorService.isReady()) {
      logger_default.warn("QuotaValidator not ready, allowing operation");
      return next();
    }
    const allowed = await quotaValidatorService.checkStorageQuota(companyId, fileSize);
    if (!allowed) {
      const quotaInfo = await quotaValidatorService.getStorageQuotaInfo(companyId);
      logger_default.warn(`Storage quota exceeded for company ${companyId}`, {
        fileSize,
        ...quotaInfo
      });
      res.status(429).json({
        success: false,
        error: {
          message: "Storage quota exceeded",
          code: "STORAGE_QUOTA_EXCEEDED",
          statusCode: 429,
          quota: {
            current: quotaInfo.current,
            limit: quotaInfo.limit,
            remaining: quotaInfo.remaining,
            period: quotaInfo.period,
            currentFormatted: formatBytes(quotaInfo.current),
            limitFormatted: formatBytes(quotaInfo.limit),
            remainingFormatted: formatBytes(quotaInfo.remaining),
            fileSizeFormatted: formatBytes(fileSize)
          }
        }
      });
      return;
    }
    logger_default.debug(`Storage quota check passed for company ${companyId}: ${fileSize} bytes`);
    next();
  } catch (error) {
    const err = error;
    const statusCode = err.statusCode || 500;
    logger_default.error("Storage quota validation error:", error);
    res.status(statusCode).json({
      success: false,
      error: {
        message: err.message || "Error validating storage quota",
        code: err.code || "QUOTA_VALIDATION_ERROR",
        statusCode
      }
    });
  }
}
async function incrementWhatsAppUsage(companyId) {
  try {
    if (quotaValidatorService.isReady()) {
      await quotaValidatorService.incrementWhatsAppUsage(companyId, 1);
      logger_default.debug(`Incremented WhatsApp usage for company ${companyId}`);
    }
  } catch (error) {
    logger_default.error("Error incrementing WhatsApp usage:", error);
  }
}
async function incrementStorageUsage(companyId, fileSize) {
  try {
    if (quotaValidatorService.isReady()) {
      await quotaValidatorService.incrementStorageUsage(companyId, fileSize);
      logger_default.debug(`Incremented storage usage for company ${companyId}: ${fileSize} bytes`);
    }
  } catch (error) {
    logger_default.error("Error incrementing storage usage:", error);
  }
}
async function decrementStorageUsage(companyId, fileSize) {
  try {
    if (quotaValidatorService.isReady()) {
      await quotaValidatorService.decrementStorageUsage(companyId, fileSize);
      logger_default.debug(`Decremented storage usage for company ${companyId}: ${fileSize} bytes`);
    }
  } catch (error) {
    logger_default.error("Error decrementing storage usage:", error);
  }
}
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// src/api/controllers/message.controller.ts
function normalizeRecipient(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("@")) return trimmed;
  const normalized = trimmed.replace(/[^\d]/g, "");
  return `${normalized}@s.whatsapp.net`;
}
function detectMimeType(filename, fallback) {
  if (fallback) return fallback;
  if (!filename) return "application/octet-stream";
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "txt":
      return "text/plain";
    case "csv":
      return "text/csv";
    case "zip":
      return "application/zip";
    case "rar":
      return "application/vnd.rar";
    case "7z":
      return "application/x-7z-compressed";
    default:
      return "application/octet-stream";
  }
}
async function sendMessage(req, res, next) {
  try {
    const { sessionPhone, chatId, message } = req.body;
    if (!sessionPhone || !chatId || !message) {
      const error = new Error("sessionPhone, chatId, and message are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const { queued } = await connection_manager_default.sendTextMessage(
      sessionPhone,
      chatId,
      message
    );
    logger_default.info(`Message ${queued ? "queued" : "sent"} to ${chatId} via ${sessionPhone}`);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: queued ? "Message queued for delivery" : "Message sent successfully",
      queued
    });
  } catch (error) {
    next(error);
  }
}
async function sendTextMessage(req, res, next) {
  try {
    const { sessionPhone } = req.params;
    const { to, message, mentions } = req.body;
    if (!sessionPhone || !to || !message) {
      const error = new Error("sessionPhone, to, and message are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error = new Error("to is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const isConnected = await connection_manager_default.ensureConnected(sessionPhone);
    const socket = connection_manager_default.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const messageContent = { text: message };
    if (mentions && Array.isArray(mentions) && mentions.length > 0) {
      const mentionedJids = mentions.map((phone) => normalizeRecipient(phone));
      messageContent.mentions = mentionedJids;
      logger_default.info(`Sending message with ${mentionedJids.length} mentions`);
    }
    await socket.sendMessage(recipient, messageContent);
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Message sent successfully",
      mentionsCount: mentions?.length || 0
    });
  } catch (error) {
    next(error);
  }
}
async function sendImage(req, res, next) {
  try {
    const { sessionPhone } = req.params;
    const { to, caption } = req.body;
    const file = req.file;
    if (!sessionPhone || !to || !file) {
      const error = new Error("sessionPhone, to, and file are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const isConnected = await connection_manager_default.ensureConnected(sessionPhone);
    const socket = connection_manager_default.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error = new Error("to is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await socket.sendMessage(recipient, {
      image: file.buffer,
      caption,
      mimetype: file.mimetype
    });
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Image sent successfully"
    });
  } catch (error) {
    next(error);
  }
}
async function sendVideo(req, res, next) {
  try {
    const { sessionPhone } = req.params;
    const { to, caption } = req.body;
    const file = req.file;
    if (!sessionPhone || !to || !file) {
      const error = new Error("sessionPhone, to, and file are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const isConnected = await connection_manager_default.ensureConnected(sessionPhone);
    const socket = connection_manager_default.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error = new Error("to is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await socket.sendMessage(recipient, {
      video: file.buffer,
      caption,
      mimetype: file.mimetype
    });
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Video sent successfully"
    });
  } catch (error) {
    next(error);
  }
}
async function sendFile(req, res, next) {
  try {
    const { sessionPhone } = req.params;
    const { to, caption, mimeType } = req.body;
    const file = req.file;
    if (!sessionPhone || !to || !file) {
      const error = new Error("sessionPhone, to, and file are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const isConnected = await connection_manager_default.ensureConnected(sessionPhone);
    const socket = connection_manager_default.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error = new Error("to is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await socket.sendMessage(recipient, {
      document: file.buffer,
      fileName: file.originalname || "document",
      mimetype: detectMimeType(file.originalname, mimeType || file.mimetype),
      caption
    });
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "File sent successfully"
    });
  } catch (error) {
    next(error);
  }
}
async function getConversation(req, res, next) {
  try {
    const { sessionPhone, chatId } = req.params;
    if (!sessionPhone || !chatId) {
      const error = new Error("sessionPhone and chatId are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const conversation = await conversation_manager_default.get(chatId, sessionPhone);
    if (!conversation) {
      const error = new Error("Conversation not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    next(error);
  }
}
async function getAllConversations(req, res, next) {
  try {
    const { sessionPhone } = req.params;
    if (!sessionPhone) {
      const error = new Error("sessionPhone is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const conversations = await conversation_manager_default.getAllForSession(sessionPhone);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        total: conversations.length,
        conversations
      }
    });
  } catch (error) {
    next(error);
  }
}
async function closeConversation(req, res, next) {
  try {
    const { sessionPhone, chatId } = req.params;
    if (!sessionPhone || !chatId) {
      const error = new Error("sessionPhone and chatId are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await conversation_manager_default.closeConversation(chatId, sessionPhone);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Conversation closed"
    });
  } catch (error) {
    next(error);
  }
}
async function sendPoll(req, res, next) {
  try {
    const { sessionPhone } = req.params;
    const { to, question, options, selectableCount } = req.body;
    if (!sessionPhone || !to || !question || !options) {
      const error = new Error("sessionPhone, to, question, and options are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (!Array.isArray(options) || options.length < 2) {
      const error = new Error("options must be an array with at least 2 items");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (options.length > 12) {
      const error = new Error("options cannot exceed 12 items");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const isConnected = await connection_manager_default.ensureConnected(sessionPhone);
    const socket = connection_manager_default.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error = new Error("Invalid recipient");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const selectableOptions = selectableCount || 1;
    const maxSelectable = Math.min(selectableOptions, options.length);
    const message = await socket.sendMessage(recipient, {
      poll: {
        name: question,
        values: options,
        selectableCount: maxSelectable
      }
    });
    logger_default.info(`Poll sent to ${recipient}: ${question} (${options.length} options)`);
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Poll sent successfully",
      messageId: message.key.id,
      pollDetails: {
        question,
        optionsCount: options.length,
        selectableCount: maxSelectable
      }
    });
  } catch (error) {
    next(error);
  }
}
async function sendTextMenu(req, res, next) {
  try {
    const { sessionPhone } = req.params;
    const { to, title, options, footer } = req.body;
    if (!sessionPhone || !to || !options) {
      const error = new Error("sessionPhone, to, and options are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (!Array.isArray(options) || options.length < 1) {
      const error = new Error("options must be an array with at least 1 item");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const isConnected = await connection_manager_default.ensureConnected(sessionPhone);
    const socket = connection_manager_default.getConnection(sessionPhone);
    if (!socket || !isConnected) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const recipient = normalizeRecipient(to);
    if (!recipient) {
      const error = new Error("Invalid recipient");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const menuLines = [];
    if (title) {
      menuLines.push(`*${title}*`);
      menuLines.push("");
    }
    options.forEach((option, index) => {
      menuLines.push(`${index + 1}. ${option}`);
    });
    if (footer) {
      menuLines.push("");
      menuLines.push(footer);
    } else {
      menuLines.push("");
      menuLines.push("_Reply with the number of your choice_");
    }
    const menuText = menuLines.join("\n");
    await socket.sendMessage(recipient, { text: menuText });
    logger_default.info(`Text menu sent to ${recipient}: ${options.length} options`);
    if (req.companyId) {
      await incrementWhatsAppUsage(req.companyId);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Text menu sent successfully",
      menuDetails: {
        title: title || null,
        optionsCount: options.length,
        footer: footer || null
      }
    });
  } catch (error) {
    next(error);
  }
}

// src/middleware/tenant.middleware.ts
var import_jsonwebtoken = __toESM(require_jsonwebtoken(), 1);
init_environment();
init_logger();
function requireTenant(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      const error = new Error("No authorization header provided");
      error.statusCode = 401;
      throw error;
    }
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      const error = new Error("Invalid authorization header format. Expected: Bearer <token>");
      error.statusCode = 401;
      throw error;
    }
    const token = parts[1];
    if (!token) {
      const error = new Error("No token provided");
      error.statusCode = 401;
      throw error;
    }
    let decoded;
    try {
      decoded = import_jsonwebtoken.default.verify(token, config.security.jwtSecret);
    } catch (err) {
      const error = new Error("Invalid or expired token");
      error.statusCode = 401;
      throw error;
    }
    if (!decoded.companyId) {
      const error = new Error("Token does not contain companyId");
      error.statusCode = 401;
      throw error;
    }
    req.companyId = decoded.companyId;
    logger_default.info(`Tenant validated: ${decoded.companyId}`, {
      path: req.path,
      method: req.method,
      userId: decoded.userId
    });
    next();
  } catch (err) {
    const error = err;
    const statusCode = error.statusCode || 401;
    logger_default.warn("Tenant validation failed:", {
      path: req.path,
      method: req.method,
      error: error.message
    });
    res.status(statusCode).json({
      success: false,
      error: {
        message: error.message,
        statusCode
      }
    });
  }
}

// src/middleware/company-rate-limiter.middleware.ts
init_logger();
var rateLimitStore = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [companyId, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(companyId);
    }
  }
}, 5 * 60 * 1e3);
function checkAndIncrementRateLimit(companyId, limit, windowMs) {
  const now = Date.now();
  const record = rateLimitStore.get(companyId);
  if (!record || now > record.resetTime) {
    const newRecord = {
      count: 1,
      resetTime: now + windowMs
    };
    rateLimitStore.set(companyId, newRecord);
    return {
      allowed: true,
      current: 1,
      resetTime: newRecord.resetTime
    };
  }
  record.count++;
  rateLimitStore.set(companyId, record);
  const allowed = record.count <= limit;
  return {
    allowed,
    current: record.count,
    resetTime: record.resetTime
  };
}
function companyRateLimiter(options) {
  const {
    limit,
    windowMs = 6e4,
    // 1 minuto por defecto
    message = "Too many requests, please try again later",
    includeHeaders = true,
    onLimitReached
  } = options;
  return async (req, res, next) => {
    try {
      const companyId = req.companyId;
      if (!companyId) {
        logger_default.warn("Company rate limiter called without companyId");
        return next();
      }
      const result = checkAndIncrementRateLimit(companyId, limit, windowMs);
      if (includeHeaders) {
        res.setHeader("X-RateLimit-Limit", limit.toString());
        res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - result.current).toString());
        res.setHeader("X-RateLimit-Reset", result.resetTime.toString());
      }
      if (!result.allowed) {
        logger_default.warn(`Rate limit exceeded for company ${companyId}`, {
          current: result.current,
          limit,
          windowMs
        });
        const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1e3);
        res.setHeader("Retry-After", retryAfter.toString());
        if (onLimitReached) {
          onLimitReached(req, res);
          return;
        }
        res.status(429).json({
          success: false,
          error: {
            message,
            code: "RATE_LIMIT_EXCEEDED",
            statusCode: 429,
            rateLimit: {
              limit,
              current: result.current,
              windowMs,
              retryAfter
            }
          }
        });
        return;
      }
      next();
    } catch (error) {
      logger_default.error("Error in company rate limiter:", error);
      next();
    }
  };
}
var strictRateLimiter = companyRateLimiter({
  limit: 10,
  windowMs: 6e4,
  // 1 minuto
  message: "Rate limit exceeded. Maximum 10 requests per minute."
});
var moderateRateLimiter = companyRateLimiter({
  limit: 60,
  windowMs: 6e4,
  // 1 minuto
  message: "Rate limit exceeded. Maximum 60 requests per minute."
});
var generousRateLimiter = companyRateLimiter({
  limit: 200,
  windowMs: 6e4,
  // 1 minuto
  message: "Rate limit exceeded. Maximum 200 requests per minute."
});
var whatsappRateLimiter = companyRateLimiter({
  limit: 30,
  windowMs: 6e4,
  // 1 minuto
  message: "WhatsApp rate limit exceeded. Maximum 30 messages per minute."
});
var uploadRateLimiter = companyRateLimiter({
  limit: 20,
  windowMs: 6e4,
  // 1 minuto
  message: "Upload rate limit exceeded. Maximum 20 uploads per minute."
});

// src/api/routes/message.routes.ts
var router3 = Router3();
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});
router3.post("/", messageLimiter, sendMessage);
router3.post(
  "/:sessionPhone/text",
  requireTenant,
  whatsappRateLimiter,
  requireWhatsAppQuota,
  sendTextMessage
);
router3.post(
  "/:sessionPhone/image",
  requireTenant,
  whatsappRateLimiter,
  requireWhatsAppQuota,
  upload.single("file"),
  sendImage
);
router3.post(
  "/:sessionPhone/video",
  requireTenant,
  whatsappRateLimiter,
  requireWhatsAppQuota,
  upload.single("file"),
  sendVideo
);
router3.post(
  "/:sessionPhone/file",
  requireTenant,
  whatsappRateLimiter,
  requireWhatsAppQuota,
  upload.single("file"),
  sendFile
);
router3.get("/:sessionPhone/:chatId", getConversation);
router3.get("/:sessionPhone", getAllConversations);
router3.delete("/:sessionPhone/:chatId", closeConversation);
router3.post(
  "/:sessionPhone/poll",
  requireTenant,
  whatsappRateLimiter,
  requireWhatsAppQuota,
  sendPoll
);
router3.post(
  "/:sessionPhone/menu",
  requireTenant,
  whatsappRateLimiter,
  requireWhatsAppQuota,
  sendTextMenu
);
var message_routes_default = router3;

// src/api/routes/pdf.routes.ts
import { Router as Router4 } from "express";

// src/pdf/generator.service.ts
init_logger();
init_environment();
import puppeteer from "puppeteer";
import Handlebars from "handlebars";
import fs4 from "fs-extra";
import path8 from "path";
import { randomUUID as randomUUID2 } from "crypto";
var PDFGenerator = class {
  constructor() {
    this.browser = null;
    this.templatesDir = config.pdf.templatesDir;
    this.uploadsDir = config.pdf.uploadsDir;
  }
  async initialize() {
    try {
      logger_default.info("Initializing PDF Generator...");
      await fs4.ensureDir(this.templatesDir);
      await fs4.ensureDir(this.uploadsDir);
      this.browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });
      logger_default.info("PDF Generator initialized");
    } catch (error) {
      logger_default.error("Error initializing PDF Generator:", error);
      throw error;
    }
  }
  async generatePDF(request) {
    try {
      if (!this.browser) {
        throw new Error("PDF Generator not initialized");
      }
      logger_default.info(`Generating PDF from template: ${request.templateId}`);
      const template = await this.loadTemplate(request.templateId);
      const compiled = Handlebars.compile(template);
      const html = compiled(request.data);
      const filename = request.filename || `pdf-${randomUUID2()}.pdf`;
      const filepath = path8.join(this.uploadsDir, filename);
      const page = await this.browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.pdf({
        path: filepath,
        format: "A4",
        margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" }
      });
      await page.close();
      logger_default.info(`PDF generated: ${filepath}`);
      return filepath;
    } catch (error) {
      logger_default.error("Error generating PDF:", error);
      throw error;
    }
  }
  async createTemplate(id, name, htmlContent) {
    try {
      const filepath = path8.join(this.templatesDir, `${id}.hbs`);
      await fs4.ensureDir(path8.dirname(filepath));
      await fs4.writeFile(filepath, htmlContent, "utf-8");
      logger_default.info(`Created PDF template: ${id}`);
    } catch (error) {
      logger_default.error("Error creating PDF template:", error);
      throw error;
    }
  }
  async loadTemplate(templateId) {
    try {
      const filepath = path8.join(this.templatesDir, `${templateId}.hbs`);
      if (!await fs4.pathExists(filepath)) {
        throw new Error(`Template not found: ${templateId}`);
      }
      return await fs4.readFile(filepath, "utf-8");
    } catch (error) {
      logger_default.error("Error loading template:", error);
      throw error;
    }
  }
  async listTemplates() {
    try {
      const files = await fs4.readdir(this.templatesDir);
      return files.filter((f) => f.endsWith(".hbs")).map((f) => f.replace(".hbs", ""));
    } catch (error) {
      logger_default.error("Error listing templates:", error);
      return [];
    }
  }
  async deleteTemplate(templateId) {
    try {
      const filepath = path8.join(this.templatesDir, `${templateId}.hbs`);
      if (await fs4.pathExists(filepath)) {
        await fs4.remove(filepath);
        logger_default.info(`Deleted template: ${templateId}`);
      }
    } catch (error) {
      logger_default.error("Error deleting template:", error);
      throw error;
    }
  }
  async shutdown() {
    if (this.browser) {
      await this.browser.close();
      logger_default.info("PDF Generator shut down");
    }
  }
};
var generator_service_default = new PDFGenerator();

// src/api/controllers/pdf.controller.ts
async function generatePDF(req, res, next) {
  try {
    const { templateId, data, filename } = req.body;
    if (!templateId || !data) {
      const error = new Error("templateId and data are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const filepath = await generator_service_default.generatePDF({
      templateId,
      data,
      filename
    });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        filepath,
        filename: filename || `pdf-${Date.now()}.pdf`
      }
    });
  } catch (error) {
    next(error);
  }
}
async function createTemplate(req, res, next) {
  try {
    const { id, name, htmlContent } = req.body;
    if (!id || !name || !htmlContent) {
      const error = new Error("id, name, and htmlContent are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await generator_service_default.createTemplate(id, name, htmlContent);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: `Template ${id} created`
    });
  } catch (error) {
    next(error);
  }
}
async function listTemplates(req, res, next) {
  try {
    const templates = await generator_service_default.listTemplates();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        total: templates.length,
        templates
      }
    });
  } catch (error) {
    next(error);
  }
}
async function deleteTemplate(req, res, next) {
  try {
    const { templateId } = req.params;
    if (!templateId) {
      const error = new Error("templateId is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await generator_service_default.deleteTemplate(templateId);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Template ${templateId} deleted`
    });
  } catch (error) {
    next(error);
  }
}

// src/api/controllers/pdf-vale.controller.ts
import fs6 from "fs-extra";
import path10 from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { randomUUID as randomUUID3 } from "crypto";
init_environment();

// src/pdf/render.service.ts
init_environment();
import fs5 from "fs-extra";
import path9 from "path";
import crypto from "crypto";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
function getCacheKey(filePath, stat, page, scale) {
  const raw = `${filePath}:${stat.size}:${stat.mtimeMs}:${page}:${scale}`;
  return crypto.createHash("sha1").update(raw).digest("hex");
}
function clampScale(value) {
  if (Number.isNaN(value)) return 1;
  return Math.min(3, Math.max(0.5, value));
}
async function getPdfInfo(filePath) {
  const buffer = await fs5.readFile(filePath);
  const data = new Uint8Array(buffer);
  const task = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await task.promise;
  return {
    pages: pdf.numPages
  };
}
async function renderPdfPageToPng(filePath, options) {
  const stat = await fs5.stat(filePath);
  const scale = clampScale(options.scale);
  const cacheKey = getCacheKey(filePath, stat, options.page, scale);
  const cacheDir = path9.resolve(config.drive.cacheDir, cacheKey);
  const cacheFile = path9.join(cacheDir, `page-${options.page}.png`);
  if (await fs5.pathExists(cacheFile)) {
    return { cacheFile, fromCache: true };
  }
  await fs5.ensureDir(cacheDir);
  const buffer = await fs5.readFile(filePath);
  const data = new Uint8Array(buffer);
  const task = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await task.promise;
  if (options.page < 1 || options.page > pdf.numPages) {
    throw new Error("Page out of range");
  }
  const page = await pdf.getPage(options.page);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  const pngBuffer = canvas.toBuffer("image/png");
  await fs5.writeFile(cacheFile, pngBuffer);
  return { cacheFile, fromCache: false };
}
async function renderPdfPageToPngWithGrid(filePath, options) {
  const stat = await fs5.stat(filePath);
  const scale = clampScale(options.scale);
  const gridSize = options.gridSize && options.gridSize > 0 ? options.gridSize : 50;
  const cacheKey = getCacheKey(filePath, stat, options.page, scale) + `-g${gridSize}`;
  const cacheDir = path9.resolve(config.drive.cacheDir, cacheKey);
  const cacheFile = path9.join(cacheDir, `page-${options.page}-grid.png`);
  if (await fs5.pathExists(cacheFile)) {
    return { cacheFile, fromCache: true };
  }
  await fs5.ensureDir(cacheDir);
  const buffer = await fs5.readFile(filePath);
  const data = new Uint8Array(buffer);
  const task = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await task.promise;
  if (options.page < 1 || options.page > pdf.numPages) {
    throw new Error("Page out of range");
  }
  const page = await pdf.getPage(options.page);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  const step = gridSize * scale;
  ctx.strokeStyle = "rgba(255,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.font = `${Math.max(10, Math.floor(10 * scale))}px Arial`;
  ctx.fillStyle = "rgba(255,0,0,0.7)";
  for (let x = 0; x <= canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
    ctx.fillText(String(Math.round(x / scale)), x + 2, 12);
  }
  for (let y = 0; y <= canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    const coord = Math.round((canvas.height - y) / scale);
    ctx.fillText(String(coord), 2, y - 2);
  }
  const pngBuffer = canvas.toBuffer("image/png");
  await fs5.writeFile(cacheFile, pngBuffer);
  return { cacheFile, fromCache: false };
}

// src/api/controllers/pdf-vale.controller.ts
var DEFAULT_TEMPLATE = "plantilla_dispatch_note.pdf";
var DEFAULT_COORDS = {
  nroVale: { x: 445, y: 755, size: 11, bold: true },
  fecha: { x: 450, y: 725, size: 11, bold: true },
  senores: { x: 122, y: 676, size: 11, bold: true },
  obra: { x: 122, y: 655, size: 11 },
  tipoMaterial: { x: 122, y: 632, size: 11 },
  nroM3: { x: 230, y: 608, size: 11 },
  placa: { x: 405, y: 610, size: 11 },
  chofer: { x: 405, y: 585, size: 11 },
  hora: { x: 405, y: 560, size: 11 },
  nota: { x: 122, y: 588, size: 11 }
};
function adjustFontSizeForValue(key, value, baseSize) {
  if (key !== "obra") return baseSize;
  const length = value.trim().length;
  if (length > 70) return Math.max(8, baseSize - 4);
  if (length > 55) return Math.max(9, baseSize - 3);
  if (length > 40) return Math.max(10, baseSize - 2);
  if (length > 30) return Math.max(11, baseSize - 1);
  return baseSize;
}
function normalizeWhatsappTarget(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) return trimmed;
  if (trimmed.includes("-")) {
    return `${trimmed}@g.us`;
  }
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  return `${digits}@s.whatsapp.net`;
}
function getDefaultWhatsappSession() {
  const sessions = Array.from(connection_manager_default.getAllConnections().keys());
  return sessions.find((phone) => connection_manager_default.isConnected(phone)) || null;
}
async function sendWhatsappNotification(sessionOverride, target, caption, fileBuffer, filename) {
  const sessionPhone = sessionOverride || getDefaultWhatsappSession();
  if (!sessionPhone) {
    throw new Error("No WhatsApp session connected");
  }
  const recipient = normalizeWhatsappTarget(target);
  if (!recipient) {
    throw new Error("Invalid WhatsApp target");
  }
  const isConnected = await connection_manager_default.ensureConnected(sessionPhone);
  if (!isConnected) {
    throw new Error("WhatsApp session not connected");
  }
  const socket = connection_manager_default.getConnection(sessionPhone);
  if (!socket) {
    throw new Error("WhatsApp session not connected");
  }
  await socket.sendMessage(recipient, {
    document: fileBuffer,
    fileName: filename,
    mimetype: "application/pdf",
    caption
  });
  return { sessionPhone, recipient };
}
async function sendTelegramNotification(chatId, caption, fileBuffer, filename) {
  if (!config.telegram.botToken) {
    throw new Error("Telegram bot token not configured");
  }
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([fileBuffer], { type: "application/pdf" }), filename);
  const response = await fetch(
    `https://api.telegram.org/bot${config.telegram.botToken}/sendDocument`,
    {
      method: "POST",
      body: form
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram error: ${response.status} ${text}`);
  }
}
function buildAbsoluteUrl(req, relativeUrl) {
  const host = req.get("host");
  if (!host) return relativeUrl;
  const proto = req.protocol;
  return `${proto}://${host}${relativeUrl}`;
}
async function generateVale(req, res, next) {
  try {
    const {
      template = DEFAULT_TEMPLATE,
      fields,
      coords,
      notify
    } = req.body;
    if (!fields) {
      const error = new Error("fields are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const requiredFields = [
      "senores",
      "obra",
      "tipoMaterial",
      "nroM3",
      "placa",
      "chofer",
      "hora",
      "fecha"
    ];
    for (const key of requiredFields) {
      if (!fields[key]) {
        const error = new Error(`${key} is required`);
        error.statusCode = HTTP_STATUS.BAD_REQUEST;
        return next(error);
      }
    }
    const templatePath = path10.join(config.pdf.templatesDir, template);
    if (!await fs6.pathExists(templatePath)) {
      const error = new Error("Template not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const bytes = await fs6.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(bytes);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    if (width > height) {
      const error = new Error("Template must be portrait (vertical)");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const signaturePath = path10.join(
      path10.dirname(config.pdf.templatesDir),
      "signatures",
      "signature-dispatch-note.png"
    );
    if (await fs6.pathExists(signaturePath)) {
      const signatureBytes = await fs6.readFile(signaturePath);
      const signatureImage = await pdfDoc.embedPng(signatureBytes);
      page.drawImage(signatureImage, {
        x: 120,
        y: 500,
        width: 140,
        height: 55
      });
    }
    const values = {
      nroVale: fields.nroVale || `VALE-${Date.now()}`,
      fecha: fields.fecha,
      senores: fields.senores,
      obra: fields.obra,
      tipoMaterial: fields.tipoMaterial,
      nroM3: fields.nroM3,
      placa: fields.placa,
      chofer: fields.chofer,
      hora: fields.hora,
      nota: fields.nota || ""
    };
    const positions = {
      ...DEFAULT_COORDS,
      ...coords || {}
    };
    Object.keys(values).forEach((key) => {
      const value = values[key];
      if (!value) return;
      const pos = positions[key];
      const isVale = key === "nroVale";
      const isbold = pos.bold || false;
      const size = adjustFontSizeForValue(key, String(value), pos.size || 12);
      page.drawText(String(value), {
        x: pos.x,
        y: pos.y,
        size,
        font: isbold ? fontBold : font,
        color: isVale ? rgb(0.8, 0, 0) : rgb(0, 0, 0)
      });
    });
    await fs6.ensureDir(config.pdf.tempDir);
    const valeNumber = fields.nroVale || randomUUID3().slice(0, 8);
    const safeVale = String(valeNumber).replace(/[^a-zA-Z0-9_-]+/g, "-");
    const filename = `vale-despacho-${safeVale}.pdf`;
    const outputPath = path10.join(config.pdf.tempDir, filename);
    const pdfBytes = await pdfDoc.save();
    await fs6.writeFile(outputPath, pdfBytes);
    const publicUrl = `${config.pdf.tempPublicBaseUrl.replace(/\/+$/, "")}/${encodeURI(
      filename
    )}`;
    const notifyStatus = {};
    const notifyTasks = [];
    if (notify?.whatsapp?.to) {
      notifyTasks.push(
        (async () => {
          try {
            const result = await sendWhatsappNotification(
              notify.whatsapp.from,
              notify.whatsapp.to,
              notify.whatsapp.caption,
              Buffer.from(pdfBytes),
              filename
            );
            notifyStatus.whatsapp = { sent: true, ...result };
          } catch (error) {
            notifyStatus.whatsapp = { sent: false, error: String(error) };
          }
        })()
      );
    }
    if (notify?.telegram?.chatId) {
      notifyTasks.push(
        (async () => {
          try {
            await sendTelegramNotification(
              notify.telegram.chatId,
              notify.telegram.caption,
              Buffer.from(pdfBytes),
              filename
            );
            notifyStatus.telegram = { sent: true };
          } catch (error) {
            notifyStatus.telegram = { sent: false, error: String(error) };
          }
        })()
      );
    }
    if (notifyTasks.length > 0) {
      await Promise.allSettled(notifyTasks);
    }
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        filename,
        url: publicUrl,
        urlAbsolute: buildAbsoluteUrl(req, publicUrl),
        notify: notifyStatus
      }
    });
  } catch (error) {
    next(error);
  }
}
async function previewValeTemplateGrid(req, res, next) {
  try {
    const template = String(req.query.template || DEFAULT_TEMPLATE);
    const page = parseInt(String(req.query.page || "1"), 10);
    const scale = parseFloat(String(req.query.scale || "1.5"));
    const gridSize = parseInt(String(req.query.grid || "50"), 10);
    const templatePath = path10.join(config.pdf.templatesDir, template);
    if (!await fs6.pathExists(templatePath)) {
      const error = new Error("Template not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const { cacheFile } = await renderPdfPageToPngWithGrid(templatePath, {
      page,
      scale,
      gridSize
    });
    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    res.setHeader("Content-Type", "image/png");
    res.status(HTTP_STATUS.OK).sendFile(path10.resolve(cacheFile));
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Invalid request");
    if (!err.statusCode) {
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
    }
    next(err);
  }
}

// src/api/routes/pdf.routes.ts
var router4 = Router4();
router4.post("/generate", generatePDF);
router4.post("/generate-vale", generateVale);
router4.get("/templates/preview-grid", previewValeTemplateGrid);
router4.post("/templates", createTemplate);
router4.get("/templates", listTemplates);
router4.delete("/templates/:templateId", deleteTemplate);
var pdf_routes_default = router4;

// src/api/routes/drive.routes.ts
import { Router as Router5 } from "express";
import multer2 from "multer";
import fs10 from "fs-extra";
import path14 from "path";

// src/api/controllers/drive.controller.ts
import fs8 from "fs-extra";
import path12 from "path";

// src/services/storage-path.service.ts
init_environment();
init_logger();
import path11 from "path";
import fs7 from "fs-extra";
var StoragePathService = class {
  constructor() {
    /**
     * Módulos estándar que se crean automáticamente para cada empresa
     */
    this.standardModules = [
      { name: "orders", description: "Pedidos y obras", autoCreate: true },
      { name: "dispatches", description: "Despachos y vales", autoCreate: true },
      { name: "clients", description: "Documentos de clientes", autoCreate: true },
      { name: "certificates", description: "Certificados de calidad", autoCreate: true },
      { name: "reports", description: "Reportes y an\xE1lisis", autoCreate: true },
      { name: "media", description: "Archivos multimedia", autoCreate: true },
      { name: "temp", description: "Archivos temporales", autoCreate: true }
    ];
    this.root = config.storage.root;
    logger_default.info(`StoragePathService initialized with root: ${this.root}`);
  }
  // ==========================================================================
  // PATH BUILDERS
  // ==========================================================================
  /**
   * Obtiene la ruta raíz de una empresa
   * @param companyId ID de la empresa
   * @returns Ruta absoluta a la carpeta de la empresa
   */
  getCompanyRoot(companyId) {
    if (!companyId || companyId.trim() === "") {
      throw new Error("companyId is required");
    }
    return path11.join(this.root, "companies", companyId);
  }
  /**
   * Obtiene la ruta de un módulo específico para una empresa
   * @param companyId ID de la empresa
   * @param module Nombre del módulo (orders, dispatches, clients, etc.)
   * @param subpath Subruta opcional dentro del módulo
   * @returns Ruta absoluta al módulo o subruta
   */
  getModulePath(companyId, module, subpath) {
    const root = this.getCompanyRoot(companyId);
    const modulePath = path11.join(root, module);
    if (subpath) {
      return path11.join(modulePath, subpath);
    }
    return modulePath;
  }
  /**
   * Obtiene la estructura completa de carpetas para una empresa
   * @param companyId ID de la empresa
   * @returns Objeto con todas las rutas de módulos
   */
  getCompanyStructure(companyId) {
    const root = this.getCompanyRoot(companyId);
    return {
      companyId,
      root,
      modules: {
        orders: path11.join(root, "orders"),
        dispatches: path11.join(root, "dispatches"),
        clients: path11.join(root, "clients"),
        certificates: path11.join(root, "certificates"),
        reports: path11.join(root, "reports"),
        media: path11.join(root, "media"),
        temp: path11.join(root, "temp")
      }
    };
  }
  /**
   * Resuelve una ruta relativa a una ruta absoluta dentro de una empresa
   * @param companyId ID de la empresa
   * @param relativePath Ruta relativa proporcionada por el usuario
   * @returns Ruta absoluta resuelta
   */
  resolvePath(companyId, relativePath) {
    const companyRoot = this.getCompanyRoot(companyId);
    const normalized = path11.normalize(relativePath);
    const resolved = path11.join(companyRoot, normalized);
    return resolved;
  }
  // ==========================================================================
  // VALIDATION
  // ==========================================================================
  /**
   * Valida que una ruta esté dentro del espacio permitido para una empresa
   * Previene path traversal attacks (../, etc.)
   * @param requestedPath Ruta que se quiere acceder
   * @param companyId ID de la empresa
   * @returns true si el acceso es válido, false si no
   */
  validateAccess(requestedPath, companyId) {
    try {
      const companyRoot = this.getCompanyRoot(companyId);
      const normalizedRequested = path11.normalize(requestedPath);
      const normalizedRoot = path11.normalize(companyRoot);
      const isWithinCompanyRoot = normalizedRequested.startsWith(normalizedRoot);
      if (!isWithinCompanyRoot) {
        logger_default.warn("Path validation failed: outside company root", {
          companyId,
          requestedPath: normalizedRequested,
          companyRoot: normalizedRoot
        });
        return false;
      }
      const relative = path11.relative(normalizedRoot, normalizedRequested);
      const hasTraversal = relative.startsWith("..") || path11.isAbsolute(relative);
      if (hasTraversal) {
        logger_default.warn("Path validation failed: traversal attempt detected", {
          companyId,
          requestedPath: normalizedRequested,
          relative
        });
        return false;
      }
      return true;
    } catch (error) {
      logger_default.error("Path validation error:", error);
      return false;
    }
  }
  /**
   * Valida que un módulo sea válido
   * @param moduleName Nombre del módulo
   * @returns true si es un módulo estándar
   */
  isValidModule(moduleName) {
    return this.standardModules.some((m) => m.name === moduleName);
  }
  // ==========================================================================
  // DIRECTORY MANAGEMENT
  // ==========================================================================
  /**
   * Crea la estructura de carpetas completa para una empresa
   * @param companyId ID de la empresa
   * @returns Promise que se resuelve cuando se crea la estructura
   */
  async ensureCompanyStructure(companyId) {
    const structure = this.getCompanyStructure(companyId);
    logger_default.info(`Creating company storage structure for: ${companyId}`);
    try {
      await fs7.ensureDir(structure.root);
      const moduleCreations = this.standardModules.filter((m) => m.autoCreate).map(async (module) => {
        const modulePath = path11.join(structure.root, module.name);
        await fs7.ensureDir(modulePath);
        logger_default.debug(`Created module folder: ${module.name}`, { companyId });
      });
      await Promise.all(moduleCreations);
      logger_default.info(`Company storage structure created successfully for: ${companyId}`);
      return structure;
    } catch (error) {
      logger_default.error(`Failed to create company storage structure for: ${companyId}`, error);
      throw error;
    }
  }
  /**
   * Verifica si la estructura de una empresa existe
   * @param companyId ID de la empresa
   * @returns true si existe la carpeta raíz
   */
  async companyStructureExists(companyId) {
    const root = this.getCompanyRoot(companyId);
    return fs7.pathExists(root);
  }
  /**
   * Asegura que un directorio exista, creándolo si es necesario
   * Solo si está dentro del espacio de la empresa
   * @param dirPath Ruta del directorio
   * @param companyId ID de la empresa
   */
  async ensureDir(dirPath, companyId) {
    if (!this.validateAccess(dirPath, companyId)) {
      throw new Error("Invalid path: outside company storage space");
    }
    await fs7.ensureDir(dirPath);
  }
  // ==========================================================================
  // UTILITIES
  // ==========================================================================
  /**
   * Obtiene información de uso de almacenamiento para una empresa
   * @param companyId ID de la empresa
   * @returns Tamaño total en bytes
   */
  async getStorageUsage(companyId) {
    const root = this.getCompanyRoot(companyId);
    if (!await fs7.pathExists(root)) {
      return 0;
    }
    try {
      const calculateSize = async (dir) => {
        const entries = await fs7.readdir(dir, { withFileTypes: true });
        let totalSize = 0;
        for (const entry of entries) {
          const fullPath = path11.join(dir, entry.name);
          if (entry.isDirectory()) {
            totalSize += await calculateSize(fullPath);
          } else {
            const stats = await fs7.stat(fullPath);
            totalSize += stats.size;
          }
        }
        return totalSize;
      };
      return await calculateSize(root);
    } catch (error) {
      logger_default.error(`Failed to calculate storage usage for: ${companyId}`, error);
      return 0;
    }
  }
  /**
   * Convierte bytes a formato legible
   * @param bytes Tamaño en bytes
   * @returns String formateado (ej: "1.5 GB")
   */
  formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
  /**
   * Limpia archivos temporales de una empresa
   * @param companyId ID de la empresa
   */
  async cleanTempFiles(companyId) {
    const tempPath = this.getModulePath(companyId, "temp");
    if (await fs7.pathExists(tempPath)) {
      await fs7.emptyDir(tempPath);
      logger_default.info(`Cleaned temp files for company: ${companyId}`);
    }
  }
};
var storagePathService = new StoragePathService();

// src/api/controllers/drive.controller.ts
function isValidEntryName(name) {
  if (!name) return false;
  if (name === "." || name === "..") return false;
  return !/[\\/]/.test(name);
}
function toEntry(relativeBase, name, stat, companyId) {
  const relPath = relativeBase ? `${relativeBase}/${name}` : name;
  const type = stat.isDirectory() ? "folder" : "file";
  const listUrl = type === "folder" ? `/api/drive/list?path=${encodeURIComponent(relPath)}` : void 0;
  return {
    name,
    path: relPath,
    type,
    size: stat.isFile() ? stat.size : void 0,
    updatedAt: stat.mtime.toISOString(),
    url: stat.isFile() ? `/files/companies/${companyId}/${relPath}` : void 0,
    listUrl
  };
}
function buildAbsoluteUrl2(req, relativeUrl) {
  const host = req.get("host");
  if (!host) return relativeUrl;
  const proto = req.protocol;
  return `${proto}://${host}${relativeUrl}`;
}
async function listEntries(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error = new Error("Company ID is required");
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }
    await storagePathService.ensureCompanyStructure(companyId);
    const relativePath = req.query.path || "";
    const resolved = storagePathService.resolvePath(companyId, relativePath);
    if (!storagePathService.validateAccess(resolved, companyId)) {
      const error = new Error("Access denied: invalid path");
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }
    const exists = await fs8.pathExists(resolved);
    if (!exists) {
      const error = new Error("Path not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const stat = await fs8.stat(resolved);
    if (!stat.isDirectory()) {
      const error = new Error("Path is not a folder");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const entries = (await fs8.readdir(resolved)).filter((name) => !name.startsWith("."));
    const results = await Promise.all(
      entries.map(async (name) => {
        const entryStat = await fs8.stat(path12.join(resolved, name));
        const entry = toEntry(relativePath, name, entryStat, companyId);
        const result = { ...entry };
        if (entry.url) {
          result.urlAbsolute = buildAbsoluteUrl2(req, entry.url);
        }
        if (entry.listUrl) {
          result.listUrlAbsolute = buildAbsoluteUrl2(req, entry.listUrl);
        }
        return result;
      })
    );
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        path: relativePath || "",
        total: results.length,
        entries: results
      }
    });
  } catch (error) {
    next(error);
  }
}
async function createFolder(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error = new Error("Company ID is required");
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }
    const { path: parentPath, name } = req.body;
    if (!name || !isValidEntryName(name)) {
      const error = new Error("Invalid folder name");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const relativePath = parentPath || "";
    const resolved = storagePathService.resolvePath(companyId, relativePath);
    if (!storagePathService.validateAccess(resolved, companyId)) {
      const error = new Error("Access denied: invalid path");
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }
    const parentExists = await fs8.pathExists(resolved);
    if (!parentExists) {
      const error = new Error("Parent path not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const target = path12.join(resolved, name);
    if (!storagePathService.validateAccess(target, companyId)) {
      const error = new Error("Access denied: invalid target path");
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }
    await fs8.ensureDir(target);
    const newPath = relativePath ? `${relativePath}/${name}` : name;
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        name,
        path: newPath,
        type: "folder"
      }
    });
  } catch (error) {
    next(error);
  }
}
async function uploadFile(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error = new Error("Company ID is required");
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }
    const { path: parentPath } = req.body;
    const file = req.file;
    if (!file) {
      const error = new Error("file is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (!isValidEntryName(file.originalname)) {
      const error = new Error("Invalid file name");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const relativePath = parentPath || "";
    const resolved = storagePathService.resolvePath(companyId, relativePath);
    if (!storagePathService.validateAccess(resolved, companyId)) {
      const error = new Error("Access denied: invalid path");
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }
    await fs8.ensureDir(resolved);
    const MAX_ORDERS_BYTES = 100 * 1024 * 1024;
    const MAX_DRIVE_BYTES2 = 2 * 1024 * 1024 * 1024;
    const isDriveRoot = relativePath.startsWith("drive");
    const maxAllowedBytes = isDriveRoot ? MAX_DRIVE_BYTES2 : MAX_ORDERS_BYTES;
    if (file.size > maxAllowedBytes) {
      await fs8.remove(file.path).catch(() => {
      });
      const error = new Error("File too large");
      error.statusCode = HTTP_STATUS.REQUEST_TOO_LONG;
      return next(error);
    }
    const target = path12.join(resolved, file.originalname);
    if (!storagePathService.validateAccess(target, companyId)) {
      const error = new Error("Access denied: invalid target path");
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }
    await fs8.move(file.path, target, { overwrite: true });
    await incrementStorageUsage(companyId, file.size);
    const filePath = relativePath ? `${relativePath}/${file.originalname}` : file.originalname;
    const publicUrl = `/files/companies/${companyId}/${filePath}`;
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        name: file.originalname,
        path: filePath,
        type: "file",
        size: file.size,
        url: publicUrl,
        urlAbsolute: buildAbsoluteUrl2(req, publicUrl)
      }
    });
  } catch (error) {
    next(error);
  }
}
async function deleteEntry(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error = new Error("Company ID is required");
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }
    const targetPath = req.query.path;
    if (!targetPath) {
      const error = new Error("path is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const resolved = storagePathService.resolvePath(companyId, targetPath);
    if (!storagePathService.validateAccess(resolved, companyId)) {
      const error = new Error("Access denied: invalid path");
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }
    const exists = await fs8.pathExists(resolved);
    if (!exists) {
      const error = new Error("Path not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const stats = await fs8.stat(resolved);
    const isFile = stats.isFile();
    const fileSize = isFile ? stats.size : 0;
    await fs8.remove(resolved);
    if (isFile && fileSize > 0) {
      await decrementStorageUsage(companyId, fileSize);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Entry deleted",
      data: {
        path: targetPath
      }
    });
  } catch (error) {
    next(error);
  }
}
async function moveEntry(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error = new Error("Company ID is required");
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }
    const { from, to } = req.body;
    if (!from || !to) {
      const error = new Error("from and to are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const fromResolved = storagePathService.resolvePath(companyId, from);
    const toResolved = storagePathService.resolvePath(companyId, to);
    if (!storagePathService.validateAccess(fromResolved, companyId)) {
      const error = new Error("Access denied: invalid source path");
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }
    if (!storagePathService.validateAccess(toResolved, companyId)) {
      const error = new Error("Access denied: invalid destination path");
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }
    const exists = await fs8.pathExists(fromResolved);
    if (!exists) {
      const error = new Error("Source not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    await fs8.ensureDir(path12.dirname(toResolved));
    await fs8.move(fromResolved, toResolved, { overwrite: false });
    const publicUrl = `/files/companies/${companyId}/${to}`;
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        from,
        to,
        url: publicUrl,
        urlAbsolute: buildAbsoluteUrl2(req, publicUrl)
      }
    });
  } catch (error) {
    next(error);
  }
}
async function getInfo(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error = new Error("Company ID is required");
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }
    const targetPath = req.query.path;
    if (!targetPath) {
      const error = new Error("path is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const resolved = storagePathService.resolvePath(companyId, targetPath);
    if (!storagePathService.validateAccess(resolved, companyId)) {
      const error = new Error("Access denied: invalid path");
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }
    const stat = await fs8.stat(resolved);
    const name = path12.basename(resolved);
    const parent = path12.dirname(targetPath).replace(/\\/g, "/");
    const base = parent === "." ? "" : parent;
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: (() => {
        const entry = toEntry(base, name, stat, companyId);
        const result = { ...entry };
        if (entry.url) {
          result.urlAbsolute = buildAbsoluteUrl2(req, entry.url);
        }
        if (entry.listUrl) {
          result.listUrlAbsolute = buildAbsoluteUrl2(req, entry.listUrl);
        }
        return result;
      })()
    });
  } catch (error) {
    next(error);
  }
}

// src/api/controllers/drive-pdf.controller.ts
import fs9 from "fs-extra";
import path13 from "path";
function getPdfPathFromRequest(req) {
  const companyId = req.companyId;
  if (!companyId) {
    throw new Error("Company ID is required");
  }
  const { path: pathParam } = req.query;
  if (!pathParam) {
    throw new Error("path is required");
  }
  const resolved = storagePathService.resolvePath(companyId, pathParam);
  if (!storagePathService.validateAccess(resolved, companyId)) {
    throw new Error("Access denied: invalid path");
  }
  return { resolved, normalized: pathParam };
}
function ensurePdfExtension(filePath) {
  return path13.extname(filePath).toLowerCase() === ".pdf";
}
async function resolveExistingPdfPath(resolved, normalized, companyId) {
  if (await fs9.pathExists(resolved)) {
    return { resolved, normalized };
  }
  const candidates = [normalized.normalize("NFC"), normalized.normalize("NFD")].filter(
    (candidate, index, arr) => candidate && arr.indexOf(candidate) === index
  );
  for (const candidate of candidates) {
    const altResolved = storagePathService.resolvePath(companyId, candidate);
    if (await fs9.pathExists(altResolved)) {
      return { resolved: altResolved, normalized: candidate };
    }
  }
  return { resolved, normalized };
}
async function getPdfMetadata(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error = new Error("Company ID is required");
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }
    const initial = getPdfPathFromRequest(req);
    const { resolved, normalized } = await resolveExistingPdfPath(
      initial.resolved,
      initial.normalized,
      companyId
    );
    if (!normalized || !ensurePdfExtension(resolved)) {
      const error = new Error("Only PDF files are allowed");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const exists = await fs9.pathExists(resolved);
    if (!exists) {
      const error = new Error("File not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const info = await getPdfInfo(resolved);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        path: normalized,
        pages: info.pages
      }
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Invalid request");
    if (!err.statusCode) {
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
    }
    next(err);
  }
}
async function getPdfPageImage(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error = new Error("Company ID is required");
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }
    const initial = getPdfPathFromRequest(req);
    const { resolved, normalized } = await resolveExistingPdfPath(
      initial.resolved,
      initial.normalized,
      companyId
    );
    const page = parseInt(String(req.query.page || "1"), 10);
    const scale = parseFloat(String(req.query.scale || "1.5"));
    if (!normalized || !ensurePdfExtension(resolved)) {
      const error = new Error("Only PDF files are allowed");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const exists = await fs9.pathExists(resolved);
    if (!exists) {
      const error = new Error("File not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const { cacheFile } = await renderPdfPageToPng(resolved, { page, scale });
    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-PDF-Path", normalized);
    res.setHeader("X-PDF-Page", String(page));
    res.status(HTTP_STATUS.OK).sendFile(path13.resolve(cacheFile));
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Invalid request");
    if (!err.statusCode) {
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
    }
    next(err);
  }
}
async function getPdfPagePreviewGrid(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      const error = new Error("Company ID is required");
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      return next(error);
    }
    const initial = getPdfPathFromRequest(req);
    const { resolved, normalized } = await resolveExistingPdfPath(
      initial.resolved,
      initial.normalized,
      companyId
    );
    const page = parseInt(String(req.query.page || "1"), 10);
    const scale = parseFloat(String(req.query.scale || "1.5"));
    const gridSize = parseInt(String(req.query.grid || "50"), 10);
    if (!normalized || !ensurePdfExtension(resolved)) {
      const error = new Error("Only PDF files are allowed");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const exists = await fs9.pathExists(resolved);
    if (!exists) {
      const error = new Error("File not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const { cacheFile } = await renderPdfPageToPngWithGrid(resolved, {
      page,
      scale,
      gridSize
    });
    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-PDF-Path", normalized);
    res.setHeader("X-PDF-Page", String(page));
    res.status(HTTP_STATUS.OK).sendFile(path13.resolve(cacheFile));
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Invalid request");
    if (!err.statusCode) {
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
    }
    next(err);
  }
}

// src/api/routes/drive.routes.ts
init_environment();
var router5 = Router5();
var MAX_DRIVE_BYTES = 2 * 1024 * 1024 * 1024;
var tempDir = path14.join(config.storage.root, "temp", "uploads");
fs10.ensureDirSync(tempDir);
var upload2 = multer2({
  storage: multer2.diskStorage({
    destination: (_req, _file, cb) => cb(null, tempDir),
    filename: (_req, file, cb) => {
      const safeName = `${Date.now()}-${file.originalname}`;
      cb(null, safeName);
    }
  }),
  limits: { fileSize: MAX_DRIVE_BYTES }
});
router5.get("/list", requireTenant, listEntries);
router5.get("/info", requireTenant, getInfo);
router5.post("/folders", requireTenant, createFolder);
router5.post("/files", requireTenant, uploadRateLimiter, upload2.single("file"), requireStorageQuota, uploadFile);
router5.delete("/entry", requireTenant, deleteEntry);
router5.patch("/move", requireTenant, moveEntry);
router5.get("/pdf/info", requireTenant, getPdfMetadata);
router5.get("/pdf/page", requireTenant, getPdfPageImage);
router5.get("/pdf/preview-grid", requireTenant, getPdfPagePreviewGrid);
var drive_routes_default = router5;

// src/index.ts
import swaggerUi from "swagger-ui-express";

// src/api/docs/openapi.ts
var openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "WhatsApp API v2",
    version: "2.0.0",
    description: "API para sesiones, mensajeria, jobs, PDFs y almacenamiento multi-tenant."
  },
  servers: [
    {
      url: "/"
    }
  ],
  tags: [
    { name: "Session", description: "Sesiones de WhatsApp" },
    { name: "WhatsApp", description: "Envio de mensajes y archivos" },
    { name: "Messages", description: "Historial de conversaciones" },
    { name: "Jobs", description: "Cron jobs" },
    { name: "PDF", description: "Generacion de PDFs y templates" },
    { name: "Drive", description: "Almacenamiento multi-tenant (requiere JWT con companyId)" },
    { name: "System", description: "Health y estado del servidor" }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token con companyId en el payload. Formato: Authorization: Bearer {token}"
      }
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              message: { type: "string" },
              statusCode: { type: "number" }
            }
          }
        }
      },
      DriveEntry: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre del archivo o carpeta" },
          path: { type: "string", description: "Ruta relativa" },
          type: { type: "string", enum: ["file", "folder"] },
          size: { type: "number", description: "Tama\xF1o en bytes (solo archivos)" },
          updatedAt: { type: "string", format: "date-time" },
          url: { type: "string", description: "URL publica (solo archivos)" },
          listUrl: { type: "string", description: "URL para listar (solo carpetas)" }
        }
      }
    }
  },
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          200: {
            description: "Servidor activo",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    timestamp: { type: "string", format: "date-time" },
                    environment: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/status": {
      get: {
        tags: ["System"],
        summary: "Estado del servidor y sesiones activas",
        responses: {
          200: {
            description: "Estado del sistema",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        activeSessions: { type: "number" },
                        nodeEnv: { type: "string" },
                        timestamp: { type: "string", format: "date-time" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/sessions": {
      post: {
        tags: ["Session"],
        summary: "Crear nueva sesion WhatsApp",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["phoneNumber"],
                properties: {
                  phoneNumber: {
                    type: "string",
                    description: "Numero en formato internacional (ej. 51999999999)"
                  }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Sesion creada"
          },
          400: { description: "Datos invalidos" }
        }
      },
      get: {
        tags: ["Session"],
        summary: "Obtener todas las sesiones",
        responses: {
          200: { description: "Listado de sesiones" }
        }
      }
    },
    "/api/sessions/list": {
      get: {
        tags: ["Session"],
        summary: "Listar sesiones activas",
        responses: {
          200: {
            description: "Listado de sesiones"
          }
        }
      }
    },
    "/api/sessions/{phoneNumber}/qr": {
      get: {
        tags: ["Session"],
        summary: "Obtener QR como imagen PNG",
        description: "Usa ?format=json para recibir el QR como data URL.",
        parameters: [
          {
            name: "phoneNumber",
            in: "path",
            required: true,
            schema: { type: "string" }
          },
          {
            name: "format",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["json"] },
            description: "Devuelve el QR como data URL en JSON"
          }
        ],
        responses: {
          200: {
            description: "QR en PNG",
            content: {
              "image/png": {
                schema: { type: "string", format: "binary" }
              },
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        qr: { type: "string" },
                        qrImage: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          },
          404: { description: "QR no disponible" }
        }
      }
    },
    "/api/sessions/{phoneNumber}/status": {
      get: {
        tags: ["Session"],
        summary: "Estado de sesion WhatsApp",
        parameters: [
          {
            name: "phoneNumber",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: { description: "Estado de sesion" },
          400: { description: "Numero invalido" }
        }
      }
    },
    "/api/sessions/{phoneNumber}/logout": {
      post: {
        tags: ["Session"],
        summary: "Cerrar sesion activa",
        parameters: [
          {
            name: "phoneNumber",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: { description: "Sesion cerrada" },
          400: { description: "Numero invalido" }
        }
      }
    },
    "/api/sessions/{phoneNumber}/groups": {
      get: {
        tags: ["Session"],
        summary: "Listar grupos de WhatsApp",
        parameters: [
          {
            name: "phoneNumber",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Listado de grupos",
            content: {
              "application/json": {
                schema: { type: "array", items: { type: "object" } }
              }
            }
          }
        }
      }
    },
    "/api/sessions/{phoneNumber}/syncGroups": {
      get: {
        tags: ["Session"],
        summary: "Sincronizar grupos de WhatsApp",
        parameters: [
          {
            name: "phoneNumber",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Listado de grupos",
            content: {
              "application/json": {
                schema: { type: "array", items: { type: "object" } }
              }
            }
          }
        }
      }
    },
    "/api/sessions/{phoneNumber}/contacts": {
      get: {
        tags: ["Session"],
        summary: "Listar contactos de WhatsApp",
        parameters: [
          {
            name: "phoneNumber",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: {
            description: "Listado de contactos",
            content: {
              "application/json": {
                schema: { type: "array", items: { type: "object" } }
              }
            }
          }
        }
      }
    },
    "/api/sessions/{phoneNumber}": {
      delete: {
        tags: ["Session"],
        summary: "Desconectar sesion WhatsApp",
        parameters: [
          {
            name: "phoneNumber",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: { description: "Sesion desconectada" },
          400: { description: "Numero invalido" }
        }
      }
    },
    "/api/message": {
      post: {
        tags: ["WhatsApp"],
        summary: "Enviar mensaje de texto (legacy)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sessionPhone", "chatId", "message"],
                properties: {
                  sessionPhone: { type: "string" },
                  chatId: { type: "string" },
                  message: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "Mensaje enviado" },
          400: { description: "Datos invalidos" }
        }
      }
    },
    "/api/message/{sessionPhone}/text": {
      post: {
        tags: ["WhatsApp"],
        summary: "Enviar mensaje de texto",
        parameters: [
          {
            name: "sessionPhone",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["to", "message"],
                properties: {
                  to: {
                    type: "string",
                    description: "Numero destino o JID (ej. 51999999999 o 51999999999@s.whatsapp.net)"
                  },
                  message: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "Mensaje enviado" },
          400: { description: "Datos invalidos" }
        }
      }
    },
    "/api/message/{sessionPhone}/image": {
      post: {
        tags: ["WhatsApp"],
        summary: "Enviar imagen",
        parameters: [
          {
            name: "sessionPhone",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file", "to"],
                properties: {
                  file: { type: "string", format: "binary" },
                  to: { type: "string" },
                  caption: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "Imagen enviada" },
          400: { description: "Datos invalidos" }
        }
      }
    },
    "/api/message/{sessionPhone}/video": {
      post: {
        tags: ["WhatsApp"],
        summary: "Enviar video",
        parameters: [
          {
            name: "sessionPhone",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file", "to"],
                properties: {
                  file: { type: "string", format: "binary" },
                  to: { type: "string" },
                  caption: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "Video enviado" },
          400: { description: "Datos invalidos" }
        }
      }
    },
    "/api/message/{sessionPhone}/file": {
      post: {
        tags: ["WhatsApp"],
        summary: "Enviar archivo",
        parameters: [
          {
            name: "sessionPhone",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file", "to"],
                properties: {
                  file: { type: "string", format: "binary" },
                  to: { type: "string" },
                  caption: { type: "string" },
                  mimeType: {
                    type: "string",
                    description: "Opcional, se detecta por extension si no se envia"
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "Archivo enviado" },
          400: { description: "Datos invalidos" }
        }
      }
    },
    "/api/message/{sessionPhone}/{chatId}": {
      get: {
        tags: ["Messages"],
        summary: "Obtener conversacion",
        parameters: [
          { name: "sessionPhone", in: "path", required: true, schema: { type: "string" } },
          { name: "chatId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          200: { description: "Conversacion" },
          404: { description: "No encontrada" }
        }
      },
      delete: {
        tags: ["Messages"],
        summary: "Cerrar conversacion",
        parameters: [
          { name: "sessionPhone", in: "path", required: true, schema: { type: "string" } },
          { name: "chatId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          200: { description: "Conversacion cerrada" }
        }
      }
    },
    "/api/message/{sessionPhone}": {
      get: {
        tags: ["Messages"],
        summary: "Listar conversaciones de sesion",
        parameters: [
          { name: "sessionPhone", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          200: { description: "Listado de conversaciones" }
        }
      }
    },
    "/api/jobs": {
      post: {
        tags: ["Jobs"],
        summary: "Crear cron job",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "cronExpression", "company", "isActive"],
                properties: {
                  name: { type: "string" },
                  type: { type: "string", enum: ["api", "message"] },
                  url: { type: "string" },
                  message: {
                    type: "object",
                    properties: {
                      sender: { type: "string" },
                      chatId: { type: "string" },
                      body: { type: "string" }
                    }
                  },
                  cronExpression: { type: "string" },
                  company: { type: "string", enum: ["constroad", "altavia"] },
                  isActive: { type: "boolean" },
                  timeout: { type: "number" },
                  retryPolicy: {
                    type: "object",
                    properties: {
                      maxRetries: { type: "number" },
                      backoffMultiplier: { type: "number" }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          201: { description: "Job creado" }
        }
      },
      get: {
        tags: ["Jobs"],
        summary: "Listar cron jobs",
        parameters: [
          {
            name: "company",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["constroad", "altavia"] },
            description: "Filtrar jobs por empresa"
          }
        ],
        responses: {
          200: { description: "Listado de jobs" }
        }
      }
    },
    "/api/jobs/{id}": {
      get: {
        tags: ["Jobs"],
        summary: "Obtener job por ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Job encontrado" },
          404: { description: "No encontrado" }
        }
      },
      patch: {
        tags: ["Jobs"],
        summary: "Actualizar cron job",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  url: { type: "string" },
                  type: { type: "string", enum: ["api", "message"] },
                  message: {
                    type: "object",
                    properties: {
                      sender: { type: "string" },
                      chatId: { type: "string" },
                      body: { type: "string" }
                    }
                  },
                  cronExpression: { type: "string" },
                  company: { type: "string", enum: ["constroad", "altavia"] },
                  isActive: { type: "boolean" },
                  timeout: { type: "number" },
                  retryPolicy: {
                    type: "object",
                    properties: {
                      maxRetries: { type: "number" },
                      backoffMultiplier: { type: "number" }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "Job actualizado" }
        }
      },
      put: {
        tags: ["Jobs"],
        summary: "Actualizar cron job (PUT)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  url: { type: "string" },
                  type: { type: "string", enum: ["api", "message"] },
                  message: {
                    type: "object",
                    properties: {
                      sender: { type: "string" },
                      chatId: { type: "string" },
                      body: { type: "string" }
                    }
                  },
                  cronExpression: { type: "string" },
                  company: { type: "string", enum: ["constroad", "altavia"] },
                  isActive: { type: "boolean" },
                  timeout: { type: "number" },
                  retryPolicy: {
                    type: "object",
                    properties: {
                      maxRetries: { type: "number" },
                      backoffMultiplier: { type: "number" }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "Job actualizado" }
        }
      },
      delete: {
        tags: ["Jobs"],
        summary: "Eliminar cron job",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Job eliminado" }
        }
      }
    },
    "/api/jobs/{id}/run": {
      post: {
        tags: ["Jobs"],
        summary: "Ejecutar job inmediatamente",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Job ejecutado" },
          404: { description: "No encontrado" }
        }
      }
    },
    "/api/pdf/generate": {
      post: {
        tags: ["PDF"],
        summary: "Generar PDF desde template",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["templateId", "data"],
                properties: {
                  templateId: { type: "string" },
                  data: { type: "object" },
                  filename: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          201: { description: "PDF generado" }
        }
      }
    },
    "/api/pdf/templates": {
      post: {
        tags: ["PDF"],
        summary: "Crear template",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  htmlContent: { type: "string" }
                },
                required: ["id", "name", "htmlContent"]
              }
            }
          }
        },
        responses: {
          201: { description: "Template creado" }
        }
      },
      get: {
        tags: ["PDF"],
        summary: "Listar templates",
        responses: {
          200: { description: "Listado de templates" }
        }
      }
    },
    "/api/pdf/templates/{templateId}": {
      delete: {
        tags: ["PDF"],
        summary: "Eliminar template",
        parameters: [
          { name: "templateId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          200: { description: "Template eliminado" }
        }
      }
    },
    "/api/pdf/generate-vale": {
      post: {
        tags: ["PDF"],
        summary: "Generar vale desde template PDF",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fields"],
                properties: {
                  template: {
                    type: "string",
                    description: "Nombre del template PDF en templates/pdf",
                    example: "plantilla_dispatch_note.pdf"
                  },
                  fields: {
                    type: "object",
                    required: [
                      "senores",
                      "obra",
                      "tipoMaterial",
                      "nroM3",
                      "placa",
                      "chofer",
                      "hora",
                      "fecha"
                    ],
                    properties: {
                      nroVale: { type: "string" },
                      fecha: { type: "string" },
                      senores: { type: "string" },
                      obra: { type: "string" },
                      tipoMaterial: { type: "string" },
                      nroM3: { type: "string" },
                      placa: { type: "string" },
                      chofer: { type: "string" },
                      hora: { type: "string" },
                      nota: { type: "string" }
                    }
                  },
                  coords: {
                    type: "object",
                    description: "Coordenadas opcionales por campo"
                  },
                  notify: {
                    type: "object",
                    description: "Notificaciones opcionales",
                    properties: {
                      whatsapp: {
                        type: "object",
                        properties: {
                          from: {
                            type: "string",
                            description: "Session phone a usar para enviar"
                          },
                          to: {
                            type: "string",
                            description: "Numero o group id (ej. 51999999999 o 12345-67890)"
                          },
                          caption: { type: "string" }
                        }
                      },
                      telegram: {
                        type: "object",
                        properties: {
                          chatId: {
                            type: "string",
                            description: "Chat ID o username"
                          },
                          caption: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          201: { description: "PDF generado" }
        }
      }
    },
    "/api/pdf/templates/preview-grid": {
      get: {
        tags: ["PDF"],
        summary: "Preview de template PDF con grilla",
        parameters: [
          {
            name: "template",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Nombre del template PDF"
          },
          {
            name: "page",
            in: "query",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          {
            name: "scale",
            in: "query",
            required: false,
            schema: { type: "number", default: 1.5 }
          },
          {
            name: "grid",
            in: "query",
            required: false,
            schema: { type: "integer", default: 50 }
          }
        ],
        responses: {
          200: {
            description: "Imagen PNG con grilla",
            content: {
              "image/png": {
                schema: { type: "string", format: "binary" }
              }
            }
          }
        }
      }
    },
    "/api/drive/list": {
      get: {
        tags: ["Drive"],
        summary: "Listar archivos y carpetas (Multi-tenant)",
        description: "Lista el contenido de una carpeta dentro del espacio de almacenamiento de la empresa. Requiere JWT con companyId.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "path",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Ruta relativa dentro del espacio de la empresa (ej: orders/project-1)"
          }
        ],
        responses: {
          200: {
            description: "Listado de contenido",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        path: { type: "string" },
                        total: { type: "number" },
                        entries: {
                          type: "array",
                          items: { $ref: "#/components/schemas/DriveEntry" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          401: { description: "No autorizado - Token invalido o ausente" },
          403: { description: "Acceso denegado - Ruta fuera del espacio de la empresa" },
          404: { description: "Ruta no encontrada" }
        }
      }
    },
    "/api/drive/info": {
      get: {
        tags: ["Drive"],
        summary: "Obtener metadata de un archivo o carpeta (Multi-tenant)",
        description: "Obtiene informaci\xF3n detallada de un archivo o carpeta. Requiere JWT con companyId.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "path",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Ruta relativa del archivo o carpeta"
          }
        ],
        responses: {
          200: {
            description: "Metadata del archivo o carpeta",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/DriveEntry" }
                  }
                }
              }
            }
          },
          401: { description: "No autorizado" },
          403: { description: "Acceso denegado" },
          404: { description: "No encontrado" }
        }
      }
    },
    "/api/drive/folders": {
      post: {
        tags: ["Drive"],
        summary: "Crear carpeta (Multi-tenant)",
        description: "Crea una nueva carpeta en el espacio de la empresa. Requiere JWT con companyId.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  path: { type: "string", description: "Ruta padre (opcional, raiz si se omite)" },
                  name: { type: "string", description: "Nombre de la carpeta" }
                },
                example: {
                  path: "orders",
                  name: "project-1"
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Carpeta creada exitosamente",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        path: { type: "string" },
                        type: { type: "string", example: "folder" }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: "Nombre de carpeta invalido" },
          401: { description: "No autorizado" },
          403: { description: "Acceso denegado" },
          404: { description: "Ruta padre no encontrada" }
        }
      }
    },
    "/api/drive/files": {
      post: {
        tags: ["Drive"],
        summary: "Subir archivo (Multi-tenant)",
        description: "Sube un archivo al espacio de almacenamiento de la empresa. Requiere JWT con companyId. El archivo se almacenar\xE1 en /companies/{companyId}/{path}/",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  path: { type: "string", description: "Ruta destino relativa (ej: orders/project-1)" },
                  file: { type: "string", format: "binary", description: "Archivo a subir" }
                }
              }
            }
          }
        },
        responses: {
          201: {
            description: "Archivo subido exitosamente",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        path: { type: "string" },
                        type: { type: "string", example: "file" },
                        size: { type: "number" },
                        url: { type: "string", description: "URL publica del archivo" },
                        urlAbsolute: { type: "string", description: "URL absoluta" }
                      }
                    }
                  },
                  example: {
                    success: true,
                    data: {
                      name: "factura.pdf",
                      path: "orders/project-1/factura.pdf",
                      type: "file",
                      size: 102400,
                      url: "/files/companies/company-123/orders/project-1/factura.pdf"
                    }
                  }
                }
              }
            }
          },
          400: { description: "Archivo invalido o faltante" },
          401: { description: "No autorizado" },
          403: { description: "Acceso denegado" }
        }
      }
    },
    "/api/drive/entry": {
      delete: {
        tags: ["Drive"],
        summary: "Eliminar archivo o carpeta (Multi-tenant)",
        description: "Elimina un archivo o carpeta del espacio de la empresa. Requiere JWT con companyId.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "path",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Ruta del archivo o carpeta a eliminar"
          }
        ],
        responses: {
          200: {
            description: "Eliminado exitosamente",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    data: {
                      type: "object",
                      properties: {
                        path: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: "Ruta requerida" },
          401: { description: "No autorizado" },
          403: { description: "Acceso denegado" },
          404: { description: "No encontrado" }
        }
      }
    },
    "/api/drive/move": {
      patch: {
        tags: ["Drive"],
        summary: "Mover o renombrar archivo/carpeta (Multi-tenant)",
        description: "Mueve o renombra un archivo o carpeta dentro del espacio de la empresa. Requiere JWT con companyId.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["from", "to"],
                properties: {
                  from: { type: "string", description: "Ruta origen" },
                  to: { type: "string", description: "Ruta destino" }
                },
                example: {
                  from: "orders/old-name.pdf",
                  to: "orders/project-1/new-name.pdf"
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Movido exitosamente",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        from: { type: "string" },
                        to: { type: "string" },
                        url: { type: "string" },
                        urlAbsolute: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          },
          400: { description: "Rutas requeridas o invalidas" },
          401: { description: "No autorizado" },
          403: { description: "Acceso denegado" },
          404: { description: "Origen no encontrado" }
        }
      }
    },
    "/api/drive/pdf/info": {
      get: {
        tags: ["Drive"],
        summary: "Obtener metadata de un PDF (Multi-tenant)",
        description: "Obtiene informaci\xF3n de un PDF (n\xFAmero de p\xE1ginas, dimensiones, etc.). Requiere JWT con companyId.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "url",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "URL publica del PDF"
          },
          {
            name: "path",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Ruta relativa dentro del drive"
          }
        ],
        responses: {
          200: { description: "Metadata del PDF" },
          400: { description: "Parametro invalido" },
          401: { description: "No autorizado" },
          403: { description: "Acceso denegado" },
          404: { description: "No encontrado" }
        }
      }
    },
    "/api/drive/pdf/page": {
      get: {
        tags: ["Drive"],
        summary: "Renderizar pagina de PDF a imagen (Multi-tenant)",
        description: "Renderiza una p\xE1gina de un PDF a imagen PNG. Requiere JWT con companyId.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "url",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "URL publica del PDF"
          },
          {
            name: "path",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Ruta relativa dentro del drive"
          },
          {
            name: "page",
            in: "query",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          {
            name: "scale",
            in: "query",
            required: false,
            schema: { type: "number", default: 1.5 },
            description: "Escala de render (0.5 - 3)"
          }
        ],
        responses: {
          200: {
            description: "Imagen PNG de la pagina",
            content: {
              "image/png": {
                schema: { type: "string", format: "binary" }
              }
            }
          },
          400: { description: "Parametro invalido" },
          401: { description: "No autorizado" },
          403: { description: "Acceso denegado" },
          404: { description: "No encontrado" }
        }
      }
    },
    "/api/drive/pdf/preview-grid": {
      get: {
        tags: ["Drive"],
        summary: "Preview de PDF con grilla para coordenadas (Multi-tenant)",
        description: "Renderiza una p\xE1gina de PDF con grilla superpuesta para ayudar a encontrar coordenadas. Requiere JWT con companyId.",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "url",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "URL publica del PDF"
          },
          {
            name: "path",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Ruta relativa dentro del drive"
          },
          {
            name: "page",
            in: "query",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          {
            name: "scale",
            in: "query",
            required: false,
            schema: { type: "number", default: 1.5 }
          },
          {
            name: "grid",
            in: "query",
            required: false,
            schema: { type: "integer", default: 50 },
            description: "Tama\xF1o de grilla en puntos"
          }
        ],
        responses: {
          200: {
            description: "Imagen PNG con grilla",
            content: {
              "image/png": {
                schema: { type: "string", format: "binary" }
              }
            }
          },
          400: { description: "Parametro invalido" },
          401: { description: "No autorizado" },
          403: { description: "Acceso denegado" },
          404: { description: "No encontrado" }
        }
      }
    }
  }
};

// src/index.ts
import cron2 from "node-cron";
import fs11 from "fs-extra";
var app = express();
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "blob:"]
      }
    }
  })
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(requestLogger);
app.use(apiLimiter);
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    environment: config.nodeEnv
  });
});
app.use("/api/sessions", session_routes_default);
app.use("/api/session", session_routes_default);
app.use("/api/jobs", jobs_routes_default);
app.use("/api/message", message_routes_default);
app.use("/api/pdf", pdf_routes_default);
app.use("/api/drive", drive_routes_default);
app.use(
  "/files/companies",
  express.static(config.storage.root + "/companies", {
    fallthrough: false,
    index: false,
    dotfiles: "deny",
    maxAge: "1h",
    immutable: true
  })
);
app.use(
  config.pdf.tempPublicBaseUrl,
  express.static(config.pdf.tempDir, {
    fallthrough: false,
    index: false,
    dotfiles: "deny",
    maxAge: "1h"
  })
);
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: "WhatsApp API v2"
  })
);
app.get("/api/status", (req, res) => {
  const connections = connection_manager_default.getAllConnections();
  res.status(200).json({
    success: true,
    data: {
      activeSessions: connections.size,
      nodeEnv: config.nodeEnv,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
});
app.use(notFoundHandler);
app.use(errorHandler);
async function startServer() {
  try {
    logger_default.info("\u{1F680} Starting WhatsApp AI Agent Server...");
    logger_default.info("Initializing Quota Validator...");
    const { quotaValidatorService: quotaValidatorService2 } = await Promise.resolve().then(() => (init_quota_validator_service(), quota_validator_service_exports));
    try {
      await quotaValidatorService2.connect();
      logger_default.info("\u2705 Quota Validator connected (MongoDB-only)");
    } catch (error) {
      logger_default.warn("Quota Validator initialization failed, quota validation will be disabled:", error);
    }
    logger_default.info("Initializing PDF Generator...");
    await generator_service_default.initialize();
    await fs11.ensureDir(config.pdf.tempDir);
    logger_default.info("Initializing Job Scheduler...");
    await scheduler_service_default.initialize();
    logger_default.info("Reconnecting saved WhatsApp sessions...");
    await connection_manager_default.reconnectSavedSessions();
    logger_default.info("Starting session recovery watchdog...");
    connection_manager_default.startSessionRecoveryWatchdog();
    cron2.schedule("0 0 * * 0", async () => {
      try {
        await fs11.emptyDir(config.pdf.tempDir);
        logger_default.info("\u2705 Cleared PDF temp directory");
      } catch (error) {
        logger_default.error("Failed to clear PDF temp directory:", error);
      }
    });
    const server = app.listen(config.port, () => {
      logger_default.info(`\u2705 Server running on port ${config.port}`);
      logger_default.info(`\u{1F4CA} Environment: ${config.nodeEnv}`);
      logger_default.info(`\u{1F4C1} WhatsApp sessions dir: ${config.whatsapp.sessionDir}`);
    });
    const gracefulShutdown = async (signal) => {
      logger_default.info(`
\u{1F4F4} Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        logger_default.info("HTTP server closed");
        try {
          await connection_manager_default.disconnectAll();
          await scheduler_service_default.shutdown();
          await generator_service_default.shutdown();
          const { quotaValidatorService: quotaValidatorService3 } = await Promise.resolve().then(() => (init_quota_validator_service(), quota_validator_service_exports));
          await quotaValidatorService3.disconnect();
          logger_default.info("\u2705 All services shut down successfully");
          process.exit(0);
        } catch (error) {
          logger_default.error("Error during shutdown:", error);
          process.exit(1);
        }
      });
      setTimeout(() => {
        logger_default.error("Forced shutdown due to timeout");
        process.exit(1);
      }, 3e4);
    };
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("uncaughtException", (error) => {
      logger_default.error("Uncaught Exception:", error);
      process.exit(1);
    });
    process.on("unhandledRejection", (reason, promise) => {
      logger_default.error("Unhandled Rejection at:", promise, "reason:", reason);
    });
  } catch (error) {
    logger_default.error("Failed to start server:", error);
    process.exit(1);
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
var index_default = app;
export {
  index_default as default
};
/*! Bundled license information:

safe-buffer/index.js:
  (*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)
*/
//# sourceMappingURL=index.js.map
