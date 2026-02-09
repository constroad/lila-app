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
var moduleDir, envPath, devEnvPath, trustProxyEnv, resolvedTrustProxy, config;
var init_environment = __esm({
  "src/config/environment.ts"() {
    moduleDir = path.dirname(fileURLToPath(import.meta.url));
    envPath = path.join(moduleDir, "../../.env");
    devEnvPath = path.join(moduleDir, "../../.env.development");
    dotenv.config({ path: envPath });
    if (process.env.NODE_ENV === "development" || fs.existsSync(devEnvPath)) {
      dotenv.config({ path: devEnvPath, override: true });
    }
    trustProxyEnv = process.env.TRUST_PROXY;
    resolvedTrustProxy = trustProxyEnv === void 0 ? process.env.NODE_ENV === "production" ? 1 : false : trustProxyEnv === "true" ? true : trustProxyEnv === "false" ? false : Number.isNaN(Number(trustProxyEnv)) ? true : Number(trustProxyEnv);
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
        aiEnabled: process.env.WHATSAPP_AI_ENABLED === "true",
        aiTestNumber: process.env.WHATSAPP_AI_TEST_NUMBER || "51949376824",
        baileysLogLevel: process.env.WHATSAPP_BAILEYS_LOG_LEVEL || "fatal"
      },
      // Claude API
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY
      },
      telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || "",
        errorsChatId: process.env.TELEGRAM_ERRORS_CHAT_ID || ""
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
      // Portal integration (internal actions)
      portal: {
        baseUrl: process.env.PORTAL_BASE_URL || "http://localhost:3000"
      },
      // Security
      security: {
        apiSecretKey: process.env.API_SECRET_KEY || "dev-secret-key",
        jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret",
        rateLimitWindow: process.env.RATE_LIMIT_WINDOW || "5m",
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "200", 10),
        trustProxy: resolvedTrustProxy
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
var logDir, safeStringify, logger, logger_default;
var init_logger = __esm({
  "src/utils/logger.ts"() {
    init_environment();
    logDir = config.logging.dir;
    safeStringify = (value, spacing = 0) => {
      const seen = /* @__PURE__ */ new WeakSet();
      return JSON.stringify(
        value,
        (key, val) => {
          if (val instanceof Error) {
            return {
              message: val.message,
              stack: val.stack
            };
          }
          if (typeof val === "object" && val !== null) {
            if (seen.has(val)) {
              return "[Circular]";
            }
            seen.add(val);
          }
          return val;
        },
        spacing
      );
    };
    logger = winston.createLogger({
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaKeys = Object.keys(meta).filter((key) => meta[key] !== void 0);
          const cleanLevel = String(level).replace(/\u001b\[[0-9;]*m/g, "").toLowerCase();
          const hasOnlyService = metaKeys.length === 1 && metaKeys[0] === "service";
          const shouldPrettyPrint = cleanLevel === "warn" || cleanLevel === "error";
          const metaStr = metaKeys.length && !(cleanLevel === "info" && hasOnlyService) ? shouldPrettyPrint ? `
${safeStringify(meta, 2)}` : ` ${safeStringify(meta)}` : "";
          return `${timestamp} [${String(level).toUpperCase()}]: ${message}${metaStr}`;
        })
      ),
      defaultMeta: { service: "lila-app" },
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
              const metaKeys = Object.keys(meta).filter((key) => meta[key] !== void 0);
              const cleanLevel = String(level).replace(/\u001b\[[0-9;]*m/g, "").toLowerCase();
              const hasOnlyService = metaKeys.length === 1 && metaKeys[0] === "service";
              const shouldPrettyPrint = cleanLevel === "warn" || cleanLevel === "error";
              const metaStr = metaKeys.length && !(cleanLevel === "info" && hasOnlyService) ? shouldPrettyPrint ? `
${safeStringify(meta, 2)}` : ` ${safeStringify(meta)}` : "";
              return `${timestamp} [${level}]: ${message}${metaStr}`;
            })
          )
        })
      );
    }
    logger_default = logger;
  }
});

// src/whatsapp/baileys/store.manager.ts
import fs2 from "fs-extra";
import path3 from "path";
function makeInMemoryStore(filePath) {
  const chats = /* @__PURE__ */ new Map();
  const contacts = /* @__PURE__ */ new Map();
  const messages = /* @__PURE__ */ new Map();
  const readFromFile = () => {
    if (!fs2.existsSync(filePath)) {
      logger_default.debug(`\u26A0\uFE0F Store file not found: ${filePath}, will create on first write`);
      return;
    }
    try {
      const json = fs2.readFileSync(filePath, "utf-8");
      const data = JSON.parse(json);
      if (data.chats) {
        data.chats.forEach((c) => chats.set(c.id, c));
        logger_default.info(`\u2705 Loaded ${data.chats.length} chats from store: ${filePath}`);
      }
      if (data.contacts) {
        data.contacts.forEach((c) => contacts.set(c.id, c));
        logger_default.info(`\u2705 Loaded ${data.contacts.length} contacts from store: ${filePath}`);
      }
      if (data.messages) {
        Object.entries(data.messages).forEach(([jid, msgs]) => {
          messages.set(jid, msgs);
        });
        logger_default.info(`\u2705 Loaded messages for ${Object.keys(data.messages).length} chats`);
      }
    } catch (error) {
      logger_default.error(`\u274C Error reading store file ${filePath}: ${error}`);
    }
  };
  const writeToFile = () => {
    try {
      const dir = path3.dirname(filePath);
      fs2.ensureDirSync(dir);
      const data = {
        chats: Array.from(chats.values()),
        contacts: Array.from(contacts.values()),
        messages: Object.fromEntries(messages)
      };
      fs2.writeFileSync(filePath, JSON.stringify(data, null, 2));
      logger_default.debug(`\u{1F4BE} Store persisted: ${chats.size} chats, ${contacts.size} contacts \u2192 ${filePath}`);
    } catch (error) {
      logger_default.error(`\u274C Error writing store file ${filePath}: ${error}`);
    }
  };
  const bind = (ev) => {
    ev.on("chats.upsert", (newChats) => {
      newChats.forEach((chat) => {
        chats.set(chat.id, chat);
      });
      logger_default.debug(`\u{1F4E5} Upserted ${newChats.length} chats to store`);
    });
    ev.on("chats.update", (updates) => {
      updates.forEach((update) => {
        if (update.id) {
          const existing = chats.get(update.id);
          if (existing) {
            chats.set(update.id, { ...existing, ...update });
          }
        }
      });
      logger_default.debug(`\u{1F504} Updated ${updates.length} chats in store`);
    });
    ev.on("contacts.upsert", (newContacts) => {
      newContacts.forEach((contact) => {
        contacts.set(contact.id, contact);
      });
      logger_default.debug(`\u{1F4E5} Upserted ${newContacts.length} contacts to store`);
    });
    ev.on("contacts.update", (updates) => {
      updates.forEach((update) => {
        if (update.id) {
          const existing = contacts.get(update.id);
          if (existing) {
            contacts.set(update.id, { ...existing, ...update });
          }
        }
      });
      logger_default.debug(`\u{1F504} Updated ${updates.length} contacts in store`);
    });
    ev.on("messages.upsert", ({ messages: msgs }) => {
      msgs.forEach((msg) => {
        const jid = msg.key.remoteJid;
        if (!messages.has(jid)) {
          messages.set(jid, []);
        }
        const list = messages.get(jid);
        list.push(msg);
        messages.set(jid, list);
      });
      logger_default.debug(`\u{1F4E8} Received ${msgs.length} messages`);
    });
  };
  return {
    chats,
    contacts,
    messages,
    readFromFile,
    writeToFile,
    bind
  };
}
var init_store_manager = __esm({
  "src/whatsapp/baileys/store.manager.ts"() {
    init_logger();
  }
});

// src/whatsapp/baileys/populate-store-simple.ts
var populateStoreIfEmpty;
var init_populate_store_simple = __esm({
  "src/whatsapp/baileys/populate-store-simple.ts"() {
    init_sessions_simple();
    init_logger();
    populateStoreIfEmpty = async (id, sock) => {
      const store = getStore(id);
      try {
        const groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        for (const group of Object.values(groups)) {
          const existing = store.chats.get(group.id);
          if (!existing) {
            logger_default.info(`\u2795 Adding new group to store: ${group.subject} (${group.id})`);
            store.chats.set(group.id, {
              id: group.id,
              name: group.subject,
              participants: group.participants ?? []
            });
          } else {
            if (existing.name !== group.subject) {
              logger_default.info(`\u{1F504} Updating group name in store: ${existing.name} \u2192 ${group.subject}`);
              store.chats.set(group.id, {
                ...existing,
                name: group.subject,
                participants: group.participants ?? []
              });
            }
          }
        }
        if (sock.user && !store.contacts.has(sock.user.id)) {
          store.contacts.set(sock.user.id, sock.user);
        }
        logger_default.info(`\u2705 Synced ${Object.keys(groups).length} groups to store`);
        return {
          success: true,
          groupCount: Object.keys(groups).length
        };
      } catch (err) {
        logger_default.error("\u274C Error populating store from groupFetchAllParticipating:", err);
        return {
          success: false,
          groupCount: 0,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    };
  }
});

// src/storage/json.store.ts
import fs3 from "fs-extra";
import path4 from "path";
var JsonStore, json_store_default;
var init_json_store = __esm({
  "src/storage/json.store.ts"() {
    init_logger();
    JsonStore = class {
      constructor(options) {
        this.baseDir = options.baseDir;
        this.autoBackup = options.autoBackup ?? true;
      }
      async get(key) {
        try {
          const filePath = path4.join(this.baseDir, `${key}.json`);
          const exists = await fs3.pathExists(filePath);
          if (!exists) {
            return null;
          }
          const data = await fs3.readJSON(filePath);
          return data;
        } catch (error) {
          logger_default.error(`Error reading ${key} from store:`, error);
          return null;
        }
      }
      async set(key, value) {
        try {
          const filePath = path4.join(this.baseDir, `${key}.json`);
          await fs3.ensureDir(path4.dirname(filePath));
          if (this.autoBackup && await fs3.pathExists(filePath)) {
            const backupPath = `${filePath}.backup`;
            await fs3.copy(filePath, backupPath);
          }
          const tempPath = `${filePath}.tmp`;
          await fs3.writeJSON(tempPath, value, { spaces: 2 });
          await fs3.move(tempPath, filePath, { overwrite: true });
          logger_default.debug(`Successfully wrote ${key} to store`);
        } catch (error) {
          logger_default.error(`Error writing ${key} to store:`, error);
          throw error;
        }
      }
      async delete(key) {
        try {
          const filePath = path4.join(this.baseDir, `${key}.json`);
          if (await fs3.pathExists(filePath)) {
            await fs3.remove(filePath);
            logger_default.debug(`Successfully deleted ${key} from store`);
          }
        } catch (error) {
          logger_default.error(`Error deleting ${key} from store:`, error);
          throw error;
        }
      }
      async getAllKeys() {
        try {
          const files = await fs3.readdir(this.baseDir);
          return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
        } catch (error) {
          logger_default.error("Error reading keys from store:", error);
          return [];
        }
      }
      async clear() {
        try {
          await fs3.emptyDir(this.baseDir);
          logger_default.debug("Store cleared");
        } catch (error) {
          logger_default.error("Error clearing store:", error);
          throw error;
        }
      }
      async exists(key) {
        const filePath = path4.join(this.baseDir, `${key}.json`);
        return await fs3.pathExists(filePath);
      }
    };
    json_store_default = JsonStore;
  }
});

// node_modules/uuid/dist/esm-node/rng.js
import crypto from "crypto";
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    crypto.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}
var rnds8Pool, poolPtr;
var init_rng = __esm({
  "node_modules/uuid/dist/esm-node/rng.js"() {
    rnds8Pool = new Uint8Array(256);
    poolPtr = rnds8Pool.length;
  }
});

// node_modules/uuid/dist/esm-node/regex.js
var regex_default;
var init_regex = __esm({
  "node_modules/uuid/dist/esm-node/regex.js"() {
    regex_default = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
  }
});

// node_modules/uuid/dist/esm-node/validate.js
function validate(uuid) {
  return typeof uuid === "string" && regex_default.test(uuid);
}
var validate_default;
var init_validate = __esm({
  "node_modules/uuid/dist/esm-node/validate.js"() {
    init_regex();
    validate_default = validate;
  }
});

// node_modules/uuid/dist/esm-node/stringify.js
function stringify(arr, offset = 0) {
  const uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
  if (!validate_default(uuid)) {
    throw TypeError("Stringified UUID is invalid");
  }
  return uuid;
}
var byteToHex, stringify_default;
var init_stringify = __esm({
  "node_modules/uuid/dist/esm-node/stringify.js"() {
    init_validate();
    byteToHex = [];
    for (let i = 0; i < 256; ++i) {
      byteToHex.push((i + 256).toString(16).substr(1));
    }
    stringify_default = stringify;
  }
});

// node_modules/uuid/dist/esm-node/v4.js
function v4(options, buf, offset) {
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return stringify_default(rnds);
}
var v4_default;
var init_v4 = __esm({
  "node_modules/uuid/dist/esm-node/v4.js"() {
    init_rng();
    init_stringify();
    v4_default = v4;
  }
});

// node_modules/uuid/dist/esm-node/index.js
var init_esm_node = __esm({
  "node_modules/uuid/dist/esm-node/index.js"() {
    init_v4();
  }
});

// src/services/storage-path.service.ts
import path5 from "path";
import fs4 from "fs-extra";
var StoragePathService, storagePathService;
var init_storage_path_service = __esm({
  "src/services/storage-path.service.ts"() {
    init_environment();
    init_logger();
    StoragePathService = class {
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
          { name: "projects", description: "Documentos de proyectos", autoCreate: true },
          { name: "expenses", description: "Comprobantes de gastos", autoCreate: true },
          { name: "services", description: "Servicios y reportes", autoCreate: true },
          { name: "temp", description: "Archivos temporales", autoCreate: true }
        ];
        this.root = config.storage.root;
        this.root = this.resolveWritableRoot(this.root);
        logger_default.info(`StoragePathService initialized with root: ${this.root}`);
      }
      resolveWritableRoot(candidate) {
        try {
          fs4.ensureDirSync(candidate);
          return candidate;
        } catch (error) {
          if (config.nodeEnv !== "production") {
            const fallback = path5.resolve(process.cwd(), "data", "storage");
            try {
              fs4.ensureDirSync(fallback);
              logger_default.warn("Storage root not accessible. Falling back to local storage.", {
                requested: candidate,
                fallback,
                error: String(error)
              });
              return fallback;
            } catch (fallbackError) {
              logger_default.error("Failed to initialize fallback storage root.", {
                requested: candidate,
                fallback,
                error: String(fallbackError)
              });
            }
          } else {
            logger_default.error("Storage root not accessible. Check FILE_STORAGE_ROOT permissions.", {
              requested: candidate,
              error: String(error)
            });
          }
          throw error;
        }
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
        return path5.join(this.root, "companies", companyId);
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
        const modulePath = path5.join(root, module);
        if (subpath) {
          return path5.join(modulePath, subpath);
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
            orders: path5.join(root, "orders"),
            dispatches: path5.join(root, "dispatches"),
            clients: path5.join(root, "clients"),
            certificates: path5.join(root, "certificates"),
            reports: path5.join(root, "reports"),
            media: path5.join(root, "media"),
            projects: path5.join(root, "projects"),
            expenses: path5.join(root, "expenses"),
            services: path5.join(root, "services"),
            temp: path5.join(root, "temp")
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
        const normalized = path5.normalize(relativePath);
        const resolved = path5.join(companyRoot, normalized);
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
          const normalizedRequested = path5.normalize(requestedPath);
          const normalizedRoot = path5.normalize(companyRoot);
          const isWithinCompanyRoot = normalizedRequested.startsWith(normalizedRoot);
          if (!isWithinCompanyRoot) {
            logger_default.warn("Path validation failed: outside company root", {
              companyId,
              requestedPath: normalizedRequested,
              companyRoot: normalizedRoot
            });
            return false;
          }
          const relative = path5.relative(normalizedRoot, normalizedRequested);
          const hasTraversal = relative.startsWith("..") || path5.isAbsolute(relative);
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
          await fs4.ensureDir(structure.root);
          const moduleCreations = this.standardModules.filter((m) => m.autoCreate).map(async (module) => {
            const modulePath = path5.join(structure.root, module.name);
            await fs4.ensureDir(modulePath);
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
        return fs4.pathExists(root);
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
        await fs4.ensureDir(dirPath);
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
        if (!await fs4.pathExists(root)) {
          return 0;
        }
        try {
          const calculateSize = async (dir) => {
            const entries = await fs4.readdir(dir, { withFileTypes: true });
            let totalSize = 0;
            for (const entry of entries) {
              const fullPath = path5.join(dir, entry.name);
              if (entry.isDirectory()) {
                totalSize += await calculateSize(fullPath);
              } else {
                const stats = await fs4.stat(fullPath);
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
        if (await fs4.pathExists(tempPath)) {
          await fs4.emptyDir(tempPath);
          logger_default.info(`Cleaned temp files for company: ${companyId}`);
        }
      }
    };
    storagePathService = new StoragePathService();
  }
});

// src/services/whatsapp-media.utils.ts
import fs5 from "fs-extra";
import path6 from "path";
import axios from "axios";
function detectMimeType(filename, fallback) {
  if (fallback) return fallback;
  if (!filename) return "application/octet-stream";
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "avi") return "video/x-msvideo";
  if (ext === "mkv") return "video/x-matroska";
  if (ext === "pdf") return "application/pdf";
  if (ext === "doc") return "application/msword";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "xls") return "application/vnd.ms-excel";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "ppt") return "application/vnd.ms-powerpoint";
  if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === "txt") return "text/plain";
  if (ext === "csv") return "text/csv";
  if (ext === "zip") return "application/zip";
  if (ext === "rar") return "application/vnd.rar";
  if (ext === "7z") return "application/x-7z-compressed";
  return "application/octet-stream";
}
function getSendOptions(recipient) {
  if (recipient.endsWith("@g.us")) {
    return {
      useCachedGroupMetadata: false,
      useUserDevicesCache: false
    };
  }
  return void 0;
}
function extractRelativePathFromUrl(fileUrl, companyId) {
  try {
    const url = new URL(fileUrl, "http://localhost");
    const pathname = url.pathname;
    const marker = `/files/companies/${companyId}/`;
    if (!pathname.startsWith(marker)) return null;
    const raw = pathname.slice(marker.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}
function normalizeRelativePath(input, companyId) {
  let raw = input.trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const url = new URL(raw);
      raw = url.pathname;
    }
  } catch {
  }
  raw = raw.replace(/\\/g, "/");
  const isUrlPath = raw.startsWith("/files/companies/") || raw.startsWith("/companies/");
  if (path6.isAbsolute(raw) && !isUrlPath) {
    const companyRoot = storagePathService.getCompanyRoot(companyId);
    const normalizedRoot = path6.normalize(companyRoot);
    const normalizedRaw = path6.normalize(raw);
    if (normalizedRaw.startsWith(normalizedRoot)) {
      raw = path6.relative(normalizedRoot, normalizedRaw);
    } else {
      return null;
    }
  }
  raw = raw.replace(/^\/+/, "");
  const marker = `files/companies/${companyId}/`;
  const altMarker = `companies/${companyId}/`;
  if (raw.startsWith(marker)) {
    raw = raw.slice(marker.length);
  } else if (raw.startsWith(altMarker)) {
    raw = raw.slice(altMarker.length);
  } else {
    const segment = `/companies/${companyId}/`;
    const idx = raw.indexOf(segment);
    if (idx >= 0) {
      raw = raw.slice(idx + segment.length);
    }
  }
  try {
    raw = decodeURIComponent(raw);
  } catch {
  }
  return raw || null;
}
async function resolveFileBuffer(params) {
  const { companyId, filePath, fileUrl, mimeType, fileName } = params;
  let relativePath = filePath ? normalizeRelativePath(filePath, companyId) : null;
  if (!relativePath && fileUrl) {
    relativePath = normalizeRelativePath(fileUrl, companyId) || extractRelativePathFromUrl(fileUrl, companyId);
  }
  if (!relativePath) return null;
  if (path6.isAbsolute(relativePath)) {
    throw new Error("filePath must be relative");
  }
  const resolved = storagePathService.resolvePath(companyId, relativePath);
  if (!storagePathService.validateAccess(resolved, companyId)) {
    throw new Error("Invalid filePath");
  }
  const exists = await fs5.pathExists(resolved);
  if (!exists) {
    throw new Error("File not found");
  }
  const stat = await fs5.stat(resolved);
  const MAX_WTSP_BYTES = 100 * 1024 * 1024;
  if (stat.size > MAX_WTSP_BYTES) {
    throw new Error("File too large for WhatsApp (max 100MB)");
  }
  const buffer = await fs5.readFile(resolved);
  const resolvedFileName = fileName || path6.basename(resolved);
  const resolvedMimeType = detectMimeType(resolvedFileName, mimeType);
  return {
    buffer,
    mimeType: resolvedMimeType,
    fileName: resolvedFileName
  };
}
async function downloadFileFromUrl(fileUrl, mimeType) {
  const response = await axios.get(fileUrl, { responseType: "stream" });
  const contentType = response.headers["content-type"];
  const detectedMimeType = mimeType || contentType || "application/octet-stream";
  let extension = "bin";
  try {
    const urlPath = new URL(fileUrl).pathname;
    const urlExt = path6.extname(urlPath).slice(1);
    if (urlExt) extension = urlExt;
  } catch {
    if (detectedMimeType.startsWith("image/")) extension = detectedMimeType.split("/")[1];
    else if (detectedMimeType.startsWith("video/")) extension = detectedMimeType.split("/")[1];
  }
  const tempFileName = `${v4_default()}.${extension}`;
  const tempFilePath = path6.join(config.uploads.directory, tempFileName);
  const writer = fs5.createWriteStream(tempFilePath);
  response.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
  return {
    filePath: tempFilePath,
    mimeType: detectedMimeType,
    fileName: tempFileName
  };
}
var init_whatsapp_media_utils = __esm({
  "src/services/whatsapp-media.utils.ts"() {
    init_esm_node();
    init_storage_path_service();
    init_environment();
  }
});

// src/services/whatsapp-direct.service.ts
var whatsapp_direct_service_exports = {};
__export(whatsapp_direct_service_exports, {
  WhatsAppDirectService: () => WhatsAppDirectService
});
import path7 from "path";
import fs6 from "fs/promises";
function getValidPhoneNumber(to) {
  let cleanedTo = to.replace(/\s/g, "").replace(/\+/g, "");
  let jid;
  if (cleanedTo.endsWith("@g.us")) {
    jid = cleanedTo;
  } else if (!cleanedTo.endsWith("@s.whatsapp.net")) {
    jid = `${cleanedTo}@s.whatsapp.net`;
  } else {
    jid = cleanedTo;
  }
  if (cleanedTo === "" || jid === void 0) {
    throw new Error("Invalid phone number");
  }
  return jid;
}
var WhatsAppDirectService;
var init_whatsapp_direct_service = __esm({
  "src/services/whatsapp-direct.service.ts"() {
    init_sessions_simple();
    init_populate_store_simple();
    init_whatsapp_media_utils();
    init_outbox_queue();
    init_logger();
    init_environment();
    WhatsAppDirectService = {
      /**
       * Create session with QR code
       */
      async createSession(id, qrCb) {
        return await startSession(id, qrCb);
      },
      /**
       * Create session with pairing code
       */
      createPairingSession: (phone, cb) => {
        return createPairingSession(phone, cb);
      },
      /**
       * Send text message (DIRECT - no assertSessions)
       * @param queueOnFail - If true, queue message when send fails (default: true)
       */
      async sendMessage(id, to, message, options = {}) {
        const queueOnFail = options.queueOnFail !== false;
        const sock = getSession(id);
        if (!sock) {
          if (queueOnFail) {
            await outbox_queue_default.enqueue(id, to, message, options.mentions);
            logger_default.info(`\u{1F4E5} Queued text message for ${id} (session not found)`);
            return { queued: true };
          }
          throw new Error("Session not found");
        }
        if (!isSessionReady(id)) {
          if (queueOnFail) {
            await outbox_queue_default.enqueue(id, to, message, options.mentions);
            logger_default.info(`\u{1F4E5} Queued text message for ${id} (session not ready)`);
            return { queued: true };
          }
          throw new Error("Session not ready");
        }
        try {
          const validTo = getValidPhoneNumber(to);
          const sendOptions = getSendOptions(validTo);
          return await sock.sendMessage(validTo, { text: message }, sendOptions);
        } catch (error) {
          logger_default.warn(`Failed to send message via ${id}: ${String(error)}`);
          if (queueOnFail) {
            await outbox_queue_default.enqueue(id, to, message, options.mentions);
            logger_default.info(`\u{1F4E5} Queued text message for ${id} (send failed)`);
            return { queued: true };
          }
          throw error;
        }
      },
      /**
       * Send video file (enhanced with legacy features)
       *
       * FIXES:
       * - MP4 detection: Forces 'video/mp4' instead of 'application/mp4'
       * - Proper mimetype detection by extension (not browser detection)
       *
       * @param id - Session ID
       * @param to - Recipient (phone or group JID)
       * @param options - Send options (same as sendImageFile)
       */
      async sendVideoFile(id, to, options) {
        const queueOnFail = options.queueOnFail !== false;
        const sock = getSession(id);
        if (!sock) {
          if (queueOnFail) {
            await outbox_queue_default.enqueueMedia(id, to, "video", options);
            logger_default.info(`\u{1F4E5} Queued video message for ${id} (session not found)`);
            return { queued: true };
          }
          throw new Error("Session not found");
        }
        if (!isSessionReady(id)) {
          if (queueOnFail) {
            await outbox_queue_default.enqueueMedia(id, to, "video", options);
            logger_default.info(`\u{1F4E5} Queued video message for ${id} (session not ready)`);
            return { queued: true };
          }
          throw new Error("Session not ready");
        }
        const validTo = getValidPhoneNumber(to);
        const sendOptions = getSendOptions(validTo);
        let videoBuffer;
        let resolvedMimeType;
        let shouldCleanup = false;
        let cleanupPath;
        if (options.buffer) {
          videoBuffer = options.buffer;
          resolvedMimeType = detectMimeType(options.fileName, options.mimeType || "video/mp4");
        } else if (options.fileName) {
          const tempPath = path7.join(config.uploads.directory, options.fileName);
          videoBuffer = await fs6.readFile(tempPath);
          resolvedMimeType = detectMimeType(options.fileName, options.mimeType);
          shouldCleanup = true;
          cleanupPath = tempPath;
        } else if (options.filePath || options.fileUrl) {
          if (!options.companyId) {
            throw new Error("companyId is required when using filePath or fileUrl");
          }
          const resolved = await resolveFileBuffer({
            companyId: options.companyId,
            filePath: options.filePath,
            fileUrl: options.fileUrl,
            mimeType: options.mimeType,
            fileName: options.fileName
          });
          if (!resolved) {
            throw new Error("Could not resolve file from filePath or fileUrl");
          }
          videoBuffer = resolved.buffer;
          resolvedMimeType = resolved.mimeType;
        } else if (options.fileUrl && !options.companyId) {
          const downloaded = await downloadFileFromUrl(options.fileUrl, options.mimeType);
          videoBuffer = await fs6.readFile(downloaded.filePath);
          resolvedMimeType = downloaded.mimeType;
          shouldCleanup = true;
          cleanupPath = downloaded.filePath;
        } else {
          throw new Error("One of buffer, fileName, filePath, or fileUrl is required");
        }
        try {
          await sock.sendMessage(
            validTo,
            {
              video: videoBuffer,
              caption: options.caption,
              mimetype: resolvedMimeType,
              ptv: false
              // Not a video note
            },
            sendOptions
          );
          if (shouldCleanup && cleanupPath) {
            await fs6.unlink(cleanupPath).catch(
              (err) => console.error(`\u26A0\uFE0F Could not delete temp file ${cleanupPath}:`, err)
            );
          }
        } catch (error) {
          logger_default.warn(`Failed to send video via ${id}: ${String(error)}`);
          if (queueOnFail) {
            await outbox_queue_default.enqueueMedia(id, to, "video", options);
            logger_default.info(`\u{1F4E5} Queued video message for ${id} (send failed)`);
            return { queued: true };
          }
          throw error;
        }
      },
      /**
       * Send image file (enhanced with legacy features)
       *
       * @param id - Session ID
       * @param to - Recipient (phone or group JID)
       * @param options - Send options
       *   - buffer: Direct buffer (from file upload)
       *   - fileName: Temp file name in uploads dir (will be deleted after send)
       *   - filePath: Relative path in company storage (persistent, won't be deleted)
       *   - fileUrl: External URL or company storage URL
       *   - caption: Image caption
       *   - mimeType: Override MIME type
       *   - companyId: Required for filePath/fileUrl resolution
       */
      async sendImageFile(id, to, options) {
        const queueOnFail = options.queueOnFail !== false;
        const sock = getSession(id);
        if (!sock) {
          if (queueOnFail) {
            await outbox_queue_default.enqueueMedia(id, to, "image", options);
            logger_default.info(`\u{1F4E5} Queued image message for ${id} (session not found)`);
            return { queued: true };
          }
          throw new Error("Session not found");
        }
        if (!isSessionReady(id)) {
          if (queueOnFail) {
            await outbox_queue_default.enqueueMedia(id, to, "image", options);
            logger_default.info(`\u{1F4E5} Queued image message for ${id} (session not ready)`);
            return { queued: true };
          }
          throw new Error("Session not ready");
        }
        const validTo = getValidPhoneNumber(to);
        const sendOptions = getSendOptions(validTo);
        let imageBuffer;
        let resolvedMimeType;
        let shouldCleanup = false;
        let cleanupPath;
        if (options.buffer) {
          imageBuffer = options.buffer;
          resolvedMimeType = detectMimeType(options.fileName, options.mimeType || "image/jpeg");
        } else if (options.fileName) {
          const tempPath = path7.join(config.uploads.directory, options.fileName);
          imageBuffer = await fs6.readFile(tempPath);
          resolvedMimeType = detectMimeType(options.fileName, options.mimeType);
          shouldCleanup = true;
          cleanupPath = tempPath;
        } else if (options.filePath || options.fileUrl) {
          if (!options.companyId) {
            throw new Error("companyId is required when using filePath or fileUrl");
          }
          const resolved = await resolveFileBuffer({
            companyId: options.companyId,
            filePath: options.filePath,
            fileUrl: options.fileUrl,
            mimeType: options.mimeType,
            fileName: options.fileName
          });
          if (!resolved) {
            throw new Error("Could not resolve file from filePath or fileUrl");
          }
          imageBuffer = resolved.buffer;
          resolvedMimeType = resolved.mimeType;
        } else if (options.fileUrl && !options.companyId) {
          const downloaded = await downloadFileFromUrl(options.fileUrl, options.mimeType);
          imageBuffer = await fs6.readFile(downloaded.filePath);
          resolvedMimeType = downloaded.mimeType;
          shouldCleanup = true;
          cleanupPath = downloaded.filePath;
        } else {
          throw new Error("One of buffer, fileName, filePath, or fileUrl is required");
        }
        try {
          await sock.sendMessage(
            validTo,
            {
              image: imageBuffer,
              caption: options.caption,
              mimetype: resolvedMimeType
            },
            sendOptions
          );
          if (shouldCleanup && cleanupPath) {
            await fs6.unlink(cleanupPath).catch(
              (err) => console.error(`\u26A0\uFE0F Could not delete temp file ${cleanupPath}:`, err)
            );
          }
        } catch (error) {
          logger_default.warn(`Failed to send image via ${id}: ${String(error)}`);
          if (queueOnFail) {
            await outbox_queue_default.enqueueMedia(id, to, "image", options);
            logger_default.info(`\u{1F4E5} Queued image message for ${id} (send failed)`);
            return { queued: true };
          }
          throw error;
        }
      },
      /**
       * Send document/file (enhanced with legacy features)
       *
       * FIXES:
       * - PDF detection: Forces 'application/pdf' instead of 'application/octet-stream'
       * - Proper mimetype for Office docs (DOCX, XLSX, PPTX)
       * - fileName is REQUIRED for WhatsApp document display
       *
       * @param id - Session ID
       * @param to - Recipient (phone or group JID)
       * @param options - Send options (same as sendImageFile)
       */
      async sendDocument(id, to, options) {
        const queueOnFail = options.queueOnFail !== false;
        const sock = getSession(id);
        if (!sock) {
          if (queueOnFail) {
            await outbox_queue_default.enqueueMedia(id, to, "document", options);
            logger_default.info(`\u{1F4E5} Queued document message for ${id} (session not found)`);
            return { queued: true };
          }
          throw new Error("Session not found");
        }
        if (!isSessionReady(id)) {
          if (queueOnFail) {
            await outbox_queue_default.enqueueMedia(id, to, "document", options);
            logger_default.info(`\u{1F4E5} Queued document message for ${id} (session not ready)`);
            return { queued: true };
          }
          throw new Error("Session not ready");
        }
        const validTo = getValidPhoneNumber(to);
        const sendOptions = getSendOptions(validTo);
        let documentBuffer;
        let resolvedMimeType;
        let resolvedFileName;
        let shouldCleanup = false;
        let cleanupPath;
        if (options.buffer) {
          documentBuffer = options.buffer;
          resolvedMimeType = detectMimeType(options.fileName, options.mimeType || "application/octet-stream");
          resolvedFileName = options.fileName || "document";
        } else if (options.fileName) {
          const tempPath = path7.join(config.uploads.directory, options.fileName);
          documentBuffer = await fs6.readFile(tempPath);
          resolvedMimeType = detectMimeType(options.fileName, options.mimeType);
          resolvedFileName = options.fileName;
          shouldCleanup = true;
          cleanupPath = tempPath;
        } else if (options.filePath || options.fileUrl) {
          if (!options.companyId) {
            throw new Error("companyId is required when using filePath or fileUrl");
          }
          const resolved = await resolveFileBuffer({
            companyId: options.companyId,
            filePath: options.filePath,
            fileUrl: options.fileUrl,
            mimeType: options.mimeType,
            fileName: options.fileName
          });
          if (!resolved) {
            throw new Error("Could not resolve file from filePath or fileUrl");
          }
          documentBuffer = resolved.buffer;
          resolvedMimeType = resolved.mimeType;
          resolvedFileName = resolved.fileName;
        } else if (options.fileUrl && !options.companyId) {
          const downloaded = await downloadFileFromUrl(options.fileUrl, options.mimeType);
          documentBuffer = await fs6.readFile(downloaded.filePath);
          resolvedMimeType = downloaded.mimeType;
          resolvedFileName = downloaded.fileName;
          shouldCleanup = true;
          cleanupPath = downloaded.filePath;
        } else {
          throw new Error("One of buffer, fileName, filePath, or fileUrl is required");
        }
        try {
          await sock.sendMessage(
            validTo,
            {
              document: documentBuffer,
              fileName: resolvedFileName,
              // REQUIRED for WhatsApp
              mimetype: resolvedMimeType,
              caption: options.caption
            },
            sendOptions
          );
          if (shouldCleanup && cleanupPath) {
            await fs6.unlink(cleanupPath).catch(
              (err) => console.error(`\u26A0\uFE0F Could not delete temp file ${cleanupPath}:`, err)
            );
          }
        } catch (error) {
          logger_default.warn(`Failed to send document via ${id}: ${String(error)}`);
          if (queueOnFail) {
            await outbox_queue_default.enqueueMedia(id, to, "document", options);
            logger_default.info(`\u{1F4E5} Queued document message for ${id} (send failed)`);
            return { queued: true };
          }
          throw error;
        }
      },
      /**
       * List all chats
       */
      listChats: (id) => {
        const store = getStore(id);
        return Array.from(store.chats.values());
      },
      /**
       * List all contacts
       */
      listContacts: (id) => {
        const store = getStore(id);
        return Array.from(store.contacts.values());
      },
      /**
       * List groups only
       */
      listGroups: (id) => {
        const store = getStore(id);
        return Array.from(store.chats.values()).filter((chat) => chat.id.endsWith("@g.us")).map((group) => ({
          id: group.id,
          name: group.name,
          participants: group.participant?.map((p) => p) || []
        }));
      },
      /**
       * Refresh groups from WhatsApp
       */
      refreshGroups: async (id) => {
        const sock = getSession(id);
        if (!sock) throw new Error("Session not found");
        const result = await populateStoreIfEmpty(id, sock);
        return result;
      },
      /**
       * Get all active sessions
       */
      getSessions: () => {
        return listSessions();
      },
      /**
       * Check if session is active
       */
      isSessionActive: (id) => {
        return isWhatsAppSessionActive(id);
      },
      /**
       * Check if session is ready
       */
      isSessionReady: (id) => {
        return isSessionReady(id);
      },
      /**
       * Get QR code for session
       */
      getQRCode: (id) => {
        return getQRCode(id);
      },
      /**
       * Disconnect session
       */
      disconnectSession: async (id) => {
        return await disconnectSession(id);
      },
      /**
       * Get session socket (for advanced use)
       */
      getSession: (id) => {
        return getSession(id);
      },
      /**
       * Flush outbox queue (send pending messages after reconnection)
       * This is called automatically when a session reconnects
       */
      async flushOutbox(id) {
        const sock = getSession(id);
        if (!sock || !isSessionReady(id)) {
          logger_default.warn(`Cannot flush outbox for ${id}: session not ready`);
          return;
        }
        const queue = await outbox_queue_default.list(id);
        if (queue.length === 0) {
          return;
        }
        logger_default.info(`\u{1F4E4} Flushing ${queue.length} queued messages for ${id}`);
        for (const item of queue) {
          try {
            if (item.messageType === "text") {
              await sock.sendMessage(item.recipient, { text: item.text });
              await outbox_queue_default.remove(id, item.id);
              logger_default.info(`\u2705 Sent queued text message ${item.id}`);
            } else if (item.messageType === "image" && item.mediaOptions) {
              const options = { ...item.mediaOptions };
              if (options.buffer) {
                options.buffer = Buffer.from(options.buffer, "base64");
              }
              await this.sendImageFile(id, item.recipient, options);
              await outbox_queue_default.remove(id, item.id);
              logger_default.info(`\u2705 Sent queued image message ${item.id}`);
            } else if (item.messageType === "video" && item.mediaOptions) {
              const options = { ...item.mediaOptions };
              if (options.buffer) {
                options.buffer = Buffer.from(options.buffer, "base64");
              }
              await this.sendVideoFile(id, item.recipient, options);
              await outbox_queue_default.remove(id, item.id);
              logger_default.info(`\u2705 Sent queued video message ${item.id}`);
            } else if (item.messageType === "document" && item.mediaOptions) {
              const options = { ...item.mediaOptions };
              if (options.buffer) {
                options.buffer = Buffer.from(options.buffer, "base64");
              }
              await this.sendDocument(id, item.recipient, options);
              await outbox_queue_default.remove(id, item.id);
              logger_default.info(`\u2705 Sent queued document message ${item.id}`);
            }
          } catch (error) {
            const updated = {
              ...item,
              attempts: item.attempts + 1,
              lastError: String(error)
            };
            await outbox_queue_default.update(id, updated);
            logger_default.warn(`\u26A0\uFE0F Failed to flush queued message ${item.id}: ${String(error)}`);
            break;
          }
        }
      }
    };
  }
});

// src/whatsapp/queue/outbox-queue.ts
import path8 from "path";
import { randomUUID } from "crypto";
async function flushOutboxForSession(sessionPhone) {
  const { WhatsAppDirectService: WhatsAppDirectService2 } = await Promise.resolve().then(() => (init_whatsapp_direct_service(), whatsapp_direct_service_exports));
  try {
    await WhatsAppDirectService2.flushOutbox(sessionPhone);
  } catch (error) {
    logger_default.error(`Error flushing outbox for ${sessionPhone}:`, error);
  }
}
var OutboxQueue, outboxQueueInstance, outbox_queue_default;
var init_outbox_queue = __esm({
  "src/whatsapp/queue/outbox-queue.ts"() {
    init_json_store();
    init_logger();
    init_environment();
    OutboxQueue = class {
      constructor() {
        const baseDir = path8.join(config.whatsapp.sessionDir, "../outbox");
        this.store = new json_store_default({ baseDir, autoBackup: true });
      }
      async list(sessionPhone) {
        const data = await this.store.get(sessionPhone);
        return Array.isArray(data) ? data : [];
      }
      /**
       * Enqueue a text message
       */
      async enqueue(sessionPhone, recipient, text, mentions) {
        const queue = await this.list(sessionPhone);
        const item = {
          id: randomUUID(),
          sessionPhone,
          recipient,
          messageType: "text",
          text,
          mentions,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          attempts: 0
        };
        queue.push(item);
        await this.store.set(sessionPhone, queue);
        logger_default.info(`Queued outbound text message ${item.id} for ${sessionPhone}`);
        return item;
      }
      /**
       * Enqueue a media message (image, video, document)
       */
      async enqueueMedia(sessionPhone, recipient, messageType, options) {
        const queue = await this.list(sessionPhone);
        const mediaOptions = {
          ...options,
          buffer: options.buffer ? options.buffer.toString("base64") : void 0
        };
        const item = {
          id: randomUUID(),
          sessionPhone,
          recipient,
          messageType,
          mediaOptions,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          attempts: 0
        };
        queue.push(item);
        await this.store.set(sessionPhone, queue);
        logger_default.info(`Queued outbound ${messageType} message ${item.id} for ${sessionPhone}`);
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
      async clear(sessionPhone) {
        await this.store.set(sessionPhone, []);
        logger_default.info(`Cleared outbound queue for ${sessionPhone}`);
      }
    };
    outboxQueueInstance = new OutboxQueue();
    outbox_queue_default = outboxQueueInstance;
  }
});

// src/whatsapp/baileys/sessions.simple.ts
import {
  makeWASocket,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import path9 from "path";
import pino from "pino";
function getStore(sessionId) {
  const store = stores[sessionId];
  if (!store) throw new Error(`No store found for session: ${sessionId}`);
  return store;
}
function getSession(id) {
  return sessions[id];
}
function isSessionReady(sessionId) {
  return readyClients.get(sessionId) ?? false;
}
function isWhatsAppSessionActive(sessionId) {
  const sock = getSession(sessionId);
  if (!sock) {
    logger_default.warn(`Session ${sessionId} does not exist`);
    return false;
  }
  if (!isSessionReady(sessionId)) {
    logger_default.warn(`Session ${sessionId} is not ready yet`);
    return false;
  }
  return true;
}
function listSessions() {
  return Array.from(Object.keys(sessions));
}
function getQRCode(sessionId) {
  return qrCodes[sessionId];
}
async function startSession(sessionId, qrCb) {
  const authDir = path9.join(config.whatsapp.sessionDir, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger_default.info(`Using WA v${version.join(".")}, isLatest: ${isLatest}`);
  const pinoLogger = pino({ level: "silent" });
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pinoLogger,
    // Baileys expects pino logger
    browser: Browsers.ubuntu("Chrome"),
    generateHighQualityLinkPreview: true,
    printQRInTerminal: false
  });
  const storeFilePath = path9.join(authDir, "baileys_store.json");
  const store = makeInMemoryStore(storeFilePath);
  stores[sessionId] = store;
  store.readFromFile();
  setInterval(() => store.writeToFile(), 1e4);
  store.bind(sock.ev);
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      logger_default.info(`\u2705 QR generated for ${sessionId}`);
      qrCodes[sessionId] = qr;
      if (qrCb) qrCb(qr);
    }
    if (connection === "open") {
      logger_default.info(`\u2705 Session connected successfully for ${sessionId}`);
      readyClients.set(sessionId, true);
      sock.ev.on("messaging-history.set", async ({ chats, contacts, messages }) => {
        logger_default.info(`\u{1F4E5} Received ${chats.length} chats and ${contacts.length} contacts`);
        chats.forEach((chat) => store.chats.set(chat.id, chat));
        contacts.forEach((contact) => store.contacts.set(contact.id, contact));
        messages.forEach((msg) => {
          const jid = msg.key.remoteJid;
          const list = store.messages.get(jid) || [];
          list.push(msg);
          store.messages.set(jid, list);
        });
      });
      try {
        await populateStoreIfEmpty(sessionId, sock);
      } catch (err) {
        logger_default.error(`Error populating store for ${sessionId}:`, err);
      }
      try {
        await sock.sendPresenceUpdate("available");
      } catch (err) {
        logger_default.error(`Error setting presence for ${sessionId}:`, err);
      }
      try {
        await flushOutboxForSession(sessionId);
      } catch (err) {
        logger_default.error(`Error flushing outbox for ${sessionId}:`, err);
      }
    }
    if (connection === "close") {
      readyClients.set(sessionId, false);
      delete qrCodes[sessionId];
      logger_default.warn(`\u274C Session closed for ${sessionId}`);
      const code = lastDisconnect?.error?.output?.statusCode;
      logger_default.info(`Disconnect reason: ${code}`);
      if (code !== DisconnectReason.loggedOut) {
        logger_default.info(`\u{1F501} Reconnecting session ${sessionId}...`);
        setTimeout(() => startSession(sessionId, qrCb), 3e3);
      } else {
        delete sessions[sessionId];
        delete stores[sessionId];
      }
    }
  });
  sessions[sessionId] = sock;
  return sock;
}
async function createPairingSession(phone, sendCode) {
  const sessionId = phone.replace("+", "");
  const authDir = path9.join(config.whatsapp.sessionDir, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  const pinoLogger = pino({ level: "silent" });
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pinoLogger,
    // Baileys expects pino logger
    browser: Browsers.macOS("Lila")
  });
  const storeFilePath = path9.join(authDir, "baileys_store.json");
  const store = makeInMemoryStore(storeFilePath);
  stores[sessionId] = store;
  store.readFromFile();
  setInterval(() => store.writeToFile(), 1e4);
  store.bind(sock.ev);
  sock.ev.on("creds.update", saveCreds);
  let pairingDone = false;
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      logger_default.info(`\u2705 Session with ${phone} connected`);
      readyClients.set(sessionId, true);
      try {
        await populateStoreIfEmpty(sessionId, sock);
      } catch (err) {
        logger_default.error(`Error populating store for ${sessionId}:`, err);
      }
      try {
        await flushOutboxForSession(sessionId);
      } catch (err) {
        logger_default.error(`Error flushing outbox for ${sessionId}:`, err);
      }
    }
    if (connection === "close") {
      readyClients.set(sessionId, false);
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      logger_default.warn(`\u274C Session ${phone} closed`, statusCode);
      if (statusCode !== DisconnectReason.loggedOut && statusCode !== 401) {
        setTimeout(() => createPairingSession(phone, sendCode), 3e3);
      } else {
        delete sessions[sessionId];
        delete stores[sessionId];
      }
    }
    if (!pairingDone && !sock.authState.creds.registered && connection === "connecting") {
      try {
        const code = await sock.requestPairingCode(phone);
        logger_default.info(`\u{1F4F2} Pairing code for ${phone}: ${code}`);
        sendCode(code);
        pairingDone = true;
      } catch (err) {
        logger_default.error("\u274C Error requesting pairing code:", err);
      }
    }
  });
  sessions[sessionId] = sock;
}
async function disconnectSession(sessionId) {
  const sock = sessions[sessionId];
  if (sock) {
    await sock.logout();
    delete sessions[sessionId];
    delete stores[sessionId];
    delete qrCodes[sessionId];
    readyClients.delete(sessionId);
    logger_default.info(`Session ${sessionId} disconnected and removed`);
  }
}
var sessions, stores, qrCodes, readyClients;
var init_sessions_simple = __esm({
  "src/whatsapp/baileys/sessions.simple.ts"() {
    init_store_manager();
    init_logger();
    init_environment();
    init_populate_store_simple();
    init_outbox_queue();
    sessions = {};
    stores = {};
    qrCodes = {};
    readyClients = /* @__PURE__ */ new Map();
  }
});

// src/models/company.model.ts
import { Schema as Schema2 } from "mongoose";
var CompanyLimitsSchema, CompanySchema;
var init_company_model = __esm({
  "src/models/company.model.ts"() {
    CompanyLimitsSchema = new Schema2(
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
    CompanySchema = new Schema2(
      {
        companyId: {
          type: String,
          required: true,
          unique: true
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
        whatsappConfig: {
          sender: { type: String },
          adminGroupId: { type: String },
          aiEnabled: { type: Boolean, default: false },
          cronjobPrefix: { type: String }
        },
        limits: {
          type: CompanyLimitsSchema,
          required: true,
          default: () => ({})
          // Usa defaults del sub-schema
        },
        features: {
          modules: {
            drive: { type: Boolean, default: false }
          }
        },
        isActive: {
          type: Boolean,
          required: true,
          default: true
        },
        subscription: {
          limits: {
            cronJobs: { type: Number }
          },
          usage: {
            cronJobs: { type: Number }
          }
        },
        // API Key for lila-app direct access (FE)
        "api-key-lila-access": {
          keyHash: { type: String },
          keyEncrypted: { type: String },
          keyPrefix: { type: String },
          last4: { type: String },
          isActive: { type: Boolean, default: false },
          createdAt: { type: Date },
          rotatedAt: { type: Date },
          lastUsedAt: { type: Date },
          lastUsedIp: { type: String },
          allowedOrigins: { type: [String], default: [] },
          allowedSenders: { type: [String], default: [] },
          rateLimit: {
            limit: { type: Number },
            windowMs: { type: Number }
          }
        }
      },
      {
        timestamps: true,
        collection: "companies"
        // Nombre de la colección en Portal
      }
    );
    CompanySchema.index({ isActive: 1 });
  }
});

// node_modules/luxon/build/node/luxon.js
var require_luxon = __commonJS({
  "node_modules/luxon/build/node/luxon.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var LuxonError = class extends Error {
    };
    var InvalidDateTimeError = class extends LuxonError {
      constructor(reason) {
        super(`Invalid DateTime: ${reason.toMessage()}`);
      }
    };
    var InvalidIntervalError = class extends LuxonError {
      constructor(reason) {
        super(`Invalid Interval: ${reason.toMessage()}`);
      }
    };
    var InvalidDurationError = class extends LuxonError {
      constructor(reason) {
        super(`Invalid Duration: ${reason.toMessage()}`);
      }
    };
    var ConflictingSpecificationError = class extends LuxonError {
    };
    var InvalidUnitError = class extends LuxonError {
      constructor(unit) {
        super(`Invalid unit ${unit}`);
      }
    };
    var InvalidArgumentError = class extends LuxonError {
    };
    var ZoneIsAbstractError = class extends LuxonError {
      constructor() {
        super("Zone is an abstract class");
      }
    };
    var n = "numeric";
    var s = "short";
    var l = "long";
    var DATE_SHORT = {
      year: n,
      month: n,
      day: n
    };
    var DATE_MED = {
      year: n,
      month: s,
      day: n
    };
    var DATE_MED_WITH_WEEKDAY = {
      year: n,
      month: s,
      day: n,
      weekday: s
    };
    var DATE_FULL = {
      year: n,
      month: l,
      day: n
    };
    var DATE_HUGE = {
      year: n,
      month: l,
      day: n,
      weekday: l
    };
    var TIME_SIMPLE = {
      hour: n,
      minute: n
    };
    var TIME_WITH_SECONDS = {
      hour: n,
      minute: n,
      second: n
    };
    var TIME_WITH_SHORT_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      timeZoneName: s
    };
    var TIME_WITH_LONG_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      timeZoneName: l
    };
    var TIME_24_SIMPLE = {
      hour: n,
      minute: n,
      hourCycle: "h23"
    };
    var TIME_24_WITH_SECONDS = {
      hour: n,
      minute: n,
      second: n,
      hourCycle: "h23"
    };
    var TIME_24_WITH_SHORT_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      hourCycle: "h23",
      timeZoneName: s
    };
    var TIME_24_WITH_LONG_OFFSET = {
      hour: n,
      minute: n,
      second: n,
      hourCycle: "h23",
      timeZoneName: l
    };
    var DATETIME_SHORT = {
      year: n,
      month: n,
      day: n,
      hour: n,
      minute: n
    };
    var DATETIME_SHORT_WITH_SECONDS = {
      year: n,
      month: n,
      day: n,
      hour: n,
      minute: n,
      second: n
    };
    var DATETIME_MED = {
      year: n,
      month: s,
      day: n,
      hour: n,
      minute: n
    };
    var DATETIME_MED_WITH_SECONDS = {
      year: n,
      month: s,
      day: n,
      hour: n,
      minute: n,
      second: n
    };
    var DATETIME_MED_WITH_WEEKDAY = {
      year: n,
      month: s,
      day: n,
      weekday: s,
      hour: n,
      minute: n
    };
    var DATETIME_FULL = {
      year: n,
      month: l,
      day: n,
      hour: n,
      minute: n,
      timeZoneName: s
    };
    var DATETIME_FULL_WITH_SECONDS = {
      year: n,
      month: l,
      day: n,
      hour: n,
      minute: n,
      second: n,
      timeZoneName: s
    };
    var DATETIME_HUGE = {
      year: n,
      month: l,
      day: n,
      weekday: l,
      hour: n,
      minute: n,
      timeZoneName: l
    };
    var DATETIME_HUGE_WITH_SECONDS = {
      year: n,
      month: l,
      day: n,
      weekday: l,
      hour: n,
      minute: n,
      second: n,
      timeZoneName: l
    };
    var Zone = class {
      /**
       * The type of zone
       * @abstract
       * @type {string}
       */
      get type() {
        throw new ZoneIsAbstractError();
      }
      /**
       * The name of this zone.
       * @abstract
       * @type {string}
       */
      get name() {
        throw new ZoneIsAbstractError();
      }
      /**
       * The IANA name of this zone.
       * Defaults to `name` if not overwritten by a subclass.
       * @abstract
       * @type {string}
       */
      get ianaName() {
        return this.name;
      }
      /**
       * Returns whether the offset is known to be fixed for the whole year.
       * @abstract
       * @type {boolean}
       */
      get isUniversal() {
        throw new ZoneIsAbstractError();
      }
      /**
       * Returns the offset's common name (such as EST) at the specified timestamp
       * @abstract
       * @param {number} ts - Epoch milliseconds for which to get the name
       * @param {Object} opts - Options to affect the format
       * @param {string} opts.format - What style of offset to return. Accepts 'long' or 'short'.
       * @param {string} opts.locale - What locale to return the offset name in.
       * @return {string}
       */
      offsetName(ts, opts) {
        throw new ZoneIsAbstractError();
      }
      /**
       * Returns the offset's value as a string
       * @abstract
       * @param {number} ts - Epoch milliseconds for which to get the offset
       * @param {string} format - What style of offset to return.
       *                          Accepts 'narrow', 'short', or 'techie'. Returning '+6', '+06:00', or '+0600' respectively
       * @return {string}
       */
      formatOffset(ts, format) {
        throw new ZoneIsAbstractError();
      }
      /**
       * Return the offset in minutes for this zone at the specified timestamp.
       * @abstract
       * @param {number} ts - Epoch milliseconds for which to compute the offset
       * @return {number}
       */
      offset(ts) {
        throw new ZoneIsAbstractError();
      }
      /**
       * Return whether this Zone is equal to another zone
       * @abstract
       * @param {Zone} otherZone - the zone to compare
       * @return {boolean}
       */
      equals(otherZone) {
        throw new ZoneIsAbstractError();
      }
      /**
       * Return whether this Zone is valid.
       * @abstract
       * @type {boolean}
       */
      get isValid() {
        throw new ZoneIsAbstractError();
      }
    };
    var singleton$1 = null;
    var SystemZone = class _SystemZone extends Zone {
      /**
       * Get a singleton instance of the local zone
       * @return {SystemZone}
       */
      static get instance() {
        if (singleton$1 === null) {
          singleton$1 = new _SystemZone();
        }
        return singleton$1;
      }
      /** @override **/
      get type() {
        return "system";
      }
      /** @override **/
      get name() {
        return new Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
      /** @override **/
      get isUniversal() {
        return false;
      }
      /** @override **/
      offsetName(ts, {
        format,
        locale
      }) {
        return parseZoneInfo(ts, format, locale);
      }
      /** @override **/
      formatOffset(ts, format) {
        return formatOffset(this.offset(ts), format);
      }
      /** @override **/
      offset(ts) {
        return -new Date(ts).getTimezoneOffset();
      }
      /** @override **/
      equals(otherZone) {
        return otherZone.type === "system";
      }
      /** @override **/
      get isValid() {
        return true;
      }
    };
    var dtfCache = /* @__PURE__ */ new Map();
    function makeDTF(zoneName) {
      let dtf = dtfCache.get(zoneName);
      if (dtf === void 0) {
        dtf = new Intl.DateTimeFormat("en-US", {
          hour12: false,
          timeZone: zoneName,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          era: "short"
        });
        dtfCache.set(zoneName, dtf);
      }
      return dtf;
    }
    var typeToPos = {
      year: 0,
      month: 1,
      day: 2,
      era: 3,
      hour: 4,
      minute: 5,
      second: 6
    };
    function hackyOffset(dtf, date) {
      const formatted = dtf.format(date).replace(/\u200E/g, ""), parsed = /(\d+)\/(\d+)\/(\d+) (AD|BC),? (\d+):(\d+):(\d+)/.exec(formatted), [, fMonth, fDay, fYear, fadOrBc, fHour, fMinute, fSecond] = parsed;
      return [fYear, fMonth, fDay, fadOrBc, fHour, fMinute, fSecond];
    }
    function partsOffset(dtf, date) {
      const formatted = dtf.formatToParts(date);
      const filled = [];
      for (let i = 0; i < formatted.length; i++) {
        const {
          type,
          value
        } = formatted[i];
        const pos = typeToPos[type];
        if (type === "era") {
          filled[pos] = value;
        } else if (!isUndefined(pos)) {
          filled[pos] = parseInt(value, 10);
        }
      }
      return filled;
    }
    var ianaZoneCache = /* @__PURE__ */ new Map();
    var IANAZone = class _IANAZone extends Zone {
      /**
       * @param {string} name - Zone name
       * @return {IANAZone}
       */
      static create(name) {
        let zone = ianaZoneCache.get(name);
        if (zone === void 0) {
          ianaZoneCache.set(name, zone = new _IANAZone(name));
        }
        return zone;
      }
      /**
       * Reset local caches. Should only be necessary in testing scenarios.
       * @return {void}
       */
      static resetCache() {
        ianaZoneCache.clear();
        dtfCache.clear();
      }
      /**
       * Returns whether the provided string is a valid specifier. This only checks the string's format, not that the specifier identifies a known zone; see isValidZone for that.
       * @param {string} s - The string to check validity on
       * @example IANAZone.isValidSpecifier("America/New_York") //=> true
       * @example IANAZone.isValidSpecifier("Sport~~blorp") //=> false
       * @deprecated For backward compatibility, this forwards to isValidZone, better use `isValidZone()` directly instead.
       * @return {boolean}
       */
      static isValidSpecifier(s2) {
        return this.isValidZone(s2);
      }
      /**
       * Returns whether the provided string identifies a real zone
       * @param {string} zone - The string to check
       * @example IANAZone.isValidZone("America/New_York") //=> true
       * @example IANAZone.isValidZone("Fantasia/Castle") //=> false
       * @example IANAZone.isValidZone("Sport~~blorp") //=> false
       * @return {boolean}
       */
      static isValidZone(zone) {
        if (!zone) {
          return false;
        }
        try {
          new Intl.DateTimeFormat("en-US", {
            timeZone: zone
          }).format();
          return true;
        } catch (e) {
          return false;
        }
      }
      constructor(name) {
        super();
        this.zoneName = name;
        this.valid = _IANAZone.isValidZone(name);
      }
      /**
       * The type of zone. `iana` for all instances of `IANAZone`.
       * @override
       * @type {string}
       */
      get type() {
        return "iana";
      }
      /**
       * The name of this zone (i.e. the IANA zone name).
       * @override
       * @type {string}
       */
      get name() {
        return this.zoneName;
      }
      /**
       * Returns whether the offset is known to be fixed for the whole year:
       * Always returns false for all IANA zones.
       * @override
       * @type {boolean}
       */
      get isUniversal() {
        return false;
      }
      /**
       * Returns the offset's common name (such as EST) at the specified timestamp
       * @override
       * @param {number} ts - Epoch milliseconds for which to get the name
       * @param {Object} opts - Options to affect the format
       * @param {string} opts.format - What style of offset to return. Accepts 'long' or 'short'.
       * @param {string} opts.locale - What locale to return the offset name in.
       * @return {string}
       */
      offsetName(ts, {
        format,
        locale
      }) {
        return parseZoneInfo(ts, format, locale, this.name);
      }
      /**
       * Returns the offset's value as a string
       * @override
       * @param {number} ts - Epoch milliseconds for which to get the offset
       * @param {string} format - What style of offset to return.
       *                          Accepts 'narrow', 'short', or 'techie'. Returning '+6', '+06:00', or '+0600' respectively
       * @return {string}
       */
      formatOffset(ts, format) {
        return formatOffset(this.offset(ts), format);
      }
      /**
       * Return the offset in minutes for this zone at the specified timestamp.
       * @override
       * @param {number} ts - Epoch milliseconds for which to compute the offset
       * @return {number}
       */
      offset(ts) {
        if (!this.valid) return NaN;
        const date = new Date(ts);
        if (isNaN(date)) return NaN;
        const dtf = makeDTF(this.name);
        let [year, month, day, adOrBc, hour, minute, second] = dtf.formatToParts ? partsOffset(dtf, date) : hackyOffset(dtf, date);
        if (adOrBc === "BC") {
          year = -Math.abs(year) + 1;
        }
        const adjustedHour = hour === 24 ? 0 : hour;
        const asUTC = objToLocalTS({
          year,
          month,
          day,
          hour: adjustedHour,
          minute,
          second,
          millisecond: 0
        });
        let asTS = +date;
        const over = asTS % 1e3;
        asTS -= over >= 0 ? over : 1e3 + over;
        return (asUTC - asTS) / (60 * 1e3);
      }
      /**
       * Return whether this Zone is equal to another zone
       * @override
       * @param {Zone} otherZone - the zone to compare
       * @return {boolean}
       */
      equals(otherZone) {
        return otherZone.type === "iana" && otherZone.name === this.name;
      }
      /**
       * Return whether this Zone is valid.
       * @override
       * @type {boolean}
       */
      get isValid() {
        return this.valid;
      }
    };
    var intlLFCache = {};
    function getCachedLF(locString, opts = {}) {
      const key = JSON.stringify([locString, opts]);
      let dtf = intlLFCache[key];
      if (!dtf) {
        dtf = new Intl.ListFormat(locString, opts);
        intlLFCache[key] = dtf;
      }
      return dtf;
    }
    var intlDTCache = /* @__PURE__ */ new Map();
    function getCachedDTF(locString, opts = {}) {
      const key = JSON.stringify([locString, opts]);
      let dtf = intlDTCache.get(key);
      if (dtf === void 0) {
        dtf = new Intl.DateTimeFormat(locString, opts);
        intlDTCache.set(key, dtf);
      }
      return dtf;
    }
    var intlNumCache = /* @__PURE__ */ new Map();
    function getCachedINF(locString, opts = {}) {
      const key = JSON.stringify([locString, opts]);
      let inf = intlNumCache.get(key);
      if (inf === void 0) {
        inf = new Intl.NumberFormat(locString, opts);
        intlNumCache.set(key, inf);
      }
      return inf;
    }
    var intlRelCache = /* @__PURE__ */ new Map();
    function getCachedRTF(locString, opts = {}) {
      const {
        base,
        ...cacheKeyOpts
      } = opts;
      const key = JSON.stringify([locString, cacheKeyOpts]);
      let inf = intlRelCache.get(key);
      if (inf === void 0) {
        inf = new Intl.RelativeTimeFormat(locString, opts);
        intlRelCache.set(key, inf);
      }
      return inf;
    }
    var sysLocaleCache = null;
    function systemLocale() {
      if (sysLocaleCache) {
        return sysLocaleCache;
      } else {
        sysLocaleCache = new Intl.DateTimeFormat().resolvedOptions().locale;
        return sysLocaleCache;
      }
    }
    var intlResolvedOptionsCache = /* @__PURE__ */ new Map();
    function getCachedIntResolvedOptions(locString) {
      let opts = intlResolvedOptionsCache.get(locString);
      if (opts === void 0) {
        opts = new Intl.DateTimeFormat(locString).resolvedOptions();
        intlResolvedOptionsCache.set(locString, opts);
      }
      return opts;
    }
    var weekInfoCache = /* @__PURE__ */ new Map();
    function getCachedWeekInfo(locString) {
      let data = weekInfoCache.get(locString);
      if (!data) {
        const locale = new Intl.Locale(locString);
        data = "getWeekInfo" in locale ? locale.getWeekInfo() : locale.weekInfo;
        if (!("minimalDays" in data)) {
          data = {
            ...fallbackWeekSettings,
            ...data
          };
        }
        weekInfoCache.set(locString, data);
      }
      return data;
    }
    function parseLocaleString(localeStr) {
      const xIndex = localeStr.indexOf("-x-");
      if (xIndex !== -1) {
        localeStr = localeStr.substring(0, xIndex);
      }
      const uIndex = localeStr.indexOf("-u-");
      if (uIndex === -1) {
        return [localeStr];
      } else {
        let options;
        let selectedStr;
        try {
          options = getCachedDTF(localeStr).resolvedOptions();
          selectedStr = localeStr;
        } catch (e) {
          const smaller = localeStr.substring(0, uIndex);
          options = getCachedDTF(smaller).resolvedOptions();
          selectedStr = smaller;
        }
        const {
          numberingSystem,
          calendar
        } = options;
        return [selectedStr, numberingSystem, calendar];
      }
    }
    function intlConfigString(localeStr, numberingSystem, outputCalendar) {
      if (outputCalendar || numberingSystem) {
        if (!localeStr.includes("-u-")) {
          localeStr += "-u";
        }
        if (outputCalendar) {
          localeStr += `-ca-${outputCalendar}`;
        }
        if (numberingSystem) {
          localeStr += `-nu-${numberingSystem}`;
        }
        return localeStr;
      } else {
        return localeStr;
      }
    }
    function mapMonths(f) {
      const ms = [];
      for (let i = 1; i <= 12; i++) {
        const dt = DateTime.utc(2009, i, 1);
        ms.push(f(dt));
      }
      return ms;
    }
    function mapWeekdays(f) {
      const ms = [];
      for (let i = 1; i <= 7; i++) {
        const dt = DateTime.utc(2016, 11, 13 + i);
        ms.push(f(dt));
      }
      return ms;
    }
    function listStuff(loc, length, englishFn, intlFn) {
      const mode = loc.listingMode();
      if (mode === "error") {
        return null;
      } else if (mode === "en") {
        return englishFn(length);
      } else {
        return intlFn(length);
      }
    }
    function supportsFastNumbers(loc) {
      if (loc.numberingSystem && loc.numberingSystem !== "latn") {
        return false;
      } else {
        return loc.numberingSystem === "latn" || !loc.locale || loc.locale.startsWith("en") || getCachedIntResolvedOptions(loc.locale).numberingSystem === "latn";
      }
    }
    var PolyNumberFormatter = class {
      constructor(intl, forceSimple, opts) {
        this.padTo = opts.padTo || 0;
        this.floor = opts.floor || false;
        const {
          padTo,
          floor,
          ...otherOpts
        } = opts;
        if (!forceSimple || Object.keys(otherOpts).length > 0) {
          const intlOpts = {
            useGrouping: false,
            ...opts
          };
          if (opts.padTo > 0) intlOpts.minimumIntegerDigits = opts.padTo;
          this.inf = getCachedINF(intl, intlOpts);
        }
      }
      format(i) {
        if (this.inf) {
          const fixed = this.floor ? Math.floor(i) : i;
          return this.inf.format(fixed);
        } else {
          const fixed = this.floor ? Math.floor(i) : roundTo(i, 3);
          return padStart(fixed, this.padTo);
        }
      }
    };
    var PolyDateFormatter = class {
      constructor(dt, intl, opts) {
        this.opts = opts;
        this.originalZone = void 0;
        let z = void 0;
        if (this.opts.timeZone) {
          this.dt = dt;
        } else if (dt.zone.type === "fixed") {
          const gmtOffset = -1 * (dt.offset / 60);
          const offsetZ = gmtOffset >= 0 ? `Etc/GMT+${gmtOffset}` : `Etc/GMT${gmtOffset}`;
          if (dt.offset !== 0 && IANAZone.create(offsetZ).valid) {
            z = offsetZ;
            this.dt = dt;
          } else {
            z = "UTC";
            this.dt = dt.offset === 0 ? dt : dt.setZone("UTC").plus({
              minutes: dt.offset
            });
            this.originalZone = dt.zone;
          }
        } else if (dt.zone.type === "system") {
          this.dt = dt;
        } else if (dt.zone.type === "iana") {
          this.dt = dt;
          z = dt.zone.name;
        } else {
          z = "UTC";
          this.dt = dt.setZone("UTC").plus({
            minutes: dt.offset
          });
          this.originalZone = dt.zone;
        }
        const intlOpts = {
          ...this.opts
        };
        intlOpts.timeZone = intlOpts.timeZone || z;
        this.dtf = getCachedDTF(intl, intlOpts);
      }
      format() {
        if (this.originalZone) {
          return this.formatToParts().map(({
            value
          }) => value).join("");
        }
        return this.dtf.format(this.dt.toJSDate());
      }
      formatToParts() {
        const parts = this.dtf.formatToParts(this.dt.toJSDate());
        if (this.originalZone) {
          return parts.map((part) => {
            if (part.type === "timeZoneName") {
              const offsetName = this.originalZone.offsetName(this.dt.ts, {
                locale: this.dt.locale,
                format: this.opts.timeZoneName
              });
              return {
                ...part,
                value: offsetName
              };
            } else {
              return part;
            }
          });
        }
        return parts;
      }
      resolvedOptions() {
        return this.dtf.resolvedOptions();
      }
    };
    var PolyRelFormatter = class {
      constructor(intl, isEnglish, opts) {
        this.opts = {
          style: "long",
          ...opts
        };
        if (!isEnglish && hasRelative()) {
          this.rtf = getCachedRTF(intl, opts);
        }
      }
      format(count, unit) {
        if (this.rtf) {
          return this.rtf.format(count, unit);
        } else {
          return formatRelativeTime(unit, count, this.opts.numeric, this.opts.style !== "long");
        }
      }
      formatToParts(count, unit) {
        if (this.rtf) {
          return this.rtf.formatToParts(count, unit);
        } else {
          return [];
        }
      }
    };
    var fallbackWeekSettings = {
      firstDay: 1,
      minimalDays: 4,
      weekend: [6, 7]
    };
    var Locale = class _Locale {
      static fromOpts(opts) {
        return _Locale.create(opts.locale, opts.numberingSystem, opts.outputCalendar, opts.weekSettings, opts.defaultToEN);
      }
      static create(locale, numberingSystem, outputCalendar, weekSettings, defaultToEN = false) {
        const specifiedLocale = locale || Settings.defaultLocale;
        const localeR = specifiedLocale || (defaultToEN ? "en-US" : systemLocale());
        const numberingSystemR = numberingSystem || Settings.defaultNumberingSystem;
        const outputCalendarR = outputCalendar || Settings.defaultOutputCalendar;
        const weekSettingsR = validateWeekSettings(weekSettings) || Settings.defaultWeekSettings;
        return new _Locale(localeR, numberingSystemR, outputCalendarR, weekSettingsR, specifiedLocale);
      }
      static resetCache() {
        sysLocaleCache = null;
        intlDTCache.clear();
        intlNumCache.clear();
        intlRelCache.clear();
        intlResolvedOptionsCache.clear();
        weekInfoCache.clear();
      }
      static fromObject({
        locale,
        numberingSystem,
        outputCalendar,
        weekSettings
      } = {}) {
        return _Locale.create(locale, numberingSystem, outputCalendar, weekSettings);
      }
      constructor(locale, numbering, outputCalendar, weekSettings, specifiedLocale) {
        const [parsedLocale, parsedNumberingSystem, parsedOutputCalendar] = parseLocaleString(locale);
        this.locale = parsedLocale;
        this.numberingSystem = numbering || parsedNumberingSystem || null;
        this.outputCalendar = outputCalendar || parsedOutputCalendar || null;
        this.weekSettings = weekSettings;
        this.intl = intlConfigString(this.locale, this.numberingSystem, this.outputCalendar);
        this.weekdaysCache = {
          format: {},
          standalone: {}
        };
        this.monthsCache = {
          format: {},
          standalone: {}
        };
        this.meridiemCache = null;
        this.eraCache = {};
        this.specifiedLocale = specifiedLocale;
        this.fastNumbersCached = null;
      }
      get fastNumbers() {
        if (this.fastNumbersCached == null) {
          this.fastNumbersCached = supportsFastNumbers(this);
        }
        return this.fastNumbersCached;
      }
      listingMode() {
        const isActuallyEn = this.isEnglish();
        const hasNoWeirdness = (this.numberingSystem === null || this.numberingSystem === "latn") && (this.outputCalendar === null || this.outputCalendar === "gregory");
        return isActuallyEn && hasNoWeirdness ? "en" : "intl";
      }
      clone(alts) {
        if (!alts || Object.getOwnPropertyNames(alts).length === 0) {
          return this;
        } else {
          return _Locale.create(alts.locale || this.specifiedLocale, alts.numberingSystem || this.numberingSystem, alts.outputCalendar || this.outputCalendar, validateWeekSettings(alts.weekSettings) || this.weekSettings, alts.defaultToEN || false);
        }
      }
      redefaultToEN(alts = {}) {
        return this.clone({
          ...alts,
          defaultToEN: true
        });
      }
      redefaultToSystem(alts = {}) {
        return this.clone({
          ...alts,
          defaultToEN: false
        });
      }
      months(length, format = false) {
        return listStuff(this, length, months, () => {
          const monthSpecialCase = this.intl === "ja" || this.intl.startsWith("ja-");
          format &= !monthSpecialCase;
          const intl = format ? {
            month: length,
            day: "numeric"
          } : {
            month: length
          }, formatStr = format ? "format" : "standalone";
          if (!this.monthsCache[formatStr][length]) {
            const mapper = !monthSpecialCase ? (dt) => this.extract(dt, intl, "month") : (dt) => this.dtFormatter(dt, intl).format();
            this.monthsCache[formatStr][length] = mapMonths(mapper);
          }
          return this.monthsCache[formatStr][length];
        });
      }
      weekdays(length, format = false) {
        return listStuff(this, length, weekdays, () => {
          const intl = format ? {
            weekday: length,
            year: "numeric",
            month: "long",
            day: "numeric"
          } : {
            weekday: length
          }, formatStr = format ? "format" : "standalone";
          if (!this.weekdaysCache[formatStr][length]) {
            this.weekdaysCache[formatStr][length] = mapWeekdays((dt) => this.extract(dt, intl, "weekday"));
          }
          return this.weekdaysCache[formatStr][length];
        });
      }
      meridiems() {
        return listStuff(this, void 0, () => meridiems, () => {
          if (!this.meridiemCache) {
            const intl = {
              hour: "numeric",
              hourCycle: "h12"
            };
            this.meridiemCache = [DateTime.utc(2016, 11, 13, 9), DateTime.utc(2016, 11, 13, 19)].map((dt) => this.extract(dt, intl, "dayperiod"));
          }
          return this.meridiemCache;
        });
      }
      eras(length) {
        return listStuff(this, length, eras, () => {
          const intl = {
            era: length
          };
          if (!this.eraCache[length]) {
            this.eraCache[length] = [DateTime.utc(-40, 1, 1), DateTime.utc(2017, 1, 1)].map((dt) => this.extract(dt, intl, "era"));
          }
          return this.eraCache[length];
        });
      }
      extract(dt, intlOpts, field) {
        const df = this.dtFormatter(dt, intlOpts), results = df.formatToParts(), matching = results.find((m) => m.type.toLowerCase() === field);
        return matching ? matching.value : null;
      }
      numberFormatter(opts = {}) {
        return new PolyNumberFormatter(this.intl, opts.forceSimple || this.fastNumbers, opts);
      }
      dtFormatter(dt, intlOpts = {}) {
        return new PolyDateFormatter(dt, this.intl, intlOpts);
      }
      relFormatter(opts = {}) {
        return new PolyRelFormatter(this.intl, this.isEnglish(), opts);
      }
      listFormatter(opts = {}) {
        return getCachedLF(this.intl, opts);
      }
      isEnglish() {
        return this.locale === "en" || this.locale.toLowerCase() === "en-us" || getCachedIntResolvedOptions(this.intl).locale.startsWith("en-us");
      }
      getWeekSettings() {
        if (this.weekSettings) {
          return this.weekSettings;
        } else if (!hasLocaleWeekInfo()) {
          return fallbackWeekSettings;
        } else {
          return getCachedWeekInfo(this.locale);
        }
      }
      getStartOfWeek() {
        return this.getWeekSettings().firstDay;
      }
      getMinDaysInFirstWeek() {
        return this.getWeekSettings().minimalDays;
      }
      getWeekendDays() {
        return this.getWeekSettings().weekend;
      }
      equals(other) {
        return this.locale === other.locale && this.numberingSystem === other.numberingSystem && this.outputCalendar === other.outputCalendar;
      }
      toString() {
        return `Locale(${this.locale}, ${this.numberingSystem}, ${this.outputCalendar})`;
      }
    };
    var singleton = null;
    var FixedOffsetZone = class _FixedOffsetZone extends Zone {
      /**
       * Get a singleton instance of UTC
       * @return {FixedOffsetZone}
       */
      static get utcInstance() {
        if (singleton === null) {
          singleton = new _FixedOffsetZone(0);
        }
        return singleton;
      }
      /**
       * Get an instance with a specified offset
       * @param {number} offset - The offset in minutes
       * @return {FixedOffsetZone}
       */
      static instance(offset2) {
        return offset2 === 0 ? _FixedOffsetZone.utcInstance : new _FixedOffsetZone(offset2);
      }
      /**
       * Get an instance of FixedOffsetZone from a UTC offset string, like "UTC+6"
       * @param {string} s - The offset string to parse
       * @example FixedOffsetZone.parseSpecifier("UTC+6")
       * @example FixedOffsetZone.parseSpecifier("UTC+06")
       * @example FixedOffsetZone.parseSpecifier("UTC-6:00")
       * @return {FixedOffsetZone}
       */
      static parseSpecifier(s2) {
        if (s2) {
          const r = s2.match(/^utc(?:([+-]\d{1,2})(?::(\d{2}))?)?$/i);
          if (r) {
            return new _FixedOffsetZone(signedOffset(r[1], r[2]));
          }
        }
        return null;
      }
      constructor(offset2) {
        super();
        this.fixed = offset2;
      }
      /**
       * The type of zone. `fixed` for all instances of `FixedOffsetZone`.
       * @override
       * @type {string}
       */
      get type() {
        return "fixed";
      }
      /**
       * The name of this zone.
       * All fixed zones' names always start with "UTC" (plus optional offset)
       * @override
       * @type {string}
       */
      get name() {
        return this.fixed === 0 ? "UTC" : `UTC${formatOffset(this.fixed, "narrow")}`;
      }
      /**
       * The IANA name of this zone, i.e. `Etc/UTC` or `Etc/GMT+/-nn`
       *
       * @override
       * @type {string}
       */
      get ianaName() {
        if (this.fixed === 0) {
          return "Etc/UTC";
        } else {
          return `Etc/GMT${formatOffset(-this.fixed, "narrow")}`;
        }
      }
      /**
       * Returns the offset's common name at the specified timestamp.
       *
       * For fixed offset zones this equals to the zone name.
       * @override
       */
      offsetName() {
        return this.name;
      }
      /**
       * Returns the offset's value as a string
       * @override
       * @param {number} ts - Epoch milliseconds for which to get the offset
       * @param {string} format - What style of offset to return.
       *                          Accepts 'narrow', 'short', or 'techie'. Returning '+6', '+06:00', or '+0600' respectively
       * @return {string}
       */
      formatOffset(ts, format) {
        return formatOffset(this.fixed, format);
      }
      /**
       * Returns whether the offset is known to be fixed for the whole year:
       * Always returns true for all fixed offset zones.
       * @override
       * @type {boolean}
       */
      get isUniversal() {
        return true;
      }
      /**
       * Return the offset in minutes for this zone at the specified timestamp.
       *
       * For fixed offset zones, this is constant and does not depend on a timestamp.
       * @override
       * @return {number}
       */
      offset() {
        return this.fixed;
      }
      /**
       * Return whether this Zone is equal to another zone (i.e. also fixed and same offset)
       * @override
       * @param {Zone} otherZone - the zone to compare
       * @return {boolean}
       */
      equals(otherZone) {
        return otherZone.type === "fixed" && otherZone.fixed === this.fixed;
      }
      /**
       * Return whether this Zone is valid:
       * All fixed offset zones are valid.
       * @override
       * @type {boolean}
       */
      get isValid() {
        return true;
      }
    };
    var InvalidZone = class extends Zone {
      constructor(zoneName) {
        super();
        this.zoneName = zoneName;
      }
      /** @override **/
      get type() {
        return "invalid";
      }
      /** @override **/
      get name() {
        return this.zoneName;
      }
      /** @override **/
      get isUniversal() {
        return false;
      }
      /** @override **/
      offsetName() {
        return null;
      }
      /** @override **/
      formatOffset() {
        return "";
      }
      /** @override **/
      offset() {
        return NaN;
      }
      /** @override **/
      equals() {
        return false;
      }
      /** @override **/
      get isValid() {
        return false;
      }
    };
    function normalizeZone(input, defaultZone2) {
      if (isUndefined(input) || input === null) {
        return defaultZone2;
      } else if (input instanceof Zone) {
        return input;
      } else if (isString(input)) {
        const lowered = input.toLowerCase();
        if (lowered === "default") return defaultZone2;
        else if (lowered === "local" || lowered === "system") return SystemZone.instance;
        else if (lowered === "utc" || lowered === "gmt") return FixedOffsetZone.utcInstance;
        else return FixedOffsetZone.parseSpecifier(lowered) || IANAZone.create(input);
      } else if (isNumber(input)) {
        return FixedOffsetZone.instance(input);
      } else if (typeof input === "object" && "offset" in input && typeof input.offset === "function") {
        return input;
      } else {
        return new InvalidZone(input);
      }
    }
    var numberingSystems = {
      arab: "[\u0660-\u0669]",
      arabext: "[\u06F0-\u06F9]",
      bali: "[\u1B50-\u1B59]",
      beng: "[\u09E6-\u09EF]",
      deva: "[\u0966-\u096F]",
      fullwide: "[\uFF10-\uFF19]",
      gujr: "[\u0AE6-\u0AEF]",
      hanidec: "[\u3007|\u4E00|\u4E8C|\u4E09|\u56DB|\u4E94|\u516D|\u4E03|\u516B|\u4E5D]",
      khmr: "[\u17E0-\u17E9]",
      knda: "[\u0CE6-\u0CEF]",
      laoo: "[\u0ED0-\u0ED9]",
      limb: "[\u1946-\u194F]",
      mlym: "[\u0D66-\u0D6F]",
      mong: "[\u1810-\u1819]",
      mymr: "[\u1040-\u1049]",
      orya: "[\u0B66-\u0B6F]",
      tamldec: "[\u0BE6-\u0BEF]",
      telu: "[\u0C66-\u0C6F]",
      thai: "[\u0E50-\u0E59]",
      tibt: "[\u0F20-\u0F29]",
      latn: "\\d"
    };
    var numberingSystemsUTF16 = {
      arab: [1632, 1641],
      arabext: [1776, 1785],
      bali: [6992, 7001],
      beng: [2534, 2543],
      deva: [2406, 2415],
      fullwide: [65296, 65303],
      gujr: [2790, 2799],
      khmr: [6112, 6121],
      knda: [3302, 3311],
      laoo: [3792, 3801],
      limb: [6470, 6479],
      mlym: [3430, 3439],
      mong: [6160, 6169],
      mymr: [4160, 4169],
      orya: [2918, 2927],
      tamldec: [3046, 3055],
      telu: [3174, 3183],
      thai: [3664, 3673],
      tibt: [3872, 3881]
    };
    var hanidecChars = numberingSystems.hanidec.replace(/[\[|\]]/g, "").split("");
    function parseDigits(str) {
      let value = parseInt(str, 10);
      if (isNaN(value)) {
        value = "";
        for (let i = 0; i < str.length; i++) {
          const code = str.charCodeAt(i);
          if (str[i].search(numberingSystems.hanidec) !== -1) {
            value += hanidecChars.indexOf(str[i]);
          } else {
            for (const key in numberingSystemsUTF16) {
              const [min, max] = numberingSystemsUTF16[key];
              if (code >= min && code <= max) {
                value += code - min;
              }
            }
          }
        }
        return parseInt(value, 10);
      } else {
        return value;
      }
    }
    var digitRegexCache = /* @__PURE__ */ new Map();
    function resetDigitRegexCache() {
      digitRegexCache.clear();
    }
    function digitRegex({
      numberingSystem
    }, append = "") {
      const ns = numberingSystem || "latn";
      let appendCache = digitRegexCache.get(ns);
      if (appendCache === void 0) {
        appendCache = /* @__PURE__ */ new Map();
        digitRegexCache.set(ns, appendCache);
      }
      let regex = appendCache.get(append);
      if (regex === void 0) {
        regex = new RegExp(`${numberingSystems[ns]}${append}`);
        appendCache.set(append, regex);
      }
      return regex;
    }
    var now = () => Date.now();
    var defaultZone = "system";
    var defaultLocale = null;
    var defaultNumberingSystem = null;
    var defaultOutputCalendar = null;
    var twoDigitCutoffYear = 60;
    var throwOnInvalid;
    var defaultWeekSettings = null;
    var Settings = class {
      /**
       * Get the callback for returning the current timestamp.
       * @type {function}
       */
      static get now() {
        return now;
      }
      /**
       * Set the callback for returning the current timestamp.
       * The function should return a number, which will be interpreted as an Epoch millisecond count
       * @type {function}
       * @example Settings.now = () => Date.now() + 3000 // pretend it is 3 seconds in the future
       * @example Settings.now = () => 0 // always pretend it's Jan 1, 1970 at midnight in UTC time
       */
      static set now(n2) {
        now = n2;
      }
      /**
       * Set the default time zone to create DateTimes in. Does not affect existing instances.
       * Use the value "system" to reset this value to the system's time zone.
       * @type {string}
       */
      static set defaultZone(zone) {
        defaultZone = zone;
      }
      /**
       * Get the default time zone object currently used to create DateTimes. Does not affect existing instances.
       * The default value is the system's time zone (the one set on the machine that runs this code).
       * @type {Zone}
       */
      static get defaultZone() {
        return normalizeZone(defaultZone, SystemZone.instance);
      }
      /**
       * Get the default locale to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static get defaultLocale() {
        return defaultLocale;
      }
      /**
       * Set the default locale to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static set defaultLocale(locale) {
        defaultLocale = locale;
      }
      /**
       * Get the default numbering system to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static get defaultNumberingSystem() {
        return defaultNumberingSystem;
      }
      /**
       * Set the default numbering system to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static set defaultNumberingSystem(numberingSystem) {
        defaultNumberingSystem = numberingSystem;
      }
      /**
       * Get the default output calendar to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static get defaultOutputCalendar() {
        return defaultOutputCalendar;
      }
      /**
       * Set the default output calendar to create DateTimes with. Does not affect existing instances.
       * @type {string}
       */
      static set defaultOutputCalendar(outputCalendar) {
        defaultOutputCalendar = outputCalendar;
      }
      /**
       * @typedef {Object} WeekSettings
       * @property {number} firstDay
       * @property {number} minimalDays
       * @property {number[]} weekend
       */
      /**
       * @return {WeekSettings|null}
       */
      static get defaultWeekSettings() {
        return defaultWeekSettings;
      }
      /**
       * Allows overriding the default locale week settings, i.e. the start of the week, the weekend and
       * how many days are required in the first week of a year.
       * Does not affect existing instances.
       *
       * @param {WeekSettings|null} weekSettings
       */
      static set defaultWeekSettings(weekSettings) {
        defaultWeekSettings = validateWeekSettings(weekSettings);
      }
      /**
       * Get the cutoff year for whether a 2-digit year string is interpreted in the current or previous century. Numbers higher than the cutoff will be considered to mean 19xx and numbers lower or equal to the cutoff will be considered 20xx.
       * @type {number}
       */
      static get twoDigitCutoffYear() {
        return twoDigitCutoffYear;
      }
      /**
       * Set the cutoff year for whether a 2-digit year string is interpreted in the current or previous century. Numbers higher than the cutoff will be considered to mean 19xx and numbers lower or equal to the cutoff will be considered 20xx.
       * @type {number}
       * @example Settings.twoDigitCutoffYear = 0 // all 'yy' are interpreted as 20th century
       * @example Settings.twoDigitCutoffYear = 99 // all 'yy' are interpreted as 21st century
       * @example Settings.twoDigitCutoffYear = 50 // '49' -> 2049; '50' -> 1950
       * @example Settings.twoDigitCutoffYear = 1950 // interpreted as 50
       * @example Settings.twoDigitCutoffYear = 2050 // ALSO interpreted as 50
       */
      static set twoDigitCutoffYear(cutoffYear) {
        twoDigitCutoffYear = cutoffYear % 100;
      }
      /**
       * Get whether Luxon will throw when it encounters invalid DateTimes, Durations, or Intervals
       * @type {boolean}
       */
      static get throwOnInvalid() {
        return throwOnInvalid;
      }
      /**
       * Set whether Luxon will throw when it encounters invalid DateTimes, Durations, or Intervals
       * @type {boolean}
       */
      static set throwOnInvalid(t) {
        throwOnInvalid = t;
      }
      /**
       * Reset Luxon's global caches. Should only be necessary in testing scenarios.
       * @return {void}
       */
      static resetCaches() {
        Locale.resetCache();
        IANAZone.resetCache();
        DateTime.resetCache();
        resetDigitRegexCache();
      }
    };
    var Invalid = class {
      constructor(reason, explanation) {
        this.reason = reason;
        this.explanation = explanation;
      }
      toMessage() {
        if (this.explanation) {
          return `${this.reason}: ${this.explanation}`;
        } else {
          return this.reason;
        }
      }
    };
    var nonLeapLadder = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var leapLadder = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
    function unitOutOfRange(unit, value) {
      return new Invalid("unit out of range", `you specified ${value} (of type ${typeof value}) as a ${unit}, which is invalid`);
    }
    function dayOfWeek(year, month, day) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (year < 100 && year >= 0) {
        d.setUTCFullYear(d.getUTCFullYear() - 1900);
      }
      const js = d.getUTCDay();
      return js === 0 ? 7 : js;
    }
    function computeOrdinal(year, month, day) {
      return day + (isLeapYear(year) ? leapLadder : nonLeapLadder)[month - 1];
    }
    function uncomputeOrdinal(year, ordinal) {
      const table = isLeapYear(year) ? leapLadder : nonLeapLadder, month0 = table.findIndex((i) => i < ordinal), day = ordinal - table[month0];
      return {
        month: month0 + 1,
        day
      };
    }
    function isoWeekdayToLocal(isoWeekday, startOfWeek) {
      return (isoWeekday - startOfWeek + 7) % 7 + 1;
    }
    function gregorianToWeek(gregObj, minDaysInFirstWeek = 4, startOfWeek = 1) {
      const {
        year,
        month,
        day
      } = gregObj, ordinal = computeOrdinal(year, month, day), weekday = isoWeekdayToLocal(dayOfWeek(year, month, day), startOfWeek);
      let weekNumber = Math.floor((ordinal - weekday + 14 - minDaysInFirstWeek) / 7), weekYear;
      if (weekNumber < 1) {
        weekYear = year - 1;
        weekNumber = weeksInWeekYear(weekYear, minDaysInFirstWeek, startOfWeek);
      } else if (weekNumber > weeksInWeekYear(year, minDaysInFirstWeek, startOfWeek)) {
        weekYear = year + 1;
        weekNumber = 1;
      } else {
        weekYear = year;
      }
      return {
        weekYear,
        weekNumber,
        weekday,
        ...timeObject(gregObj)
      };
    }
    function weekToGregorian(weekData, minDaysInFirstWeek = 4, startOfWeek = 1) {
      const {
        weekYear,
        weekNumber,
        weekday
      } = weekData, weekdayOfJan4 = isoWeekdayToLocal(dayOfWeek(weekYear, 1, minDaysInFirstWeek), startOfWeek), yearInDays = daysInYear(weekYear);
      let ordinal = weekNumber * 7 + weekday - weekdayOfJan4 - 7 + minDaysInFirstWeek, year;
      if (ordinal < 1) {
        year = weekYear - 1;
        ordinal += daysInYear(year);
      } else if (ordinal > yearInDays) {
        year = weekYear + 1;
        ordinal -= daysInYear(weekYear);
      } else {
        year = weekYear;
      }
      const {
        month,
        day
      } = uncomputeOrdinal(year, ordinal);
      return {
        year,
        month,
        day,
        ...timeObject(weekData)
      };
    }
    function gregorianToOrdinal(gregData) {
      const {
        year,
        month,
        day
      } = gregData;
      const ordinal = computeOrdinal(year, month, day);
      return {
        year,
        ordinal,
        ...timeObject(gregData)
      };
    }
    function ordinalToGregorian(ordinalData) {
      const {
        year,
        ordinal
      } = ordinalData;
      const {
        month,
        day
      } = uncomputeOrdinal(year, ordinal);
      return {
        year,
        month,
        day,
        ...timeObject(ordinalData)
      };
    }
    function usesLocalWeekValues(obj, loc) {
      const hasLocaleWeekData = !isUndefined(obj.localWeekday) || !isUndefined(obj.localWeekNumber) || !isUndefined(obj.localWeekYear);
      if (hasLocaleWeekData) {
        const hasIsoWeekData = !isUndefined(obj.weekday) || !isUndefined(obj.weekNumber) || !isUndefined(obj.weekYear);
        if (hasIsoWeekData) {
          throw new ConflictingSpecificationError("Cannot mix locale-based week fields with ISO-based week fields");
        }
        if (!isUndefined(obj.localWeekday)) obj.weekday = obj.localWeekday;
        if (!isUndefined(obj.localWeekNumber)) obj.weekNumber = obj.localWeekNumber;
        if (!isUndefined(obj.localWeekYear)) obj.weekYear = obj.localWeekYear;
        delete obj.localWeekday;
        delete obj.localWeekNumber;
        delete obj.localWeekYear;
        return {
          minDaysInFirstWeek: loc.getMinDaysInFirstWeek(),
          startOfWeek: loc.getStartOfWeek()
        };
      } else {
        return {
          minDaysInFirstWeek: 4,
          startOfWeek: 1
        };
      }
    }
    function hasInvalidWeekData(obj, minDaysInFirstWeek = 4, startOfWeek = 1) {
      const validYear = isInteger(obj.weekYear), validWeek = integerBetween(obj.weekNumber, 1, weeksInWeekYear(obj.weekYear, minDaysInFirstWeek, startOfWeek)), validWeekday = integerBetween(obj.weekday, 1, 7);
      if (!validYear) {
        return unitOutOfRange("weekYear", obj.weekYear);
      } else if (!validWeek) {
        return unitOutOfRange("week", obj.weekNumber);
      } else if (!validWeekday) {
        return unitOutOfRange("weekday", obj.weekday);
      } else return false;
    }
    function hasInvalidOrdinalData(obj) {
      const validYear = isInteger(obj.year), validOrdinal = integerBetween(obj.ordinal, 1, daysInYear(obj.year));
      if (!validYear) {
        return unitOutOfRange("year", obj.year);
      } else if (!validOrdinal) {
        return unitOutOfRange("ordinal", obj.ordinal);
      } else return false;
    }
    function hasInvalidGregorianData(obj) {
      const validYear = isInteger(obj.year), validMonth = integerBetween(obj.month, 1, 12), validDay = integerBetween(obj.day, 1, daysInMonth(obj.year, obj.month));
      if (!validYear) {
        return unitOutOfRange("year", obj.year);
      } else if (!validMonth) {
        return unitOutOfRange("month", obj.month);
      } else if (!validDay) {
        return unitOutOfRange("day", obj.day);
      } else return false;
    }
    function hasInvalidTimeData(obj) {
      const {
        hour,
        minute,
        second,
        millisecond
      } = obj;
      const validHour = integerBetween(hour, 0, 23) || hour === 24 && minute === 0 && second === 0 && millisecond === 0, validMinute = integerBetween(minute, 0, 59), validSecond = integerBetween(second, 0, 59), validMillisecond = integerBetween(millisecond, 0, 999);
      if (!validHour) {
        return unitOutOfRange("hour", hour);
      } else if (!validMinute) {
        return unitOutOfRange("minute", minute);
      } else if (!validSecond) {
        return unitOutOfRange("second", second);
      } else if (!validMillisecond) {
        return unitOutOfRange("millisecond", millisecond);
      } else return false;
    }
    function isUndefined(o) {
      return typeof o === "undefined";
    }
    function isNumber(o) {
      return typeof o === "number";
    }
    function isInteger(o) {
      return typeof o === "number" && o % 1 === 0;
    }
    function isString(o) {
      return typeof o === "string";
    }
    function isDate(o) {
      return Object.prototype.toString.call(o) === "[object Date]";
    }
    function hasRelative() {
      try {
        return typeof Intl !== "undefined" && !!Intl.RelativeTimeFormat;
      } catch (e) {
        return false;
      }
    }
    function hasLocaleWeekInfo() {
      try {
        return typeof Intl !== "undefined" && !!Intl.Locale && ("weekInfo" in Intl.Locale.prototype || "getWeekInfo" in Intl.Locale.prototype);
      } catch (e) {
        return false;
      }
    }
    function maybeArray(thing) {
      return Array.isArray(thing) ? thing : [thing];
    }
    function bestBy(arr, by, compare) {
      if (arr.length === 0) {
        return void 0;
      }
      return arr.reduce((best, next) => {
        const pair = [by(next), next];
        if (!best) {
          return pair;
        } else if (compare(best[0], pair[0]) === best[0]) {
          return best;
        } else {
          return pair;
        }
      }, null)[1];
    }
    function pick(obj, keys) {
      return keys.reduce((a, k) => {
        a[k] = obj[k];
        return a;
      }, {});
    }
    function hasOwnProperty(obj, prop) {
      return Object.prototype.hasOwnProperty.call(obj, prop);
    }
    function validateWeekSettings(settings) {
      if (settings == null) {
        return null;
      } else if (typeof settings !== "object") {
        throw new InvalidArgumentError("Week settings must be an object");
      } else {
        if (!integerBetween(settings.firstDay, 1, 7) || !integerBetween(settings.minimalDays, 1, 7) || !Array.isArray(settings.weekend) || settings.weekend.some((v) => !integerBetween(v, 1, 7))) {
          throw new InvalidArgumentError("Invalid week settings");
        }
        return {
          firstDay: settings.firstDay,
          minimalDays: settings.minimalDays,
          weekend: Array.from(settings.weekend)
        };
      }
    }
    function integerBetween(thing, bottom, top) {
      return isInteger(thing) && thing >= bottom && thing <= top;
    }
    function floorMod(x, n2) {
      return x - n2 * Math.floor(x / n2);
    }
    function padStart(input, n2 = 2) {
      const isNeg = input < 0;
      let padded;
      if (isNeg) {
        padded = "-" + ("" + -input).padStart(n2, "0");
      } else {
        padded = ("" + input).padStart(n2, "0");
      }
      return padded;
    }
    function parseInteger(string) {
      if (isUndefined(string) || string === null || string === "") {
        return void 0;
      } else {
        return parseInt(string, 10);
      }
    }
    function parseFloating(string) {
      if (isUndefined(string) || string === null || string === "") {
        return void 0;
      } else {
        return parseFloat(string);
      }
    }
    function parseMillis(fraction) {
      if (isUndefined(fraction) || fraction === null || fraction === "") {
        return void 0;
      } else {
        const f = parseFloat("0." + fraction) * 1e3;
        return Math.floor(f);
      }
    }
    function roundTo(number, digits, rounding = "round") {
      const factor = 10 ** digits;
      switch (rounding) {
        case "expand":
          return number > 0 ? Math.ceil(number * factor) / factor : Math.floor(number * factor) / factor;
        case "trunc":
          return Math.trunc(number * factor) / factor;
        case "round":
          return Math.round(number * factor) / factor;
        case "floor":
          return Math.floor(number * factor) / factor;
        case "ceil":
          return Math.ceil(number * factor) / factor;
        default:
          throw new RangeError(`Value rounding ${rounding} is out of range`);
      }
    }
    function isLeapYear(year) {
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    }
    function daysInYear(year) {
      return isLeapYear(year) ? 366 : 365;
    }
    function daysInMonth(year, month) {
      const modMonth = floorMod(month - 1, 12) + 1, modYear = year + (month - modMonth) / 12;
      if (modMonth === 2) {
        return isLeapYear(modYear) ? 29 : 28;
      } else {
        return [31, null, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][modMonth - 1];
      }
    }
    function objToLocalTS(obj) {
      let d = Date.UTC(obj.year, obj.month - 1, obj.day, obj.hour, obj.minute, obj.second, obj.millisecond);
      if (obj.year < 100 && obj.year >= 0) {
        d = new Date(d);
        d.setUTCFullYear(obj.year, obj.month - 1, obj.day);
      }
      return +d;
    }
    function firstWeekOffset(year, minDaysInFirstWeek, startOfWeek) {
      const fwdlw = isoWeekdayToLocal(dayOfWeek(year, 1, minDaysInFirstWeek), startOfWeek);
      return -fwdlw + minDaysInFirstWeek - 1;
    }
    function weeksInWeekYear(weekYear, minDaysInFirstWeek = 4, startOfWeek = 1) {
      const weekOffset = firstWeekOffset(weekYear, minDaysInFirstWeek, startOfWeek);
      const weekOffsetNext = firstWeekOffset(weekYear + 1, minDaysInFirstWeek, startOfWeek);
      return (daysInYear(weekYear) - weekOffset + weekOffsetNext) / 7;
    }
    function untruncateYear(year) {
      if (year > 99) {
        return year;
      } else return year > Settings.twoDigitCutoffYear ? 1900 + year : 2e3 + year;
    }
    function parseZoneInfo(ts, offsetFormat, locale, timeZone = null) {
      const date = new Date(ts), intlOpts = {
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      };
      if (timeZone) {
        intlOpts.timeZone = timeZone;
      }
      const modified = {
        timeZoneName: offsetFormat,
        ...intlOpts
      };
      const parsed = new Intl.DateTimeFormat(locale, modified).formatToParts(date).find((m) => m.type.toLowerCase() === "timezonename");
      return parsed ? parsed.value : null;
    }
    function signedOffset(offHourStr, offMinuteStr) {
      let offHour = parseInt(offHourStr, 10);
      if (Number.isNaN(offHour)) {
        offHour = 0;
      }
      const offMin = parseInt(offMinuteStr, 10) || 0, offMinSigned = offHour < 0 || Object.is(offHour, -0) ? -offMin : offMin;
      return offHour * 60 + offMinSigned;
    }
    function asNumber(value) {
      const numericValue = Number(value);
      if (typeof value === "boolean" || value === "" || !Number.isFinite(numericValue)) throw new InvalidArgumentError(`Invalid unit value ${value}`);
      return numericValue;
    }
    function normalizeObject(obj, normalizer) {
      const normalized = {};
      for (const u in obj) {
        if (hasOwnProperty(obj, u)) {
          const v = obj[u];
          if (v === void 0 || v === null) continue;
          normalized[normalizer(u)] = asNumber(v);
        }
      }
      return normalized;
    }
    function formatOffset(offset2, format) {
      const hours = Math.trunc(Math.abs(offset2 / 60)), minutes = Math.trunc(Math.abs(offset2 % 60)), sign = offset2 >= 0 ? "+" : "-";
      switch (format) {
        case "short":
          return `${sign}${padStart(hours, 2)}:${padStart(minutes, 2)}`;
        case "narrow":
          return `${sign}${hours}${minutes > 0 ? `:${minutes}` : ""}`;
        case "techie":
          return `${sign}${padStart(hours, 2)}${padStart(minutes, 2)}`;
        default:
          throw new RangeError(`Value format ${format} is out of range for property format`);
      }
    }
    function timeObject(obj) {
      return pick(obj, ["hour", "minute", "second", "millisecond"]);
    }
    var monthsLong = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var monthsNarrow = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
    function months(length) {
      switch (length) {
        case "narrow":
          return [...monthsNarrow];
        case "short":
          return [...monthsShort];
        case "long":
          return [...monthsLong];
        case "numeric":
          return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
        case "2-digit":
          return ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
        default:
          return null;
      }
    }
    var weekdaysLong = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    var weekdaysShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var weekdaysNarrow = ["M", "T", "W", "T", "F", "S", "S"];
    function weekdays(length) {
      switch (length) {
        case "narrow":
          return [...weekdaysNarrow];
        case "short":
          return [...weekdaysShort];
        case "long":
          return [...weekdaysLong];
        case "numeric":
          return ["1", "2", "3", "4", "5", "6", "7"];
        default:
          return null;
      }
    }
    var meridiems = ["AM", "PM"];
    var erasLong = ["Before Christ", "Anno Domini"];
    var erasShort = ["BC", "AD"];
    var erasNarrow = ["B", "A"];
    function eras(length) {
      switch (length) {
        case "narrow":
          return [...erasNarrow];
        case "short":
          return [...erasShort];
        case "long":
          return [...erasLong];
        default:
          return null;
      }
    }
    function meridiemForDateTime(dt) {
      return meridiems[dt.hour < 12 ? 0 : 1];
    }
    function weekdayForDateTime(dt, length) {
      return weekdays(length)[dt.weekday - 1];
    }
    function monthForDateTime(dt, length) {
      return months(length)[dt.month - 1];
    }
    function eraForDateTime(dt, length) {
      return eras(length)[dt.year < 0 ? 0 : 1];
    }
    function formatRelativeTime(unit, count, numeric = "always", narrow = false) {
      const units = {
        years: ["year", "yr."],
        quarters: ["quarter", "qtr."],
        months: ["month", "mo."],
        weeks: ["week", "wk."],
        days: ["day", "day", "days"],
        hours: ["hour", "hr."],
        minutes: ["minute", "min."],
        seconds: ["second", "sec."]
      };
      const lastable = ["hours", "minutes", "seconds"].indexOf(unit) === -1;
      if (numeric === "auto" && lastable) {
        const isDay = unit === "days";
        switch (count) {
          case 1:
            return isDay ? "tomorrow" : `next ${units[unit][0]}`;
          case -1:
            return isDay ? "yesterday" : `last ${units[unit][0]}`;
          case 0:
            return isDay ? "today" : `this ${units[unit][0]}`;
        }
      }
      const isInPast = Object.is(count, -0) || count < 0, fmtValue = Math.abs(count), singular = fmtValue === 1, lilUnits = units[unit], fmtUnit = narrow ? singular ? lilUnits[1] : lilUnits[2] || lilUnits[1] : singular ? units[unit][0] : unit;
      return isInPast ? `${fmtValue} ${fmtUnit} ago` : `in ${fmtValue} ${fmtUnit}`;
    }
    function stringifyTokens(splits, tokenToString) {
      let s2 = "";
      for (const token of splits) {
        if (token.literal) {
          s2 += token.val;
        } else {
          s2 += tokenToString(token.val);
        }
      }
      return s2;
    }
    var macroTokenToFormatOpts = {
      D: DATE_SHORT,
      DD: DATE_MED,
      DDD: DATE_FULL,
      DDDD: DATE_HUGE,
      t: TIME_SIMPLE,
      tt: TIME_WITH_SECONDS,
      ttt: TIME_WITH_SHORT_OFFSET,
      tttt: TIME_WITH_LONG_OFFSET,
      T: TIME_24_SIMPLE,
      TT: TIME_24_WITH_SECONDS,
      TTT: TIME_24_WITH_SHORT_OFFSET,
      TTTT: TIME_24_WITH_LONG_OFFSET,
      f: DATETIME_SHORT,
      ff: DATETIME_MED,
      fff: DATETIME_FULL,
      ffff: DATETIME_HUGE,
      F: DATETIME_SHORT_WITH_SECONDS,
      FF: DATETIME_MED_WITH_SECONDS,
      FFF: DATETIME_FULL_WITH_SECONDS,
      FFFF: DATETIME_HUGE_WITH_SECONDS
    };
    var Formatter = class _Formatter {
      static create(locale, opts = {}) {
        return new _Formatter(locale, opts);
      }
      static parseFormat(fmt) {
        let current = null, currentFull = "", bracketed = false;
        const splits = [];
        for (let i = 0; i < fmt.length; i++) {
          const c = fmt.charAt(i);
          if (c === "'") {
            if (currentFull.length > 0 || bracketed) {
              splits.push({
                literal: bracketed || /^\s+$/.test(currentFull),
                val: currentFull === "" ? "'" : currentFull
              });
            }
            current = null;
            currentFull = "";
            bracketed = !bracketed;
          } else if (bracketed) {
            currentFull += c;
          } else if (c === current) {
            currentFull += c;
          } else {
            if (currentFull.length > 0) {
              splits.push({
                literal: /^\s+$/.test(currentFull),
                val: currentFull
              });
            }
            currentFull = c;
            current = c;
          }
        }
        if (currentFull.length > 0) {
          splits.push({
            literal: bracketed || /^\s+$/.test(currentFull),
            val: currentFull
          });
        }
        return splits;
      }
      static macroTokenToFormatOpts(token) {
        return macroTokenToFormatOpts[token];
      }
      constructor(locale, formatOpts) {
        this.opts = formatOpts;
        this.loc = locale;
        this.systemLoc = null;
      }
      formatWithSystemDefault(dt, opts) {
        if (this.systemLoc === null) {
          this.systemLoc = this.loc.redefaultToSystem();
        }
        const df = this.systemLoc.dtFormatter(dt, {
          ...this.opts,
          ...opts
        });
        return df.format();
      }
      dtFormatter(dt, opts = {}) {
        return this.loc.dtFormatter(dt, {
          ...this.opts,
          ...opts
        });
      }
      formatDateTime(dt, opts) {
        return this.dtFormatter(dt, opts).format();
      }
      formatDateTimeParts(dt, opts) {
        return this.dtFormatter(dt, opts).formatToParts();
      }
      formatInterval(interval, opts) {
        const df = this.dtFormatter(interval.start, opts);
        return df.dtf.formatRange(interval.start.toJSDate(), interval.end.toJSDate());
      }
      resolvedOptions(dt, opts) {
        return this.dtFormatter(dt, opts).resolvedOptions();
      }
      num(n2, p = 0, signDisplay = void 0) {
        if (this.opts.forceSimple) {
          return padStart(n2, p);
        }
        const opts = {
          ...this.opts
        };
        if (p > 0) {
          opts.padTo = p;
        }
        if (signDisplay) {
          opts.signDisplay = signDisplay;
        }
        return this.loc.numberFormatter(opts).format(n2);
      }
      formatDateTimeFromString(dt, fmt) {
        const knownEnglish = this.loc.listingMode() === "en", useDateTimeFormatter = this.loc.outputCalendar && this.loc.outputCalendar !== "gregory", string = (opts, extract) => this.loc.extract(dt, opts, extract), formatOffset2 = (opts) => {
          if (dt.isOffsetFixed && dt.offset === 0 && opts.allowZ) {
            return "Z";
          }
          return dt.isValid ? dt.zone.formatOffset(dt.ts, opts.format) : "";
        }, meridiem = () => knownEnglish ? meridiemForDateTime(dt) : string({
          hour: "numeric",
          hourCycle: "h12"
        }, "dayperiod"), month = (length, standalone) => knownEnglish ? monthForDateTime(dt, length) : string(standalone ? {
          month: length
        } : {
          month: length,
          day: "numeric"
        }, "month"), weekday = (length, standalone) => knownEnglish ? weekdayForDateTime(dt, length) : string(standalone ? {
          weekday: length
        } : {
          weekday: length,
          month: "long",
          day: "numeric"
        }, "weekday"), maybeMacro = (token) => {
          const formatOpts = _Formatter.macroTokenToFormatOpts(token);
          if (formatOpts) {
            return this.formatWithSystemDefault(dt, formatOpts);
          } else {
            return token;
          }
        }, era = (length) => knownEnglish ? eraForDateTime(dt, length) : string({
          era: length
        }, "era"), tokenToString = (token) => {
          switch (token) {
            // ms
            case "S":
              return this.num(dt.millisecond);
            case "u":
            // falls through
            case "SSS":
              return this.num(dt.millisecond, 3);
            // seconds
            case "s":
              return this.num(dt.second);
            case "ss":
              return this.num(dt.second, 2);
            // fractional seconds
            case "uu":
              return this.num(Math.floor(dt.millisecond / 10), 2);
            case "uuu":
              return this.num(Math.floor(dt.millisecond / 100));
            // minutes
            case "m":
              return this.num(dt.minute);
            case "mm":
              return this.num(dt.minute, 2);
            // hours
            case "h":
              return this.num(dt.hour % 12 === 0 ? 12 : dt.hour % 12);
            case "hh":
              return this.num(dt.hour % 12 === 0 ? 12 : dt.hour % 12, 2);
            case "H":
              return this.num(dt.hour);
            case "HH":
              return this.num(dt.hour, 2);
            // offset
            case "Z":
              return formatOffset2({
                format: "narrow",
                allowZ: this.opts.allowZ
              });
            case "ZZ":
              return formatOffset2({
                format: "short",
                allowZ: this.opts.allowZ
              });
            case "ZZZ":
              return formatOffset2({
                format: "techie",
                allowZ: this.opts.allowZ
              });
            case "ZZZZ":
              return dt.zone.offsetName(dt.ts, {
                format: "short",
                locale: this.loc.locale
              });
            case "ZZZZZ":
              return dt.zone.offsetName(dt.ts, {
                format: "long",
                locale: this.loc.locale
              });
            // zone
            case "z":
              return dt.zoneName;
            // meridiems
            case "a":
              return meridiem();
            // dates
            case "d":
              return useDateTimeFormatter ? string({
                day: "numeric"
              }, "day") : this.num(dt.day);
            case "dd":
              return useDateTimeFormatter ? string({
                day: "2-digit"
              }, "day") : this.num(dt.day, 2);
            // weekdays - standalone
            case "c":
              return this.num(dt.weekday);
            case "ccc":
              return weekday("short", true);
            case "cccc":
              return weekday("long", true);
            case "ccccc":
              return weekday("narrow", true);
            // weekdays - format
            case "E":
              return this.num(dt.weekday);
            case "EEE":
              return weekday("short", false);
            case "EEEE":
              return weekday("long", false);
            case "EEEEE":
              return weekday("narrow", false);
            // months - standalone
            case "L":
              return useDateTimeFormatter ? string({
                month: "numeric",
                day: "numeric"
              }, "month") : this.num(dt.month);
            case "LL":
              return useDateTimeFormatter ? string({
                month: "2-digit",
                day: "numeric"
              }, "month") : this.num(dt.month, 2);
            case "LLL":
              return month("short", true);
            case "LLLL":
              return month("long", true);
            case "LLLLL":
              return month("narrow", true);
            // months - format
            case "M":
              return useDateTimeFormatter ? string({
                month: "numeric"
              }, "month") : this.num(dt.month);
            case "MM":
              return useDateTimeFormatter ? string({
                month: "2-digit"
              }, "month") : this.num(dt.month, 2);
            case "MMM":
              return month("short", false);
            case "MMMM":
              return month("long", false);
            case "MMMMM":
              return month("narrow", false);
            // years
            case "y":
              return useDateTimeFormatter ? string({
                year: "numeric"
              }, "year") : this.num(dt.year);
            case "yy":
              return useDateTimeFormatter ? string({
                year: "2-digit"
              }, "year") : this.num(dt.year.toString().slice(-2), 2);
            case "yyyy":
              return useDateTimeFormatter ? string({
                year: "numeric"
              }, "year") : this.num(dt.year, 4);
            case "yyyyyy":
              return useDateTimeFormatter ? string({
                year: "numeric"
              }, "year") : this.num(dt.year, 6);
            // eras
            case "G":
              return era("short");
            case "GG":
              return era("long");
            case "GGGGG":
              return era("narrow");
            case "kk":
              return this.num(dt.weekYear.toString().slice(-2), 2);
            case "kkkk":
              return this.num(dt.weekYear, 4);
            case "W":
              return this.num(dt.weekNumber);
            case "WW":
              return this.num(dt.weekNumber, 2);
            case "n":
              return this.num(dt.localWeekNumber);
            case "nn":
              return this.num(dt.localWeekNumber, 2);
            case "ii":
              return this.num(dt.localWeekYear.toString().slice(-2), 2);
            case "iiii":
              return this.num(dt.localWeekYear, 4);
            case "o":
              return this.num(dt.ordinal);
            case "ooo":
              return this.num(dt.ordinal, 3);
            case "q":
              return this.num(dt.quarter);
            case "qq":
              return this.num(dt.quarter, 2);
            case "X":
              return this.num(Math.floor(dt.ts / 1e3));
            case "x":
              return this.num(dt.ts);
            default:
              return maybeMacro(token);
          }
        };
        return stringifyTokens(_Formatter.parseFormat(fmt), tokenToString);
      }
      formatDurationFromString(dur, fmt) {
        const invertLargest = this.opts.signMode === "negativeLargestOnly" ? -1 : 1;
        const tokenToField = (token) => {
          switch (token[0]) {
            case "S":
              return "milliseconds";
            case "s":
              return "seconds";
            case "m":
              return "minutes";
            case "h":
              return "hours";
            case "d":
              return "days";
            case "w":
              return "weeks";
            case "M":
              return "months";
            case "y":
              return "years";
            default:
              return null;
          }
        }, tokenToString = (lildur, info) => (token) => {
          const mapped = tokenToField(token);
          if (mapped) {
            const inversionFactor = info.isNegativeDuration && mapped !== info.largestUnit ? invertLargest : 1;
            let signDisplay;
            if (this.opts.signMode === "negativeLargestOnly" && mapped !== info.largestUnit) {
              signDisplay = "never";
            } else if (this.opts.signMode === "all") {
              signDisplay = "always";
            } else {
              signDisplay = "auto";
            }
            return this.num(lildur.get(mapped) * inversionFactor, token.length, signDisplay);
          } else {
            return token;
          }
        }, tokens = _Formatter.parseFormat(fmt), realTokens = tokens.reduce((found, {
          literal,
          val
        }) => literal ? found : found.concat(val), []), collapsed = dur.shiftTo(...realTokens.map(tokenToField).filter((t) => t)), durationInfo = {
          isNegativeDuration: collapsed < 0,
          // this relies on "collapsed" being based on "shiftTo", which builds up the object
          // in order
          largestUnit: Object.keys(collapsed.values)[0]
        };
        return stringifyTokens(tokens, tokenToString(collapsed, durationInfo));
      }
    };
    var ianaRegex = /[A-Za-z_+-]{1,256}(?::?\/[A-Za-z0-9_+-]{1,256}(?:\/[A-Za-z0-9_+-]{1,256})?)?/;
    function combineRegexes(...regexes) {
      const full = regexes.reduce((f, r) => f + r.source, "");
      return RegExp(`^${full}$`);
    }
    function combineExtractors(...extractors) {
      return (m) => extractors.reduce(([mergedVals, mergedZone, cursor], ex) => {
        const [val, zone, next] = ex(m, cursor);
        return [{
          ...mergedVals,
          ...val
        }, zone || mergedZone, next];
      }, [{}, null, 1]).slice(0, 2);
    }
    function parse(s2, ...patterns) {
      if (s2 == null) {
        return [null, null];
      }
      for (const [regex, extractor] of patterns) {
        const m = regex.exec(s2);
        if (m) {
          return extractor(m);
        }
      }
      return [null, null];
    }
    function simpleParse(...keys) {
      return (match2, cursor) => {
        const ret = {};
        let i;
        for (i = 0; i < keys.length; i++) {
          ret[keys[i]] = parseInteger(match2[cursor + i]);
        }
        return [ret, null, cursor + i];
      };
    }
    var offsetRegex = /(?:([Zz])|([+-]\d\d)(?::?(\d\d))?)/;
    var isoExtendedZone = `(?:${offsetRegex.source}?(?:\\[(${ianaRegex.source})\\])?)?`;
    var isoTimeBaseRegex = /(\d\d)(?::?(\d\d)(?::?(\d\d)(?:[.,](\d{1,30}))?)?)?/;
    var isoTimeRegex = RegExp(`${isoTimeBaseRegex.source}${isoExtendedZone}`);
    var isoTimeExtensionRegex = RegExp(`(?:[Tt]${isoTimeRegex.source})?`);
    var isoYmdRegex = /([+-]\d{6}|\d{4})(?:-?(\d\d)(?:-?(\d\d))?)?/;
    var isoWeekRegex = /(\d{4})-?W(\d\d)(?:-?(\d))?/;
    var isoOrdinalRegex = /(\d{4})-?(\d{3})/;
    var extractISOWeekData = simpleParse("weekYear", "weekNumber", "weekDay");
    var extractISOOrdinalData = simpleParse("year", "ordinal");
    var sqlYmdRegex = /(\d{4})-(\d\d)-(\d\d)/;
    var sqlTimeRegex = RegExp(`${isoTimeBaseRegex.source} ?(?:${offsetRegex.source}|(${ianaRegex.source}))?`);
    var sqlTimeExtensionRegex = RegExp(`(?: ${sqlTimeRegex.source})?`);
    function int(match2, pos, fallback) {
      const m = match2[pos];
      return isUndefined(m) ? fallback : parseInteger(m);
    }
    function extractISOYmd(match2, cursor) {
      const item = {
        year: int(match2, cursor),
        month: int(match2, cursor + 1, 1),
        day: int(match2, cursor + 2, 1)
      };
      return [item, null, cursor + 3];
    }
    function extractISOTime(match2, cursor) {
      const item = {
        hours: int(match2, cursor, 0),
        minutes: int(match2, cursor + 1, 0),
        seconds: int(match2, cursor + 2, 0),
        milliseconds: parseMillis(match2[cursor + 3])
      };
      return [item, null, cursor + 4];
    }
    function extractISOOffset(match2, cursor) {
      const local = !match2[cursor] && !match2[cursor + 1], fullOffset = signedOffset(match2[cursor + 1], match2[cursor + 2]), zone = local ? null : FixedOffsetZone.instance(fullOffset);
      return [{}, zone, cursor + 3];
    }
    function extractIANAZone(match2, cursor) {
      const zone = match2[cursor] ? IANAZone.create(match2[cursor]) : null;
      return [{}, zone, cursor + 1];
    }
    var isoTimeOnly = RegExp(`^T?${isoTimeBaseRegex.source}$`);
    var isoDuration = /^-?P(?:(?:(-?\d{1,20}(?:\.\d{1,20})?)Y)?(?:(-?\d{1,20}(?:\.\d{1,20})?)M)?(?:(-?\d{1,20}(?:\.\d{1,20})?)W)?(?:(-?\d{1,20}(?:\.\d{1,20})?)D)?(?:T(?:(-?\d{1,20}(?:\.\d{1,20})?)H)?(?:(-?\d{1,20}(?:\.\d{1,20})?)M)?(?:(-?\d{1,20})(?:[.,](-?\d{1,20}))?S)?)?)$/;
    function extractISODuration(match2) {
      const [s2, yearStr, monthStr, weekStr, dayStr, hourStr, minuteStr, secondStr, millisecondsStr] = match2;
      const hasNegativePrefix = s2[0] === "-";
      const negativeSeconds = secondStr && secondStr[0] === "-";
      const maybeNegate = (num, force = false) => num !== void 0 && (force || num && hasNegativePrefix) ? -num : num;
      return [{
        years: maybeNegate(parseFloating(yearStr)),
        months: maybeNegate(parseFloating(monthStr)),
        weeks: maybeNegate(parseFloating(weekStr)),
        days: maybeNegate(parseFloating(dayStr)),
        hours: maybeNegate(parseFloating(hourStr)),
        minutes: maybeNegate(parseFloating(minuteStr)),
        seconds: maybeNegate(parseFloating(secondStr), secondStr === "-0"),
        milliseconds: maybeNegate(parseMillis(millisecondsStr), negativeSeconds)
      }];
    }
    var obsOffsets = {
      GMT: 0,
      EDT: -4 * 60,
      EST: -5 * 60,
      CDT: -5 * 60,
      CST: -6 * 60,
      MDT: -6 * 60,
      MST: -7 * 60,
      PDT: -7 * 60,
      PST: -8 * 60
    };
    function fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr) {
      const result = {
        year: yearStr.length === 2 ? untruncateYear(parseInteger(yearStr)) : parseInteger(yearStr),
        month: monthsShort.indexOf(monthStr) + 1,
        day: parseInteger(dayStr),
        hour: parseInteger(hourStr),
        minute: parseInteger(minuteStr)
      };
      if (secondStr) result.second = parseInteger(secondStr);
      if (weekdayStr) {
        result.weekday = weekdayStr.length > 3 ? weekdaysLong.indexOf(weekdayStr) + 1 : weekdaysShort.indexOf(weekdayStr) + 1;
      }
      return result;
    }
    var rfc2822 = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s)?(\d{1,2})\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(\d{2,4})\s(\d\d):(\d\d)(?::(\d\d))?\s(?:(UT|GMT|[ECMP][SD]T)|([Zz])|(?:([+-]\d\d)(\d\d)))$/;
    function extractRFC2822(match2) {
      const [, weekdayStr, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr, obsOffset, milOffset, offHourStr, offMinuteStr] = match2, result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);
      let offset2;
      if (obsOffset) {
        offset2 = obsOffsets[obsOffset];
      } else if (milOffset) {
        offset2 = 0;
      } else {
        offset2 = signedOffset(offHourStr, offMinuteStr);
      }
      return [result, new FixedOffsetZone(offset2)];
    }
    function preprocessRFC2822(s2) {
      return s2.replace(/\([^()]*\)|[\n\t]/g, " ").replace(/(\s\s+)/g, " ").trim();
    }
    var rfc1123 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d\d) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d\d):(\d\d):(\d\d) GMT$/;
    var rfc850 = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d\d)-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d\d) (\d\d):(\d\d):(\d\d) GMT$/;
    var ascii = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( \d|\d\d) (\d\d):(\d\d):(\d\d) (\d{4})$/;
    function extractRFC1123Or850(match2) {
      const [, weekdayStr, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr] = match2, result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);
      return [result, FixedOffsetZone.utcInstance];
    }
    function extractASCII(match2) {
      const [, weekdayStr, monthStr, dayStr, hourStr, minuteStr, secondStr, yearStr] = match2, result = fromStrings(weekdayStr, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr);
      return [result, FixedOffsetZone.utcInstance];
    }
    var isoYmdWithTimeExtensionRegex = combineRegexes(isoYmdRegex, isoTimeExtensionRegex);
    var isoWeekWithTimeExtensionRegex = combineRegexes(isoWeekRegex, isoTimeExtensionRegex);
    var isoOrdinalWithTimeExtensionRegex = combineRegexes(isoOrdinalRegex, isoTimeExtensionRegex);
    var isoTimeCombinedRegex = combineRegexes(isoTimeRegex);
    var extractISOYmdTimeAndOffset = combineExtractors(extractISOYmd, extractISOTime, extractISOOffset, extractIANAZone);
    var extractISOWeekTimeAndOffset = combineExtractors(extractISOWeekData, extractISOTime, extractISOOffset, extractIANAZone);
    var extractISOOrdinalDateAndTime = combineExtractors(extractISOOrdinalData, extractISOTime, extractISOOffset, extractIANAZone);
    var extractISOTimeAndOffset = combineExtractors(extractISOTime, extractISOOffset, extractIANAZone);
    function parseISODate(s2) {
      return parse(s2, [isoYmdWithTimeExtensionRegex, extractISOYmdTimeAndOffset], [isoWeekWithTimeExtensionRegex, extractISOWeekTimeAndOffset], [isoOrdinalWithTimeExtensionRegex, extractISOOrdinalDateAndTime], [isoTimeCombinedRegex, extractISOTimeAndOffset]);
    }
    function parseRFC2822Date(s2) {
      return parse(preprocessRFC2822(s2), [rfc2822, extractRFC2822]);
    }
    function parseHTTPDate(s2) {
      return parse(s2, [rfc1123, extractRFC1123Or850], [rfc850, extractRFC1123Or850], [ascii, extractASCII]);
    }
    function parseISODuration(s2) {
      return parse(s2, [isoDuration, extractISODuration]);
    }
    var extractISOTimeOnly = combineExtractors(extractISOTime);
    function parseISOTimeOnly(s2) {
      return parse(s2, [isoTimeOnly, extractISOTimeOnly]);
    }
    var sqlYmdWithTimeExtensionRegex = combineRegexes(sqlYmdRegex, sqlTimeExtensionRegex);
    var sqlTimeCombinedRegex = combineRegexes(sqlTimeRegex);
    var extractISOTimeOffsetAndIANAZone = combineExtractors(extractISOTime, extractISOOffset, extractIANAZone);
    function parseSQL(s2) {
      return parse(s2, [sqlYmdWithTimeExtensionRegex, extractISOYmdTimeAndOffset], [sqlTimeCombinedRegex, extractISOTimeOffsetAndIANAZone]);
    }
    var INVALID$2 = "Invalid Duration";
    var lowOrderMatrix = {
      weeks: {
        days: 7,
        hours: 7 * 24,
        minutes: 7 * 24 * 60,
        seconds: 7 * 24 * 60 * 60,
        milliseconds: 7 * 24 * 60 * 60 * 1e3
      },
      days: {
        hours: 24,
        minutes: 24 * 60,
        seconds: 24 * 60 * 60,
        milliseconds: 24 * 60 * 60 * 1e3
      },
      hours: {
        minutes: 60,
        seconds: 60 * 60,
        milliseconds: 60 * 60 * 1e3
      },
      minutes: {
        seconds: 60,
        milliseconds: 60 * 1e3
      },
      seconds: {
        milliseconds: 1e3
      }
    };
    var casualMatrix = {
      years: {
        quarters: 4,
        months: 12,
        weeks: 52,
        days: 365,
        hours: 365 * 24,
        minutes: 365 * 24 * 60,
        seconds: 365 * 24 * 60 * 60,
        milliseconds: 365 * 24 * 60 * 60 * 1e3
      },
      quarters: {
        months: 3,
        weeks: 13,
        days: 91,
        hours: 91 * 24,
        minutes: 91 * 24 * 60,
        seconds: 91 * 24 * 60 * 60,
        milliseconds: 91 * 24 * 60 * 60 * 1e3
      },
      months: {
        weeks: 4,
        days: 30,
        hours: 30 * 24,
        minutes: 30 * 24 * 60,
        seconds: 30 * 24 * 60 * 60,
        milliseconds: 30 * 24 * 60 * 60 * 1e3
      },
      ...lowOrderMatrix
    };
    var daysInYearAccurate = 146097 / 400;
    var daysInMonthAccurate = 146097 / 4800;
    var accurateMatrix = {
      years: {
        quarters: 4,
        months: 12,
        weeks: daysInYearAccurate / 7,
        days: daysInYearAccurate,
        hours: daysInYearAccurate * 24,
        minutes: daysInYearAccurate * 24 * 60,
        seconds: daysInYearAccurate * 24 * 60 * 60,
        milliseconds: daysInYearAccurate * 24 * 60 * 60 * 1e3
      },
      quarters: {
        months: 3,
        weeks: daysInYearAccurate / 28,
        days: daysInYearAccurate / 4,
        hours: daysInYearAccurate * 24 / 4,
        minutes: daysInYearAccurate * 24 * 60 / 4,
        seconds: daysInYearAccurate * 24 * 60 * 60 / 4,
        milliseconds: daysInYearAccurate * 24 * 60 * 60 * 1e3 / 4
      },
      months: {
        weeks: daysInMonthAccurate / 7,
        days: daysInMonthAccurate,
        hours: daysInMonthAccurate * 24,
        minutes: daysInMonthAccurate * 24 * 60,
        seconds: daysInMonthAccurate * 24 * 60 * 60,
        milliseconds: daysInMonthAccurate * 24 * 60 * 60 * 1e3
      },
      ...lowOrderMatrix
    };
    var orderedUnits$1 = ["years", "quarters", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds"];
    var reverseUnits = orderedUnits$1.slice(0).reverse();
    function clone$1(dur, alts, clear = false) {
      const conf = {
        values: clear ? alts.values : {
          ...dur.values,
          ...alts.values || {}
        },
        loc: dur.loc.clone(alts.loc),
        conversionAccuracy: alts.conversionAccuracy || dur.conversionAccuracy,
        matrix: alts.matrix || dur.matrix
      };
      return new Duration(conf);
    }
    function durationToMillis(matrix, vals) {
      var _vals$milliseconds;
      let sum = (_vals$milliseconds = vals.milliseconds) != null ? _vals$milliseconds : 0;
      for (const unit of reverseUnits.slice(1)) {
        if (vals[unit]) {
          sum += vals[unit] * matrix[unit]["milliseconds"];
        }
      }
      return sum;
    }
    function normalizeValues(matrix, vals) {
      const factor = durationToMillis(matrix, vals) < 0 ? -1 : 1;
      orderedUnits$1.reduceRight((previous, current) => {
        if (!isUndefined(vals[current])) {
          if (previous) {
            const previousVal = vals[previous] * factor;
            const conv = matrix[current][previous];
            const rollUp = Math.floor(previousVal / conv);
            vals[current] += rollUp * factor;
            vals[previous] -= rollUp * conv * factor;
          }
          return current;
        } else {
          return previous;
        }
      }, null);
      orderedUnits$1.reduce((previous, current) => {
        if (!isUndefined(vals[current])) {
          if (previous) {
            const fraction = vals[previous] % 1;
            vals[previous] -= fraction;
            vals[current] += fraction * matrix[previous][current];
          }
          return current;
        } else {
          return previous;
        }
      }, null);
    }
    function removeZeroes(vals) {
      const newVals = {};
      for (const [key, value] of Object.entries(vals)) {
        if (value !== 0) {
          newVals[key] = value;
        }
      }
      return newVals;
    }
    var Duration = class _Duration {
      /**
       * @private
       */
      constructor(config2) {
        const accurate = config2.conversionAccuracy === "longterm" || false;
        let matrix = accurate ? accurateMatrix : casualMatrix;
        if (config2.matrix) {
          matrix = config2.matrix;
        }
        this.values = config2.values;
        this.loc = config2.loc || Locale.create();
        this.conversionAccuracy = accurate ? "longterm" : "casual";
        this.invalid = config2.invalid || null;
        this.matrix = matrix;
        this.isLuxonDuration = true;
      }
      /**
       * Create Duration from a number of milliseconds.
       * @param {number} count of milliseconds
       * @param {Object} opts - options for parsing
       * @param {string} [opts.locale='en-US'] - the locale to use
       * @param {string} opts.numberingSystem - the numbering system to use
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @return {Duration}
       */
      static fromMillis(count, opts) {
        return _Duration.fromObject({
          milliseconds: count
        }, opts);
      }
      /**
       * Create a Duration from a JavaScript object with keys like 'years' and 'hours'.
       * If this object is empty then a zero milliseconds duration is returned.
       * @param {Object} obj - the object to create the DateTime from
       * @param {number} obj.years
       * @param {number} obj.quarters
       * @param {number} obj.months
       * @param {number} obj.weeks
       * @param {number} obj.days
       * @param {number} obj.hours
       * @param {number} obj.minutes
       * @param {number} obj.seconds
       * @param {number} obj.milliseconds
       * @param {Object} [opts=[]] - options for creating this Duration
       * @param {string} [opts.locale='en-US'] - the locale to use
       * @param {string} opts.numberingSystem - the numbering system to use
       * @param {string} [opts.conversionAccuracy='casual'] - the preset conversion system to use
       * @param {string} [opts.matrix=Object] - the custom conversion system to use
       * @return {Duration}
       */
      static fromObject(obj, opts = {}) {
        if (obj == null || typeof obj !== "object") {
          throw new InvalidArgumentError(`Duration.fromObject: argument expected to be an object, got ${obj === null ? "null" : typeof obj}`);
        }
        return new _Duration({
          values: normalizeObject(obj, _Duration.normalizeUnit),
          loc: Locale.fromObject(opts),
          conversionAccuracy: opts.conversionAccuracy,
          matrix: opts.matrix
        });
      }
      /**
       * Create a Duration from DurationLike.
       *
       * @param {Object | number | Duration} durationLike
       * One of:
       * - object with keys like 'years' and 'hours'.
       * - number representing milliseconds
       * - Duration instance
       * @return {Duration}
       */
      static fromDurationLike(durationLike) {
        if (isNumber(durationLike)) {
          return _Duration.fromMillis(durationLike);
        } else if (_Duration.isDuration(durationLike)) {
          return durationLike;
        } else if (typeof durationLike === "object") {
          return _Duration.fromObject(durationLike);
        } else {
          throw new InvalidArgumentError(`Unknown duration argument ${durationLike} of type ${typeof durationLike}`);
        }
      }
      /**
       * Create a Duration from an ISO 8601 duration string.
       * @param {string} text - text to parse
       * @param {Object} opts - options for parsing
       * @param {string} [opts.locale='en-US'] - the locale to use
       * @param {string} opts.numberingSystem - the numbering system to use
       * @param {string} [opts.conversionAccuracy='casual'] - the preset conversion system to use
       * @param {string} [opts.matrix=Object] - the preset conversion system to use
       * @see https://en.wikipedia.org/wiki/ISO_8601#Durations
       * @example Duration.fromISO('P3Y6M1W4DT12H30M5S').toObject() //=> { years: 3, months: 6, weeks: 1, days: 4, hours: 12, minutes: 30, seconds: 5 }
       * @example Duration.fromISO('PT23H').toObject() //=> { hours: 23 }
       * @example Duration.fromISO('P5Y3M').toObject() //=> { years: 5, months: 3 }
       * @return {Duration}
       */
      static fromISO(text, opts) {
        const [parsed] = parseISODuration(text);
        if (parsed) {
          return _Duration.fromObject(parsed, opts);
        } else {
          return _Duration.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
        }
      }
      /**
       * Create a Duration from an ISO 8601 time string.
       * @param {string} text - text to parse
       * @param {Object} opts - options for parsing
       * @param {string} [opts.locale='en-US'] - the locale to use
       * @param {string} opts.numberingSystem - the numbering system to use
       * @param {string} [opts.conversionAccuracy='casual'] - the preset conversion system to use
       * @param {string} [opts.matrix=Object] - the conversion system to use
       * @see https://en.wikipedia.org/wiki/ISO_8601#Times
       * @example Duration.fromISOTime('11:22:33.444').toObject() //=> { hours: 11, minutes: 22, seconds: 33, milliseconds: 444 }
       * @example Duration.fromISOTime('11:00').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @example Duration.fromISOTime('T11:00').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @example Duration.fromISOTime('1100').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @example Duration.fromISOTime('T1100').toObject() //=> { hours: 11, minutes: 0, seconds: 0 }
       * @return {Duration}
       */
      static fromISOTime(text, opts) {
        const [parsed] = parseISOTimeOnly(text);
        if (parsed) {
          return _Duration.fromObject(parsed, opts);
        } else {
          return _Duration.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
        }
      }
      /**
       * Create an invalid Duration.
       * @param {string} reason - simple string of why this datetime is invalid. Should not contain parameters or anything else data-dependent
       * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
       * @return {Duration}
       */
      static invalid(reason, explanation = null) {
        if (!reason) {
          throw new InvalidArgumentError("need to specify a reason the Duration is invalid");
        }
        const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);
        if (Settings.throwOnInvalid) {
          throw new InvalidDurationError(invalid);
        } else {
          return new _Duration({
            invalid
          });
        }
      }
      /**
       * @private
       */
      static normalizeUnit(unit) {
        const normalized = {
          year: "years",
          years: "years",
          quarter: "quarters",
          quarters: "quarters",
          month: "months",
          months: "months",
          week: "weeks",
          weeks: "weeks",
          day: "days",
          days: "days",
          hour: "hours",
          hours: "hours",
          minute: "minutes",
          minutes: "minutes",
          second: "seconds",
          seconds: "seconds",
          millisecond: "milliseconds",
          milliseconds: "milliseconds"
        }[unit ? unit.toLowerCase() : unit];
        if (!normalized) throw new InvalidUnitError(unit);
        return normalized;
      }
      /**
       * Check if an object is a Duration. Works across context boundaries
       * @param {object} o
       * @return {boolean}
       */
      static isDuration(o) {
        return o && o.isLuxonDuration || false;
      }
      /**
       * Get  the locale of a Duration, such 'en-GB'
       * @type {string}
       */
      get locale() {
        return this.isValid ? this.loc.locale : null;
      }
      /**
       * Get the numbering system of a Duration, such 'beng'. The numbering system is used when formatting the Duration
       *
       * @type {string}
       */
      get numberingSystem() {
        return this.isValid ? this.loc.numberingSystem : null;
      }
      /**
       * Returns a string representation of this Duration formatted according to the specified format string. You may use these tokens:
       * * `S` for milliseconds
       * * `s` for seconds
       * * `m` for minutes
       * * `h` for hours
       * * `d` for days
       * * `w` for weeks
       * * `M` for months
       * * `y` for years
       * Notes:
       * * Add padding by repeating the token, e.g. "yy" pads the years to two digits, "hhhh" pads the hours out to four digits
       * * Tokens can be escaped by wrapping with single quotes.
       * * The duration will be converted to the set of units in the format string using {@link Duration#shiftTo} and the Durations's conversion accuracy setting.
       * @param {string} fmt - the format string
       * @param {Object} opts - options
       * @param {boolean} [opts.floor=true] - floor numerical values
       * @param {'negative'|'all'|'negativeLargestOnly'} [opts.signMode=negative] - How to handle signs
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("y d s") //=> "1 6 2"
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("yy dd sss") //=> "01 06 002"
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toFormat("M S") //=> "12 518402000"
       * @example Duration.fromObject({ days: 6, seconds: 2 }).toFormat("d s", { signMode: "all" }) //=> "+6 +2"
       * @example Duration.fromObject({ days: -6, seconds: -2 }).toFormat("d s", { signMode: "all" }) //=> "-6 -2"
       * @example Duration.fromObject({ days: -6, seconds: -2 }).toFormat("d s", { signMode: "negativeLargestOnly" }) //=> "-6 2"
       * @return {string}
       */
      toFormat(fmt, opts = {}) {
        const fmtOpts = {
          ...opts,
          floor: opts.round !== false && opts.floor !== false
        };
        return this.isValid ? Formatter.create(this.loc, fmtOpts).formatDurationFromString(this, fmt) : INVALID$2;
      }
      /**
       * Returns a string representation of a Duration with all units included.
       * To modify its behavior, use `listStyle` and any Intl.NumberFormat option, though `unitDisplay` is especially relevant.
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat#options
       * @param {Object} opts - Formatting options. Accepts the same keys as the options parameter of the native `Intl.NumberFormat` constructor, as well as `listStyle`.
       * @param {string} [opts.listStyle='narrow'] - How to format the merged list. Corresponds to the `style` property of the options parameter of the native `Intl.ListFormat` constructor.
       * @param {boolean} [opts.showZeros=true] - Show all units previously used by the duration even if they are zero
       * @example
       * ```js
       * var dur = Duration.fromObject({ months: 1, weeks: 0, hours: 5, minutes: 6 })
       * dur.toHuman() //=> '1 month, 0 weeks, 5 hours, 6 minutes'
       * dur.toHuman({ listStyle: "long" }) //=> '1 month, 0 weeks, 5 hours, and 6 minutes'
       * dur.toHuman({ unitDisplay: "short" }) //=> '1 mth, 0 wks, 5 hr, 6 min'
       * dur.toHuman({ showZeros: false }) //=> '1 month, 5 hours, 6 minutes'
       * ```
       */
      toHuman(opts = {}) {
        if (!this.isValid) return INVALID$2;
        const showZeros = opts.showZeros !== false;
        const l2 = orderedUnits$1.map((unit) => {
          const val = this.values[unit];
          if (isUndefined(val) || val === 0 && !showZeros) {
            return null;
          }
          return this.loc.numberFormatter({
            style: "unit",
            unitDisplay: "long",
            ...opts,
            unit: unit.slice(0, -1)
          }).format(val);
        }).filter((n2) => n2);
        return this.loc.listFormatter({
          type: "conjunction",
          style: opts.listStyle || "narrow",
          ...opts
        }).format(l2);
      }
      /**
       * Returns a JavaScript object with this Duration's values.
       * @example Duration.fromObject({ years: 1, days: 6, seconds: 2 }).toObject() //=> { years: 1, days: 6, seconds: 2 }
       * @return {Object}
       */
      toObject() {
        if (!this.isValid) return {};
        return {
          ...this.values
        };
      }
      /**
       * Returns an ISO 8601-compliant string representation of this Duration.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Durations
       * @example Duration.fromObject({ years: 3, seconds: 45 }).toISO() //=> 'P3YT45S'
       * @example Duration.fromObject({ months: 4, seconds: 45 }).toISO() //=> 'P4MT45S'
       * @example Duration.fromObject({ months: 5 }).toISO() //=> 'P5M'
       * @example Duration.fromObject({ minutes: 5 }).toISO() //=> 'PT5M'
       * @example Duration.fromObject({ milliseconds: 6 }).toISO() //=> 'PT0.006S'
       * @return {string}
       */
      toISO() {
        if (!this.isValid) return null;
        let s2 = "P";
        if (this.years !== 0) s2 += this.years + "Y";
        if (this.months !== 0 || this.quarters !== 0) s2 += this.months + this.quarters * 3 + "M";
        if (this.weeks !== 0) s2 += this.weeks + "W";
        if (this.days !== 0) s2 += this.days + "D";
        if (this.hours !== 0 || this.minutes !== 0 || this.seconds !== 0 || this.milliseconds !== 0) s2 += "T";
        if (this.hours !== 0) s2 += this.hours + "H";
        if (this.minutes !== 0) s2 += this.minutes + "M";
        if (this.seconds !== 0 || this.milliseconds !== 0)
          s2 += roundTo(this.seconds + this.milliseconds / 1e3, 3) + "S";
        if (s2 === "P") s2 += "T0S";
        return s2;
      }
      /**
       * Returns an ISO 8601-compliant string representation of this Duration, formatted as a time of day.
       * Note that this will return null if the duration is invalid, negative, or equal to or greater than 24 hours.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Times
       * @param {Object} opts - options
       * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
       * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
       * @param {boolean} [opts.includePrefix=false] - include the `T` prefix
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @example Duration.fromObject({ hours: 11 }).toISOTime() //=> '11:00:00.000'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ suppressMilliseconds: true }) //=> '11:00:00'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ suppressSeconds: true }) //=> '11:00'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ includePrefix: true }) //=> 'T11:00:00.000'
       * @example Duration.fromObject({ hours: 11 }).toISOTime({ format: 'basic' }) //=> '110000.000'
       * @return {string}
       */
      toISOTime(opts = {}) {
        if (!this.isValid) return null;
        const millis = this.toMillis();
        if (millis < 0 || millis >= 864e5) return null;
        opts = {
          suppressMilliseconds: false,
          suppressSeconds: false,
          includePrefix: false,
          format: "extended",
          ...opts,
          includeOffset: false
        };
        const dateTime = DateTime.fromMillis(millis, {
          zone: "UTC"
        });
        return dateTime.toISOTime(opts);
      }
      /**
       * Returns an ISO 8601 representation of this Duration appropriate for use in JSON.
       * @return {string}
       */
      toJSON() {
        return this.toISO();
      }
      /**
       * Returns an ISO 8601 representation of this Duration appropriate for use in debugging.
       * @return {string}
       */
      toString() {
        return this.toISO();
      }
      /**
       * Returns a string representation of this Duration appropriate for the REPL.
       * @return {string}
       */
      [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
        if (this.isValid) {
          return `Duration { values: ${JSON.stringify(this.values)} }`;
        } else {
          return `Duration { Invalid, reason: ${this.invalidReason} }`;
        }
      }
      /**
       * Returns an milliseconds value of this Duration.
       * @return {number}
       */
      toMillis() {
        if (!this.isValid) return NaN;
        return durationToMillis(this.matrix, this.values);
      }
      /**
       * Returns an milliseconds value of this Duration. Alias of {@link toMillis}
       * @return {number}
       */
      valueOf() {
        return this.toMillis();
      }
      /**
       * Make this Duration longer by the specified amount. Return a newly-constructed Duration.
       * @param {Duration|Object|number} duration - The amount to add. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       * @return {Duration}
       */
      plus(duration) {
        if (!this.isValid) return this;
        const dur = _Duration.fromDurationLike(duration), result = {};
        for (const k of orderedUnits$1) {
          if (hasOwnProperty(dur.values, k) || hasOwnProperty(this.values, k)) {
            result[k] = dur.get(k) + this.get(k);
          }
        }
        return clone$1(this, {
          values: result
        }, true);
      }
      /**
       * Make this Duration shorter by the specified amount. Return a newly-constructed Duration.
       * @param {Duration|Object|number} duration - The amount to subtract. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       * @return {Duration}
       */
      minus(duration) {
        if (!this.isValid) return this;
        const dur = _Duration.fromDurationLike(duration);
        return this.plus(dur.negate());
      }
      /**
       * Scale this Duration by the specified amount. Return a newly-constructed Duration.
       * @param {function} fn - The function to apply to each unit. Arity is 1 or 2: the value of the unit and, optionally, the unit name. Must return a number.
       * @example Duration.fromObject({ hours: 1, minutes: 30 }).mapUnits(x => x * 2) //=> { hours: 2, minutes: 60 }
       * @example Duration.fromObject({ hours: 1, minutes: 30 }).mapUnits((x, u) => u === "hours" ? x * 2 : x) //=> { hours: 2, minutes: 30 }
       * @return {Duration}
       */
      mapUnits(fn) {
        if (!this.isValid) return this;
        const result = {};
        for (const k of Object.keys(this.values)) {
          result[k] = asNumber(fn(this.values[k], k));
        }
        return clone$1(this, {
          values: result
        }, true);
      }
      /**
       * Get the value of unit.
       * @param {string} unit - a unit such as 'minute' or 'day'
       * @example Duration.fromObject({years: 2, days: 3}).get('years') //=> 2
       * @example Duration.fromObject({years: 2, days: 3}).get('months') //=> 0
       * @example Duration.fromObject({years: 2, days: 3}).get('days') //=> 3
       * @return {number}
       */
      get(unit) {
        return this[_Duration.normalizeUnit(unit)];
      }
      /**
       * "Set" the values of specified units. Return a newly-constructed Duration.
       * @param {Object} values - a mapping of units to numbers
       * @example dur.set({ years: 2017 })
       * @example dur.set({ hours: 8, minutes: 30 })
       * @return {Duration}
       */
      set(values) {
        if (!this.isValid) return this;
        const mixed = {
          ...this.values,
          ...normalizeObject(values, _Duration.normalizeUnit)
        };
        return clone$1(this, {
          values: mixed
        });
      }
      /**
       * "Set" the locale and/or numberingSystem.  Returns a newly-constructed Duration.
       * @example dur.reconfigure({ locale: 'en-GB' })
       * @return {Duration}
       */
      reconfigure({
        locale,
        numberingSystem,
        conversionAccuracy,
        matrix
      } = {}) {
        const loc = this.loc.clone({
          locale,
          numberingSystem
        });
        const opts = {
          loc,
          matrix,
          conversionAccuracy
        };
        return clone$1(this, opts);
      }
      /**
       * Return the length of the duration in the specified unit.
       * @param {string} unit - a unit such as 'minutes' or 'days'
       * @example Duration.fromObject({years: 1}).as('days') //=> 365
       * @example Duration.fromObject({years: 1}).as('months') //=> 12
       * @example Duration.fromObject({hours: 60}).as('days') //=> 2.5
       * @return {number}
       */
      as(unit) {
        return this.isValid ? this.shiftTo(unit).get(unit) : NaN;
      }
      /**
       * Reduce this Duration to its canonical representation in its current units.
       * Assuming the overall value of the Duration is positive, this means:
       * - excessive values for lower-order units are converted to higher-order units (if possible, see first and second example)
       * - negative lower-order units are converted to higher order units (there must be such a higher order unit, otherwise
       *   the overall value would be negative, see third example)
       * - fractional values for higher-order units are converted to lower-order units (if possible, see fourth example)
       *
       * If the overall value is negative, the result of this method is equivalent to `this.negate().normalize().negate()`.
       * @example Duration.fromObject({ years: 2, days: 5000 }).normalize().toObject() //=> { years: 15, days: 255 }
       * @example Duration.fromObject({ days: 5000 }).normalize().toObject() //=> { days: 5000 }
       * @example Duration.fromObject({ hours: 12, minutes: -45 }).normalize().toObject() //=> { hours: 11, minutes: 15 }
       * @example Duration.fromObject({ years: 2.5, days: 0, hours: 0 }).normalize().toObject() //=> { years: 2, days: 182, hours: 12 }
       * @return {Duration}
       */
      normalize() {
        if (!this.isValid) return this;
        const vals = this.toObject();
        normalizeValues(this.matrix, vals);
        return clone$1(this, {
          values: vals
        }, true);
      }
      /**
       * Rescale units to its largest representation
       * @example Duration.fromObject({ milliseconds: 90000 }).rescale().toObject() //=> { minutes: 1, seconds: 30 }
       * @return {Duration}
       */
      rescale() {
        if (!this.isValid) return this;
        const vals = removeZeroes(this.normalize().shiftToAll().toObject());
        return clone$1(this, {
          values: vals
        }, true);
      }
      /**
       * Convert this Duration into its representation in a different set of units.
       * @example Duration.fromObject({ hours: 1, seconds: 30 }).shiftTo('minutes', 'milliseconds').toObject() //=> { minutes: 60, milliseconds: 30000 }
       * @return {Duration}
       */
      shiftTo(...units) {
        if (!this.isValid) return this;
        if (units.length === 0) {
          return this;
        }
        units = units.map((u) => _Duration.normalizeUnit(u));
        const built = {}, accumulated = {}, vals = this.toObject();
        let lastUnit;
        for (const k of orderedUnits$1) {
          if (units.indexOf(k) >= 0) {
            lastUnit = k;
            let own = 0;
            for (const ak in accumulated) {
              own += this.matrix[ak][k] * accumulated[ak];
              accumulated[ak] = 0;
            }
            if (isNumber(vals[k])) {
              own += vals[k];
            }
            const i = Math.trunc(own);
            built[k] = i;
            accumulated[k] = (own * 1e3 - i * 1e3) / 1e3;
          } else if (isNumber(vals[k])) {
            accumulated[k] = vals[k];
          }
        }
        for (const key in accumulated) {
          if (accumulated[key] !== 0) {
            built[lastUnit] += key === lastUnit ? accumulated[key] : accumulated[key] / this.matrix[lastUnit][key];
          }
        }
        normalizeValues(this.matrix, built);
        return clone$1(this, {
          values: built
        }, true);
      }
      /**
       * Shift this Duration to all available units.
       * Same as shiftTo("years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds")
       * @return {Duration}
       */
      shiftToAll() {
        if (!this.isValid) return this;
        return this.shiftTo("years", "months", "weeks", "days", "hours", "minutes", "seconds", "milliseconds");
      }
      /**
       * Return the negative of this Duration.
       * @example Duration.fromObject({ hours: 1, seconds: 30 }).negate().toObject() //=> { hours: -1, seconds: -30 }
       * @return {Duration}
       */
      negate() {
        if (!this.isValid) return this;
        const negated = {};
        for (const k of Object.keys(this.values)) {
          negated[k] = this.values[k] === 0 ? 0 : -this.values[k];
        }
        return clone$1(this, {
          values: negated
        }, true);
      }
      /**
       * Removes all units with values equal to 0 from this Duration.
       * @example Duration.fromObject({ years: 2, days: 0, hours: 0, minutes: 0 }).removeZeros().toObject() //=> { years: 2 }
       * @return {Duration}
       */
      removeZeros() {
        if (!this.isValid) return this;
        const vals = removeZeroes(this.values);
        return clone$1(this, {
          values: vals
        }, true);
      }
      /**
       * Get the years.
       * @type {number}
       */
      get years() {
        return this.isValid ? this.values.years || 0 : NaN;
      }
      /**
       * Get the quarters.
       * @type {number}
       */
      get quarters() {
        return this.isValid ? this.values.quarters || 0 : NaN;
      }
      /**
       * Get the months.
       * @type {number}
       */
      get months() {
        return this.isValid ? this.values.months || 0 : NaN;
      }
      /**
       * Get the weeks
       * @type {number}
       */
      get weeks() {
        return this.isValid ? this.values.weeks || 0 : NaN;
      }
      /**
       * Get the days.
       * @type {number}
       */
      get days() {
        return this.isValid ? this.values.days || 0 : NaN;
      }
      /**
       * Get the hours.
       * @type {number}
       */
      get hours() {
        return this.isValid ? this.values.hours || 0 : NaN;
      }
      /**
       * Get the minutes.
       * @type {number}
       */
      get minutes() {
        return this.isValid ? this.values.minutes || 0 : NaN;
      }
      /**
       * Get the seconds.
       * @return {number}
       */
      get seconds() {
        return this.isValid ? this.values.seconds || 0 : NaN;
      }
      /**
       * Get the milliseconds.
       * @return {number}
       */
      get milliseconds() {
        return this.isValid ? this.values.milliseconds || 0 : NaN;
      }
      /**
       * Returns whether the Duration is invalid. Invalid durations are returned by diff operations
       * on invalid DateTimes or Intervals.
       * @return {boolean}
       */
      get isValid() {
        return this.invalid === null;
      }
      /**
       * Returns an error code if this Duration became invalid, or null if the Duration is valid
       * @return {string}
       */
      get invalidReason() {
        return this.invalid ? this.invalid.reason : null;
      }
      /**
       * Returns an explanation of why this Duration became invalid, or null if the Duration is valid
       * @type {string}
       */
      get invalidExplanation() {
        return this.invalid ? this.invalid.explanation : null;
      }
      /**
       * Equality check
       * Two Durations are equal iff they have the same units and the same values for each unit.
       * @param {Duration} other
       * @return {boolean}
       */
      equals(other) {
        if (!this.isValid || !other.isValid) {
          return false;
        }
        if (!this.loc.equals(other.loc)) {
          return false;
        }
        function eq(v1, v2) {
          if (v1 === void 0 || v1 === 0) return v2 === void 0 || v2 === 0;
          return v1 === v2;
        }
        for (const u of orderedUnits$1) {
          if (!eq(this.values[u], other.values[u])) {
            return false;
          }
        }
        return true;
      }
    };
    var INVALID$1 = "Invalid Interval";
    function validateStartEnd(start, end) {
      if (!start || !start.isValid) {
        return Interval.invalid("missing or invalid start");
      } else if (!end || !end.isValid) {
        return Interval.invalid("missing or invalid end");
      } else if (end < start) {
        return Interval.invalid("end before start", `The end of an interval must be after its start, but you had start=${start.toISO()} and end=${end.toISO()}`);
      } else {
        return null;
      }
    }
    var Interval = class _Interval {
      /**
       * @private
       */
      constructor(config2) {
        this.s = config2.start;
        this.e = config2.end;
        this.invalid = config2.invalid || null;
        this.isLuxonInterval = true;
      }
      /**
       * Create an invalid Interval.
       * @param {string} reason - simple string of why this Interval is invalid. Should not contain parameters or anything else data-dependent
       * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
       * @return {Interval}
       */
      static invalid(reason, explanation = null) {
        if (!reason) {
          throw new InvalidArgumentError("need to specify a reason the Interval is invalid");
        }
        const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);
        if (Settings.throwOnInvalid) {
          throw new InvalidIntervalError(invalid);
        } else {
          return new _Interval({
            invalid
          });
        }
      }
      /**
       * Create an Interval from a start DateTime and an end DateTime. Inclusive of the start but not the end.
       * @param {DateTime|Date|Object} start
       * @param {DateTime|Date|Object} end
       * @return {Interval}
       */
      static fromDateTimes(start, end) {
        const builtStart = friendlyDateTime(start), builtEnd = friendlyDateTime(end);
        const validateError = validateStartEnd(builtStart, builtEnd);
        if (validateError == null) {
          return new _Interval({
            start: builtStart,
            end: builtEnd
          });
        } else {
          return validateError;
        }
      }
      /**
       * Create an Interval from a start DateTime and a Duration to extend to.
       * @param {DateTime|Date|Object} start
       * @param {Duration|Object|number} duration - the length of the Interval.
       * @return {Interval}
       */
      static after(start, duration) {
        const dur = Duration.fromDurationLike(duration), dt = friendlyDateTime(start);
        return _Interval.fromDateTimes(dt, dt.plus(dur));
      }
      /**
       * Create an Interval from an end DateTime and a Duration to extend backwards to.
       * @param {DateTime|Date|Object} end
       * @param {Duration|Object|number} duration - the length of the Interval.
       * @return {Interval}
       */
      static before(end, duration) {
        const dur = Duration.fromDurationLike(duration), dt = friendlyDateTime(end);
        return _Interval.fromDateTimes(dt.minus(dur), dt);
      }
      /**
       * Create an Interval from an ISO 8601 string.
       * Accepts `<start>/<end>`, `<start>/<duration>`, and `<duration>/<end>` formats.
       * @param {string} text - the ISO string to parse
       * @param {Object} [opts] - options to pass {@link DateTime#fromISO} and optionally {@link Duration#fromISO}
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @return {Interval}
       */
      static fromISO(text, opts) {
        const [s2, e] = (text || "").split("/", 2);
        if (s2 && e) {
          let start, startIsValid;
          try {
            start = DateTime.fromISO(s2, opts);
            startIsValid = start.isValid;
          } catch (e2) {
            startIsValid = false;
          }
          let end, endIsValid;
          try {
            end = DateTime.fromISO(e, opts);
            endIsValid = end.isValid;
          } catch (e2) {
            endIsValid = false;
          }
          if (startIsValid && endIsValid) {
            return _Interval.fromDateTimes(start, end);
          }
          if (startIsValid) {
            const dur = Duration.fromISO(e, opts);
            if (dur.isValid) {
              return _Interval.after(start, dur);
            }
          } else if (endIsValid) {
            const dur = Duration.fromISO(s2, opts);
            if (dur.isValid) {
              return _Interval.before(end, dur);
            }
          }
        }
        return _Interval.invalid("unparsable", `the input "${text}" can't be parsed as ISO 8601`);
      }
      /**
       * Check if an object is an Interval. Works across context boundaries
       * @param {object} o
       * @return {boolean}
       */
      static isInterval(o) {
        return o && o.isLuxonInterval || false;
      }
      /**
       * Returns the start of the Interval
       * @type {DateTime}
       */
      get start() {
        return this.isValid ? this.s : null;
      }
      /**
       * Returns the end of the Interval. This is the first instant which is not part of the interval
       * (Interval is half-open).
       * @type {DateTime}
       */
      get end() {
        return this.isValid ? this.e : null;
      }
      /**
       * Returns the last DateTime included in the interval (since end is not part of the interval)
       * @type {DateTime}
       */
      get lastDateTime() {
        return this.isValid ? this.e ? this.e.minus(1) : null : null;
      }
      /**
       * Returns whether this Interval's end is at least its start, meaning that the Interval isn't 'backwards'.
       * @type {boolean}
       */
      get isValid() {
        return this.invalidReason === null;
      }
      /**
       * Returns an error code if this Interval is invalid, or null if the Interval is valid
       * @type {string}
       */
      get invalidReason() {
        return this.invalid ? this.invalid.reason : null;
      }
      /**
       * Returns an explanation of why this Interval became invalid, or null if the Interval is valid
       * @type {string}
       */
      get invalidExplanation() {
        return this.invalid ? this.invalid.explanation : null;
      }
      /**
       * Returns the length of the Interval in the specified unit.
       * @param {string} unit - the unit (such as 'hours' or 'days') to return the length in.
       * @return {number}
       */
      length(unit = "milliseconds") {
        return this.isValid ? this.toDuration(...[unit]).get(unit) : NaN;
      }
      /**
       * Returns the count of minutes, hours, days, months, or years included in the Interval, even in part.
       * Unlike {@link Interval#length} this counts sections of the calendar, not periods of time, e.g. specifying 'day'
       * asks 'what dates are included in this interval?', not 'how many days long is this interval?'
       * @param {string} [unit='milliseconds'] - the unit of time to count.
       * @param {Object} opts - options
       * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week; this operation will always use the locale of the start DateTime
       * @return {number}
       */
      count(unit = "milliseconds", opts) {
        if (!this.isValid) return NaN;
        const start = this.start.startOf(unit, opts);
        let end;
        if (opts != null && opts.useLocaleWeeks) {
          end = this.end.reconfigure({
            locale: start.locale
          });
        } else {
          end = this.end;
        }
        end = end.startOf(unit, opts);
        return Math.floor(end.diff(start, unit).get(unit)) + (end.valueOf() !== this.end.valueOf());
      }
      /**
       * Returns whether this Interval's start and end are both in the same unit of time
       * @param {string} unit - the unit of time to check sameness on
       * @return {boolean}
       */
      hasSame(unit) {
        return this.isValid ? this.isEmpty() || this.e.minus(1).hasSame(this.s, unit) : false;
      }
      /**
       * Return whether this Interval has the same start and end DateTimes.
       * @return {boolean}
       */
      isEmpty() {
        return this.s.valueOf() === this.e.valueOf();
      }
      /**
       * Return whether this Interval's start is after the specified DateTime.
       * @param {DateTime} dateTime
       * @return {boolean}
       */
      isAfter(dateTime) {
        if (!this.isValid) return false;
        return this.s > dateTime;
      }
      /**
       * Return whether this Interval's end is before the specified DateTime.
       * @param {DateTime} dateTime
       * @return {boolean}
       */
      isBefore(dateTime) {
        if (!this.isValid) return false;
        return this.e <= dateTime;
      }
      /**
       * Return whether this Interval contains the specified DateTime.
       * @param {DateTime} dateTime
       * @return {boolean}
       */
      contains(dateTime) {
        if (!this.isValid) return false;
        return this.s <= dateTime && this.e > dateTime;
      }
      /**
       * "Sets" the start and/or end dates. Returns a newly-constructed Interval.
       * @param {Object} values - the values to set
       * @param {DateTime} values.start - the starting DateTime
       * @param {DateTime} values.end - the ending DateTime
       * @return {Interval}
       */
      set({
        start,
        end
      } = {}) {
        if (!this.isValid) return this;
        return _Interval.fromDateTimes(start || this.s, end || this.e);
      }
      /**
       * Split this Interval at each of the specified DateTimes
       * @param {...DateTime} dateTimes - the unit of time to count.
       * @return {Array}
       */
      splitAt(...dateTimes) {
        if (!this.isValid) return [];
        const sorted = dateTimes.map(friendlyDateTime).filter((d) => this.contains(d)).sort((a, b) => a.toMillis() - b.toMillis()), results = [];
        let {
          s: s2
        } = this, i = 0;
        while (s2 < this.e) {
          const added = sorted[i] || this.e, next = +added > +this.e ? this.e : added;
          results.push(_Interval.fromDateTimes(s2, next));
          s2 = next;
          i += 1;
        }
        return results;
      }
      /**
       * Split this Interval into smaller Intervals, each of the specified length.
       * Left over time is grouped into a smaller interval
       * @param {Duration|Object|number} duration - The length of each resulting interval.
       * @return {Array}
       */
      splitBy(duration) {
        const dur = Duration.fromDurationLike(duration);
        if (!this.isValid || !dur.isValid || dur.as("milliseconds") === 0) {
          return [];
        }
        let {
          s: s2
        } = this, idx = 1, next;
        const results = [];
        while (s2 < this.e) {
          const added = this.start.plus(dur.mapUnits((x) => x * idx));
          next = +added > +this.e ? this.e : added;
          results.push(_Interval.fromDateTimes(s2, next));
          s2 = next;
          idx += 1;
        }
        return results;
      }
      /**
       * Split this Interval into the specified number of smaller intervals.
       * @param {number} numberOfParts - The number of Intervals to divide the Interval into.
       * @return {Array}
       */
      divideEqually(numberOfParts) {
        if (!this.isValid) return [];
        return this.splitBy(this.length() / numberOfParts).slice(0, numberOfParts);
      }
      /**
       * Return whether this Interval overlaps with the specified Interval
       * @param {Interval} other
       * @return {boolean}
       */
      overlaps(other) {
        return this.e > other.s && this.s < other.e;
      }
      /**
       * Return whether this Interval's end is adjacent to the specified Interval's start.
       * @param {Interval} other
       * @return {boolean}
       */
      abutsStart(other) {
        if (!this.isValid) return false;
        return +this.e === +other.s;
      }
      /**
       * Return whether this Interval's start is adjacent to the specified Interval's end.
       * @param {Interval} other
       * @return {boolean}
       */
      abutsEnd(other) {
        if (!this.isValid) return false;
        return +other.e === +this.s;
      }
      /**
       * Returns true if this Interval fully contains the specified Interval, specifically if the intersect (of this Interval and the other Interval) is equal to the other Interval; false otherwise.
       * @param {Interval} other
       * @return {boolean}
       */
      engulfs(other) {
        if (!this.isValid) return false;
        return this.s <= other.s && this.e >= other.e;
      }
      /**
       * Return whether this Interval has the same start and end as the specified Interval.
       * @param {Interval} other
       * @return {boolean}
       */
      equals(other) {
        if (!this.isValid || !other.isValid) {
          return false;
        }
        return this.s.equals(other.s) && this.e.equals(other.e);
      }
      /**
       * Return an Interval representing the intersection of this Interval and the specified Interval.
       * Specifically, the resulting Interval has the maximum start time and the minimum end time of the two Intervals.
       * Returns null if the intersection is empty, meaning, the intervals don't intersect.
       * @param {Interval} other
       * @return {Interval}
       */
      intersection(other) {
        if (!this.isValid) return this;
        const s2 = this.s > other.s ? this.s : other.s, e = this.e < other.e ? this.e : other.e;
        if (s2 >= e) {
          return null;
        } else {
          return _Interval.fromDateTimes(s2, e);
        }
      }
      /**
       * Return an Interval representing the union of this Interval and the specified Interval.
       * Specifically, the resulting Interval has the minimum start time and the maximum end time of the two Intervals.
       * @param {Interval} other
       * @return {Interval}
       */
      union(other) {
        if (!this.isValid) return this;
        const s2 = this.s < other.s ? this.s : other.s, e = this.e > other.e ? this.e : other.e;
        return _Interval.fromDateTimes(s2, e);
      }
      /**
       * Merge an array of Intervals into an equivalent minimal set of Intervals.
       * Combines overlapping and adjacent Intervals.
       * The resulting array will contain the Intervals in ascending order, that is, starting with the earliest Interval
       * and ending with the latest.
       *
       * @param {Array} intervals
       * @return {Array}
       */
      static merge(intervals) {
        const [found, final] = intervals.sort((a, b) => a.s - b.s).reduce(([sofar, current], item) => {
          if (!current) {
            return [sofar, item];
          } else if (current.overlaps(item) || current.abutsStart(item)) {
            return [sofar, current.union(item)];
          } else {
            return [sofar.concat([current]), item];
          }
        }, [[], null]);
        if (final) {
          found.push(final);
        }
        return found;
      }
      /**
       * Return an array of Intervals representing the spans of time that only appear in one of the specified Intervals.
       * @param {Array} intervals
       * @return {Array}
       */
      static xor(intervals) {
        let start = null, currentCount = 0;
        const results = [], ends = intervals.map((i) => [{
          time: i.s,
          type: "s"
        }, {
          time: i.e,
          type: "e"
        }]), flattened = Array.prototype.concat(...ends), arr = flattened.sort((a, b) => a.time - b.time);
        for (const i of arr) {
          currentCount += i.type === "s" ? 1 : -1;
          if (currentCount === 1) {
            start = i.time;
          } else {
            if (start && +start !== +i.time) {
              results.push(_Interval.fromDateTimes(start, i.time));
            }
            start = null;
          }
        }
        return _Interval.merge(results);
      }
      /**
       * Return an Interval representing the span of time in this Interval that doesn't overlap with any of the specified Intervals.
       * @param {...Interval} intervals
       * @return {Array}
       */
      difference(...intervals) {
        return _Interval.xor([this].concat(intervals)).map((i) => this.intersection(i)).filter((i) => i && !i.isEmpty());
      }
      /**
       * Returns a string representation of this Interval appropriate for debugging.
       * @return {string}
       */
      toString() {
        if (!this.isValid) return INVALID$1;
        return `[${this.s.toISO()} \u2013 ${this.e.toISO()})`;
      }
      /**
       * Returns a string representation of this Interval appropriate for the REPL.
       * @return {string}
       */
      [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
        if (this.isValid) {
          return `Interval { start: ${this.s.toISO()}, end: ${this.e.toISO()} }`;
        } else {
          return `Interval { Invalid, reason: ${this.invalidReason} }`;
        }
      }
      /**
       * Returns a localized string representing this Interval. Accepts the same options as the
       * Intl.DateTimeFormat constructor and any presets defined by Luxon, such as
       * {@link DateTime.DATE_FULL} or {@link DateTime.TIME_SIMPLE}. The exact behavior of this method
       * is browser-specific, but in general it will return an appropriate representation of the
       * Interval in the assigned locale. Defaults to the system's locale if no locale has been
       * specified.
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
       * @param {Object} [formatOpts=DateTime.DATE_SHORT] - Either a DateTime preset or
       * Intl.DateTimeFormat constructor options.
       * @param {Object} opts - Options to override the configuration of the start DateTime.
       * @example Interval.fromISO('2022-11-07T09:00Z/2022-11-08T09:00Z').toLocaleString(); //=> 11/7/2022 – 11/8/2022
       * @example Interval.fromISO('2022-11-07T09:00Z/2022-11-08T09:00Z').toLocaleString(DateTime.DATE_FULL); //=> November 7 – 8, 2022
       * @example Interval.fromISO('2022-11-07T09:00Z/2022-11-08T09:00Z').toLocaleString(DateTime.DATE_FULL, { locale: 'fr-FR' }); //=> 7–8 novembre 2022
       * @example Interval.fromISO('2022-11-07T17:00Z/2022-11-07T19:00Z').toLocaleString(DateTime.TIME_SIMPLE); //=> 6:00 – 8:00 PM
       * @example Interval.fromISO('2022-11-07T17:00Z/2022-11-07T19:00Z').toLocaleString({ weekday: 'short', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); //=> Mon, Nov 07, 6:00 – 8:00 p
       * @return {string}
       */
      toLocaleString(formatOpts = DATE_SHORT, opts = {}) {
        return this.isValid ? Formatter.create(this.s.loc.clone(opts), formatOpts).formatInterval(this) : INVALID$1;
      }
      /**
       * Returns an ISO 8601-compliant string representation of this Interval.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @param {Object} opts - The same options as {@link DateTime#toISO}
       * @return {string}
       */
      toISO(opts) {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toISO(opts)}/${this.e.toISO(opts)}`;
      }
      /**
       * Returns an ISO 8601-compliant string representation of date of this Interval.
       * The time components are ignored.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @return {string}
       */
      toISODate() {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toISODate()}/${this.e.toISODate()}`;
      }
      /**
       * Returns an ISO 8601-compliant string representation of time of this Interval.
       * The date components are ignored.
       * @see https://en.wikipedia.org/wiki/ISO_8601#Time_intervals
       * @param {Object} opts - The same options as {@link DateTime#toISO}
       * @return {string}
       */
      toISOTime(opts) {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toISOTime(opts)}/${this.e.toISOTime(opts)}`;
      }
      /**
       * Returns a string representation of this Interval formatted according to the specified format
       * string. **You may not want this.** See {@link Interval#toLocaleString} for a more flexible
       * formatting tool.
       * @param {string} dateFormat - The format string. This string formats the start and end time.
       * See {@link DateTime#toFormat} for details.
       * @param {Object} opts - Options.
       * @param {string} [opts.separator =  ' – '] - A separator to place between the start and end
       * representations.
       * @return {string}
       */
      toFormat(dateFormat, {
        separator = " \u2013 "
      } = {}) {
        if (!this.isValid) return INVALID$1;
        return `${this.s.toFormat(dateFormat)}${separator}${this.e.toFormat(dateFormat)}`;
      }
      /**
       * Return a Duration representing the time spanned by this interval.
       * @param {string|string[]} [unit=['milliseconds']] - the unit or units (such as 'hours' or 'days') to include in the duration.
       * @param {Object} opts - options that affect the creation of the Duration
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @example Interval.fromDateTimes(dt1, dt2).toDuration().toObject() //=> { milliseconds: 88489257 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration('days').toObject() //=> { days: 1.0241812152777778 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration(['hours', 'minutes']).toObject() //=> { hours: 24, minutes: 34.82095 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration(['hours', 'minutes', 'seconds']).toObject() //=> { hours: 24, minutes: 34, seconds: 49.257 }
       * @example Interval.fromDateTimes(dt1, dt2).toDuration('seconds').toObject() //=> { seconds: 88489.257 }
       * @return {Duration}
       */
      toDuration(unit, opts) {
        if (!this.isValid) {
          return Duration.invalid(this.invalidReason);
        }
        return this.e.diff(this.s, unit, opts);
      }
      /**
       * Run mapFn on the interval start and end, returning a new Interval from the resulting DateTimes
       * @param {function} mapFn
       * @return {Interval}
       * @example Interval.fromDateTimes(dt1, dt2).mapEndpoints(endpoint => endpoint.toUTC())
       * @example Interval.fromDateTimes(dt1, dt2).mapEndpoints(endpoint => endpoint.plus({ hours: 2 }))
       */
      mapEndpoints(mapFn) {
        return _Interval.fromDateTimes(mapFn(this.s), mapFn(this.e));
      }
    };
    var Info = class {
      /**
       * Return whether the specified zone contains a DST.
       * @param {string|Zone} [zone='local'] - Zone to check. Defaults to the environment's local zone.
       * @return {boolean}
       */
      static hasDST(zone = Settings.defaultZone) {
        const proto = DateTime.now().setZone(zone).set({
          month: 12
        });
        return !zone.isUniversal && proto.offset !== proto.set({
          month: 6
        }).offset;
      }
      /**
       * Return whether the specified zone is a valid IANA specifier.
       * @param {string} zone - Zone to check
       * @return {boolean}
       */
      static isValidIANAZone(zone) {
        return IANAZone.isValidZone(zone);
      }
      /**
       * Converts the input into a {@link Zone} instance.
       *
       * * If `input` is already a Zone instance, it is returned unchanged.
       * * If `input` is a string containing a valid time zone name, a Zone instance
       *   with that name is returned.
       * * If `input` is a string that doesn't refer to a known time zone, a Zone
       *   instance with {@link Zone#isValid} == false is returned.
       * * If `input is a number, a Zone instance with the specified fixed offset
       *   in minutes is returned.
       * * If `input` is `null` or `undefined`, the default zone is returned.
       * @param {string|Zone|number} [input] - the value to be converted
       * @return {Zone}
       */
      static normalizeZone(input) {
        return normalizeZone(input, Settings.defaultZone);
      }
      /**
       * Get the weekday on which the week starts according to the given locale.
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @returns {number} the start of the week, 1 for Monday through 7 for Sunday
       */
      static getStartOfWeek({
        locale = null,
        locObj = null
      } = {}) {
        return (locObj || Locale.create(locale)).getStartOfWeek();
      }
      /**
       * Get the minimum number of days necessary in a week before it is considered part of the next year according
       * to the given locale.
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @returns {number}
       */
      static getMinimumDaysInFirstWeek({
        locale = null,
        locObj = null
      } = {}) {
        return (locObj || Locale.create(locale)).getMinDaysInFirstWeek();
      }
      /**
       * Get the weekdays, which are considered the weekend according to the given locale
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @returns {number[]} an array of weekdays, 1 for Monday through 7 for Sunday
       */
      static getWeekendWeekdays({
        locale = null,
        locObj = null
      } = {}) {
        return (locObj || Locale.create(locale)).getWeekendDays().slice();
      }
      /**
       * Return an array of standalone month names.
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
       * @param {string} [length='long'] - the length of the month representation, such as "numeric", "2-digit", "narrow", "short", "long"
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @param {string} [opts.outputCalendar='gregory'] - the calendar
       * @example Info.months()[0] //=> 'January'
       * @example Info.months('short')[0] //=> 'Jan'
       * @example Info.months('numeric')[0] //=> '1'
       * @example Info.months('short', { locale: 'fr-CA' } )[0] //=> 'janv.'
       * @example Info.months('numeric', { locale: 'ar' })[0] //=> '١'
       * @example Info.months('long', { outputCalendar: 'islamic' })[0] //=> 'Rabiʻ I'
       * @return {Array}
       */
      static months(length = "long", {
        locale = null,
        numberingSystem = null,
        locObj = null,
        outputCalendar = "gregory"
      } = {}) {
        return (locObj || Locale.create(locale, numberingSystem, outputCalendar)).months(length);
      }
      /**
       * Return an array of format month names.
       * Format months differ from standalone months in that they're meant to appear next to the day of the month. In some languages, that
       * changes the string.
       * See {@link Info#months}
       * @param {string} [length='long'] - the length of the month representation, such as "numeric", "2-digit", "narrow", "short", "long"
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @param {string} [opts.outputCalendar='gregory'] - the calendar
       * @return {Array}
       */
      static monthsFormat(length = "long", {
        locale = null,
        numberingSystem = null,
        locObj = null,
        outputCalendar = "gregory"
      } = {}) {
        return (locObj || Locale.create(locale, numberingSystem, outputCalendar)).months(length, true);
      }
      /**
       * Return an array of standalone week names.
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
       * @param {string} [length='long'] - the length of the weekday representation, such as "narrow", "short", "long".
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @example Info.weekdays()[0] //=> 'Monday'
       * @example Info.weekdays('short')[0] //=> 'Mon'
       * @example Info.weekdays('short', { locale: 'fr-CA' })[0] //=> 'lun.'
       * @example Info.weekdays('short', { locale: 'ar' })[0] //=> 'الاثنين'
       * @return {Array}
       */
      static weekdays(length = "long", {
        locale = null,
        numberingSystem = null,
        locObj = null
      } = {}) {
        return (locObj || Locale.create(locale, numberingSystem, null)).weekdays(length);
      }
      /**
       * Return an array of format week names.
       * Format weekdays differ from standalone weekdays in that they're meant to appear next to more date information. In some languages, that
       * changes the string.
       * See {@link Info#weekdays}
       * @param {string} [length='long'] - the length of the month representation, such as "narrow", "short", "long".
       * @param {Object} opts - options
       * @param {string} [opts.locale=null] - the locale code
       * @param {string} [opts.numberingSystem=null] - the numbering system
       * @param {string} [opts.locObj=null] - an existing locale object to use
       * @return {Array}
       */
      static weekdaysFormat(length = "long", {
        locale = null,
        numberingSystem = null,
        locObj = null
      } = {}) {
        return (locObj || Locale.create(locale, numberingSystem, null)).weekdays(length, true);
      }
      /**
       * Return an array of meridiems.
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @example Info.meridiems() //=> [ 'AM', 'PM' ]
       * @example Info.meridiems({ locale: 'my' }) //=> [ 'နံနက်', 'ညနေ' ]
       * @return {Array}
       */
      static meridiems({
        locale = null
      } = {}) {
        return Locale.create(locale).meridiems();
      }
      /**
       * Return an array of eras, such as ['BC', 'AD']. The locale can be specified, but the calendar system is always Gregorian.
       * @param {string} [length='short'] - the length of the era representation, such as "short" or "long".
       * @param {Object} opts - options
       * @param {string} [opts.locale] - the locale code
       * @example Info.eras() //=> [ 'BC', 'AD' ]
       * @example Info.eras('long') //=> [ 'Before Christ', 'Anno Domini' ]
       * @example Info.eras('long', { locale: 'fr' }) //=> [ 'avant Jésus-Christ', 'après Jésus-Christ' ]
       * @return {Array}
       */
      static eras(length = "short", {
        locale = null
      } = {}) {
        return Locale.create(locale, null, "gregory").eras(length);
      }
      /**
       * Return the set of available features in this environment.
       * Some features of Luxon are not available in all environments. For example, on older browsers, relative time formatting support is not available. Use this function to figure out if that's the case.
       * Keys:
       * * `relative`: whether this environment supports relative time formatting
       * * `localeWeek`: whether this environment supports different weekdays for the start of the week based on the locale
       * @example Info.features() //=> { relative: false, localeWeek: true }
       * @return {Object}
       */
      static features() {
        return {
          relative: hasRelative(),
          localeWeek: hasLocaleWeekInfo()
        };
      }
    };
    function dayDiff(earlier, later) {
      const utcDayStart = (dt) => dt.toUTC(0, {
        keepLocalTime: true
      }).startOf("day").valueOf(), ms = utcDayStart(later) - utcDayStart(earlier);
      return Math.floor(Duration.fromMillis(ms).as("days"));
    }
    function highOrderDiffs(cursor, later, units) {
      const differs = [["years", (a, b) => b.year - a.year], ["quarters", (a, b) => b.quarter - a.quarter + (b.year - a.year) * 4], ["months", (a, b) => b.month - a.month + (b.year - a.year) * 12], ["weeks", (a, b) => {
        const days = dayDiff(a, b);
        return (days - days % 7) / 7;
      }], ["days", dayDiff]];
      const results = {};
      const earlier = cursor;
      let lowestOrder, highWater;
      for (const [unit, differ] of differs) {
        if (units.indexOf(unit) >= 0) {
          lowestOrder = unit;
          results[unit] = differ(cursor, later);
          highWater = earlier.plus(results);
          if (highWater > later) {
            results[unit]--;
            cursor = earlier.plus(results);
            if (cursor > later) {
              highWater = cursor;
              results[unit]--;
              cursor = earlier.plus(results);
            }
          } else {
            cursor = highWater;
          }
        }
      }
      return [cursor, results, highWater, lowestOrder];
    }
    function diff(earlier, later, units, opts) {
      let [cursor, results, highWater, lowestOrder] = highOrderDiffs(earlier, later, units);
      const remainingMillis = later - cursor;
      const lowerOrderUnits = units.filter((u) => ["hours", "minutes", "seconds", "milliseconds"].indexOf(u) >= 0);
      if (lowerOrderUnits.length === 0) {
        if (highWater < later) {
          highWater = cursor.plus({
            [lowestOrder]: 1
          });
        }
        if (highWater !== cursor) {
          results[lowestOrder] = (results[lowestOrder] || 0) + remainingMillis / (highWater - cursor);
        }
      }
      const duration = Duration.fromObject(results, opts);
      if (lowerOrderUnits.length > 0) {
        return Duration.fromMillis(remainingMillis, opts).shiftTo(...lowerOrderUnits).plus(duration);
      } else {
        return duration;
      }
    }
    var MISSING_FTP = "missing Intl.DateTimeFormat.formatToParts support";
    function intUnit(regex, post = (i) => i) {
      return {
        regex,
        deser: ([s2]) => post(parseDigits(s2))
      };
    }
    var NBSP = String.fromCharCode(160);
    var spaceOrNBSP = `[ ${NBSP}]`;
    var spaceOrNBSPRegExp = new RegExp(spaceOrNBSP, "g");
    function fixListRegex(s2) {
      return s2.replace(/\./g, "\\.?").replace(spaceOrNBSPRegExp, spaceOrNBSP);
    }
    function stripInsensitivities(s2) {
      return s2.replace(/\./g, "").replace(spaceOrNBSPRegExp, " ").toLowerCase();
    }
    function oneOf(strings, startIndex) {
      if (strings === null) {
        return null;
      } else {
        return {
          regex: RegExp(strings.map(fixListRegex).join("|")),
          deser: ([s2]) => strings.findIndex((i) => stripInsensitivities(s2) === stripInsensitivities(i)) + startIndex
        };
      }
    }
    function offset(regex, groups) {
      return {
        regex,
        deser: ([, h, m]) => signedOffset(h, m),
        groups
      };
    }
    function simple(regex) {
      return {
        regex,
        deser: ([s2]) => s2
      };
    }
    function escapeToken(value) {
      return value.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
    }
    function unitForToken(token, loc) {
      const one = digitRegex(loc), two = digitRegex(loc, "{2}"), three = digitRegex(loc, "{3}"), four = digitRegex(loc, "{4}"), six = digitRegex(loc, "{6}"), oneOrTwo = digitRegex(loc, "{1,2}"), oneToThree = digitRegex(loc, "{1,3}"), oneToSix = digitRegex(loc, "{1,6}"), oneToNine = digitRegex(loc, "{1,9}"), twoToFour = digitRegex(loc, "{2,4}"), fourToSix = digitRegex(loc, "{4,6}"), literal = (t) => ({
        regex: RegExp(escapeToken(t.val)),
        deser: ([s2]) => s2,
        literal: true
      }), unitate = (t) => {
        if (token.literal) {
          return literal(t);
        }
        switch (t.val) {
          // era
          case "G":
            return oneOf(loc.eras("short"), 0);
          case "GG":
            return oneOf(loc.eras("long"), 0);
          // years
          case "y":
            return intUnit(oneToSix);
          case "yy":
            return intUnit(twoToFour, untruncateYear);
          case "yyyy":
            return intUnit(four);
          case "yyyyy":
            return intUnit(fourToSix);
          case "yyyyyy":
            return intUnit(six);
          // months
          case "M":
            return intUnit(oneOrTwo);
          case "MM":
            return intUnit(two);
          case "MMM":
            return oneOf(loc.months("short", true), 1);
          case "MMMM":
            return oneOf(loc.months("long", true), 1);
          case "L":
            return intUnit(oneOrTwo);
          case "LL":
            return intUnit(two);
          case "LLL":
            return oneOf(loc.months("short", false), 1);
          case "LLLL":
            return oneOf(loc.months("long", false), 1);
          // dates
          case "d":
            return intUnit(oneOrTwo);
          case "dd":
            return intUnit(two);
          // ordinals
          case "o":
            return intUnit(oneToThree);
          case "ooo":
            return intUnit(three);
          // time
          case "HH":
            return intUnit(two);
          case "H":
            return intUnit(oneOrTwo);
          case "hh":
            return intUnit(two);
          case "h":
            return intUnit(oneOrTwo);
          case "mm":
            return intUnit(two);
          case "m":
            return intUnit(oneOrTwo);
          case "q":
            return intUnit(oneOrTwo);
          case "qq":
            return intUnit(two);
          case "s":
            return intUnit(oneOrTwo);
          case "ss":
            return intUnit(two);
          case "S":
            return intUnit(oneToThree);
          case "SSS":
            return intUnit(three);
          case "u":
            return simple(oneToNine);
          case "uu":
            return simple(oneOrTwo);
          case "uuu":
            return intUnit(one);
          // meridiem
          case "a":
            return oneOf(loc.meridiems(), 0);
          // weekYear (k)
          case "kkkk":
            return intUnit(four);
          case "kk":
            return intUnit(twoToFour, untruncateYear);
          // weekNumber (W)
          case "W":
            return intUnit(oneOrTwo);
          case "WW":
            return intUnit(two);
          // weekdays
          case "E":
          case "c":
            return intUnit(one);
          case "EEE":
            return oneOf(loc.weekdays("short", false), 1);
          case "EEEE":
            return oneOf(loc.weekdays("long", false), 1);
          case "ccc":
            return oneOf(loc.weekdays("short", true), 1);
          case "cccc":
            return oneOf(loc.weekdays("long", true), 1);
          // offset/zone
          case "Z":
          case "ZZ":
            return offset(new RegExp(`([+-]${oneOrTwo.source})(?::(${two.source}))?`), 2);
          case "ZZZ":
            return offset(new RegExp(`([+-]${oneOrTwo.source})(${two.source})?`), 2);
          // we don't support ZZZZ (PST) or ZZZZZ (Pacific Standard Time) in parsing
          // because we don't have any way to figure out what they are
          case "z":
            return simple(/[a-z_+-/]{1,256}?/i);
          // this special-case "token" represents a place where a macro-token expanded into a white-space literal
          // in this case we accept any non-newline white-space
          case " ":
            return simple(/[^\S\n\r]/);
          default:
            return literal(t);
        }
      };
      const unit = unitate(token) || {
        invalidReason: MISSING_FTP
      };
      unit.token = token;
      return unit;
    }
    var partTypeStyleToTokenVal = {
      year: {
        "2-digit": "yy",
        numeric: "yyyyy"
      },
      month: {
        numeric: "M",
        "2-digit": "MM",
        short: "MMM",
        long: "MMMM"
      },
      day: {
        numeric: "d",
        "2-digit": "dd"
      },
      weekday: {
        short: "EEE",
        long: "EEEE"
      },
      dayperiod: "a",
      dayPeriod: "a",
      hour12: {
        numeric: "h",
        "2-digit": "hh"
      },
      hour24: {
        numeric: "H",
        "2-digit": "HH"
      },
      minute: {
        numeric: "m",
        "2-digit": "mm"
      },
      second: {
        numeric: "s",
        "2-digit": "ss"
      },
      timeZoneName: {
        long: "ZZZZZ",
        short: "ZZZ"
      }
    };
    function tokenForPart(part, formatOpts, resolvedOpts) {
      const {
        type,
        value
      } = part;
      if (type === "literal") {
        const isSpace = /^\s+$/.test(value);
        return {
          literal: !isSpace,
          val: isSpace ? " " : value
        };
      }
      const style = formatOpts[type];
      let actualType = type;
      if (type === "hour") {
        if (formatOpts.hour12 != null) {
          actualType = formatOpts.hour12 ? "hour12" : "hour24";
        } else if (formatOpts.hourCycle != null) {
          if (formatOpts.hourCycle === "h11" || formatOpts.hourCycle === "h12") {
            actualType = "hour12";
          } else {
            actualType = "hour24";
          }
        } else {
          actualType = resolvedOpts.hour12 ? "hour12" : "hour24";
        }
      }
      let val = partTypeStyleToTokenVal[actualType];
      if (typeof val === "object") {
        val = val[style];
      }
      if (val) {
        return {
          literal: false,
          val
        };
      }
      return void 0;
    }
    function buildRegex(units) {
      const re = units.map((u) => u.regex).reduce((f, r) => `${f}(${r.source})`, "");
      return [`^${re}$`, units];
    }
    function match(input, regex, handlers) {
      const matches = input.match(regex);
      if (matches) {
        const all = {};
        let matchIndex = 1;
        for (const i in handlers) {
          if (hasOwnProperty(handlers, i)) {
            const h = handlers[i], groups = h.groups ? h.groups + 1 : 1;
            if (!h.literal && h.token) {
              all[h.token.val[0]] = h.deser(matches.slice(matchIndex, matchIndex + groups));
            }
            matchIndex += groups;
          }
        }
        return [matches, all];
      } else {
        return [matches, {}];
      }
    }
    function dateTimeFromMatches(matches) {
      const toField = (token) => {
        switch (token) {
          case "S":
            return "millisecond";
          case "s":
            return "second";
          case "m":
            return "minute";
          case "h":
          case "H":
            return "hour";
          case "d":
            return "day";
          case "o":
            return "ordinal";
          case "L":
          case "M":
            return "month";
          case "y":
            return "year";
          case "E":
          case "c":
            return "weekday";
          case "W":
            return "weekNumber";
          case "k":
            return "weekYear";
          case "q":
            return "quarter";
          default:
            return null;
        }
      };
      let zone = null;
      let specificOffset;
      if (!isUndefined(matches.z)) {
        zone = IANAZone.create(matches.z);
      }
      if (!isUndefined(matches.Z)) {
        if (!zone) {
          zone = new FixedOffsetZone(matches.Z);
        }
        specificOffset = matches.Z;
      }
      if (!isUndefined(matches.q)) {
        matches.M = (matches.q - 1) * 3 + 1;
      }
      if (!isUndefined(matches.h)) {
        if (matches.h < 12 && matches.a === 1) {
          matches.h += 12;
        } else if (matches.h === 12 && matches.a === 0) {
          matches.h = 0;
        }
      }
      if (matches.G === 0 && matches.y) {
        matches.y = -matches.y;
      }
      if (!isUndefined(matches.u)) {
        matches.S = parseMillis(matches.u);
      }
      const vals = Object.keys(matches).reduce((r, k) => {
        const f = toField(k);
        if (f) {
          r[f] = matches[k];
        }
        return r;
      }, {});
      return [vals, zone, specificOffset];
    }
    var dummyDateTimeCache = null;
    function getDummyDateTime() {
      if (!dummyDateTimeCache) {
        dummyDateTimeCache = DateTime.fromMillis(1555555555555);
      }
      return dummyDateTimeCache;
    }
    function maybeExpandMacroToken(token, locale) {
      if (token.literal) {
        return token;
      }
      const formatOpts = Formatter.macroTokenToFormatOpts(token.val);
      const tokens = formatOptsToTokens(formatOpts, locale);
      if (tokens == null || tokens.includes(void 0)) {
        return token;
      }
      return tokens;
    }
    function expandMacroTokens(tokens, locale) {
      return Array.prototype.concat(...tokens.map((t) => maybeExpandMacroToken(t, locale)));
    }
    var TokenParser = class {
      constructor(locale, format) {
        this.locale = locale;
        this.format = format;
        this.tokens = expandMacroTokens(Formatter.parseFormat(format), locale);
        this.units = this.tokens.map((t) => unitForToken(t, locale));
        this.disqualifyingUnit = this.units.find((t) => t.invalidReason);
        if (!this.disqualifyingUnit) {
          const [regexString, handlers] = buildRegex(this.units);
          this.regex = RegExp(regexString, "i");
          this.handlers = handlers;
        }
      }
      explainFromTokens(input) {
        if (!this.isValid) {
          return {
            input,
            tokens: this.tokens,
            invalidReason: this.invalidReason
          };
        } else {
          const [rawMatches, matches] = match(input, this.regex, this.handlers), [result, zone, specificOffset] = matches ? dateTimeFromMatches(matches) : [null, null, void 0];
          if (hasOwnProperty(matches, "a") && hasOwnProperty(matches, "H")) {
            throw new ConflictingSpecificationError("Can't include meridiem when specifying 24-hour format");
          }
          return {
            input,
            tokens: this.tokens,
            regex: this.regex,
            rawMatches,
            matches,
            result,
            zone,
            specificOffset
          };
        }
      }
      get isValid() {
        return !this.disqualifyingUnit;
      }
      get invalidReason() {
        return this.disqualifyingUnit ? this.disqualifyingUnit.invalidReason : null;
      }
    };
    function explainFromTokens(locale, input, format) {
      const parser = new TokenParser(locale, format);
      return parser.explainFromTokens(input);
    }
    function parseFromTokens(locale, input, format) {
      const {
        result,
        zone,
        specificOffset,
        invalidReason
      } = explainFromTokens(locale, input, format);
      return [result, zone, specificOffset, invalidReason];
    }
    function formatOptsToTokens(formatOpts, locale) {
      if (!formatOpts) {
        return null;
      }
      const formatter = Formatter.create(locale, formatOpts);
      const df = formatter.dtFormatter(getDummyDateTime());
      const parts = df.formatToParts();
      const resolvedOpts = df.resolvedOptions();
      return parts.map((p) => tokenForPart(p, formatOpts, resolvedOpts));
    }
    var INVALID = "Invalid DateTime";
    var MAX_DATE = 864e13;
    function unsupportedZone(zone) {
      return new Invalid("unsupported zone", `the zone "${zone.name}" is not supported`);
    }
    function possiblyCachedWeekData(dt) {
      if (dt.weekData === null) {
        dt.weekData = gregorianToWeek(dt.c);
      }
      return dt.weekData;
    }
    function possiblyCachedLocalWeekData(dt) {
      if (dt.localWeekData === null) {
        dt.localWeekData = gregorianToWeek(dt.c, dt.loc.getMinDaysInFirstWeek(), dt.loc.getStartOfWeek());
      }
      return dt.localWeekData;
    }
    function clone(inst, alts) {
      const current = {
        ts: inst.ts,
        zone: inst.zone,
        c: inst.c,
        o: inst.o,
        loc: inst.loc,
        invalid: inst.invalid
      };
      return new DateTime({
        ...current,
        ...alts,
        old: current
      });
    }
    function fixOffset(localTS, o, tz) {
      let utcGuess = localTS - o * 60 * 1e3;
      const o2 = tz.offset(utcGuess);
      if (o === o2) {
        return [utcGuess, o];
      }
      utcGuess -= (o2 - o) * 60 * 1e3;
      const o3 = tz.offset(utcGuess);
      if (o2 === o3) {
        return [utcGuess, o2];
      }
      return [localTS - Math.min(o2, o3) * 60 * 1e3, Math.max(o2, o3)];
    }
    function tsToObj(ts, offset2) {
      ts += offset2 * 60 * 1e3;
      const d = new Date(ts);
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        second: d.getUTCSeconds(),
        millisecond: d.getUTCMilliseconds()
      };
    }
    function objToTS(obj, offset2, zone) {
      return fixOffset(objToLocalTS(obj), offset2, zone);
    }
    function adjustTime(inst, dur) {
      const oPre = inst.o, year = inst.c.year + Math.trunc(dur.years), month = inst.c.month + Math.trunc(dur.months) + Math.trunc(dur.quarters) * 3, c = {
        ...inst.c,
        year,
        month,
        day: Math.min(inst.c.day, daysInMonth(year, month)) + Math.trunc(dur.days) + Math.trunc(dur.weeks) * 7
      }, millisToAdd = Duration.fromObject({
        years: dur.years - Math.trunc(dur.years),
        quarters: dur.quarters - Math.trunc(dur.quarters),
        months: dur.months - Math.trunc(dur.months),
        weeks: dur.weeks - Math.trunc(dur.weeks),
        days: dur.days - Math.trunc(dur.days),
        hours: dur.hours,
        minutes: dur.minutes,
        seconds: dur.seconds,
        milliseconds: dur.milliseconds
      }).as("milliseconds"), localTS = objToLocalTS(c);
      let [ts, o] = fixOffset(localTS, oPre, inst.zone);
      if (millisToAdd !== 0) {
        ts += millisToAdd;
        o = inst.zone.offset(ts);
      }
      return {
        ts,
        o
      };
    }
    function parseDataToDateTime(parsed, parsedZone, opts, format, text, specificOffset) {
      const {
        setZone,
        zone
      } = opts;
      if (parsed && Object.keys(parsed).length !== 0 || parsedZone) {
        const interpretationZone = parsedZone || zone, inst = DateTime.fromObject(parsed, {
          ...opts,
          zone: interpretationZone,
          specificOffset
        });
        return setZone ? inst : inst.setZone(zone);
      } else {
        return DateTime.invalid(new Invalid("unparsable", `the input "${text}" can't be parsed as ${format}`));
      }
    }
    function toTechFormat(dt, format, allowZ = true) {
      return dt.isValid ? Formatter.create(Locale.create("en-US"), {
        allowZ,
        forceSimple: true
      }).formatDateTimeFromString(dt, format) : null;
    }
    function toISODate(o, extended, precision) {
      const longFormat = o.c.year > 9999 || o.c.year < 0;
      let c = "";
      if (longFormat && o.c.year >= 0) c += "+";
      c += padStart(o.c.year, longFormat ? 6 : 4);
      if (precision === "year") return c;
      if (extended) {
        c += "-";
        c += padStart(o.c.month);
        if (precision === "month") return c;
        c += "-";
      } else {
        c += padStart(o.c.month);
        if (precision === "month") return c;
      }
      c += padStart(o.c.day);
      return c;
    }
    function toISOTime(o, extended, suppressSeconds, suppressMilliseconds, includeOffset, extendedZone, precision) {
      let showSeconds = !suppressSeconds || o.c.millisecond !== 0 || o.c.second !== 0, c = "";
      switch (precision) {
        case "day":
        case "month":
        case "year":
          break;
        default:
          c += padStart(o.c.hour);
          if (precision === "hour") break;
          if (extended) {
            c += ":";
            c += padStart(o.c.minute);
            if (precision === "minute") break;
            if (showSeconds) {
              c += ":";
              c += padStart(o.c.second);
            }
          } else {
            c += padStart(o.c.minute);
            if (precision === "minute") break;
            if (showSeconds) {
              c += padStart(o.c.second);
            }
          }
          if (precision === "second") break;
          if (showSeconds && (!suppressMilliseconds || o.c.millisecond !== 0)) {
            c += ".";
            c += padStart(o.c.millisecond, 3);
          }
      }
      if (includeOffset) {
        if (o.isOffsetFixed && o.offset === 0 && !extendedZone) {
          c += "Z";
        } else if (o.o < 0) {
          c += "-";
          c += padStart(Math.trunc(-o.o / 60));
          c += ":";
          c += padStart(Math.trunc(-o.o % 60));
        } else {
          c += "+";
          c += padStart(Math.trunc(o.o / 60));
          c += ":";
          c += padStart(Math.trunc(o.o % 60));
        }
      }
      if (extendedZone) {
        c += "[" + o.zone.ianaName + "]";
      }
      return c;
    }
    var defaultUnitValues = {
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    };
    var defaultWeekUnitValues = {
      weekNumber: 1,
      weekday: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    };
    var defaultOrdinalUnitValues = {
      ordinal: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    };
    var orderedUnits = ["year", "month", "day", "hour", "minute", "second", "millisecond"];
    var orderedWeekUnits = ["weekYear", "weekNumber", "weekday", "hour", "minute", "second", "millisecond"];
    var orderedOrdinalUnits = ["year", "ordinal", "hour", "minute", "second", "millisecond"];
    function normalizeUnit(unit) {
      const normalized = {
        year: "year",
        years: "year",
        month: "month",
        months: "month",
        day: "day",
        days: "day",
        hour: "hour",
        hours: "hour",
        minute: "minute",
        minutes: "minute",
        quarter: "quarter",
        quarters: "quarter",
        second: "second",
        seconds: "second",
        millisecond: "millisecond",
        milliseconds: "millisecond",
        weekday: "weekday",
        weekdays: "weekday",
        weeknumber: "weekNumber",
        weeksnumber: "weekNumber",
        weeknumbers: "weekNumber",
        weekyear: "weekYear",
        weekyears: "weekYear",
        ordinal: "ordinal"
      }[unit.toLowerCase()];
      if (!normalized) throw new InvalidUnitError(unit);
      return normalized;
    }
    function normalizeUnitWithLocalWeeks(unit) {
      switch (unit.toLowerCase()) {
        case "localweekday":
        case "localweekdays":
          return "localWeekday";
        case "localweeknumber":
        case "localweeknumbers":
          return "localWeekNumber";
        case "localweekyear":
        case "localweekyears":
          return "localWeekYear";
        default:
          return normalizeUnit(unit);
      }
    }
    function guessOffsetForZone(zone) {
      if (zoneOffsetTs === void 0) {
        zoneOffsetTs = Settings.now();
      }
      if (zone.type !== "iana") {
        return zone.offset(zoneOffsetTs);
      }
      const zoneName = zone.name;
      let offsetGuess = zoneOffsetGuessCache.get(zoneName);
      if (offsetGuess === void 0) {
        offsetGuess = zone.offset(zoneOffsetTs);
        zoneOffsetGuessCache.set(zoneName, offsetGuess);
      }
      return offsetGuess;
    }
    function quickDT(obj, opts) {
      const zone = normalizeZone(opts.zone, Settings.defaultZone);
      if (!zone.isValid) {
        return DateTime.invalid(unsupportedZone(zone));
      }
      const loc = Locale.fromObject(opts);
      let ts, o;
      if (!isUndefined(obj.year)) {
        for (const u of orderedUnits) {
          if (isUndefined(obj[u])) {
            obj[u] = defaultUnitValues[u];
          }
        }
        const invalid = hasInvalidGregorianData(obj) || hasInvalidTimeData(obj);
        if (invalid) {
          return DateTime.invalid(invalid);
        }
        const offsetProvis = guessOffsetForZone(zone);
        [ts, o] = objToTS(obj, offsetProvis, zone);
      } else {
        ts = Settings.now();
      }
      return new DateTime({
        ts,
        zone,
        loc,
        o
      });
    }
    function diffRelative(start, end, opts) {
      const round = isUndefined(opts.round) ? true : opts.round, rounding = isUndefined(opts.rounding) ? "trunc" : opts.rounding, format = (c, unit) => {
        c = roundTo(c, round || opts.calendary ? 0 : 2, opts.calendary ? "round" : rounding);
        const formatter = end.loc.clone(opts).relFormatter(opts);
        return formatter.format(c, unit);
      }, differ = (unit) => {
        if (opts.calendary) {
          if (!end.hasSame(start, unit)) {
            return end.startOf(unit).diff(start.startOf(unit), unit).get(unit);
          } else return 0;
        } else {
          return end.diff(start, unit).get(unit);
        }
      };
      if (opts.unit) {
        return format(differ(opts.unit), opts.unit);
      }
      for (const unit of opts.units) {
        const count = differ(unit);
        if (Math.abs(count) >= 1) {
          return format(count, unit);
        }
      }
      return format(start > end ? -0 : 0, opts.units[opts.units.length - 1]);
    }
    function lastOpts(argList) {
      let opts = {}, args;
      if (argList.length > 0 && typeof argList[argList.length - 1] === "object") {
        opts = argList[argList.length - 1];
        args = Array.from(argList).slice(0, argList.length - 1);
      } else {
        args = Array.from(argList);
      }
      return [opts, args];
    }
    var zoneOffsetTs;
    var zoneOffsetGuessCache = /* @__PURE__ */ new Map();
    var DateTime = class _DateTime {
      /**
       * @access private
       */
      constructor(config2) {
        const zone = config2.zone || Settings.defaultZone;
        let invalid = config2.invalid || (Number.isNaN(config2.ts) ? new Invalid("invalid input") : null) || (!zone.isValid ? unsupportedZone(zone) : null);
        this.ts = isUndefined(config2.ts) ? Settings.now() : config2.ts;
        let c = null, o = null;
        if (!invalid) {
          const unchanged = config2.old && config2.old.ts === this.ts && config2.old.zone.equals(zone);
          if (unchanged) {
            [c, o] = [config2.old.c, config2.old.o];
          } else {
            const ot = isNumber(config2.o) && !config2.old ? config2.o : zone.offset(this.ts);
            c = tsToObj(this.ts, ot);
            invalid = Number.isNaN(c.year) ? new Invalid("invalid input") : null;
            c = invalid ? null : c;
            o = invalid ? null : ot;
          }
        }
        this._zone = zone;
        this.loc = config2.loc || Locale.create();
        this.invalid = invalid;
        this.weekData = null;
        this.localWeekData = null;
        this.c = c;
        this.o = o;
        this.isLuxonDateTime = true;
      }
      // CONSTRUCT
      /**
       * Create a DateTime for the current instant, in the system's time zone.
       *
       * Use Settings to override these default values if needed.
       * @example DateTime.now().toISO() //~> now in the ISO format
       * @return {DateTime}
       */
      static now() {
        return new _DateTime({});
      }
      /**
       * Create a local DateTime
       * @param {number} [year] - The calendar year. If omitted (as in, call `local()` with no arguments), the current time will be used
       * @param {number} [month=1] - The month, 1-indexed
       * @param {number} [day=1] - The day of the month, 1-indexed
       * @param {number} [hour=0] - The hour of the day, in 24-hour time
       * @param {number} [minute=0] - The minute of the hour, meaning a number between 0 and 59
       * @param {number} [second=0] - The second of the minute, meaning a number between 0 and 59
       * @param {number} [millisecond=0] - The millisecond of the second, meaning a number between 0 and 999
       * @example DateTime.local()                                  //~> now
       * @example DateTime.local({ zone: "America/New_York" })      //~> now, in US east coast time
       * @example DateTime.local(2017)                              //~> 2017-01-01T00:00:00
       * @example DateTime.local(2017, 3)                           //~> 2017-03-01T00:00:00
       * @example DateTime.local(2017, 3, 12, { locale: "fr" })     //~> 2017-03-12T00:00:00, with a French locale
       * @example DateTime.local(2017, 3, 12, 5)                    //~> 2017-03-12T05:00:00
       * @example DateTime.local(2017, 3, 12, 5, { zone: "utc" })   //~> 2017-03-12T05:00:00, in UTC
       * @example DateTime.local(2017, 3, 12, 5, 45)                //~> 2017-03-12T05:45:00
       * @example DateTime.local(2017, 3, 12, 5, 45, 10)            //~> 2017-03-12T05:45:10
       * @example DateTime.local(2017, 3, 12, 5, 45, 10, 765)       //~> 2017-03-12T05:45:10.765
       * @return {DateTime}
       */
      static local() {
        const [opts, args] = lastOpts(arguments), [year, month, day, hour, minute, second, millisecond] = args;
        return quickDT({
          year,
          month,
          day,
          hour,
          minute,
          second,
          millisecond
        }, opts);
      }
      /**
       * Create a DateTime in UTC
       * @param {number} [year] - The calendar year. If omitted (as in, call `utc()` with no arguments), the current time will be used
       * @param {number} [month=1] - The month, 1-indexed
       * @param {number} [day=1] - The day of the month
       * @param {number} [hour=0] - The hour of the day, in 24-hour time
       * @param {number} [minute=0] - The minute of the hour, meaning a number between 0 and 59
       * @param {number} [second=0] - The second of the minute, meaning a number between 0 and 59
       * @param {number} [millisecond=0] - The millisecond of the second, meaning a number between 0 and 999
       * @param {Object} options - configuration options for the DateTime
       * @param {string} [options.locale] - a locale to set on the resulting DateTime instance
       * @param {string} [options.outputCalendar] - the output calendar to set on the resulting DateTime instance
       * @param {string} [options.numberingSystem] - the numbering system to set on the resulting DateTime instance
       * @param {string} [options.weekSettings] - the week settings to set on the resulting DateTime instance
       * @example DateTime.utc()                                              //~> now
       * @example DateTime.utc(2017)                                          //~> 2017-01-01T00:00:00Z
       * @example DateTime.utc(2017, 3)                                       //~> 2017-03-01T00:00:00Z
       * @example DateTime.utc(2017, 3, 12)                                   //~> 2017-03-12T00:00:00Z
       * @example DateTime.utc(2017, 3, 12, 5)                                //~> 2017-03-12T05:00:00Z
       * @example DateTime.utc(2017, 3, 12, 5, 45)                            //~> 2017-03-12T05:45:00Z
       * @example DateTime.utc(2017, 3, 12, 5, 45, { locale: "fr" })          //~> 2017-03-12T05:45:00Z with a French locale
       * @example DateTime.utc(2017, 3, 12, 5, 45, 10)                        //~> 2017-03-12T05:45:10Z
       * @example DateTime.utc(2017, 3, 12, 5, 45, 10, 765, { locale: "fr" }) //~> 2017-03-12T05:45:10.765Z with a French locale
       * @return {DateTime}
       */
      static utc() {
        const [opts, args] = lastOpts(arguments), [year, month, day, hour, minute, second, millisecond] = args;
        opts.zone = FixedOffsetZone.utcInstance;
        return quickDT({
          year,
          month,
          day,
          hour,
          minute,
          second,
          millisecond
        }, opts);
      }
      /**
       * Create a DateTime from a JavaScript Date object. Uses the default zone.
       * @param {Date} date - a JavaScript Date object
       * @param {Object} options - configuration options for the DateTime
       * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
       * @return {DateTime}
       */
      static fromJSDate(date, options = {}) {
        const ts = isDate(date) ? date.valueOf() : NaN;
        if (Number.isNaN(ts)) {
          return _DateTime.invalid("invalid input");
        }
        const zoneToUse = normalizeZone(options.zone, Settings.defaultZone);
        if (!zoneToUse.isValid) {
          return _DateTime.invalid(unsupportedZone(zoneToUse));
        }
        return new _DateTime({
          ts,
          zone: zoneToUse,
          loc: Locale.fromObject(options)
        });
      }
      /**
       * Create a DateTime from a number of milliseconds since the epoch (meaning since 1 January 1970 00:00:00 UTC). Uses the default zone.
       * @param {number} milliseconds - a number of milliseconds since 1970 UTC
       * @param {Object} options - configuration options for the DateTime
       * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
       * @param {string} [options.locale] - a locale to set on the resulting DateTime instance
       * @param {string} options.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} options.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @param {string} options.weekSettings - the week settings to set on the resulting DateTime instance
       * @return {DateTime}
       */
      static fromMillis(milliseconds, options = {}) {
        if (!isNumber(milliseconds)) {
          throw new InvalidArgumentError(`fromMillis requires a numerical input, but received a ${typeof milliseconds} with value ${milliseconds}`);
        } else if (milliseconds < -MAX_DATE || milliseconds > MAX_DATE) {
          return _DateTime.invalid("Timestamp out of range");
        } else {
          return new _DateTime({
            ts: milliseconds,
            zone: normalizeZone(options.zone, Settings.defaultZone),
            loc: Locale.fromObject(options)
          });
        }
      }
      /**
       * Create a DateTime from a number of seconds since the epoch (meaning since 1 January 1970 00:00:00 UTC). Uses the default zone.
       * @param {number} seconds - a number of seconds since 1970 UTC
       * @param {Object} options - configuration options for the DateTime
       * @param {string|Zone} [options.zone='local'] - the zone to place the DateTime into
       * @param {string} [options.locale] - a locale to set on the resulting DateTime instance
       * @param {string} options.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} options.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @param {string} options.weekSettings - the week settings to set on the resulting DateTime instance
       * @return {DateTime}
       */
      static fromSeconds(seconds, options = {}) {
        if (!isNumber(seconds)) {
          throw new InvalidArgumentError("fromSeconds requires a numerical input");
        } else {
          return new _DateTime({
            ts: seconds * 1e3,
            zone: normalizeZone(options.zone, Settings.defaultZone),
            loc: Locale.fromObject(options)
          });
        }
      }
      /**
       * Create a DateTime from a JavaScript object with keys like 'year' and 'hour' with reasonable defaults.
       * @param {Object} obj - the object to create the DateTime from
       * @param {number} obj.year - a year, such as 1987
       * @param {number} obj.month - a month, 1-12
       * @param {number} obj.day - a day of the month, 1-31, depending on the month
       * @param {number} obj.ordinal - day of the year, 1-365 or 366
       * @param {number} obj.weekYear - an ISO week year
       * @param {number} obj.weekNumber - an ISO week number, between 1 and 52 or 53, depending on the year
       * @param {number} obj.weekday - an ISO weekday, 1-7, where 1 is Monday and 7 is Sunday
       * @param {number} obj.localWeekYear - a week year, according to the locale
       * @param {number} obj.localWeekNumber - a week number, between 1 and 52 or 53, depending on the year, according to the locale
       * @param {number} obj.localWeekday - a weekday, 1-7, where 1 is the first and 7 is the last day of the week, according to the locale
       * @param {number} obj.hour - hour of the day, 0-23
       * @param {number} obj.minute - minute of the hour, 0-59
       * @param {number} obj.second - second of the minute, 0-59
       * @param {number} obj.millisecond - millisecond of the second, 0-999
       * @param {Object} opts - options for creating this DateTime
       * @param {string|Zone} [opts.zone='local'] - interpret the numbers in the context of a particular zone. Can take any value taken as the first argument to setZone()
       * @param {string} [opts.locale='system\'s locale'] - a locale to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
       * @example DateTime.fromObject({ year: 1982, month: 5, day: 25}).toISODate() //=> '1982-05-25'
       * @example DateTime.fromObject({ year: 1982 }).toISODate() //=> '1982-01-01'
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }) //~> today at 10:26:06
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }, { zone: 'utc' }),
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }, { zone: 'local' })
       * @example DateTime.fromObject({ hour: 10, minute: 26, second: 6 }, { zone: 'America/New_York' })
       * @example DateTime.fromObject({ weekYear: 2016, weekNumber: 2, weekday: 3 }).toISODate() //=> '2016-01-13'
       * @example DateTime.fromObject({ localWeekYear: 2022, localWeekNumber: 1, localWeekday: 1 }, { locale: "en-US" }).toISODate() //=> '2021-12-26'
       * @return {DateTime}
       */
      static fromObject(obj, opts = {}) {
        obj = obj || {};
        const zoneToUse = normalizeZone(opts.zone, Settings.defaultZone);
        if (!zoneToUse.isValid) {
          return _DateTime.invalid(unsupportedZone(zoneToUse));
        }
        const loc = Locale.fromObject(opts);
        const normalized = normalizeObject(obj, normalizeUnitWithLocalWeeks);
        const {
          minDaysInFirstWeek,
          startOfWeek
        } = usesLocalWeekValues(normalized, loc);
        const tsNow = Settings.now(), offsetProvis = !isUndefined(opts.specificOffset) ? opts.specificOffset : zoneToUse.offset(tsNow), containsOrdinal = !isUndefined(normalized.ordinal), containsGregorYear = !isUndefined(normalized.year), containsGregorMD = !isUndefined(normalized.month) || !isUndefined(normalized.day), containsGregor = containsGregorYear || containsGregorMD, definiteWeekDef = normalized.weekYear || normalized.weekNumber;
        if ((containsGregor || containsOrdinal) && definiteWeekDef) {
          throw new ConflictingSpecificationError("Can't mix weekYear/weekNumber units with year/month/day or ordinals");
        }
        if (containsGregorMD && containsOrdinal) {
          throw new ConflictingSpecificationError("Can't mix ordinal dates with month/day");
        }
        const useWeekData = definiteWeekDef || normalized.weekday && !containsGregor;
        let units, defaultValues, objNow = tsToObj(tsNow, offsetProvis);
        if (useWeekData) {
          units = orderedWeekUnits;
          defaultValues = defaultWeekUnitValues;
          objNow = gregorianToWeek(objNow, minDaysInFirstWeek, startOfWeek);
        } else if (containsOrdinal) {
          units = orderedOrdinalUnits;
          defaultValues = defaultOrdinalUnitValues;
          objNow = gregorianToOrdinal(objNow);
        } else {
          units = orderedUnits;
          defaultValues = defaultUnitValues;
        }
        let foundFirst = false;
        for (const u of units) {
          const v = normalized[u];
          if (!isUndefined(v)) {
            foundFirst = true;
          } else if (foundFirst) {
            normalized[u] = defaultValues[u];
          } else {
            normalized[u] = objNow[u];
          }
        }
        const higherOrderInvalid = useWeekData ? hasInvalidWeekData(normalized, minDaysInFirstWeek, startOfWeek) : containsOrdinal ? hasInvalidOrdinalData(normalized) : hasInvalidGregorianData(normalized), invalid = higherOrderInvalid || hasInvalidTimeData(normalized);
        if (invalid) {
          return _DateTime.invalid(invalid);
        }
        const gregorian = useWeekData ? weekToGregorian(normalized, minDaysInFirstWeek, startOfWeek) : containsOrdinal ? ordinalToGregorian(normalized) : normalized, [tsFinal, offsetFinal] = objToTS(gregorian, offsetProvis, zoneToUse), inst = new _DateTime({
          ts: tsFinal,
          zone: zoneToUse,
          o: offsetFinal,
          loc
        });
        if (normalized.weekday && containsGregor && obj.weekday !== inst.weekday) {
          return _DateTime.invalid("mismatched weekday", `you can't specify both a weekday of ${normalized.weekday} and a date of ${inst.toISO()}`);
        }
        if (!inst.isValid) {
          return _DateTime.invalid(inst.invalid);
        }
        return inst;
      }
      /**
       * Create a DateTime from an ISO 8601 string
       * @param {string} text - the ISO string
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the time to this zone
       * @param {boolean} [opts.setZone=false] - override the zone with a fixed-offset zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
       * @param {string} [opts.outputCalendar] - the output calendar to set on the resulting DateTime instance
       * @param {string} [opts.numberingSystem] - the numbering system to set on the resulting DateTime instance
       * @param {string} [opts.weekSettings] - the week settings to set on the resulting DateTime instance
       * @example DateTime.fromISO('2016-05-25T09:08:34.123')
       * @example DateTime.fromISO('2016-05-25T09:08:34.123+06:00')
       * @example DateTime.fromISO('2016-05-25T09:08:34.123+06:00', {setZone: true})
       * @example DateTime.fromISO('2016-05-25T09:08:34.123', {zone: 'utc'})
       * @example DateTime.fromISO('2016-W05-4')
       * @return {DateTime}
       */
      static fromISO(text, opts = {}) {
        const [vals, parsedZone] = parseISODate(text);
        return parseDataToDateTime(vals, parsedZone, opts, "ISO 8601", text);
      }
      /**
       * Create a DateTime from an RFC 2822 string
       * @param {string} text - the RFC 2822 string
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - convert the time to this zone. Since the offset is always specified in the string itself, this has no effect on the interpretation of string, merely the zone the resulting DateTime is expressed in.
       * @param {boolean} [opts.setZone=false] - override the zone with a fixed-offset zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
       * @example DateTime.fromRFC2822('25 Nov 2016 13:23:12 GMT')
       * @example DateTime.fromRFC2822('Fri, 25 Nov 2016 13:23:12 +0600')
       * @example DateTime.fromRFC2822('25 Nov 2016 13:23 Z')
       * @return {DateTime}
       */
      static fromRFC2822(text, opts = {}) {
        const [vals, parsedZone] = parseRFC2822Date(text);
        return parseDataToDateTime(vals, parsedZone, opts, "RFC 2822", text);
      }
      /**
       * Create a DateTime from an HTTP header date
       * @see https://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html#sec3.3.1
       * @param {string} text - the HTTP header date
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - convert the time to this zone. Since HTTP dates are always in UTC, this has no effect on the interpretation of string, merely the zone the resulting DateTime is expressed in.
       * @param {boolean} [opts.setZone=false] - override the zone with the fixed-offset zone specified in the string. For HTTP dates, this is always UTC, so this option is equivalent to setting the `zone` option to 'utc', but this option is included for consistency with similar methods.
       * @param {string} [opts.locale='system's locale'] - a locale to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @param {string} opts.numberingSystem - the numbering system to set on the resulting DateTime instance
       * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
       * @example DateTime.fromHTTP('Sun, 06 Nov 1994 08:49:37 GMT')
       * @example DateTime.fromHTTP('Sunday, 06-Nov-94 08:49:37 GMT')
       * @example DateTime.fromHTTP('Sun Nov  6 08:49:37 1994')
       * @return {DateTime}
       */
      static fromHTTP(text, opts = {}) {
        const [vals, parsedZone] = parseHTTPDate(text);
        return parseDataToDateTime(vals, parsedZone, opts, "HTTP", opts);
      }
      /**
       * Create a DateTime from an input string and format string.
       * Defaults to en-US if no locale has been specified, regardless of the system's locale. For a table of tokens and their interpretations, see [here](https://moment.github.io/luxon/#/parsing?id=table-of-tokens).
       * @param {string} text - the string to parse
       * @param {string} fmt - the format the string is expected to be in (see the link below for the formats)
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the DateTime to this zone
       * @param {boolean} [opts.setZone=false] - override the zone with a zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='en-US'] - a locale string to use when parsing. Will also set the DateTime to this locale
       * @param {string} opts.numberingSystem - the numbering system to use when parsing. Will also set the resulting DateTime to this numbering system
       * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @return {DateTime}
       */
      static fromFormat(text, fmt, opts = {}) {
        if (isUndefined(text) || isUndefined(fmt)) {
          throw new InvalidArgumentError("fromFormat requires an input string and a format");
        }
        const {
          locale = null,
          numberingSystem = null
        } = opts, localeToUse = Locale.fromOpts({
          locale,
          numberingSystem,
          defaultToEN: true
        }), [vals, parsedZone, specificOffset, invalid] = parseFromTokens(localeToUse, text, fmt);
        if (invalid) {
          return _DateTime.invalid(invalid);
        } else {
          return parseDataToDateTime(vals, parsedZone, opts, `format ${fmt}`, text, specificOffset);
        }
      }
      /**
       * @deprecated use fromFormat instead
       */
      static fromString(text, fmt, opts = {}) {
        return _DateTime.fromFormat(text, fmt, opts);
      }
      /**
       * Create a DateTime from a SQL date, time, or datetime
       * Defaults to en-US if no locale has been specified, regardless of the system's locale
       * @param {string} text - the string to parse
       * @param {Object} opts - options to affect the creation
       * @param {string|Zone} [opts.zone='local'] - use this zone if no offset is specified in the input string itself. Will also convert the DateTime to this zone
       * @param {boolean} [opts.setZone=false] - override the zone with a zone specified in the string itself, if it specifies one
       * @param {string} [opts.locale='en-US'] - a locale string to use when parsing. Will also set the DateTime to this locale
       * @param {string} opts.numberingSystem - the numbering system to use when parsing. Will also set the resulting DateTime to this numbering system
       * @param {string} opts.weekSettings - the week settings to set on the resulting DateTime instance
       * @param {string} opts.outputCalendar - the output calendar to set on the resulting DateTime instance
       * @example DateTime.fromSQL('2017-05-15')
       * @example DateTime.fromSQL('2017-05-15 09:12:34')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342+06:00')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342 America/Los_Angeles')
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342 America/Los_Angeles', { setZone: true })
       * @example DateTime.fromSQL('2017-05-15 09:12:34.342', { zone: 'America/Los_Angeles' })
       * @example DateTime.fromSQL('09:12:34.342')
       * @return {DateTime}
       */
      static fromSQL(text, opts = {}) {
        const [vals, parsedZone] = parseSQL(text);
        return parseDataToDateTime(vals, parsedZone, opts, "SQL", text);
      }
      /**
       * Create an invalid DateTime.
       * @param {string} reason - simple string of why this DateTime is invalid. Should not contain parameters or anything else data-dependent.
       * @param {string} [explanation=null] - longer explanation, may include parameters and other useful debugging information
       * @return {DateTime}
       */
      static invalid(reason, explanation = null) {
        if (!reason) {
          throw new InvalidArgumentError("need to specify a reason the DateTime is invalid");
        }
        const invalid = reason instanceof Invalid ? reason : new Invalid(reason, explanation);
        if (Settings.throwOnInvalid) {
          throw new InvalidDateTimeError(invalid);
        } else {
          return new _DateTime({
            invalid
          });
        }
      }
      /**
       * Check if an object is an instance of DateTime. Works across context boundaries
       * @param {object} o
       * @return {boolean}
       */
      static isDateTime(o) {
        return o && o.isLuxonDateTime || false;
      }
      /**
       * Produce the format string for a set of options
       * @param formatOpts
       * @param localeOpts
       * @returns {string}
       */
      static parseFormatForOpts(formatOpts, localeOpts = {}) {
        const tokenList = formatOptsToTokens(formatOpts, Locale.fromObject(localeOpts));
        return !tokenList ? null : tokenList.map((t) => t ? t.val : null).join("");
      }
      /**
       * Produce the the fully expanded format token for the locale
       * Does NOT quote characters, so quoted tokens will not round trip correctly
       * @param fmt
       * @param localeOpts
       * @returns {string}
       */
      static expandFormat(fmt, localeOpts = {}) {
        const expanded = expandMacroTokens(Formatter.parseFormat(fmt), Locale.fromObject(localeOpts));
        return expanded.map((t) => t.val).join("");
      }
      static resetCache() {
        zoneOffsetTs = void 0;
        zoneOffsetGuessCache.clear();
      }
      // INFO
      /**
       * Get the value of unit.
       * @param {string} unit - a unit such as 'minute' or 'day'
       * @example DateTime.local(2017, 7, 4).get('month'); //=> 7
       * @example DateTime.local(2017, 7, 4).get('day'); //=> 4
       * @return {number}
       */
      get(unit) {
        return this[unit];
      }
      /**
       * Returns whether the DateTime is valid. Invalid DateTimes occur when:
       * * The DateTime was created from invalid calendar information, such as the 13th month or February 30
       * * The DateTime was created by an operation on another invalid date
       * @type {boolean}
       */
      get isValid() {
        return this.invalid === null;
      }
      /**
       * Returns an error code if this DateTime is invalid, or null if the DateTime is valid
       * @type {string}
       */
      get invalidReason() {
        return this.invalid ? this.invalid.reason : null;
      }
      /**
       * Returns an explanation of why this DateTime became invalid, or null if the DateTime is valid
       * @type {string}
       */
      get invalidExplanation() {
        return this.invalid ? this.invalid.explanation : null;
      }
      /**
       * Get the locale of a DateTime, such 'en-GB'. The locale is used when formatting the DateTime
       *
       * @type {string}
       */
      get locale() {
        return this.isValid ? this.loc.locale : null;
      }
      /**
       * Get the numbering system of a DateTime, such 'beng'. The numbering system is used when formatting the DateTime
       *
       * @type {string}
       */
      get numberingSystem() {
        return this.isValid ? this.loc.numberingSystem : null;
      }
      /**
       * Get the output calendar of a DateTime, such 'islamic'. The output calendar is used when formatting the DateTime
       *
       * @type {string}
       */
      get outputCalendar() {
        return this.isValid ? this.loc.outputCalendar : null;
      }
      /**
       * Get the time zone associated with this DateTime.
       * @type {Zone}
       */
      get zone() {
        return this._zone;
      }
      /**
       * Get the name of the time zone.
       * @type {string}
       */
      get zoneName() {
        return this.isValid ? this.zone.name : null;
      }
      /**
       * Get the year
       * @example DateTime.local(2017, 5, 25).year //=> 2017
       * @type {number}
       */
      get year() {
        return this.isValid ? this.c.year : NaN;
      }
      /**
       * Get the quarter
       * @example DateTime.local(2017, 5, 25).quarter //=> 2
       * @type {number}
       */
      get quarter() {
        return this.isValid ? Math.ceil(this.c.month / 3) : NaN;
      }
      /**
       * Get the month (1-12).
       * @example DateTime.local(2017, 5, 25).month //=> 5
       * @type {number}
       */
      get month() {
        return this.isValid ? this.c.month : NaN;
      }
      /**
       * Get the day of the month (1-30ish).
       * @example DateTime.local(2017, 5, 25).day //=> 25
       * @type {number}
       */
      get day() {
        return this.isValid ? this.c.day : NaN;
      }
      /**
       * Get the hour of the day (0-23).
       * @example DateTime.local(2017, 5, 25, 9).hour //=> 9
       * @type {number}
       */
      get hour() {
        return this.isValid ? this.c.hour : NaN;
      }
      /**
       * Get the minute of the hour (0-59).
       * @example DateTime.local(2017, 5, 25, 9, 30).minute //=> 30
       * @type {number}
       */
      get minute() {
        return this.isValid ? this.c.minute : NaN;
      }
      /**
       * Get the second of the minute (0-59).
       * @example DateTime.local(2017, 5, 25, 9, 30, 52).second //=> 52
       * @type {number}
       */
      get second() {
        return this.isValid ? this.c.second : NaN;
      }
      /**
       * Get the millisecond of the second (0-999).
       * @example DateTime.local(2017, 5, 25, 9, 30, 52, 654).millisecond //=> 654
       * @type {number}
       */
      get millisecond() {
        return this.isValid ? this.c.millisecond : NaN;
      }
      /**
       * Get the week year
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2014, 12, 31).weekYear //=> 2015
       * @type {number}
       */
      get weekYear() {
        return this.isValid ? possiblyCachedWeekData(this).weekYear : NaN;
      }
      /**
       * Get the week number of the week year (1-52ish).
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2017, 5, 25).weekNumber //=> 21
       * @type {number}
       */
      get weekNumber() {
        return this.isValid ? possiblyCachedWeekData(this).weekNumber : NaN;
      }
      /**
       * Get the day of the week.
       * 1 is Monday and 7 is Sunday
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2014, 11, 31).weekday //=> 4
       * @type {number}
       */
      get weekday() {
        return this.isValid ? possiblyCachedWeekData(this).weekday : NaN;
      }
      /**
       * Returns true if this date is on a weekend according to the locale, false otherwise
       * @returns {boolean}
       */
      get isWeekend() {
        return this.isValid && this.loc.getWeekendDays().includes(this.weekday);
      }
      /**
       * Get the day of the week according to the locale.
       * 1 is the first day of the week and 7 is the last day of the week.
       * If the locale assigns Sunday as the first day of the week, then a date which is a Sunday will return 1,
       * @returns {number}
       */
      get localWeekday() {
        return this.isValid ? possiblyCachedLocalWeekData(this).weekday : NaN;
      }
      /**
       * Get the week number of the week year according to the locale. Different locales assign week numbers differently,
       * because the week can start on different days of the week (see localWeekday) and because a different number of days
       * is required for a week to count as the first week of a year.
       * @returns {number}
       */
      get localWeekNumber() {
        return this.isValid ? possiblyCachedLocalWeekData(this).weekNumber : NaN;
      }
      /**
       * Get the week year according to the locale. Different locales assign week numbers (and therefor week years)
       * differently, see localWeekNumber.
       * @returns {number}
       */
      get localWeekYear() {
        return this.isValid ? possiblyCachedLocalWeekData(this).weekYear : NaN;
      }
      /**
       * Get the ordinal (meaning the day of the year)
       * @example DateTime.local(2017, 5, 25).ordinal //=> 145
       * @type {number|DateTime}
       */
      get ordinal() {
        return this.isValid ? gregorianToOrdinal(this.c).ordinal : NaN;
      }
      /**
       * Get the human readable short month name, such as 'Oct'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).monthShort //=> Oct
       * @type {string}
       */
      get monthShort() {
        return this.isValid ? Info.months("short", {
          locObj: this.loc
        })[this.month - 1] : null;
      }
      /**
       * Get the human readable long month name, such as 'October'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).monthLong //=> October
       * @type {string}
       */
      get monthLong() {
        return this.isValid ? Info.months("long", {
          locObj: this.loc
        })[this.month - 1] : null;
      }
      /**
       * Get the human readable short weekday, such as 'Mon'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).weekdayShort //=> Mon
       * @type {string}
       */
      get weekdayShort() {
        return this.isValid ? Info.weekdays("short", {
          locObj: this.loc
        })[this.weekday - 1] : null;
      }
      /**
       * Get the human readable long weekday, such as 'Monday'.
       * Defaults to the system's locale if no locale has been specified
       * @example DateTime.local(2017, 10, 30).weekdayLong //=> Monday
       * @type {string}
       */
      get weekdayLong() {
        return this.isValid ? Info.weekdays("long", {
          locObj: this.loc
        })[this.weekday - 1] : null;
      }
      /**
       * Get the UTC offset of this DateTime in minutes
       * @example DateTime.now().offset //=> -240
       * @example DateTime.utc().offset //=> 0
       * @type {number}
       */
      get offset() {
        return this.isValid ? +this.o : NaN;
      }
      /**
       * Get the short human name for the zone's current offset, for example "EST" or "EDT".
       * Defaults to the system's locale if no locale has been specified
       * @type {string}
       */
      get offsetNameShort() {
        if (this.isValid) {
          return this.zone.offsetName(this.ts, {
            format: "short",
            locale: this.locale
          });
        } else {
          return null;
        }
      }
      /**
       * Get the long human name for the zone's current offset, for example "Eastern Standard Time" or "Eastern Daylight Time".
       * Defaults to the system's locale if no locale has been specified
       * @type {string}
       */
      get offsetNameLong() {
        if (this.isValid) {
          return this.zone.offsetName(this.ts, {
            format: "long",
            locale: this.locale
          });
        } else {
          return null;
        }
      }
      /**
       * Get whether this zone's offset ever changes, as in a DST.
       * @type {boolean}
       */
      get isOffsetFixed() {
        return this.isValid ? this.zone.isUniversal : null;
      }
      /**
       * Get whether the DateTime is in a DST.
       * @type {boolean}
       */
      get isInDST() {
        if (this.isOffsetFixed) {
          return false;
        } else {
          return this.offset > this.set({
            month: 1,
            day: 1
          }).offset || this.offset > this.set({
            month: 5
          }).offset;
        }
      }
      /**
       * Get those DateTimes which have the same local time as this DateTime, but a different offset from UTC
       * in this DateTime's zone. During DST changes local time can be ambiguous, for example
       * `2023-10-29T02:30:00` in `Europe/Berlin` can have offset `+01:00` or `+02:00`.
       * This method will return both possible DateTimes if this DateTime's local time is ambiguous.
       * @returns {DateTime[]}
       */
      getPossibleOffsets() {
        if (!this.isValid || this.isOffsetFixed) {
          return [this];
        }
        const dayMs = 864e5;
        const minuteMs = 6e4;
        const localTS = objToLocalTS(this.c);
        const oEarlier = this.zone.offset(localTS - dayMs);
        const oLater = this.zone.offset(localTS + dayMs);
        const o1 = this.zone.offset(localTS - oEarlier * minuteMs);
        const o2 = this.zone.offset(localTS - oLater * minuteMs);
        if (o1 === o2) {
          return [this];
        }
        const ts1 = localTS - o1 * minuteMs;
        const ts2 = localTS - o2 * minuteMs;
        const c1 = tsToObj(ts1, o1);
        const c2 = tsToObj(ts2, o2);
        if (c1.hour === c2.hour && c1.minute === c2.minute && c1.second === c2.second && c1.millisecond === c2.millisecond) {
          return [clone(this, {
            ts: ts1
          }), clone(this, {
            ts: ts2
          })];
        }
        return [this];
      }
      /**
       * Returns true if this DateTime is in a leap year, false otherwise
       * @example DateTime.local(2016).isInLeapYear //=> true
       * @example DateTime.local(2013).isInLeapYear //=> false
       * @type {boolean}
       */
      get isInLeapYear() {
        return isLeapYear(this.year);
      }
      /**
       * Returns the number of days in this DateTime's month
       * @example DateTime.local(2016, 2).daysInMonth //=> 29
       * @example DateTime.local(2016, 3).daysInMonth //=> 31
       * @type {number}
       */
      get daysInMonth() {
        return daysInMonth(this.year, this.month);
      }
      /**
       * Returns the number of days in this DateTime's year
       * @example DateTime.local(2016).daysInYear //=> 366
       * @example DateTime.local(2013).daysInYear //=> 365
       * @type {number}
       */
      get daysInYear() {
        return this.isValid ? daysInYear(this.year) : NaN;
      }
      /**
       * Returns the number of weeks in this DateTime's year
       * @see https://en.wikipedia.org/wiki/ISO_week_date
       * @example DateTime.local(2004).weeksInWeekYear //=> 53
       * @example DateTime.local(2013).weeksInWeekYear //=> 52
       * @type {number}
       */
      get weeksInWeekYear() {
        return this.isValid ? weeksInWeekYear(this.weekYear) : NaN;
      }
      /**
       * Returns the number of weeks in this DateTime's local week year
       * @example DateTime.local(2020, 6, {locale: 'en-US'}).weeksInLocalWeekYear //=> 52
       * @example DateTime.local(2020, 6, {locale: 'de-DE'}).weeksInLocalWeekYear //=> 53
       * @type {number}
       */
      get weeksInLocalWeekYear() {
        return this.isValid ? weeksInWeekYear(this.localWeekYear, this.loc.getMinDaysInFirstWeek(), this.loc.getStartOfWeek()) : NaN;
      }
      /**
       * Returns the resolved Intl options for this DateTime.
       * This is useful in understanding the behavior of formatting methods
       * @param {Object} opts - the same options as toLocaleString
       * @return {Object}
       */
      resolvedLocaleOptions(opts = {}) {
        const {
          locale,
          numberingSystem,
          calendar
        } = Formatter.create(this.loc.clone(opts), opts).resolvedOptions(this);
        return {
          locale,
          numberingSystem,
          outputCalendar: calendar
        };
      }
      // TRANSFORM
      /**
       * "Set" the DateTime's zone to UTC. Returns a newly-constructed DateTime.
       *
       * Equivalent to {@link DateTime#setZone}('utc')
       * @param {number} [offset=0] - optionally, an offset from UTC in minutes
       * @param {Object} [opts={}] - options to pass to `setZone()`
       * @return {DateTime}
       */
      toUTC(offset2 = 0, opts = {}) {
        return this.setZone(FixedOffsetZone.instance(offset2), opts);
      }
      /**
       * "Set" the DateTime's zone to the host's local zone. Returns a newly-constructed DateTime.
       *
       * Equivalent to `setZone('local')`
       * @return {DateTime}
       */
      toLocal() {
        return this.setZone(Settings.defaultZone);
      }
      /**
       * "Set" the DateTime's zone to specified zone. Returns a newly-constructed DateTime.
       *
       * By default, the setter keeps the underlying time the same (as in, the same timestamp), but the new instance will report different local times and consider DSTs when making computations, as with {@link DateTime#plus}. You may wish to use {@link DateTime#toLocal} and {@link DateTime#toUTC} which provide simple convenience wrappers for commonly used zones.
       * @param {string|Zone} [zone='local'] - a zone identifier. As a string, that can be any IANA zone supported by the host environment, or a fixed-offset name of the form 'UTC+3', or the strings 'local' or 'utc'. You may also supply an instance of a {@link DateTime#Zone} class.
       * @param {Object} opts - options
       * @param {boolean} [opts.keepLocalTime=false] - If true, adjust the underlying time so that the local time stays the same, but in the target zone. You should rarely need this.
       * @return {DateTime}
       */
      setZone(zone, {
        keepLocalTime = false,
        keepCalendarTime = false
      } = {}) {
        zone = normalizeZone(zone, Settings.defaultZone);
        if (zone.equals(this.zone)) {
          return this;
        } else if (!zone.isValid) {
          return _DateTime.invalid(unsupportedZone(zone));
        } else {
          let newTS = this.ts;
          if (keepLocalTime || keepCalendarTime) {
            const offsetGuess = zone.offset(this.ts);
            const asObj = this.toObject();
            [newTS] = objToTS(asObj, offsetGuess, zone);
          }
          return clone(this, {
            ts: newTS,
            zone
          });
        }
      }
      /**
       * "Set" the locale, numberingSystem, or outputCalendar. Returns a newly-constructed DateTime.
       * @param {Object} properties - the properties to set
       * @example DateTime.local(2017, 5, 25).reconfigure({ locale: 'en-GB' })
       * @return {DateTime}
       */
      reconfigure({
        locale,
        numberingSystem,
        outputCalendar
      } = {}) {
        const loc = this.loc.clone({
          locale,
          numberingSystem,
          outputCalendar
        });
        return clone(this, {
          loc
        });
      }
      /**
       * "Set" the locale. Returns a newly-constructed DateTime.
       * Just a convenient alias for reconfigure({ locale })
       * @example DateTime.local(2017, 5, 25).setLocale('en-GB')
       * @return {DateTime}
       */
      setLocale(locale) {
        return this.reconfigure({
          locale
        });
      }
      /**
       * "Set" the values of specified units. Returns a newly-constructed DateTime.
       * You can only set units with this method; for "setting" metadata, see {@link DateTime#reconfigure} and {@link DateTime#setZone}.
       *
       * This method also supports setting locale-based week units, i.e. `localWeekday`, `localWeekNumber` and `localWeekYear`.
       * They cannot be mixed with ISO-week units like `weekday`.
       * @param {Object} values - a mapping of units to numbers
       * @example dt.set({ year: 2017 })
       * @example dt.set({ hour: 8, minute: 30 })
       * @example dt.set({ weekday: 5 })
       * @example dt.set({ year: 2005, ordinal: 234 })
       * @return {DateTime}
       */
      set(values) {
        if (!this.isValid) return this;
        const normalized = normalizeObject(values, normalizeUnitWithLocalWeeks);
        const {
          minDaysInFirstWeek,
          startOfWeek
        } = usesLocalWeekValues(normalized, this.loc);
        const settingWeekStuff = !isUndefined(normalized.weekYear) || !isUndefined(normalized.weekNumber) || !isUndefined(normalized.weekday), containsOrdinal = !isUndefined(normalized.ordinal), containsGregorYear = !isUndefined(normalized.year), containsGregorMD = !isUndefined(normalized.month) || !isUndefined(normalized.day), containsGregor = containsGregorYear || containsGregorMD, definiteWeekDef = normalized.weekYear || normalized.weekNumber;
        if ((containsGregor || containsOrdinal) && definiteWeekDef) {
          throw new ConflictingSpecificationError("Can't mix weekYear/weekNumber units with year/month/day or ordinals");
        }
        if (containsGregorMD && containsOrdinal) {
          throw new ConflictingSpecificationError("Can't mix ordinal dates with month/day");
        }
        let mixed;
        if (settingWeekStuff) {
          mixed = weekToGregorian({
            ...gregorianToWeek(this.c, minDaysInFirstWeek, startOfWeek),
            ...normalized
          }, minDaysInFirstWeek, startOfWeek);
        } else if (!isUndefined(normalized.ordinal)) {
          mixed = ordinalToGregorian({
            ...gregorianToOrdinal(this.c),
            ...normalized
          });
        } else {
          mixed = {
            ...this.toObject(),
            ...normalized
          };
          if (isUndefined(normalized.day)) {
            mixed.day = Math.min(daysInMonth(mixed.year, mixed.month), mixed.day);
          }
        }
        const [ts, o] = objToTS(mixed, this.o, this.zone);
        return clone(this, {
          ts,
          o
        });
      }
      /**
       * Add a period of time to this DateTime and return the resulting DateTime
       *
       * Adding hours, minutes, seconds, or milliseconds increases the timestamp by the right number of milliseconds. Adding days, months, or years shifts the calendar, accounting for DSTs and leap years along the way. Thus, `dt.plus({ hours: 24 })` may result in a different time than `dt.plus({ days: 1 })` if there's a DST shift in between.
       * @param {Duration|Object|number} duration - The amount to add. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       * @example DateTime.now().plus(123) //~> in 123 milliseconds
       * @example DateTime.now().plus({ minutes: 15 }) //~> in 15 minutes
       * @example DateTime.now().plus({ days: 1 }) //~> this time tomorrow
       * @example DateTime.now().plus({ days: -1 }) //~> this time yesterday
       * @example DateTime.now().plus({ hours: 3, minutes: 13 }) //~> in 3 hr, 13 min
       * @example DateTime.now().plus(Duration.fromObject({ hours: 3, minutes: 13 })) //~> in 3 hr, 13 min
       * @return {DateTime}
       */
      plus(duration) {
        if (!this.isValid) return this;
        const dur = Duration.fromDurationLike(duration);
        return clone(this, adjustTime(this, dur));
      }
      /**
       * Subtract a period of time to this DateTime and return the resulting DateTime
       * See {@link DateTime#plus}
       * @param {Duration|Object|number} duration - The amount to subtract. Either a Luxon Duration, a number of milliseconds, the object argument to Duration.fromObject()
       @return {DateTime}
       */
      minus(duration) {
        if (!this.isValid) return this;
        const dur = Duration.fromDurationLike(duration).negate();
        return clone(this, adjustTime(this, dur));
      }
      /**
       * "Set" this DateTime to the beginning of a unit of time.
       * @param {string} unit - The unit to go to the beginning of. Can be 'year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', or 'millisecond'.
       * @param {Object} opts - options
       * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week
       * @example DateTime.local(2014, 3, 3).startOf('month').toISODate(); //=> '2014-03-01'
       * @example DateTime.local(2014, 3, 3).startOf('year').toISODate(); //=> '2014-01-01'
       * @example DateTime.local(2014, 3, 3).startOf('week').toISODate(); //=> '2014-03-03', weeks always start on Mondays
       * @example DateTime.local(2014, 3, 3, 5, 30).startOf('day').toISOTime(); //=> '00:00.000-05:00'
       * @example DateTime.local(2014, 3, 3, 5, 30).startOf('hour').toISOTime(); //=> '05:00:00.000-05:00'
       * @return {DateTime}
       */
      startOf(unit, {
        useLocaleWeeks = false
      } = {}) {
        if (!this.isValid) return this;
        const o = {}, normalizedUnit = Duration.normalizeUnit(unit);
        switch (normalizedUnit) {
          case "years":
            o.month = 1;
          // falls through
          case "quarters":
          case "months":
            o.day = 1;
          // falls through
          case "weeks":
          case "days":
            o.hour = 0;
          // falls through
          case "hours":
            o.minute = 0;
          // falls through
          case "minutes":
            o.second = 0;
          // falls through
          case "seconds":
            o.millisecond = 0;
            break;
        }
        if (normalizedUnit === "weeks") {
          if (useLocaleWeeks) {
            const startOfWeek = this.loc.getStartOfWeek();
            const {
              weekday
            } = this;
            if (weekday < startOfWeek) {
              o.weekNumber = this.weekNumber - 1;
            }
            o.weekday = startOfWeek;
          } else {
            o.weekday = 1;
          }
        }
        if (normalizedUnit === "quarters") {
          const q = Math.ceil(this.month / 3);
          o.month = (q - 1) * 3 + 1;
        }
        return this.set(o);
      }
      /**
       * "Set" this DateTime to the end (meaning the last millisecond) of a unit of time
       * @param {string} unit - The unit to go to the end of. Can be 'year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', or 'millisecond'.
       * @param {Object} opts - options
       * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week
       * @example DateTime.local(2014, 3, 3).endOf('month').toISO(); //=> '2014-03-31T23:59:59.999-05:00'
       * @example DateTime.local(2014, 3, 3).endOf('year').toISO(); //=> '2014-12-31T23:59:59.999-05:00'
       * @example DateTime.local(2014, 3, 3).endOf('week').toISO(); // => '2014-03-09T23:59:59.999-05:00', weeks start on Mondays
       * @example DateTime.local(2014, 3, 3, 5, 30).endOf('day').toISO(); //=> '2014-03-03T23:59:59.999-05:00'
       * @example DateTime.local(2014, 3, 3, 5, 30).endOf('hour').toISO(); //=> '2014-03-03T05:59:59.999-05:00'
       * @return {DateTime}
       */
      endOf(unit, opts) {
        return this.isValid ? this.plus({
          [unit]: 1
        }).startOf(unit, opts).minus(1) : this;
      }
      // OUTPUT
      /**
       * Returns a string representation of this DateTime formatted according to the specified format string.
       * **You may not want this.** See {@link DateTime#toLocaleString} for a more flexible formatting tool. For a table of tokens and their interpretations, see [here](https://moment.github.io/luxon/#/formatting?id=table-of-tokens).
       * Defaults to en-US if no locale has been specified, regardless of the system's locale.
       * @param {string} fmt - the format string
       * @param {Object} opts - opts to override the configuration options on this DateTime
       * @example DateTime.now().toFormat('yyyy LLL dd') //=> '2017 Apr 22'
       * @example DateTime.now().setLocale('fr').toFormat('yyyy LLL dd') //=> '2017 avr. 22'
       * @example DateTime.now().toFormat('yyyy LLL dd', { locale: "fr" }) //=> '2017 avr. 22'
       * @example DateTime.now().toFormat("HH 'hours and' mm 'minutes'") //=> '20 hours and 55 minutes'
       * @return {string}
       */
      toFormat(fmt, opts = {}) {
        return this.isValid ? Formatter.create(this.loc.redefaultToEN(opts)).formatDateTimeFromString(this, fmt) : INVALID;
      }
      /**
       * Returns a localized string representing this date. Accepts the same options as the Intl.DateTimeFormat constructor and any presets defined by Luxon, such as `DateTime.DATE_FULL` or `DateTime.TIME_SIMPLE`.
       * The exact behavior of this method is browser-specific, but in general it will return an appropriate representation
       * of the DateTime in the assigned locale.
       * Defaults to the system's locale if no locale has been specified
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
       * @param formatOpts {Object} - Intl.DateTimeFormat constructor options and configuration options
       * @param {Object} opts - opts to override the configuration options on this DateTime
       * @example DateTime.now().toLocaleString(); //=> 4/20/2017
       * @example DateTime.now().setLocale('en-gb').toLocaleString(); //=> '20/04/2017'
       * @example DateTime.now().toLocaleString(DateTime.DATE_FULL); //=> 'April 20, 2017'
       * @example DateTime.now().toLocaleString(DateTime.DATE_FULL, { locale: 'fr' }); //=> '28 août 2022'
       * @example DateTime.now().toLocaleString(DateTime.TIME_SIMPLE); //=> '11:32 AM'
       * @example DateTime.now().toLocaleString(DateTime.DATETIME_SHORT); //=> '4/20/2017, 11:32 AM'
       * @example DateTime.now().toLocaleString({ weekday: 'long', month: 'long', day: '2-digit' }); //=> 'Thursday, April 20'
       * @example DateTime.now().toLocaleString({ weekday: 'short', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); //=> 'Thu, Apr 20, 11:27 AM'
       * @example DateTime.now().toLocaleString({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); //=> '11:32'
       * @return {string}
       */
      toLocaleString(formatOpts = DATE_SHORT, opts = {}) {
        return this.isValid ? Formatter.create(this.loc.clone(opts), formatOpts).formatDateTime(this) : INVALID;
      }
      /**
       * Returns an array of format "parts", meaning individual tokens along with metadata. This is allows callers to post-process individual sections of the formatted output.
       * Defaults to the system's locale if no locale has been specified
       * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat/formatToParts
       * @param opts {Object} - Intl.DateTimeFormat constructor options, same as `toLocaleString`.
       * @example DateTime.now().toLocaleParts(); //=> [
       *                                   //=>   { type: 'day', value: '25' },
       *                                   //=>   { type: 'literal', value: '/' },
       *                                   //=>   { type: 'month', value: '05' },
       *                                   //=>   { type: 'literal', value: '/' },
       *                                   //=>   { type: 'year', value: '1982' }
       *                                   //=> ]
       */
      toLocaleParts(opts = {}) {
        return this.isValid ? Formatter.create(this.loc.clone(opts), opts).formatDateTimeParts(this) : [];
      }
      /**
       * Returns an ISO 8601-compliant string representation of this DateTime
       * @param {Object} opts - options
       * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
       * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @param {boolean} [opts.extendedZone=false] - add the time zone format extension
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @param {string} [opts.precision='milliseconds'] - truncate output to desired presicion: 'years', 'months', 'days', 'hours', 'minutes', 'seconds' or 'milliseconds'. When precision and suppressSeconds or suppressMilliseconds are used together, precision sets the maximum unit shown in the output, however seconds or milliseconds will still be suppressed if they are 0.
       * @example DateTime.utc(1983, 5, 25).toISO() //=> '1982-05-25T00:00:00.000Z'
       * @example DateTime.now().toISO() //=> '2017-04-22T20:47:05.335-04:00'
       * @example DateTime.now().toISO({ includeOffset: false }) //=> '2017-04-22T20:47:05.335'
       * @example DateTime.now().toISO({ format: 'basic' }) //=> '20170422T204705.335-0400'
       * @example DateTime.now().toISO({ precision: 'day' }) //=> '2017-04-22Z'
       * @example DateTime.now().toISO({ precision: 'minute' }) //=> '2017-04-22T20:47Z'
       * @return {string|null}
       */
      toISO({
        format = "extended",
        suppressSeconds = false,
        suppressMilliseconds = false,
        includeOffset = true,
        extendedZone = false,
        precision = "milliseconds"
      } = {}) {
        if (!this.isValid) {
          return null;
        }
        precision = normalizeUnit(precision);
        const ext = format === "extended";
        let c = toISODate(this, ext, precision);
        if (orderedUnits.indexOf(precision) >= 3) c += "T";
        c += toISOTime(this, ext, suppressSeconds, suppressMilliseconds, includeOffset, extendedZone, precision);
        return c;
      }
      /**
       * Returns an ISO 8601-compliant string representation of this DateTime's date component
       * @param {Object} opts - options
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @param {string} [opts.precision='day'] - truncate output to desired precision: 'years', 'months', or 'days'.
       * @example DateTime.utc(1982, 5, 25).toISODate() //=> '1982-05-25'
       * @example DateTime.utc(1982, 5, 25).toISODate({ format: 'basic' }) //=> '19820525'
       * @example DateTime.utc(1982, 5, 25).toISODate({ precision: 'month' }) //=> '1982-05'
       * @return {string|null}
       */
      toISODate({
        format = "extended",
        precision = "day"
      } = {}) {
        if (!this.isValid) {
          return null;
        }
        return toISODate(this, format === "extended", normalizeUnit(precision));
      }
      /**
       * Returns an ISO 8601-compliant string representation of this DateTime's week date
       * @example DateTime.utc(1982, 5, 25).toISOWeekDate() //=> '1982-W21-2'
       * @return {string}
       */
      toISOWeekDate() {
        return toTechFormat(this, "kkkk-'W'WW-c");
      }
      /**
       * Returns an ISO 8601-compliant string representation of this DateTime's time component
       * @param {Object} opts - options
       * @param {boolean} [opts.suppressMilliseconds=false] - exclude milliseconds from the format if they're 0
       * @param {boolean} [opts.suppressSeconds=false] - exclude seconds from the format if they're 0
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @param {boolean} [opts.extendedZone=true] - add the time zone format extension
       * @param {boolean} [opts.includePrefix=false] - include the `T` prefix
       * @param {string} [opts.format='extended'] - choose between the basic and extended format
       * @param {string} [opts.precision='milliseconds'] - truncate output to desired presicion: 'hours', 'minutes', 'seconds' or 'milliseconds'. When precision and suppressSeconds or suppressMilliseconds are used together, precision sets the maximum unit shown in the output, however seconds or milliseconds will still be suppressed if they are 0.
       * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime() //=> '07:34:19.361Z'
       * @example DateTime.utc().set({ hour: 7, minute: 34, seconds: 0, milliseconds: 0 }).toISOTime({ suppressSeconds: true }) //=> '07:34Z'
       * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime({ format: 'basic' }) //=> '073419.361Z'
       * @example DateTime.utc().set({ hour: 7, minute: 34 }).toISOTime({ includePrefix: true }) //=> 'T07:34:19.361Z'
       * @example DateTime.utc().set({ hour: 7, minute: 34, second: 56 }).toISOTime({ precision: 'minute' }) //=> '07:34Z'
       * @return {string}
       */
      toISOTime({
        suppressMilliseconds = false,
        suppressSeconds = false,
        includeOffset = true,
        includePrefix = false,
        extendedZone = false,
        format = "extended",
        precision = "milliseconds"
      } = {}) {
        if (!this.isValid) {
          return null;
        }
        precision = normalizeUnit(precision);
        let c = includePrefix && orderedUnits.indexOf(precision) >= 3 ? "T" : "";
        return c + toISOTime(this, format === "extended", suppressSeconds, suppressMilliseconds, includeOffset, extendedZone, precision);
      }
      /**
       * Returns an RFC 2822-compatible string representation of this DateTime
       * @example DateTime.utc(2014, 7, 13).toRFC2822() //=> 'Sun, 13 Jul 2014 00:00:00 +0000'
       * @example DateTime.local(2014, 7, 13).toRFC2822() //=> 'Sun, 13 Jul 2014 00:00:00 -0400'
       * @return {string}
       */
      toRFC2822() {
        return toTechFormat(this, "EEE, dd LLL yyyy HH:mm:ss ZZZ", false);
      }
      /**
       * Returns a string representation of this DateTime appropriate for use in HTTP headers. The output is always expressed in GMT.
       * Specifically, the string conforms to RFC 1123.
       * @see https://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html#sec3.3.1
       * @example DateTime.utc(2014, 7, 13).toHTTP() //=> 'Sun, 13 Jul 2014 00:00:00 GMT'
       * @example DateTime.utc(2014, 7, 13, 19).toHTTP() //=> 'Sun, 13 Jul 2014 19:00:00 GMT'
       * @return {string}
       */
      toHTTP() {
        return toTechFormat(this.toUTC(), "EEE, dd LLL yyyy HH:mm:ss 'GMT'");
      }
      /**
       * Returns a string representation of this DateTime appropriate for use in SQL Date
       * @example DateTime.utc(2014, 7, 13).toSQLDate() //=> '2014-07-13'
       * @return {string|null}
       */
      toSQLDate() {
        if (!this.isValid) {
          return null;
        }
        return toISODate(this, true);
      }
      /**
       * Returns a string representation of this DateTime appropriate for use in SQL Time
       * @param {Object} opts - options
       * @param {boolean} [opts.includeZone=false] - include the zone, such as 'America/New_York'. Overrides includeOffset.
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @param {boolean} [opts.includeOffsetSpace=true] - include the space between the time and the offset, such as '05:15:16.345 -04:00'
       * @example DateTime.utc().toSQL() //=> '05:15:16.345'
       * @example DateTime.now().toSQL() //=> '05:15:16.345 -04:00'
       * @example DateTime.now().toSQL({ includeOffset: false }) //=> '05:15:16.345'
       * @example DateTime.now().toSQL({ includeZone: false }) //=> '05:15:16.345 America/New_York'
       * @return {string}
       */
      toSQLTime({
        includeOffset = true,
        includeZone = false,
        includeOffsetSpace = true
      } = {}) {
        let fmt = "HH:mm:ss.SSS";
        if (includeZone || includeOffset) {
          if (includeOffsetSpace) {
            fmt += " ";
          }
          if (includeZone) {
            fmt += "z";
          } else if (includeOffset) {
            fmt += "ZZ";
          }
        }
        return toTechFormat(this, fmt, true);
      }
      /**
       * Returns a string representation of this DateTime appropriate for use in SQL DateTime
       * @param {Object} opts - options
       * @param {boolean} [opts.includeZone=false] - include the zone, such as 'America/New_York'. Overrides includeOffset.
       * @param {boolean} [opts.includeOffset=true] - include the offset, such as 'Z' or '-04:00'
       * @param {boolean} [opts.includeOffsetSpace=true] - include the space between the time and the offset, such as '05:15:16.345 -04:00'
       * @example DateTime.utc(2014, 7, 13).toSQL() //=> '2014-07-13 00:00:00.000 Z'
       * @example DateTime.local(2014, 7, 13).toSQL() //=> '2014-07-13 00:00:00.000 -04:00'
       * @example DateTime.local(2014, 7, 13).toSQL({ includeOffset: false }) //=> '2014-07-13 00:00:00.000'
       * @example DateTime.local(2014, 7, 13).toSQL({ includeZone: true }) //=> '2014-07-13 00:00:00.000 America/New_York'
       * @return {string}
       */
      toSQL(opts = {}) {
        if (!this.isValid) {
          return null;
        }
        return `${this.toSQLDate()} ${this.toSQLTime(opts)}`;
      }
      /**
       * Returns a string representation of this DateTime appropriate for debugging
       * @return {string}
       */
      toString() {
        return this.isValid ? this.toISO() : INVALID;
      }
      /**
       * Returns a string representation of this DateTime appropriate for the REPL.
       * @return {string}
       */
      [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
        if (this.isValid) {
          return `DateTime { ts: ${this.toISO()}, zone: ${this.zone.name}, locale: ${this.locale} }`;
        } else {
          return `DateTime { Invalid, reason: ${this.invalidReason} }`;
        }
      }
      /**
       * Returns the epoch milliseconds of this DateTime. Alias of {@link DateTime#toMillis}
       * @return {number}
       */
      valueOf() {
        return this.toMillis();
      }
      /**
       * Returns the epoch milliseconds of this DateTime.
       * @return {number}
       */
      toMillis() {
        return this.isValid ? this.ts : NaN;
      }
      /**
       * Returns the epoch seconds (including milliseconds in the fractional part) of this DateTime.
       * @return {number}
       */
      toSeconds() {
        return this.isValid ? this.ts / 1e3 : NaN;
      }
      /**
       * Returns the epoch seconds (as a whole number) of this DateTime.
       * @return {number}
       */
      toUnixInteger() {
        return this.isValid ? Math.floor(this.ts / 1e3) : NaN;
      }
      /**
       * Returns an ISO 8601 representation of this DateTime appropriate for use in JSON.
       * @return {string}
       */
      toJSON() {
        return this.toISO();
      }
      /**
       * Returns a BSON serializable equivalent to this DateTime.
       * @return {Date}
       */
      toBSON() {
        return this.toJSDate();
      }
      /**
       * Returns a JavaScript object with this DateTime's year, month, day, and so on.
       * @param opts - options for generating the object
       * @param {boolean} [opts.includeConfig=false] - include configuration attributes in the output
       * @example DateTime.now().toObject() //=> { year: 2017, month: 4, day: 22, hour: 20, minute: 49, second: 42, millisecond: 268 }
       * @return {Object}
       */
      toObject(opts = {}) {
        if (!this.isValid) return {};
        const base = {
          ...this.c
        };
        if (opts.includeConfig) {
          base.outputCalendar = this.outputCalendar;
          base.numberingSystem = this.loc.numberingSystem;
          base.locale = this.loc.locale;
        }
        return base;
      }
      /**
       * Returns a JavaScript Date equivalent to this DateTime.
       * @return {Date}
       */
      toJSDate() {
        return new Date(this.isValid ? this.ts : NaN);
      }
      // COMPARE
      /**
       * Return the difference between two DateTimes as a Duration.
       * @param {DateTime} otherDateTime - the DateTime to compare this one to
       * @param {string|string[]} [unit=['milliseconds']] - the unit or array of units (such as 'hours' or 'days') to include in the duration.
       * @param {Object} opts - options that affect the creation of the Duration
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @example
       * var i1 = DateTime.fromISO('1982-05-25T09:45'),
       *     i2 = DateTime.fromISO('1983-10-14T10:30');
       * i2.diff(i1).toObject() //=> { milliseconds: 43807500000 }
       * i2.diff(i1, 'hours').toObject() //=> { hours: 12168.75 }
       * i2.diff(i1, ['months', 'days']).toObject() //=> { months: 16, days: 19.03125 }
       * i2.diff(i1, ['months', 'days', 'hours']).toObject() //=> { months: 16, days: 19, hours: 0.75 }
       * @return {Duration}
       */
      diff(otherDateTime, unit = "milliseconds", opts = {}) {
        if (!this.isValid || !otherDateTime.isValid) {
          return Duration.invalid("created by diffing an invalid DateTime");
        }
        const durOpts = {
          locale: this.locale,
          numberingSystem: this.numberingSystem,
          ...opts
        };
        const units = maybeArray(unit).map(Duration.normalizeUnit), otherIsLater = otherDateTime.valueOf() > this.valueOf(), earlier = otherIsLater ? this : otherDateTime, later = otherIsLater ? otherDateTime : this, diffed = diff(earlier, later, units, durOpts);
        return otherIsLater ? diffed.negate() : diffed;
      }
      /**
       * Return the difference between this DateTime and right now.
       * See {@link DateTime#diff}
       * @param {string|string[]} [unit=['milliseconds']] - the unit or units units (such as 'hours' or 'days') to include in the duration
       * @param {Object} opts - options that affect the creation of the Duration
       * @param {string} [opts.conversionAccuracy='casual'] - the conversion system to use
       * @return {Duration}
       */
      diffNow(unit = "milliseconds", opts = {}) {
        return this.diff(_DateTime.now(), unit, opts);
      }
      /**
       * Return an Interval spanning between this DateTime and another DateTime
       * @param {DateTime} otherDateTime - the other end point of the Interval
       * @return {Interval|DateTime}
       */
      until(otherDateTime) {
        return this.isValid ? Interval.fromDateTimes(this, otherDateTime) : this;
      }
      /**
       * Return whether this DateTime is in the same unit of time as another DateTime.
       * Higher-order units must also be identical for this function to return `true`.
       * Note that time zones are **ignored** in this comparison, which compares the **local** calendar time. Use {@link DateTime#setZone} to convert one of the dates if needed.
       * @param {DateTime} otherDateTime - the other DateTime
       * @param {string} unit - the unit of time to check sameness on
       * @param {Object} opts - options
       * @param {boolean} [opts.useLocaleWeeks=false] - If true, use weeks based on the locale, i.e. use the locale-dependent start of the week; only the locale of this DateTime is used
       * @example DateTime.now().hasSame(otherDT, 'day'); //~> true if otherDT is in the same current calendar day
       * @return {boolean}
       */
      hasSame(otherDateTime, unit, opts) {
        if (!this.isValid) return false;
        const inputMs = otherDateTime.valueOf();
        const adjustedToZone = this.setZone(otherDateTime.zone, {
          keepLocalTime: true
        });
        return adjustedToZone.startOf(unit, opts) <= inputMs && inputMs <= adjustedToZone.endOf(unit, opts);
      }
      /**
       * Equality check
       * Two DateTimes are equal if and only if they represent the same millisecond, have the same zone and location, and are both valid.
       * To compare just the millisecond values, use `+dt1 === +dt2`.
       * @param {DateTime} other - the other DateTime
       * @return {boolean}
       */
      equals(other) {
        return this.isValid && other.isValid && this.valueOf() === other.valueOf() && this.zone.equals(other.zone) && this.loc.equals(other.loc);
      }
      /**
       * Returns a string representation of a this time relative to now, such as "in two days". Can only internationalize if your
       * platform supports Intl.RelativeTimeFormat. Rounds towards zero by default.
       * @param {Object} options - options that affect the output
       * @param {DateTime} [options.base=DateTime.now()] - the DateTime to use as the basis to which this time is compared. Defaults to now.
       * @param {string} [options.style="long"] - the style of units, must be "long", "short", or "narrow"
       * @param {string|string[]} options.unit - use a specific unit or array of units; if omitted, or an array, the method will pick the best unit. Use an array or one of "years", "quarters", "months", "weeks", "days", "hours", "minutes", or "seconds"
       * @param {boolean} [options.round=true] - whether to round the numbers in the output.
       * @param {string} [options.rounding="trunc"] - rounding method to use when rounding the numbers in the output. Can be "trunc" (toward zero), "expand" (away from zero), "round", "floor", or "ceil".
       * @param {number} [options.padding=0] - padding in milliseconds. This allows you to round up the result if it fits inside the threshold. Don't use in combination with {round: false} because the decimal output will include the padding.
       * @param {string} options.locale - override the locale of this DateTime
       * @param {string} options.numberingSystem - override the numberingSystem of this DateTime. The Intl system may choose not to honor this
       * @example DateTime.now().plus({ days: 1 }).toRelative() //=> "in 1 day"
       * @example DateTime.now().setLocale("es").toRelative({ days: 1 }) //=> "dentro de 1 día"
       * @example DateTime.now().plus({ days: 1 }).toRelative({ locale: "fr" }) //=> "dans 23 heures"
       * @example DateTime.now().minus({ days: 2 }).toRelative() //=> "2 days ago"
       * @example DateTime.now().minus({ days: 2 }).toRelative({ unit: "hours" }) //=> "48 hours ago"
       * @example DateTime.now().minus({ hours: 36 }).toRelative({ round: false }) //=> "1.5 days ago"
       */
      toRelative(options = {}) {
        if (!this.isValid) return null;
        const base = options.base || _DateTime.fromObject({}, {
          zone: this.zone
        }), padding = options.padding ? this < base ? -options.padding : options.padding : 0;
        let units = ["years", "months", "days", "hours", "minutes", "seconds"];
        let unit = options.unit;
        if (Array.isArray(options.unit)) {
          units = options.unit;
          unit = void 0;
        }
        return diffRelative(base, this.plus(padding), {
          ...options,
          numeric: "always",
          units,
          unit
        });
      }
      /**
       * Returns a string representation of this date relative to today, such as "yesterday" or "next month".
       * Only internationalizes on platforms that supports Intl.RelativeTimeFormat.
       * @param {Object} options - options that affect the output
       * @param {DateTime} [options.base=DateTime.now()] - the DateTime to use as the basis to which this time is compared. Defaults to now.
       * @param {string} options.locale - override the locale of this DateTime
       * @param {string} options.unit - use a specific unit; if omitted, the method will pick the unit. Use one of "years", "quarters", "months", "weeks", or "days"
       * @param {string} options.numberingSystem - override the numberingSystem of this DateTime. The Intl system may choose not to honor this
       * @example DateTime.now().plus({ days: 1 }).toRelativeCalendar() //=> "tomorrow"
       * @example DateTime.now().setLocale("es").plus({ days: 1 }).toRelative() //=> ""mañana"
       * @example DateTime.now().plus({ days: 1 }).toRelativeCalendar({ locale: "fr" }) //=> "demain"
       * @example DateTime.now().minus({ days: 2 }).toRelativeCalendar() //=> "2 days ago"
       */
      toRelativeCalendar(options = {}) {
        if (!this.isValid) return null;
        return diffRelative(options.base || _DateTime.fromObject({}, {
          zone: this.zone
        }), this, {
          ...options,
          numeric: "auto",
          units: ["years", "months", "days"],
          calendary: true
        });
      }
      /**
       * Return the min of several date times
       * @param {...DateTime} dateTimes - the DateTimes from which to choose the minimum
       * @return {DateTime} the min DateTime, or undefined if called with no argument
       */
      static min(...dateTimes) {
        if (!dateTimes.every(_DateTime.isDateTime)) {
          throw new InvalidArgumentError("min requires all arguments be DateTimes");
        }
        return bestBy(dateTimes, (i) => i.valueOf(), Math.min);
      }
      /**
       * Return the max of several date times
       * @param {...DateTime} dateTimes - the DateTimes from which to choose the maximum
       * @return {DateTime} the max DateTime, or undefined if called with no argument
       */
      static max(...dateTimes) {
        if (!dateTimes.every(_DateTime.isDateTime)) {
          throw new InvalidArgumentError("max requires all arguments be DateTimes");
        }
        return bestBy(dateTimes, (i) => i.valueOf(), Math.max);
      }
      // MISC
      /**
       * Explain how a string would be parsed by fromFormat()
       * @param {string} text - the string to parse
       * @param {string} fmt - the format the string is expected to be in (see description)
       * @param {Object} options - options taken by fromFormat()
       * @return {Object}
       */
      static fromFormatExplain(text, fmt, options = {}) {
        const {
          locale = null,
          numberingSystem = null
        } = options, localeToUse = Locale.fromOpts({
          locale,
          numberingSystem,
          defaultToEN: true
        });
        return explainFromTokens(localeToUse, text, fmt);
      }
      /**
       * @deprecated use fromFormatExplain instead
       */
      static fromStringExplain(text, fmt, options = {}) {
        return _DateTime.fromFormatExplain(text, fmt, options);
      }
      /**
       * Build a parser for `fmt` using the given locale. This parser can be passed
       * to {@link DateTime.fromFormatParser} to a parse a date in this format. This
       * can be used to optimize cases where many dates need to be parsed in a
       * specific format.
       *
       * @param {String} fmt - the format the string is expected to be in (see
       * description)
       * @param {Object} options - options used to set locale and numberingSystem
       * for parser
       * @returns {TokenParser} - opaque object to be used
       */
      static buildFormatParser(fmt, options = {}) {
        const {
          locale = null,
          numberingSystem = null
        } = options, localeToUse = Locale.fromOpts({
          locale,
          numberingSystem,
          defaultToEN: true
        });
        return new TokenParser(localeToUse, fmt);
      }
      /**
       * Create a DateTime from an input string and format parser.
       *
       * The format parser must have been created with the same locale as this call.
       *
       * @param {String} text - the string to parse
       * @param {TokenParser} formatParser - parser from {@link DateTime.buildFormatParser}
       * @param {Object} opts - options taken by fromFormat()
       * @returns {DateTime}
       */
      static fromFormatParser(text, formatParser, opts = {}) {
        if (isUndefined(text) || isUndefined(formatParser)) {
          throw new InvalidArgumentError("fromFormatParser requires an input string and a format parser");
        }
        const {
          locale = null,
          numberingSystem = null
        } = opts, localeToUse = Locale.fromOpts({
          locale,
          numberingSystem,
          defaultToEN: true
        });
        if (!localeToUse.equals(formatParser.locale)) {
          throw new InvalidArgumentError(`fromFormatParser called with a locale of ${localeToUse}, but the format parser was created for ${formatParser.locale}`);
        }
        const {
          result,
          zone,
          specificOffset,
          invalidReason
        } = formatParser.explainFromTokens(text);
        if (invalidReason) {
          return _DateTime.invalid(invalidReason);
        } else {
          return parseDataToDateTime(result, zone, opts, `format ${formatParser.format}`, text, specificOffset);
        }
      }
      // FORMAT PRESETS
      /**
       * {@link DateTime#toLocaleString} format like 10/14/1983
       * @type {Object}
       */
      static get DATE_SHORT() {
        return DATE_SHORT;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Oct 14, 1983'
       * @type {Object}
       */
      static get DATE_MED() {
        return DATE_MED;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Fri, Oct 14, 1983'
       * @type {Object}
       */
      static get DATE_MED_WITH_WEEKDAY() {
        return DATE_MED_WITH_WEEKDAY;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'October 14, 1983'
       * @type {Object}
       */
      static get DATE_FULL() {
        return DATE_FULL;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Tuesday, October 14, 1983'
       * @type {Object}
       */
      static get DATE_HUGE() {
        return DATE_HUGE;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_SIMPLE() {
        return TIME_SIMPLE;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_WITH_SECONDS() {
        return TIME_WITH_SECONDS;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23 AM EDT'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_WITH_SHORT_OFFSET() {
        return TIME_WITH_SHORT_OFFSET;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23 AM Eastern Daylight Time'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get TIME_WITH_LONG_OFFSET() {
        return TIME_WITH_LONG_OFFSET;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_SIMPLE() {
        return TIME_24_SIMPLE;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_WITH_SECONDS() {
        return TIME_24_WITH_SECONDS;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23 EDT', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_WITH_SHORT_OFFSET() {
        return TIME_24_WITH_SHORT_OFFSET;
      }
      /**
       * {@link DateTime#toLocaleString} format like '09:30:23 Eastern Daylight Time', always 24-hour.
       * @type {Object}
       */
      static get TIME_24_WITH_LONG_OFFSET() {
        return TIME_24_WITH_LONG_OFFSET;
      }
      /**
       * {@link DateTime#toLocaleString} format like '10/14/1983, 9:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_SHORT() {
        return DATETIME_SHORT;
      }
      /**
       * {@link DateTime#toLocaleString} format like '10/14/1983, 9:30:33 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_SHORT_WITH_SECONDS() {
        return DATETIME_SHORT_WITH_SECONDS;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Oct 14, 1983, 9:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_MED() {
        return DATETIME_MED;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Oct 14, 1983, 9:30:33 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_MED_WITH_SECONDS() {
        return DATETIME_MED_WITH_SECONDS;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Fri, 14 Oct 1983, 9:30 AM'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_MED_WITH_WEEKDAY() {
        return DATETIME_MED_WITH_WEEKDAY;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'October 14, 1983, 9:30 AM EDT'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_FULL() {
        return DATETIME_FULL;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'October 14, 1983, 9:30:33 AM EDT'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_FULL_WITH_SECONDS() {
        return DATETIME_FULL_WITH_SECONDS;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Friday, October 14, 1983, 9:30 AM Eastern Daylight Time'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_HUGE() {
        return DATETIME_HUGE;
      }
      /**
       * {@link DateTime#toLocaleString} format like 'Friday, October 14, 1983, 9:30:33 AM Eastern Daylight Time'. Only 12-hour if the locale is.
       * @type {Object}
       */
      static get DATETIME_HUGE_WITH_SECONDS() {
        return DATETIME_HUGE_WITH_SECONDS;
      }
    };
    function friendlyDateTime(dateTimeish) {
      if (DateTime.isDateTime(dateTimeish)) {
        return dateTimeish;
      } else if (dateTimeish && dateTimeish.valueOf && isNumber(dateTimeish.valueOf())) {
        return DateTime.fromJSDate(dateTimeish);
      } else if (dateTimeish && typeof dateTimeish === "object") {
        return DateTime.fromObject(dateTimeish);
      } else {
        throw new InvalidArgumentError(`Unknown datetime argument: ${dateTimeish}, of type ${typeof dateTimeish}`);
      }
    }
    var VERSION = "3.7.2";
    exports.DateTime = DateTime;
    exports.Duration = Duration;
    exports.FixedOffsetZone = FixedOffsetZone;
    exports.IANAZone = IANAZone;
    exports.Info = Info;
    exports.Interval = Interval;
    exports.InvalidZone = InvalidZone;
    exports.Settings = Settings;
    exports.SystemZone = SystemZone;
    exports.VERSION = VERSION;
    exports.Zone = Zone;
  }
});

// node_modules/cron-parser/lib/date.js
var require_date = __commonJS({
  "node_modules/cron-parser/lib/date.js"(exports, module) {
    "use strict";
    var luxon = require_luxon();
    CronDate.prototype.addYear = function() {
      this._date = this._date.plus({ years: 1 });
    };
    CronDate.prototype.addMonth = function() {
      this._date = this._date.plus({ months: 1 }).startOf("month");
    };
    CronDate.prototype.addDay = function() {
      this._date = this._date.plus({ days: 1 }).startOf("day");
    };
    CronDate.prototype.addHour = function() {
      var prev = this._date;
      this._date = this._date.plus({ hours: 1 }).startOf("hour");
      if (this._date <= prev) {
        this._date = this._date.plus({ hours: 1 });
      }
    };
    CronDate.prototype.addMinute = function() {
      var prev = this._date;
      this._date = this._date.plus({ minutes: 1 }).startOf("minute");
      if (this._date < prev) {
        this._date = this._date.plus({ hours: 1 });
      }
    };
    CronDate.prototype.addSecond = function() {
      var prev = this._date;
      this._date = this._date.plus({ seconds: 1 }).startOf("second");
      if (this._date < prev) {
        this._date = this._date.plus({ hours: 1 });
      }
    };
    CronDate.prototype.subtractYear = function() {
      this._date = this._date.minus({ years: 1 });
    };
    CronDate.prototype.subtractMonth = function() {
      this._date = this._date.minus({ months: 1 }).endOf("month").startOf("second");
    };
    CronDate.prototype.subtractDay = function() {
      this._date = this._date.minus({ days: 1 }).endOf("day").startOf("second");
    };
    CronDate.prototype.subtractHour = function() {
      var prev = this._date;
      this._date = this._date.minus({ hours: 1 }).endOf("hour").startOf("second");
      if (this._date >= prev) {
        this._date = this._date.minus({ hours: 1 });
      }
    };
    CronDate.prototype.subtractMinute = function() {
      var prev = this._date;
      this._date = this._date.minus({ minutes: 1 }).endOf("minute").startOf("second");
      if (this._date > prev) {
        this._date = this._date.minus({ hours: 1 });
      }
    };
    CronDate.prototype.subtractSecond = function() {
      var prev = this._date;
      this._date = this._date.minus({ seconds: 1 }).startOf("second");
      if (this._date > prev) {
        this._date = this._date.minus({ hours: 1 });
      }
    };
    CronDate.prototype.getDate = function() {
      return this._date.day;
    };
    CronDate.prototype.getFullYear = function() {
      return this._date.year;
    };
    CronDate.prototype.getDay = function() {
      var weekday = this._date.weekday;
      return weekday == 7 ? 0 : weekday;
    };
    CronDate.prototype.getMonth = function() {
      return this._date.month - 1;
    };
    CronDate.prototype.getHours = function() {
      return this._date.hour;
    };
    CronDate.prototype.getMinutes = function() {
      return this._date.minute;
    };
    CronDate.prototype.getSeconds = function() {
      return this._date.second;
    };
    CronDate.prototype.getMilliseconds = function() {
      return this._date.millisecond;
    };
    CronDate.prototype.getTime = function() {
      return this._date.valueOf();
    };
    CronDate.prototype.getUTCDate = function() {
      return this._getUTC().day;
    };
    CronDate.prototype.getUTCFullYear = function() {
      return this._getUTC().year;
    };
    CronDate.prototype.getUTCDay = function() {
      var weekday = this._getUTC().weekday;
      return weekday == 7 ? 0 : weekday;
    };
    CronDate.prototype.getUTCMonth = function() {
      return this._getUTC().month - 1;
    };
    CronDate.prototype.getUTCHours = function() {
      return this._getUTC().hour;
    };
    CronDate.prototype.getUTCMinutes = function() {
      return this._getUTC().minute;
    };
    CronDate.prototype.getUTCSeconds = function() {
      return this._getUTC().second;
    };
    CronDate.prototype.toISOString = function() {
      return this._date.toUTC().toISO();
    };
    CronDate.prototype.toJSON = function() {
      return this._date.toJSON();
    };
    CronDate.prototype.setDate = function(d) {
      this._date = this._date.set({ day: d });
    };
    CronDate.prototype.setFullYear = function(y) {
      this._date = this._date.set({ year: y });
    };
    CronDate.prototype.setDay = function(d) {
      this._date = this._date.set({ weekday: d });
    };
    CronDate.prototype.setMonth = function(m) {
      this._date = this._date.set({ month: m + 1 });
    };
    CronDate.prototype.setHours = function(h) {
      this._date = this._date.set({ hour: h });
    };
    CronDate.prototype.setMinutes = function(m) {
      this._date = this._date.set({ minute: m });
    };
    CronDate.prototype.setSeconds = function(s) {
      this._date = this._date.set({ second: s });
    };
    CronDate.prototype.setMilliseconds = function(s) {
      this._date = this._date.set({ millisecond: s });
    };
    CronDate.prototype._getUTC = function() {
      return this._date.toUTC();
    };
    CronDate.prototype.toString = function() {
      return this.toDate().toString();
    };
    CronDate.prototype.toDate = function() {
      return this._date.toJSDate();
    };
    CronDate.prototype.isLastDayOfMonth = function() {
      var newDate = this._date.plus({ days: 1 }).startOf("day");
      return this._date.month !== newDate.month;
    };
    CronDate.prototype.isLastWeekdayOfMonth = function() {
      var newDate = this._date.plus({ days: 7 }).startOf("day");
      return this._date.month !== newDate.month;
    };
    function CronDate(timestamp, tz) {
      var dateOpts = { zone: tz };
      if (!timestamp) {
        this._date = luxon.DateTime.local();
      } else if (timestamp instanceof CronDate) {
        this._date = timestamp._date;
      } else if (timestamp instanceof Date) {
        this._date = luxon.DateTime.fromJSDate(timestamp, dateOpts);
      } else if (typeof timestamp === "number") {
        this._date = luxon.DateTime.fromMillis(timestamp, dateOpts);
      } else if (typeof timestamp === "string") {
        this._date = luxon.DateTime.fromISO(timestamp, dateOpts);
        this._date.isValid || (this._date = luxon.DateTime.fromRFC2822(timestamp, dateOpts));
        this._date.isValid || (this._date = luxon.DateTime.fromSQL(timestamp, dateOpts));
        this._date.isValid || (this._date = luxon.DateTime.fromFormat(timestamp, "EEE, d MMM yyyy HH:mm:ss", dateOpts));
      }
      if (!this._date || !this._date.isValid) {
        throw new Error("CronDate: unhandled timestamp: " + JSON.stringify(timestamp));
      }
      if (tz && tz !== this._date.zoneName) {
        this._date = this._date.setZone(tz);
      }
    }
    module.exports = CronDate;
  }
});

// node_modules/cron-parser/lib/field_compactor.js
var require_field_compactor = __commonJS({
  "node_modules/cron-parser/lib/field_compactor.js"(exports, module) {
    "use strict";
    function buildRange(item) {
      return {
        start: item,
        count: 1
      };
    }
    function completeRangeWithItem(range, item) {
      range.end = item;
      range.step = item - range.start;
      range.count = 2;
    }
    function finalizeCurrentRange(results, currentRange, currentItemRange) {
      if (currentRange) {
        if (currentRange.count === 2) {
          results.push(buildRange(currentRange.start));
          results.push(buildRange(currentRange.end));
        } else {
          results.push(currentRange);
        }
      }
      if (currentItemRange) {
        results.push(currentItemRange);
      }
    }
    function compactField(arr) {
      var results = [];
      var currentRange = void 0;
      for (var i = 0; i < arr.length; i++) {
        var currentItem = arr[i];
        if (typeof currentItem !== "number") {
          finalizeCurrentRange(results, currentRange, buildRange(currentItem));
          currentRange = void 0;
        } else if (!currentRange) {
          currentRange = buildRange(currentItem);
        } else if (currentRange.count === 1) {
          completeRangeWithItem(currentRange, currentItem);
        } else {
          if (currentRange.step === currentItem - currentRange.end) {
            currentRange.count++;
            currentRange.end = currentItem;
          } else if (currentRange.count === 2) {
            results.push(buildRange(currentRange.start));
            currentRange = buildRange(currentRange.end);
            completeRangeWithItem(currentRange, currentItem);
          } else {
            finalizeCurrentRange(results, currentRange);
            currentRange = buildRange(currentItem);
          }
        }
      }
      finalizeCurrentRange(results, currentRange);
      return results;
    }
    module.exports = compactField;
  }
});

// node_modules/cron-parser/lib/field_stringify.js
var require_field_stringify = __commonJS({
  "node_modules/cron-parser/lib/field_stringify.js"(exports, module) {
    "use strict";
    var compactField = require_field_compactor();
    function stringifyField(arr, min, max) {
      var ranges = compactField(arr);
      if (ranges.length === 1) {
        var singleRange = ranges[0];
        var step = singleRange.step;
        if (step === 1 && singleRange.start === min && singleRange.end === max) {
          return "*";
        }
        if (step !== 1 && singleRange.start === min && singleRange.end === max - step + 1) {
          return "*/" + step;
        }
      }
      var result = [];
      for (var i = 0, l = ranges.length; i < l; ++i) {
        var range = ranges[i];
        if (range.count === 1) {
          result.push(range.start);
          continue;
        }
        var step = range.step;
        if (range.step === 1) {
          result.push(range.start + "-" + range.end);
          continue;
        }
        var multiplier = range.start == 0 ? range.count - 1 : range.count;
        if (range.step * multiplier > range.end) {
          result = result.concat(
            Array.from({ length: range.end - range.start + 1 }).map(function(_, index) {
              var value = range.start + index;
              if ((value - range.start) % range.step === 0) {
                return value;
              }
              return null;
            }).filter(function(value) {
              return value != null;
            })
          );
        } else if (range.end === max - range.step + 1) {
          result.push(range.start + "/" + range.step);
        } else {
          result.push(range.start + "-" + range.end + "/" + range.step);
        }
      }
      return result.join(",");
    }
    module.exports = stringifyField;
  }
});

// node_modules/cron-parser/lib/expression.js
var require_expression = __commonJS({
  "node_modules/cron-parser/lib/expression.js"(exports, module) {
    "use strict";
    var CronDate = require_date();
    var stringifyField = require_field_stringify();
    var LOOP_LIMIT = 1e4;
    function CronExpression(fields, options) {
      this._options = options;
      this._utc = options.utc || false;
      this._tz = this._utc ? "UTC" : options.tz;
      this._currentDate = new CronDate(options.currentDate, this._tz);
      this._startDate = options.startDate ? new CronDate(options.startDate, this._tz) : null;
      this._endDate = options.endDate ? new CronDate(options.endDate, this._tz) : null;
      this._isIterator = options.iterator || false;
      this._hasIterated = false;
      this._nthDayOfWeek = options.nthDayOfWeek || 0;
      this.fields = CronExpression._freezeFields(fields);
    }
    CronExpression.map = ["second", "minute", "hour", "dayOfMonth", "month", "dayOfWeek"];
    CronExpression.predefined = {
      "@yearly": "0 0 1 1 *",
      "@monthly": "0 0 1 * *",
      "@weekly": "0 0 * * 0",
      "@daily": "0 0 * * *",
      "@hourly": "0 * * * *"
    };
    CronExpression.constraints = [
      { min: 0, max: 59, chars: [] },
      // Second
      { min: 0, max: 59, chars: [] },
      // Minute
      { min: 0, max: 23, chars: [] },
      // Hour
      { min: 1, max: 31, chars: ["L"] },
      // Day of month
      { min: 1, max: 12, chars: [] },
      // Month
      { min: 0, max: 7, chars: ["L"] }
      // Day of week
    ];
    CronExpression.daysInMonth = [
      31,
      29,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31
    ];
    CronExpression.aliases = {
      month: {
        jan: 1,
        feb: 2,
        mar: 3,
        apr: 4,
        may: 5,
        jun: 6,
        jul: 7,
        aug: 8,
        sep: 9,
        oct: 10,
        nov: 11,
        dec: 12
      },
      dayOfWeek: {
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6
      }
    };
    CronExpression.parseDefaults = ["0", "*", "*", "*", "*", "*"];
    CronExpression.standardValidCharacters = /^[,*\d/-]+$/;
    CronExpression.dayOfWeekValidCharacters = /^[?,*\dL#/-]+$/;
    CronExpression.dayOfMonthValidCharacters = /^[?,*\dL/-]+$/;
    CronExpression.validCharacters = {
      second: CronExpression.standardValidCharacters,
      minute: CronExpression.standardValidCharacters,
      hour: CronExpression.standardValidCharacters,
      dayOfMonth: CronExpression.dayOfMonthValidCharacters,
      month: CronExpression.standardValidCharacters,
      dayOfWeek: CronExpression.dayOfWeekValidCharacters
    };
    CronExpression._isValidConstraintChar = function _isValidConstraintChar(constraints, value) {
      if (typeof value !== "string") {
        return false;
      }
      return constraints.chars.some(function(char) {
        return value.indexOf(char) > -1;
      });
    };
    CronExpression._parseField = function _parseField(field, value, constraints) {
      switch (field) {
        case "month":
        case "dayOfWeek":
          var aliases = CronExpression.aliases[field];
          value = value.replace(/[a-z]{3}/gi, function(match) {
            match = match.toLowerCase();
            if (typeof aliases[match] !== "undefined") {
              return aliases[match];
            } else {
              throw new Error('Validation error, cannot resolve alias "' + match + '"');
            }
          });
          break;
      }
      if (!CronExpression.validCharacters[field].test(value)) {
        throw new Error("Invalid characters, got value: " + value);
      }
      if (value.indexOf("*") !== -1) {
        value = value.replace(/\*/g, constraints.min + "-" + constraints.max);
      } else if (value.indexOf("?") !== -1) {
        value = value.replace(/\?/g, constraints.min + "-" + constraints.max);
      }
      function parseSequence(val) {
        var stack = [];
        function handleResult(result) {
          if (result instanceof Array) {
            for (var i2 = 0, c2 = result.length; i2 < c2; i2++) {
              var value2 = result[i2];
              if (CronExpression._isValidConstraintChar(constraints, value2)) {
                stack.push(value2);
                continue;
              }
              if (typeof value2 !== "number" || Number.isNaN(value2) || value2 < constraints.min || value2 > constraints.max) {
                throw new Error(
                  "Constraint error, got value " + value2 + " expected range " + constraints.min + "-" + constraints.max
                );
              }
              stack.push(value2);
            }
          } else {
            if (CronExpression._isValidConstraintChar(constraints, result)) {
              stack.push(result);
              return;
            }
            var numResult = +result;
            if (Number.isNaN(numResult) || numResult < constraints.min || numResult > constraints.max) {
              throw new Error(
                "Constraint error, got value " + result + " expected range " + constraints.min + "-" + constraints.max
              );
            }
            if (field === "dayOfWeek") {
              numResult = numResult % 7;
            }
            stack.push(numResult);
          }
        }
        var atoms = val.split(",");
        if (!atoms.every(function(atom) {
          return atom.length > 0;
        })) {
          throw new Error("Invalid list value format");
        }
        if (atoms.length > 1) {
          for (var i = 0, c = atoms.length; i < c; i++) {
            handleResult(parseRepeat(atoms[i]));
          }
        } else {
          handleResult(parseRepeat(val));
        }
        stack.sort(CronExpression._sortCompareFn);
        return stack;
      }
      function parseRepeat(val) {
        var repeatInterval = 1;
        var atoms = val.split("/");
        if (atoms.length > 2) {
          throw new Error("Invalid repeat: " + val);
        }
        if (atoms.length > 1) {
          if (atoms[0] == +atoms[0]) {
            atoms = [atoms[0] + "-" + constraints.max, atoms[1]];
          }
          return parseRange(atoms[0], atoms[atoms.length - 1]);
        }
        return parseRange(val, repeatInterval);
      }
      function parseRange(val, repeatInterval) {
        var stack = [];
        var atoms = val.split("-");
        if (atoms.length > 1) {
          if (atoms.length < 2) {
            return +val;
          }
          if (!atoms[0].length) {
            if (!atoms[1].length) {
              throw new Error("Invalid range: " + val);
            }
            return +val;
          }
          var min = +atoms[0];
          var max = +atoms[1];
          if (Number.isNaN(min) || Number.isNaN(max) || min < constraints.min || max > constraints.max) {
            throw new Error(
              "Constraint error, got range " + min + "-" + max + " expected range " + constraints.min + "-" + constraints.max
            );
          } else if (min > max) {
            throw new Error("Invalid range: " + val);
          }
          var repeatIndex = +repeatInterval;
          if (Number.isNaN(repeatIndex) || repeatIndex <= 0) {
            throw new Error("Constraint error, cannot repeat at every " + repeatIndex + " time.");
          }
          if (field === "dayOfWeek" && max % 7 === 0) {
            stack.push(0);
          }
          for (var index = min, count = max; index <= count; index++) {
            var exists = stack.indexOf(index) !== -1;
            if (!exists && repeatIndex > 0 && repeatIndex % repeatInterval === 0) {
              repeatIndex = 1;
              stack.push(index);
            } else {
              repeatIndex++;
            }
          }
          return stack;
        }
        return Number.isNaN(+val) ? val : +val;
      }
      return parseSequence(value);
    };
    CronExpression._sortCompareFn = function(a, b) {
      var aIsNumber = typeof a === "number";
      var bIsNumber = typeof b === "number";
      if (aIsNumber && bIsNumber) {
        return a - b;
      }
      if (!aIsNumber && bIsNumber) {
        return 1;
      }
      if (aIsNumber && !bIsNumber) {
        return -1;
      }
      return a.localeCompare(b);
    };
    CronExpression._handleMaxDaysInMonth = function(mappedFields) {
      if (mappedFields.month.length === 1) {
        var daysInMonth = CronExpression.daysInMonth[mappedFields.month[0] - 1];
        if (mappedFields.dayOfMonth[0] > daysInMonth) {
          throw new Error("Invalid explicit day of month definition");
        }
        return mappedFields.dayOfMonth.filter(function(dayOfMonth) {
          return dayOfMonth === "L" ? true : dayOfMonth <= daysInMonth;
        }).sort(CronExpression._sortCompareFn);
      }
    };
    CronExpression._freezeFields = function(fields) {
      for (var i = 0, c = CronExpression.map.length; i < c; ++i) {
        var field = CronExpression.map[i];
        var value = fields[field];
        fields[field] = Object.freeze(value);
      }
      return Object.freeze(fields);
    };
    CronExpression.prototype._applyTimezoneShift = function(currentDate, dateMathVerb, method) {
      if (method === "Month" || method === "Day") {
        var prevTime = currentDate.getTime();
        currentDate[dateMathVerb + method]();
        var currTime = currentDate.getTime();
        if (prevTime === currTime) {
          if (currentDate.getMinutes() === 0 && currentDate.getSeconds() === 0) {
            currentDate.addHour();
          } else if (currentDate.getMinutes() === 59 && currentDate.getSeconds() === 59) {
            currentDate.subtractHour();
          }
        }
      } else {
        var previousHour = currentDate.getHours();
        currentDate[dateMathVerb + method]();
        var currentHour = currentDate.getHours();
        var diff = currentHour - previousHour;
        if (diff === 2) {
          if (this.fields.hour.length !== 24) {
            this._dstStart = currentHour;
          }
        } else if (diff === 0 && currentDate.getMinutes() === 0 && currentDate.getSeconds() === 0) {
          if (this.fields.hour.length !== 24) {
            this._dstEnd = currentHour;
          }
        }
      }
    };
    CronExpression.prototype._findSchedule = function _findSchedule(reverse) {
      function matchSchedule(value, sequence) {
        for (var i = 0, c = sequence.length; i < c; i++) {
          if (sequence[i] >= value) {
            return sequence[i] === value;
          }
        }
        return sequence[0] === value;
      }
      function isNthDayMatch(date, nthDayOfWeek) {
        if (nthDayOfWeek < 6) {
          if (date.getDate() < 8 && nthDayOfWeek === 1) {
            return true;
          }
          var offset = date.getDate() % 7 ? 1 : 0;
          var adjustedDate = date.getDate() - date.getDate() % 7;
          var occurrence = Math.floor(adjustedDate / 7) + offset;
          return occurrence === nthDayOfWeek;
        }
        return false;
      }
      function isLInExpressions(expressions) {
        return expressions.length > 0 && expressions.some(function(expression) {
          return typeof expression === "string" && expression.indexOf("L") >= 0;
        });
      }
      reverse = reverse || false;
      var dateMathVerb = reverse ? "subtract" : "add";
      var currentDate = new CronDate(this._currentDate, this._tz);
      var startDate = this._startDate;
      var endDate = this._endDate;
      var startTimestamp = currentDate.getTime();
      var stepCount = 0;
      function isLastWeekdayOfMonthMatch(expressions) {
        return expressions.some(function(expression) {
          if (!isLInExpressions([expression])) {
            return false;
          }
          var weekday = Number.parseInt(expression[0]) % 7;
          if (Number.isNaN(weekday)) {
            throw new Error("Invalid last weekday of the month expression: " + expression);
          }
          return currentDate.getDay() === weekday && currentDate.isLastWeekdayOfMonth();
        });
      }
      while (stepCount < LOOP_LIMIT) {
        stepCount++;
        if (reverse) {
          if (startDate && currentDate.getTime() - startDate.getTime() < 0) {
            throw new Error("Out of the timespan range");
          }
        } else {
          if (endDate && endDate.getTime() - currentDate.getTime() < 0) {
            throw new Error("Out of the timespan range");
          }
        }
        var dayOfMonthMatch = matchSchedule(currentDate.getDate(), this.fields.dayOfMonth);
        if (isLInExpressions(this.fields.dayOfMonth)) {
          dayOfMonthMatch = dayOfMonthMatch || currentDate.isLastDayOfMonth();
        }
        var dayOfWeekMatch = matchSchedule(currentDate.getDay(), this.fields.dayOfWeek);
        if (isLInExpressions(this.fields.dayOfWeek)) {
          dayOfWeekMatch = dayOfWeekMatch || isLastWeekdayOfMonthMatch(this.fields.dayOfWeek);
        }
        var isDayOfMonthWildcardMatch = this.fields.dayOfMonth.length >= CronExpression.daysInMonth[currentDate.getMonth()];
        var isDayOfWeekWildcardMatch = this.fields.dayOfWeek.length === CronExpression.constraints[5].max - CronExpression.constraints[5].min + 1;
        var currentHour = currentDate.getHours();
        if (!dayOfMonthMatch && (!dayOfWeekMatch || isDayOfWeekWildcardMatch)) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Day");
          continue;
        }
        if (!isDayOfMonthWildcardMatch && isDayOfWeekWildcardMatch && !dayOfMonthMatch) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Day");
          continue;
        }
        if (isDayOfMonthWildcardMatch && !isDayOfWeekWildcardMatch && !dayOfWeekMatch) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Day");
          continue;
        }
        if (this._nthDayOfWeek > 0 && !isNthDayMatch(currentDate, this._nthDayOfWeek)) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Day");
          continue;
        }
        if (!matchSchedule(currentDate.getMonth() + 1, this.fields.month)) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Month");
          continue;
        }
        if (!matchSchedule(currentHour, this.fields.hour)) {
          if (this._dstStart !== currentHour) {
            this._dstStart = null;
            this._applyTimezoneShift(currentDate, dateMathVerb, "Hour");
            continue;
          } else if (!matchSchedule(currentHour - 1, this.fields.hour)) {
            currentDate[dateMathVerb + "Hour"]();
            continue;
          }
        } else if (this._dstEnd === currentHour) {
          if (!reverse) {
            this._dstEnd = null;
            this._applyTimezoneShift(currentDate, "add", "Hour");
            continue;
          }
        }
        if (!matchSchedule(currentDate.getMinutes(), this.fields.minute)) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Minute");
          continue;
        }
        if (!matchSchedule(currentDate.getSeconds(), this.fields.second)) {
          this._applyTimezoneShift(currentDate, dateMathVerb, "Second");
          continue;
        }
        if (startTimestamp === currentDate.getTime()) {
          if (dateMathVerb === "add" || currentDate.getMilliseconds() === 0) {
            this._applyTimezoneShift(currentDate, dateMathVerb, "Second");
          } else {
            currentDate.setMilliseconds(0);
          }
          continue;
        }
        break;
      }
      if (stepCount >= LOOP_LIMIT) {
        throw new Error("Invalid expression, loop limit exceeded");
      }
      this._currentDate = new CronDate(currentDate, this._tz);
      this._hasIterated = true;
      return currentDate;
    };
    CronExpression.prototype.next = function next() {
      var schedule = this._findSchedule();
      if (this._isIterator) {
        return {
          value: schedule,
          done: !this.hasNext()
        };
      }
      return schedule;
    };
    CronExpression.prototype.prev = function prev() {
      var schedule = this._findSchedule(true);
      if (this._isIterator) {
        return {
          value: schedule,
          done: !this.hasPrev()
        };
      }
      return schedule;
    };
    CronExpression.prototype.hasNext = function() {
      var current = this._currentDate;
      var hasIterated = this._hasIterated;
      try {
        this._findSchedule();
        return true;
      } catch (err) {
        return false;
      } finally {
        this._currentDate = current;
        this._hasIterated = hasIterated;
      }
    };
    CronExpression.prototype.hasPrev = function() {
      var current = this._currentDate;
      var hasIterated = this._hasIterated;
      try {
        this._findSchedule(true);
        return true;
      } catch (err) {
        return false;
      } finally {
        this._currentDate = current;
        this._hasIterated = hasIterated;
      }
    };
    CronExpression.prototype.iterate = function iterate(steps, callback) {
      var dates = [];
      if (steps >= 0) {
        for (var i = 0, c = steps; i < c; i++) {
          try {
            var item = this.next();
            dates.push(item);
            if (callback) {
              callback(item, i);
            }
          } catch (err) {
            break;
          }
        }
      } else {
        for (var i = 0, c = steps; i > c; i--) {
          try {
            var item = this.prev();
            dates.push(item);
            if (callback) {
              callback(item, i);
            }
          } catch (err) {
            break;
          }
        }
      }
      return dates;
    };
    CronExpression.prototype.reset = function reset(newDate) {
      this._currentDate = new CronDate(newDate || this._options.currentDate);
    };
    CronExpression.prototype.stringify = function stringify2(includeSeconds) {
      var resultArr = [];
      for (var i = includeSeconds ? 0 : 1, c = CronExpression.map.length; i < c; ++i) {
        var field = CronExpression.map[i];
        var value = this.fields[field];
        var constraint = CronExpression.constraints[i];
        if (field === "dayOfMonth" && this.fields.month.length === 1) {
          constraint = { min: 1, max: CronExpression.daysInMonth[this.fields.month[0] - 1] };
        } else if (field === "dayOfWeek") {
          constraint = { min: 0, max: 6 };
          value = value[value.length - 1] === 7 ? value.slice(0, -1) : value;
        }
        resultArr.push(stringifyField(value, constraint.min, constraint.max));
      }
      return resultArr.join(" ");
    };
    CronExpression.parse = function parse(expression, options) {
      var self = this;
      if (typeof options === "function") {
        options = {};
      }
      function parse2(expression2, options2) {
        if (!options2) {
          options2 = {};
        }
        if (typeof options2.currentDate === "undefined") {
          options2.currentDate = new CronDate(void 0, self._tz);
        }
        if (CronExpression.predefined[expression2]) {
          expression2 = CronExpression.predefined[expression2];
        }
        var fields = [];
        var atoms = (expression2 + "").trim().split(/\s+/);
        if (atoms.length > 6) {
          throw new Error("Invalid cron expression");
        }
        var start = CronExpression.map.length - atoms.length;
        for (var i = 0, c = CronExpression.map.length; i < c; ++i) {
          var field = CronExpression.map[i];
          var value = atoms[atoms.length > c ? i : i - start];
          if (i < start || !value) {
            fields.push(
              CronExpression._parseField(
                field,
                CronExpression.parseDefaults[i],
                CronExpression.constraints[i]
              )
            );
          } else {
            var val = field === "dayOfWeek" ? parseNthDay(value) : value;
            fields.push(
              CronExpression._parseField(
                field,
                val,
                CronExpression.constraints[i]
              )
            );
          }
        }
        var mappedFields = {};
        for (var i = 0, c = CronExpression.map.length; i < c; i++) {
          var key = CronExpression.map[i];
          mappedFields[key] = fields[i];
        }
        var dayOfMonth = CronExpression._handleMaxDaysInMonth(mappedFields);
        mappedFields.dayOfMonth = dayOfMonth || mappedFields.dayOfMonth;
        return new CronExpression(mappedFields, options2);
        function parseNthDay(val2) {
          var atoms2 = val2.split("#");
          if (atoms2.length > 1) {
            var nthValue = +atoms2[atoms2.length - 1];
            if (/,/.test(val2)) {
              throw new Error("Constraint error, invalid dayOfWeek `#` and `,` special characters are incompatible");
            }
            if (/\//.test(val2)) {
              throw new Error("Constraint error, invalid dayOfWeek `#` and `/` special characters are incompatible");
            }
            if (/-/.test(val2)) {
              throw new Error("Constraint error, invalid dayOfWeek `#` and `-` special characters are incompatible");
            }
            if (atoms2.length > 2 || Number.isNaN(nthValue) || (nthValue < 1 || nthValue > 5)) {
              throw new Error("Constraint error, invalid dayOfWeek occurrence number (#)");
            }
            options2.nthDayOfWeek = nthValue;
            return atoms2[0];
          }
          return val2;
        }
      }
      return parse2(expression, options);
    };
    CronExpression.fieldsToExpression = function fieldsToExpression(fields, options) {
      function validateConstraints(field2, values2, constraints) {
        if (!values2) {
          throw new Error("Validation error, Field " + field2 + " is missing");
        }
        if (values2.length === 0) {
          throw new Error("Validation error, Field " + field2 + " contains no values");
        }
        for (var i2 = 0, c2 = values2.length; i2 < c2; i2++) {
          var value = values2[i2];
          if (CronExpression._isValidConstraintChar(constraints, value)) {
            continue;
          }
          if (typeof value !== "number" || Number.isNaN(value) || value < constraints.min || value > constraints.max) {
            throw new Error(
              "Constraint error, got value " + value + " expected range " + constraints.min + "-" + constraints.max
            );
          }
        }
      }
      var mappedFields = {};
      for (var i = 0, c = CronExpression.map.length; i < c; ++i) {
        var field = CronExpression.map[i];
        var values = fields[field];
        validateConstraints(
          field,
          values,
          CronExpression.constraints[i]
        );
        var copy = [];
        var j = -1;
        while (++j < values.length) {
          copy[j] = values[j];
        }
        values = copy.sort(CronExpression._sortCompareFn).filter(function(item, pos, ary) {
          return !pos || item !== ary[pos - 1];
        });
        if (values.length !== copy.length) {
          throw new Error("Validation error, Field " + field + " contains duplicate values");
        }
        mappedFields[field] = values;
      }
      var dayOfMonth = CronExpression._handleMaxDaysInMonth(mappedFields);
      mappedFields.dayOfMonth = dayOfMonth || mappedFields.dayOfMonth;
      return new CronExpression(mappedFields, options || {});
    };
    module.exports = CronExpression;
  }
});

// node_modules/cron-parser/lib/parser.js
var require_parser = __commonJS({
  "node_modules/cron-parser/lib/parser.js"(exports, module) {
    "use strict";
    var CronExpression = require_expression();
    function CronParser() {
    }
    CronParser._parseEntry = function _parseEntry(entry) {
      var atoms = entry.split(" ");
      if (atoms.length === 6) {
        return {
          interval: CronExpression.parse(entry)
        };
      } else if (atoms.length > 6) {
        return {
          interval: CronExpression.parse(
            atoms.slice(0, 6).join(" ")
          ),
          command: atoms.slice(6, atoms.length)
        };
      } else {
        throw new Error("Invalid entry: " + entry);
      }
    };
    CronParser.parseExpression = function parseExpression(expression, options) {
      return CronExpression.parse(expression, options);
    };
    CronParser.fieldsToExpression = function fieldsToExpression(fields, options) {
      return CronExpression.fieldsToExpression(fields, options);
    };
    CronParser.parseString = function parseString(data) {
      var blocks = data.split("\n");
      var response = {
        variables: {},
        expressions: [],
        errors: {}
      };
      for (var i = 0, c = blocks.length; i < c; i++) {
        var block = blocks[i];
        var matches = null;
        var entry = block.trim();
        if (entry.length > 0) {
          if (entry.match(/^#/)) {
            continue;
          } else if (matches = entry.match(/^(.*)=(.*)$/)) {
            response.variables[matches[1]] = matches[2];
          } else {
            var result = null;
            try {
              result = CronParser._parseEntry("0 " + entry);
              response.expressions.push(result.interval);
            } catch (err) {
              response.errors[entry] = err;
            }
          }
        }
      }
      return response;
    };
    CronParser.parseFile = function parseFile(filePath, callback) {
      __require("fs").readFile(filePath, function(err, data) {
        if (err) {
          callback(err);
          return;
        }
        return callback(null, CronParser.parseString(data.toString()));
      });
    };
    module.exports = CronParser;
  }
});

// src/services/quota-validator.service.ts
var quota_validator_service_exports = {};
__export(quota_validator_service_exports, {
  QuotaValidatorService: () => QuotaValidatorService,
  default: () => quota_validator_service_default,
  quotaValidatorService: () => quotaValidatorService
});
import mongoose4 from "mongoose";
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
          const connection = mongoose4.createConnection(config.mongodb.portalUri, {
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
       * Obtiene la empresa por número de WhatsApp configurado (sender)
       */
      async getCompanyByWhatsappSender(sender) {
        if (!sender) return null;
        if (!this.isReady()) {
          await this.connect();
        }
        if (!this.CompanyModel) {
          throw new Error("QuotaValidator not initialized");
        }
        const digits = sender.replace(/[^\d]/g, "");
        const candidates = Array.from(new Set([
          sender,
          digits,
          digits ? `+${digits}` : ""
        ].filter(Boolean)));
        const company = await this.CompanyModel.findOne({
          isActive: true,
          $or: candidates.map((value) => ({ "whatsappConfig.sender": value }))
        });
        return company || null;
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
    var crypto4 = __require("crypto");
    var formatEcdsa = require_ecdsa_sig_formatter();
    var util = __require("util");
    var MSG_INVALID_ALGORITHM = '"%s" is not a valid algorithm.\n  Supported algorithms are:\n  "HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512" and "none".';
    var MSG_INVALID_SECRET = "secret must be a string or buffer";
    var MSG_INVALID_VERIFIER_KEY = "key must be a string or a buffer";
    var MSG_INVALID_SIGNER_KEY = "key must be a string, a buffer or an object";
    var supportsKeyObjects = typeof crypto4.createPublicKey === "function";
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
        var hmac = crypto4.createHmac("sha" + bits, secret);
        var sig = (hmac.update(thing), hmac.digest("base64"));
        return fromBase64(sig);
      };
    }
    var bufferEqual;
    var timingSafeEqual2 = "timingSafeEqual" in crypto4 ? function timingSafeEqual3(a, b) {
      if (a.byteLength !== b.byteLength) {
        return false;
      }
      return crypto4.timingSafeEqual(a, b);
    } : function timingSafeEqual3(a, b) {
      if (!bufferEqual) {
        bufferEqual = require_buffer_equal_constant_time();
      }
      return bufferEqual(a, b);
    };
    function createHmacVerifier(bits) {
      return function verify(thing, signature, secret) {
        var computedSig = createHmacSigner(bits)(thing, secret);
        return timingSafeEqual2(Buffer2.from(signature), Buffer2.from(computedSig));
      };
    }
    function createKeySigner(bits) {
      return function sign(thing, privateKey) {
        checkIsPrivateKey(privateKey);
        thing = normalizeInput(thing);
        var signer = crypto4.createSign("RSA-SHA" + bits);
        var sig = (signer.update(thing), signer.sign(privateKey, "base64"));
        return fromBase64(sig);
      };
    }
    function createKeyVerifier(bits) {
      return function verify(thing, signature, publicKey) {
        checkIsPublicKey(publicKey);
        thing = normalizeInput(thing);
        signature = toBase64(signature);
        var verifier = crypto4.createVerify("RSA-SHA" + bits);
        verifier.update(thing);
        return verifier.verify(publicKey, signature, "base64");
      };
    }
    function createPSSKeySigner(bits) {
      return function sign(thing, privateKey) {
        checkIsPrivateKey(privateKey);
        thing = normalizeInput(thing);
        var signer = crypto4.createSign("RSA-SHA" + bits);
        var sig = (signer.update(thing), signer.sign({
          key: privateKey,
          padding: crypto4.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto4.constants.RSA_PSS_SALTLEN_DIGEST
        }, "base64"));
        return fromBase64(sig);
      };
    }
    function createPSSKeyVerifier(bits) {
      return function verify(thing, signature, publicKey) {
        checkIsPublicKey(publicKey);
        thing = normalizeInput(thing);
        signature = toBase64(signature);
        var verifier = crypto4.createVerify("RSA-SHA" + bits);
        verifier.update(thing);
        return verifier.verify({
          key: publicKey,
          padding: crypto4.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: crypto4.constants.RSA_PSS_SALTLEN_DIGEST
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
    function validate2(schema, allowUnknown, object, parameterName) {
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
      return validate2(sign_options_schema, false, options, "options");
    }
    function validatePayload(payload) {
      return validate2(registered_claims_schema, true, payload, "payload");
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

// src/api/middlewares/errorHandler.ts
init_environment();
var ALERT_WINDOW_MS = 5 * 60 * 1e3;
var alertCache = /* @__PURE__ */ new Map();
var shouldSendAlert = (key) => {
  const now = Date.now();
  const last = alertCache.get(key);
  if (last && now - last < ALERT_WINDOW_MS) return false;
  alertCache.set(key, now);
  return true;
};
var sendTelegramAlert = async (message) => {
  if (!config.telegram.botToken || !config.telegram.errorsChatId) return;
  const body = new URLSearchParams();
  body.append("chat_id", config.telegram.errorsChatId);
  body.append("text", message);
  await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
    method: "POST",
    body
  });
};
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
  const shouldAlert = statusCode >= 500 || req.path.startsWith("/api/drive") || req.path.startsWith("/api/message");
  if (shouldAlert) {
    const alertKey = `${statusCode}:${req.path}:${message}`;
    if (shouldSendAlert(alertKey)) {
      const companyId = req.companyId || "N/A";
      const errorMessage = [
        "LILA-APP ERROR!",
        "---------------------",
        `path: ${req.path}`,
        `method: ${req.method}`,
        `companyId: ${companyId}`,
        `status: ${statusCode}`,
        `message: ${message}`
      ].join("\n");
      sendTelegramAlert(errorMessage).catch((error) => {
        logger_default.warn("Failed to send Telegram alert", error);
      });
    }
  }
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
  const skipPaths = /* @__PURE__ */ new Set(["/", "/health"]);
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    if (skipPaths.has(req.path)) {
      return;
    }
    if (req.path.startsWith("/docs")) {
      return;
    }
    logger_default.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
}

// src/api/routes/session.routes.ts
import { Router } from "express";

// src/api/controllers/session.controller.simple.ts
init_sessions_simple();
init_whatsapp_direct_service();
init_logger();
import qrcode from "qrcode";
async function waitForQRCode(phoneNumber, timeoutMs = 6e4, intervalMs = 300) {
  const start = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const qr = getQRCode(phoneNumber);
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
async function createSessionHandler(req, res, next) {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    logger_default.info(`Creating session for ${phoneNumber}`);
    startSession(phoneNumber, (qr2) => {
      logger_default.info(`QR generated for ${phoneNumber}`);
    });
    const qr = await waitForQRCode(phoneNumber);
    const qrImage = qr ? await qrcode.toDataURL(qr) : void 0;
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        phoneNumber,
        status: isSessionReady(phoneNumber) ? "connected" : "connecting",
        qr,
        qrImage
      }
    });
  } catch (error) {
    next(error);
  }
}
async function createPairingSessionHandler(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    logger_default.info(`Creating pairing code session for ${phoneNumber}`);
    let pairingCode = "";
    await createPairingSession(phoneNumber, (code) => {
      pairingCode = code;
    });
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        phoneNumber,
        pairingCode,
        instructions: "Open WhatsApp \u2192 Settings \u2192 Linked Devices \u2192 Link with phone number \u2192 Enter this code"
      }
    });
  } catch (error) {
    next(error);
  }
}
async function getSessionStatusHandler(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const isConnected = isSessionReady(phoneNumber);
    const qr = getQRCode(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        phoneNumber,
        status: isConnected ? "connected" : "disconnected",
        isConnected,
        ...qr && { qr }
      }
    });
  } catch (error) {
    next(error);
  }
}
async function disconnectSessionHandler(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await disconnectSession2(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} disconnected`
    });
  } catch (error) {
    next(error);
  }
}
async function getAllSessionsHandler(req, res, next) {
  try {
    const sessionIds = listSessions();
    const sessions2 = sessionIds.map((phone) => ({
      phoneNumber: phone,
      status: isSessionReady(phone) ? "connected" : "disconnected",
      isConnected: isSessionReady(phone)
    }));
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        total: sessions2.length,
        sessions: sessions2
      }
    });
  } catch (error) {
    next(error);
  }
}
async function getQRCodeImageHandler(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const existingSession = getSession(phoneNumber);
    if (!existingSession) {
      startSession(phoneNumber, (qr2) => {
        logger_default.info(`QR generated for ${phoneNumber}`);
      });
    }
    const qr = await waitForQRCode(phoneNumber) ?? getQRCode(phoneNumber);
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
async function getGroupListHandler(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (!WhatsAppDirectService.isSessionActive(phoneNumber)) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }
    const groups = WhatsAppDirectService.listGroups(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      groups
    });
  } catch (error) {
    next(error);
  }
}
async function syncGroupsHandler(req, res, next) {
  try {
    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      const error = new Error("phoneNumber is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (!WhatsAppDirectService.isSessionActive(phoneNumber)) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }
    logger_default.info(`Syncing groups for ${phoneNumber} using refreshGroups`);
    const result = await WhatsAppDirectService.refreshGroups(phoneNumber);
    if (result.success) {
      const groups = WhatsAppDirectService.listGroups(phoneNumber);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        groupCount: result.groupCount,
        groups
      });
    } else {
      const error = new Error(result.error || "Failed to sync groups");
      error.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return next(error);
    }
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
    if (!WhatsAppDirectService.isSessionActive(phoneNumber)) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }
    const contacts = WhatsAppDirectService.listContacts(phoneNumber);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      contacts
    });
  } catch (error) {
    next(error);
  }
}
var logoutSession = disconnectSessionHandler;
var listActiveSessions = getAllSessionsHandler;
var createSession = createSessionHandler;
var getSessionStatus = getSessionStatusHandler;
var disconnectSession2 = disconnectSessionHandler;
var getAllSessions = getAllSessionsHandler;
var getQRCodeImage = getQRCodeImageHandler;
var getGroupList = getGroupListHandler;
var syncGroups = syncGroupsHandler;

// src/api/routes/session.routes.ts
var router = Router();
router.get("/list", listActiveSessions);
router.post("/", createSession);
router.get("/:phoneNumber/qr", getQRCodeImage);
router.post("/:phoneNumber/request-pairing-code", createPairingSessionHandler);
router.get("/:phoneNumber/status", getSessionStatus);
router.post("/:phoneNumber/logout", logoutSession);
router.get("/:phoneNumber/groups", getGroupList);
router.get("/:phoneNumber/syncGroups", syncGroups);
router.get("/:phoneNumber/contacts", getContactsHandler);
router.delete("/:phoneNumber", disconnectSession2);
router.get("/", getAllSessions);
var session_routes_default = router;

// src/api/routes/jobs.routes.v2.ts
import { Router as Router2 } from "express";

// src/utils/validators.ts
import Joi from "joi";
function validateCronExpression(cron3) {
  const cronRegex = /^((\d+,)*\d+|\*)(\/\d+)?( ((\d+,)*\d+|\*)(\/\d+)?){4}$/;
  return cronRegex.test(cron3);
}
function validateCronJobCreate(data) {
  const schema = Joi.object({
    companyId: Joi.string().required(),
    name: Joi.string().required().min(3).max(100),
    type: Joi.string().valid("api", "message").required(),
    isActive: Joi.boolean().default(true),
    timeout: Joi.number().default(3e4).min(5e3).max(3e5),
    schedule: Joi.object({
      cronExpression: Joi.string().required().custom((value2, helpers) => {
        if (!validateCronExpression(value2)) {
          return helpers.error("any.invalid");
        }
        return value2;
      }).messages({ "any.invalid": "Expresi\xF3n cron inv\xE1lida" }),
      timezone: Joi.string().default("America/Lima")
    }).required(),
    message: Joi.when("type", {
      is: "message",
      then: Joi.object({
        sender: Joi.string().optional(),
        chatId: Joi.string().required(),
        body: Joi.string().required().min(1),
        mentions: Joi.array().items(Joi.string()).optional()
      }).required(),
      otherwise: Joi.object({
        sender: Joi.string().optional(),
        chatId: Joi.string().required(),
        body: Joi.string().allow("").optional(),
        mentions: Joi.array().items(Joi.string()).optional()
      }).optional()
    }),
    apiConfig: Joi.object({
      url: Joi.string().required().uri(),
      method: Joi.string().valid("GET", "POST", "PUT").default("GET"),
      headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
      body: Joi.any()
    }).when("type", {
      is: "api",
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    metadata: Joi.object({
      createdBy: Joi.string().optional(),
      updatedBy: Joi.string().optional(),
      tags: Joi.array().items(Joi.string()).optional()
    }).optional(),
    retryPolicy: Joi.object({
      maxRetries: Joi.number().default(3).min(0).max(10),
      backoffMultiplier: Joi.number().default(2).min(1).max(5),
      currentRetries: Joi.number().min(0).max(10).optional()
    }).optional()
  });
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message
    }));
    return { success: false, errors };
  }
  return { success: true, data: value };
}
function validateCronJobUpdate(data) {
  const schema = Joi.object({
    name: Joi.string().min(3).max(100),
    type: Joi.string().valid("api", "message"),
    isActive: Joi.boolean(),
    timeout: Joi.number().min(5e3).max(3e5),
    schedule: Joi.object({
      cronExpression: Joi.string().custom((value2, helpers) => {
        if (!validateCronExpression(value2)) {
          return helpers.error("any.invalid");
        }
        return value2;
      }).messages({ "any.invalid": "Expresi\xF3n cron inv\xE1lida" }),
      timezone: Joi.string()
    }).optional(),
    message: Joi.object({
      sender: Joi.string().optional(),
      chatId: Joi.string().required(),
      body: Joi.string().allow("").optional(),
      mentions: Joi.array().items(Joi.string()).optional()
    }).optional(),
    apiConfig: Joi.object({
      url: Joi.string().required().uri(),
      method: Joi.string().valid("GET", "POST", "PUT"),
      headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
      body: Joi.any()
    }).optional(),
    metadata: Joi.object({
      updatedBy: Joi.string().optional(),
      tags: Joi.array().items(Joi.string()).optional()
    }).optional(),
    retryPolicy: Joi.object({
      maxRetries: Joi.number().min(0).max(10),
      backoffMultiplier: Joi.number().min(1).max(5),
      currentRetries: Joi.number().min(0).max(10).optional()
    }).optional()
  }).min(1);
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message
    }));
    return { success: false, errors };
  }
  return { success: true, data: value };
}

// src/api/controllers/jobs.controller.v2.ts
init_logger();

// src/database/sharedConnection.ts
init_logger();
init_environment();
import mongoose from "mongoose";
var sharedConnection = null;
var connecting = null;
async function getSharedConnection() {
  if (sharedConnection && sharedConnection.readyState === 1) {
    return sharedConnection;
  }
  if (connecting) {
    return connecting;
  }
  logger_default.info("[SharedDB] Connecting to shared_db...");
  connecting = mongoose.createConnection(config.mongodb.portalUri, {
    dbName: config.mongodb.sharedDb,
    serverSelectionTimeoutMS: 1e4,
    socketTimeoutMS: 45e3,
    maxPoolSize: 5,
    minPoolSize: 1,
    family: 4,
    retryWrites: true,
    heartbeatFrequencyMS: 1e4
  }).asPromise().then((conn) => {
    sharedConnection = conn;
    connecting = null;
    logger_default.info("[SharedDB] Connected");
    return conn;
  }).catch((error) => {
    connecting = null;
    logger_default.error("[SharedDB] Connection failed:", error);
    throw error;
  });
  return connecting;
}

// src/models/cronjob.model.ts
import { Schema } from "mongoose";
var CronJobMessageSchema = new Schema(
  {
    sender: { type: String },
    chatId: { type: String, required: true },
    body: { type: String },
    mentions: [{ type: String }]
  },
  { _id: false }
);
var CronJobApiConfigSchema = new Schema(
  {
    url: { type: String, required: true },
    method: { type: String, enum: ["GET", "POST", "PUT"], default: "GET" },
    headers: { type: Map, of: String },
    body: Schema.Types.Mixed
  },
  { _id: false }
);
var CronJobScheduleSchema = new Schema(
  {
    cronExpression: { type: String, required: true },
    timezone: { type: String, default: "America/Lima" },
    nextRun: Date,
    lastRun: Date
  },
  { _id: false }
);
var CronJobRetryPolicySchema = new Schema(
  {
    maxRetries: { type: Number, default: 3 },
    backoffMultiplier: { type: Number, default: 2 },
    currentRetries: { type: Number, default: 0 }
  },
  { _id: false }
);
var CronJobHistoryEntrySchema = new Schema(
  {
    status: { type: String, enum: ["success", "error"], required: true },
    timestamp: { type: Date, required: true },
    duration: Number,
    error: String,
    metadata: Schema.Types.Mixed
  },
  { _id: false }
);
var CronJobMetadataSchema = new Schema(
  {
    createdBy: String,
    updatedBy: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    tags: [String],
    legacyId: String,
    legacyCompany: String
  },
  { _id: false }
);
var CronJobSchema = new Schema(
  {
    companyId: {
      type: String,
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100
    },
    type: {
      type: String,
      enum: ["api", "message"],
      required: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    timeout: { type: Number, default: 3e4 },
    message: CronJobMessageSchema,
    apiConfig: CronJobApiConfigSchema,
    schedule: {
      type: CronJobScheduleSchema,
      required: true
    },
    retryPolicy: {
      type: CronJobRetryPolicySchema,
      default: () => ({
        maxRetries: 3,
        backoffMultiplier: 2,
        currentRetries: 0
      })
    },
    status: {
      type: String,
      enum: ["idle", "running", "success", "error"],
      default: "idle"
    },
    lastExecution: Date,
    failureCount: {
      type: Number,
      default: 0
    },
    lastError: String,
    history: {
      type: [CronJobHistoryEntrySchema],
      default: []
    },
    metadata: {
      type: CronJobMetadataSchema,
      default: () => ({
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
        tags: []
      })
    }
  },
  {
    timestamps: true
  }
);
CronJobSchema.index({ companyId: 1, isActive: 1 });
CronJobSchema.index({ companyId: 1, type: 1 });
CronJobSchema.index({ "schedule.nextRun": 1 }, { sparse: true });
CronJobSchema.pre("validate", function() {
  if (this.type === "message" && !this.message) {
    this.invalidate("message", 'message is required when type is "message"');
  }
  if (this.type === "message" && (!this.message?.body || !this.message.body.trim())) {
    this.invalidate("message.body", 'message body is required when type is "message"');
  }
  if (this.type === "api" && !this.apiConfig) {
    this.invalidate("apiConfig", 'apiConfig is required when type is "api"');
  }
});
CronJobSchema.pre("save", function() {
  if (this.history && this.history.length > 50) {
    this.history = this.history.slice(-50);
  }
});

// src/database/models.ts
init_company_model();
var cronJobModel = null;
var companyModel = null;
async function getCronJobModel() {
  if (cronJobModel) {
    return cronJobModel;
  }
  const conn = await getSharedConnection();
  cronJobModel = conn.models.CronJob || conn.model("CronJob", CronJobSchema);
  return cronJobModel;
}
async function getCompanyModel() {
  if (companyModel) {
    return companyModel;
  }
  const conn = await getSharedConnection();
  companyModel = conn.models.Company || conn.model("Company", CompanySchema);
  return companyModel;
}
async function getSharedModels() {
  const [CronJobModel, CompanyModel] = await Promise.all([
    getCronJobModel(),
    getCompanyModel()
  ]);
  return { CronJobModel, CompanyModel };
}

// src/api/controllers/jobs.controller.v2.ts
var JobsControllerV2 = class {
  constructor(scheduler) {
    this.createJob = async (req, res) => {
      try {
        const validation = validateCronJobCreate(req.body);
        if (!validation.success) {
          return res.status(400).json({
            ok: false,
            message: "Validation failed",
            errors: validation.errors
          });
        }
        const job = await this.scheduler.createJob(validation.data);
        return res.status(201).json({
          ok: true,
          data: job
        });
      } catch (error) {
        logger_default.error("[JobsControllerV2] Create job failed:", error);
        return res.status(500).json({
          ok: false,
          message: error.message
        });
      }
    };
    this.listJobs = async (req, res) => {
      try {
        const { companyId, type, isActive } = req.query;
        const filter = {};
        if (companyId) filter.companyId = companyId;
        if (type) filter.type = type;
        if (isActive !== void 0) filter.isActive = isActive === "true";
        const { CronJobModel } = await getSharedModels();
        const jobs = await CronJobModel.find(filter).sort({
          "metadata.createdAt": -1
        });
        return res.status(200).json({
          ok: true,
          data: jobs
        });
      } catch (error) {
        logger_default.error("[JobsControllerV2] List jobs failed:", error);
        return res.status(500).json({
          ok: false,
          message: error.message
        });
      }
    };
    this.getJob = async (req, res) => {
      try {
        const { id } = req.params;
        const job = await this.scheduler.getJob(id);
        if (!job) {
          return res.status(404).json({
            ok: false,
            message: "Job not found"
          });
        }
        return res.status(200).json({
          ok: true,
          data: job
        });
      } catch (error) {
        logger_default.error("[JobsControllerV2] Get job failed:", error);
        return res.status(500).json({
          ok: false,
          message: error.message
        });
      }
    };
    this.updateJob = async (req, res) => {
      try {
        const { id } = req.params;
        const validation = validateCronJobUpdate(req.body);
        if (!validation.success) {
          return res.status(400).json({
            ok: false,
            message: "Validation failed",
            errors: validation.errors
          });
        }
        const job = await this.scheduler.updateJob(id, validation.data);
        return res.status(200).json({
          ok: true,
          data: job
        });
      } catch (error) {
        logger_default.error("[JobsControllerV2] Update job failed:", error);
        return res.status(500).json({
          ok: false,
          message: error.message
        });
      }
    };
    this.deleteJob = async (req, res) => {
      try {
        const { id } = req.params;
        await this.scheduler.deleteJob(id);
        return res.status(200).json({
          ok: true,
          message: `Job ${id} deleted`
        });
      } catch (error) {
        logger_default.error("[JobsControllerV2] Delete job failed:", error);
        return res.status(500).json({
          ok: false,
          message: error.message
        });
      }
    };
    this.runJobNow = async (req, res) => {
      try {
        const { id } = req.params;
        await this.scheduler.runJobNow(id);
        return res.status(200).json({
          ok: true,
          message: `Job ${id} executed`
        });
      } catch (error) {
        logger_default.error("[JobsControllerV2] Run job failed:", error);
        return res.status(500).json({
          ok: false,
          message: error.message
        });
      }
    };
    this.scheduler = scheduler;
  }
};

// src/jobs/scheduler.service.v2.ts
import cron from "node-cron";

// src/jobs/executor.service.ts
import axios2 from "axios";
init_whatsapp_direct_service();
init_logger();
var JobExecutor = class {
  constructor() {
  }
  resolveRetryPolicy(job) {
    const maxRetries = Math.min(job.retryPolicy?.maxRetries ?? 1, 1);
    const backoffMultiplier = job.retryPolicy?.backoffMultiplier ?? 1;
    const currentRetries = job.retryPolicy?.currentRetries ?? 0;
    return {
      maxRetries: Math.max(0, maxRetries),
      backoffMultiplier: Math.max(1, backoffMultiplier),
      currentRetries: Math.max(0, currentRetries)
    };
  }
  prependBotPrefix(message, prefix) {
    const fallbackPrefix = "\u{1F916} ConstRoadBot";
    const effectivePrefix = prefix && prefix.trim() ? prefix.trim() : fallbackPrefix;
    const trimmed = (message ?? "").trim();
    if (!trimmed) {
      return effectivePrefix;
    }
    const normalized = trimmed.replace(/\r\n/g, "\n");
    if (normalized.toLowerCase().startsWith(effectivePrefix.toLowerCase())) {
      return normalized;
    }
    return `${effectivePrefix}

${normalized}`;
  }
  normalizeRecipient(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    if (trimmed.includes("@")) return trimmed;
    const normalized = trimmed.replace(/[^\d]/g, "");
    return `${normalized}@s.whatsapp.net`;
  }
  async execute(job) {
    const startTime = Date.now();
    const { CronJobModel, CompanyModel } = await getSharedModels();
    try {
      logger_default.info(
        `[JobExecutor] Executing job ${job._id} (${job.name}) for company ${job.companyId}`
      );
      await CronJobModel.updateOne(
        { _id: job._id },
        { status: "running", lastExecution: /* @__PURE__ */ new Date() }
      );
      const company = await CompanyModel.findOne({ companyId: job.companyId });
      if (!company) {
        throw new Error(`Company ${job.companyId} not found`);
      }
      const sender = company.whatsappConfig?.sender;
      const cronjobPrefix = company.whatsappConfig?.cronjobPrefix;
      const hasChatId = Boolean(job.message?.chatId);
      const hasBody = Boolean(job.message?.body?.trim());
      if (!sender && (job.type === "message" || hasChatId)) {
        throw new Error(`No sender configured for company ${job.companyId}`);
      }
      if (job.type === "message") {
        await this.executeMessage(job, sender, cronjobPrefix);
      } else if (job.type === "api") {
        const apiMessages = await this.executeApi(job);
        if (apiMessages && apiMessages.length > 0) {
          await this.executeBatchMessages(
            sender,
            apiMessages,
            cronjobPrefix,
            job.message?.chatId
          );
        } else if (hasChatId && hasBody) {
          await this.executeMessage(job, sender, cronjobPrefix);
        }
      }
      const duration = Date.now() - startTime;
      await this.recordSuccess(job, duration);
      logger_default.info(
        `[JobExecutor] Job ${job._id} completed successfully in ${duration}ms`
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      logger_default.error(`[JobExecutor] Job ${job._id} failed:`, error);
      const retryPolicy = this.resolveRetryPolicy(job);
      if (retryPolicy.currentRetries < retryPolicy.maxRetries) {
        await this.scheduleRetry(job, error, retryPolicy);
      } else {
        await this.recordError(job, error, duration);
      }
    }
  }
  async executeMessage(job, sender, prefix, overrideBody) {
    if (!job.message) {
      throw new Error("Message configuration is missing");
    }
    const { chatId, body, mentions } = job.message;
    const resolvedBody = (overrideBody ?? body ?? "").trim();
    const messageBody = this.prependBotPrefix(resolvedBody, prefix ?? "");
    await WhatsAppDirectService.sendMessage(sender, chatId, messageBody, {
      mentions: mentions || [],
      queueOnFail: true
    });
    logger_default.info(`[JobExecutor] Message sent to ${chatId}`);
  }
  async executeBatchMessages(sender, items, prefix, defaultTo) {
    for (const item of items) {
      const rawTo = item.to ?? defaultTo;
      if (!rawTo) {
        logger_default.warn("[JobExecutor] Skipping message with no recipient");
        continue;
      }
      const recipient = this.normalizeRecipient(rawTo);
      const messageBody = this.prependBotPrefix(item.message, prefix ?? "");
      await WhatsAppDirectService.sendMessage(sender, recipient, messageBody, {
        mentions: item.mentions || [],
        queueOnFail: true
      });
      logger_default.info(`[JobExecutor] Message sent to ${recipient}`);
    }
  }
  shouldUseApiResponseMessage(job, requestHeaders) {
    const headers = requestHeaders ?? job.apiConfig?.headers ?? {};
    const rawFlag = headers["x-cronjob-return-message"] || headers["x-cronjob-use-response-message"];
    if (rawFlag && rawFlag !== "0" && rawFlag !== "false") {
      return true;
    }
    const url = job.apiConfig?.url;
    if (!url) return false;
    try {
      const parsed = new URL(url, "http://localhost");
      const param = parsed.searchParams.get("returnMessage");
      return param === "1" || param === "true" || param === "yes";
    } catch {
      return false;
    }
  }
  coerceApiMessages(payload, defaultTo) {
    if (!payload) return void 0;
    const toItem = (value) => {
      if (!value) return null;
      if (typeof value === "string") {
        return { to: defaultTo, message: value };
      }
      if (typeof value === "object") {
        const message = typeof value.message === "string" ? value.message : void 0;
        if (!message) return null;
        const to = typeof value.to === "string" ? value.to : defaultTo;
        const mentions = Array.isArray(value.mentions) ? value.mentions.filter((m) => typeof m === "string") : void 0;
        return { to, message, mentions };
      }
      return null;
    };
    if (Array.isArray(payload)) {
      const items = payload.map(toItem).filter(Boolean);
      return items.length > 0 ? items : void 0;
    }
    const single = toItem(payload);
    return single ? [single] : void 0;
  }
  mergeApiMessages(primary, secondary) {
    if (primary && secondary) return [...primary, ...secondary];
    if (primary && primary.length > 0) return primary;
    if (secondary && secondary.length > 0) return secondary;
    return void 0;
  }
  extractMessageFromApiResponse(data, companyId, defaultTo) {
    if (!data) return void 0;
    const topMessages = this.coerceApiMessages(data.messages, defaultTo);
    const topMessage = this.coerceApiMessages(data.message, defaultTo);
    const topLevel = this.mergeApiMessages(topMessages, topMessage);
    if (topLevel && topLevel.length > 0) return topLevel;
    const tenantResults = Array.isArray(data.tenantResults) ? data.tenantResults : null;
    if (!tenantResults || tenantResults.length === 0) return void 0;
    const match = companyId ? tenantResults.find((t) => t?.companyId === companyId) : tenantResults[0];
    const resultMessages = this.coerceApiMessages(match?.result?.messages, defaultTo);
    const resultMessage = this.coerceApiMessages(match?.result?.message, defaultTo);
    return this.mergeApiMessages(resultMessages, resultMessage);
  }
  async executeApi(job) {
    if (!job.apiConfig) {
      throw new Error("API configuration is missing");
    }
    const { url, method, headers, body } = job.apiConfig;
    const requestHeaders = {
      ...headers || {}
    };
    if (job.companyId && !requestHeaders["x-company-id"]) {
      requestHeaders["x-company-id"] = String(job.companyId);
    }
    if (job.message?.chatId && !requestHeaders["x-cronjob-chat-id"]) {
      requestHeaders["x-cronjob-chat-id"] = String(job.message.chatId);
    }
    if (!requestHeaders["x-cronjob-return-message"] && !requestHeaders["x-cronjob-use-response-message"] && job.message?.chatId) {
      requestHeaders["x-cronjob-return-message"] = "1";
    }
    const response = await axios2.request({
      url,
      method,
      headers: requestHeaders,
      data: body,
      timeout: job.timeout || 3e4
    });
    logger_default.info(`[JobExecutor] API call to ${url} returned ${response.status}`);
    if (!this.shouldUseApiResponseMessage(job, requestHeaders)) {
      return void 0;
    }
    const messages = this.extractMessageFromApiResponse(
      response.data,
      job.companyId,
      job.message?.chatId
    );
    if (!messages || messages.length === 0) {
      logger_default.warn(`[JobExecutor] API response did not include messages to send`);
    }
    return messages;
  }
  async recordSuccess(job, duration) {
    const { CronJobModel } = await getSharedModels();
    await CronJobModel.updateOne(
      { _id: job._id },
      {
        status: "success",
        failureCount: 0,
        lastError: null,
        "retryPolicy.currentRetries": 0,
        $push: {
          history: {
            $each: [
              {
                status: "success",
                timestamp: /* @__PURE__ */ new Date(),
                duration
              }
            ],
            $slice: -50
          }
        }
      }
    );
  }
  async recordError(job, error, duration) {
    const { CronJobModel } = await getSharedModels();
    await CronJobModel.updateOne(
      { _id: job._id },
      {
        status: "error",
        $inc: { failureCount: 1 },
        lastError: error.message,
        $push: {
          history: {
            $each: [
              {
                status: "error",
                timestamp: /* @__PURE__ */ new Date(),
                duration,
                error: error.message
              }
            ],
            $slice: -50
          }
        }
      }
    );
  }
  async scheduleRetry(job, error, retryPolicy) {
    const { CronJobModel } = await getSharedModels();
    const currentRetries = retryPolicy.currentRetries;
    const maxRetries = retryPolicy.maxRetries;
    const backoffMultiplier = retryPolicy.backoffMultiplier;
    const backoffDelay = Math.pow(backoffMultiplier, currentRetries) * 1e3;
    logger_default.info(
      `[JobExecutor] Scheduling retry ${currentRetries + 1}/${maxRetries} for job ${job._id} in ${backoffDelay}ms`
    );
    const nextRetries = currentRetries + 1;
    await CronJobModel.updateOne(
      { _id: job._id },
      { "retryPolicy.currentRetries": nextRetries }
    );
    const nextJob = {
      ...job,
      retryPolicy: {
        ...job.retryPolicy ?? {},
        maxRetries,
        backoffMultiplier,
        currentRetries: nextRetries
      }
    };
    setTimeout(async () => {
      await this.execute(nextJob);
    }, backoffDelay);
  }
};

// src/utils/cronHelpers.ts
var import_cron_parser = __toESM(require_parser(), 1);
function calculateNextRun(cronExpression, timezone = "America/Lima") {
  const interval = import_cron_parser.default.parseExpression(cronExpression, {
    currentDate: /* @__PURE__ */ new Date(),
    tz: timezone
  });
  return interval.next().toDate();
}

// src/jobs/scheduler.service.v2.ts
init_logger();
var JobSchedulerV2 = class {
  constructor() {
    this.scheduledTasks = /* @__PURE__ */ new Map();
    this.executor = new JobExecutor();
  }
  async initialize() {
    try {
      logger_default.info("[JobScheduler] Initializing v2...");
      const { CronJobModel } = await getSharedModels();
      const activeJobs = await CronJobModel.find({ isActive: true });
      logger_default.info(`[JobScheduler] Found ${activeJobs.length} active jobs`);
      for (const job of activeJobs) {
        await this.scheduleJob(job, { silent: true });
      }
      logger_default.info(`[JobScheduler] Scheduled ${activeJobs.length} active jobs`);
      logger_default.info("[JobScheduler] Initialization complete");
    } catch (error) {
      logger_default.error("[JobScheduler] Initialization failed:", error);
      throw error;
    }
  }
  async createJob(data) {
    try {
      const { CronJobModel, CompanyModel } = await getSharedModels();
      const company = await CompanyModel.findOne({ companyId: data.companyId });
      if (!company) {
        throw new Error(`Company ${data.companyId} not found`);
      }
      if (data.type === "message" && !company.whatsappConfig?.sender) {
        throw new Error(
          `Company ${data.companyId} does not have WhatsApp sender configured`
        );
      }
      const limit = company.subscription?.limits?.cronJobs;
      if (typeof limit === "number") {
        const currentCount = await CronJobModel.countDocuments({
          companyId: data.companyId,
          isActive: true
        });
        if (currentCount >= limit) {
          throw new Error(`Cronjob limit reached for company ${data.companyId}`);
        }
      }
      const schedule = data.schedule || {
        cronExpression: "",
        timezone: "America/Lima"
      };
      if (schedule.cronExpression) {
        schedule.nextRun = calculateNextRun(
          schedule.cronExpression,
          schedule.timezone || "America/Lima"
        );
      }
      const job = await CronJobModel.create({
        ...data,
        schedule,
        metadata: {
          ...data.metadata,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        }
      });
      if (company.subscription?.usage?.cronJobs !== void 0) {
        await CompanyModel.updateOne(
          { companyId: data.companyId },
          { $inc: { "subscription.usage.cronJobs": 1 } }
        );
      }
      if (job.isActive) {
        await this.scheduleJob(job);
      }
      logger_default.info(
        `[JobScheduler] Created job ${job._id} for company ${job.companyId}`
      );
      return job;
    } catch (error) {
      logger_default.error("[JobScheduler] Failed to create job:", error);
      throw error;
    }
  }
  async updateJob(jobId, updates) {
    try {
      const { CronJobModel } = await getSharedModels();
      const job = await CronJobModel.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }
      if (job.type === "message" && updates.message && (!updates.message.body || !updates.message.body.trim())) {
        throw new Error('message.body is required when type is "message"');
      }
      Object.assign(job, updates, {
        "metadata.updatedAt": /* @__PURE__ */ new Date(),
        "metadata.updatedBy": updates.metadata?.updatedBy
      });
      if (updates.schedule?.cronExpression) {
        job.schedule.nextRun = calculateNextRun(
          updates.schedule.cronExpression,
          updates.schedule.timezone || job.schedule.timezone || "America/Lima"
        );
      }
      await job.save();
      if (updates.schedule?.cronExpression || updates.isActive !== void 0) {
        this.unscheduleJob(jobId);
        if (job.isActive) {
          await this.scheduleJob(job);
        }
      }
      logger_default.info(`[JobScheduler] Updated job ${jobId}`);
      return job;
    } catch (error) {
      logger_default.error("[JobScheduler] Failed to update job:", error);
      throw error;
    }
  }
  async deleteJob(jobId) {
    try {
      const { CronJobModel, CompanyModel } = await getSharedModels();
      const job = await CronJobModel.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }
      this.unscheduleJob(jobId);
      if (job.companyId) {
        await CompanyModel.updateOne(
          { companyId: job.companyId },
          { $inc: { "subscription.usage.cronJobs": -1 } }
        );
      }
      await CronJobModel.deleteOne({ _id: jobId });
      logger_default.info(`[JobScheduler] Deleted job ${jobId}`);
    } catch (error) {
      logger_default.error("[JobScheduler] Failed to delete job:", error);
      throw error;
    }
  }
  async runJobNow(jobId) {
    try {
      const { CronJobModel } = await getSharedModels();
      const job = await CronJobModel.findById(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }
      logger_default.info(`[JobScheduler] Running job ${jobId} manually`);
      await this.executor.execute(job);
    } catch (error) {
      logger_default.error("[JobScheduler] Failed to run job manually:", error);
      throw error;
    }
  }
  async getJobsByCompany(companyId) {
    const { CronJobModel } = await getSharedModels();
    return CronJobModel.find({ companyId }).sort({ "metadata.createdAt": -1 });
  }
  async getAllJobs() {
    const { CronJobModel } = await getSharedModels();
    return CronJobModel.find({}).sort({ "metadata.createdAt": -1 });
  }
  async getJob(jobId) {
    const { CronJobModel } = await getSharedModels();
    return CronJobModel.findById(jobId);
  }
  async scheduleJob(job, options = {}) {
    try {
      const task = cron.schedule(
        job.schedule.cronExpression,
        async () => {
          await this.executor.execute(job);
        },
        {
          timezone: job.schedule.timezone || "America/Lima",
          scheduled: true
        }
      );
      this.scheduledTasks.set(job._id.toString(), {
        jobId: job._id.toString(),
        task
      });
      if (!options.silent) {
        logger_default.debug(
          `[JobScheduler] Scheduled job ${job._id} with expression ${job.schedule.cronExpression}`
        );
      }
    } catch (error) {
      logger_default.error(
        `[JobScheduler] Failed to schedule job ${job._id}:`,
        error
      );
      throw error;
    }
  }
  unscheduleJob(jobId) {
    const scheduled = this.scheduledTasks.get(jobId);
    if (scheduled) {
      scheduled.task.stop();
      this.scheduledTasks.delete(jobId);
      logger_default.debug(`[JobScheduler] Unscheduled job ${jobId}`);
    }
  }
  async shutdown() {
    logger_default.info("[JobScheduler] Shutting down...");
    for (const [, scheduled] of this.scheduledTasks) {
      scheduled.task.stop();
    }
    this.scheduledTasks.clear();
    logger_default.info("[JobScheduler] Shutdown complete");
  }
  async syncFromDatabase() {
    logger_default.info("[JobScheduler] Syncing from database...");
    for (const [, scheduled] of this.scheduledTasks) {
      scheduled.task.stop();
    }
    this.scheduledTasks.clear();
    await this.initialize();
  }
};
var scheduler_service_v2_default = JobSchedulerV2;

// src/jobs/scheduler.v2.instance.ts
var jobSchedulerV2 = new scheduler_service_v2_default();
var scheduler_v2_instance_default = jobSchedulerV2;

// src/api/middlewares/validateCompany.middleware.ts
async function validateCompany(req, res, next) {
  const companyId = req.body && req.body.companyId || req.query && req.query.companyId;
  if (!companyId || typeof companyId !== "string") {
    return res.status(400).json({
      ok: false,
      message: "companyId is required"
    });
  }
  const { CompanyModel } = await getSharedModels();
  const company = await CompanyModel.findOne({ companyId });
  if (!company) {
    return res.status(404).json({
      ok: false,
      message: `Company ${companyId} not found`
    });
  }
  req.companyId = companyId;
  return next();
}

// src/api/middlewares/validateSender.middleware.ts
async function validateSender(req, res, next) {
  const companyId = req.body && req.body.companyId || req.query && req.query.companyId;
  if (!companyId || typeof companyId !== "string") {
    return res.status(400).json({
      ok: false,
      message: "companyId is required to validate sender"
    });
  }
  const { CompanyModel } = await getSharedModels();
  const company = await CompanyModel.findOne({ companyId });
  if (!company) {
    return res.status(404).json({
      ok: false,
      message: `Company ${companyId} not found`
    });
  }
  const jobType = req.body?.type;
  const hasMessage = Boolean(req.body?.message?.chatId) || Boolean(req.body?.message?.body);
  const shouldRequireSender = jobType === "message" || hasMessage;
  if (shouldRequireSender && !company.whatsappConfig?.sender) {
    return res.status(400).json({
      ok: false,
      message: "No hay sender de WhatsApp configurado para esta empresa. Configure uno antes de crear cronjobs."
    });
  }
  return next();
}

// src/api/routes/jobs.routes.v2.ts
var router2 = Router2();
var controller = new JobsControllerV2(scheduler_v2_instance_default);
router2.post("/", jobsLimiter, validateCompany, validateSender, controller.createJob);
router2.get("/", controller.listJobs);
router2.get("/:id", controller.getJob);
router2.patch("/:id", controller.updateJob);
router2.put("/:id", controller.updateJob);
router2.delete("/:id", controller.deleteJob);
router2.post("/:id/run", controller.runJobNow);
var jobs_routes_v2_default = router2;

// src/api/routes/message.routes.ts
import { Router as Router3 } from "express";
import multer from "multer";

// src/api/controllers/message.controller.simple.ts
init_whatsapp_direct_service();
init_logger();

// src/middleware/quota.middleware.ts
init_quota_validator_service();
init_logger();
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

// src/api/controllers/message.controller.simple.ts
async function sendTextMessage(req, res, next) {
  try {
    const { sessionPhone } = req.params;
    const { to, message } = req.body;
    if (!to || !message) {
      const error = new Error("to and message are required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (!WhatsAppDirectService.isSessionActive(sessionPhone)) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }
    logger_default.info(`\u{1F4E4} Sending text message from ${sessionPhone} to ${to}`);
    try {
      const result = await WhatsAppDirectService.sendMessage(sessionPhone, to, message);
      if (req.tenantId) {
        await incrementWhatsAppUsage(req.tenantId);
      }
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: "Message sent successfully",
        messageId: result.key.id,
        timestamp: result.messageTimestamp
      });
    } catch (sendError) {
      const errorMsg = sendError instanceof Error ? sendError.message : String(sendError);
      logger_default.error(`\u274C Send error: ${errorMsg}`);
      if (to.includes("@g.us") && (errorMsg.includes("participant") || errorMsg.includes("forbidden") || errorMsg.includes("not-acceptable"))) {
        const error = new Error(
          `Cannot send to group. The bot may not be a member/admin of this group. Try refreshing groups with GET /api/sessions/${sessionPhone}/syncGroups`
        );
        error.statusCode = HTTP_STATUS.FORBIDDEN;
        return next(error);
      }
      if (errorMsg.includes("session") || errorMsg.includes("connection") || errorMsg.includes("not connected")) {
        const error = new Error("Session disconnected. Please reconnect.");
        error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
        return next(error);
      }
      throw sendError;
    }
  } catch (error) {
    next(error);
  }
}
async function sendImage(req, res, next) {
  try {
    const { sessionPhone } = req.params;
    const { to, caption, filePath, fileUrl, mimeType, fileName } = req.body;
    const file = req.file;
    if (!to) {
      const error = new Error("to is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (!WhatsAppDirectService.isSessionActive(sessionPhone)) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }
    logger_default.info(`\u{1F4E4} Sending image from ${sessionPhone} to ${to}`);
    const sendOptions = {
      caption,
      mimeType,
      fileName,
      companyId: req.companyId
      // For filePath/fileUrl resolution
    };
    if (file?.buffer) {
      sendOptions.buffer = file.buffer;
      sendOptions.fileName = file.originalname;
      sendOptions.mimeType = mimeType || file.mimetype;
    } else if (file?.filename) {
      sendOptions.fileName = file.filename;
    } else if (filePath) {
      sendOptions.filePath = filePath;
    } else if (fileUrl) {
      sendOptions.fileUrl = fileUrl;
    } else {
      const error = new Error("file, filePath, or fileUrl is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await WhatsAppDirectService.sendImageFile(sessionPhone, to, sendOptions);
    if (req.tenantId) {
      await incrementWhatsAppUsage(req.tenantId);
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
    const { to, caption, filePath, fileUrl, mimeType, fileName } = req.body;
    const file = req.file;
    if (!to) {
      const error = new Error("to is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (!WhatsAppDirectService.isSessionActive(sessionPhone)) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }
    logger_default.info(`\u{1F4E4} Sending video from ${sessionPhone} to ${to}`);
    const sendOptions = {
      caption,
      mimeType,
      fileName,
      companyId: req.companyId
    };
    if (file?.buffer) {
      sendOptions.buffer = file.buffer;
      sendOptions.fileName = file.originalname;
      sendOptions.mimeType = mimeType || file.mimetype;
    } else if (file?.filename) {
      sendOptions.fileName = file.filename;
    } else if (filePath) {
      sendOptions.filePath = filePath;
    } else if (fileUrl) {
      sendOptions.fileUrl = fileUrl;
    } else {
      const error = new Error("file, filePath, or fileUrl is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await WhatsAppDirectService.sendVideoFile(sessionPhone, to, sendOptions);
    if (req.tenantId) {
      await incrementWhatsAppUsage(req.tenantId);
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
    const { to, caption, filePath, fileUrl, mimeType, fileName } = req.body;
    const file = req.file;
    if (!to) {
      const error = new Error("to is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    if (!WhatsAppDirectService.isSessionActive(sessionPhone)) {
      const error = new Error("Session not connected");
      error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
      return next(error);
    }
    logger_default.info(`\u{1F4E4} Sending file from ${sessionPhone} to ${to}`);
    const sendOptions = {
      caption,
      mimeType,
      fileName,
      companyId: req.companyId
    };
    if (file?.buffer) {
      sendOptions.buffer = file.buffer;
      sendOptions.fileName = file.originalname || "document";
      sendOptions.mimeType = mimeType || file.mimetype;
    } else if (file?.filename) {
      sendOptions.fileName = file.filename;
    } else if (filePath) {
      sendOptions.filePath = filePath;
    } else if (fileUrl) {
      sendOptions.fileUrl = fileUrl;
    } else {
      const error = new Error("file, filePath, or fileUrl is required");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    await WhatsAppDirectService.sendDocument(sessionPhone, to, sendOptions);
    if (req.tenantId) {
      await incrementWhatsAppUsage(req.tenantId);
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "File sent successfully"
    });
  } catch (error) {
    next(error);
  }
}

// src/api/routes/message.routes.ts
var router3 = Router3();
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});
router3.post(
  "/:sessionPhone/text",
  sendTextMessage
);
router3.post(
  "/:sessionPhone/image",
  // requireTenant,
  // whatsappRateLimiter,
  // requireWhatsAppQuota,
  upload.single("file"),
  sendImage
);
router3.post(
  "/:sessionPhone/video",
  // requireTenant,
  // whatsappRateLimiter,
  // requireWhatsAppQuota,
  upload.single("file"),
  sendVideo
);
router3.post(
  "/:sessionPhone/file",
  // requireTenant,
  // whatsappRateLimiter,
  // requireWhatsAppQuota,
  upload.single("file"),
  sendFile
);
var message_routes_default = router3;

// src/api/routes/pdf.routes.ts
import { Router as Router4 } from "express";

// src/pdf/generator.service.ts
init_logger();
init_environment();
import puppeteer from "puppeteer";
import Handlebars from "handlebars";
import fs7 from "fs-extra";
import path10 from "path";
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
      await fs7.ensureDir(this.templatesDir);
      await fs7.ensureDir(this.uploadsDir);
      const headlessEnv = process.env.PUPPETEER_HEADLESS;
      const headlessMode = headlessEnv === "true" ? true : headlessEnv === "false" ? false : "new";
      const launchBrowser = async (headless) => puppeteer.launch({
        headless,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage"
        ]
      });
      if (headlessEnv) {
        this.browser = await launchBrowser(headlessMode);
      } else {
        try {
          this.browser = await launchBrowser(headlessMode);
        } catch (error) {
          logger_default.warn(
            `Puppeteer launch failed with headless=${String(headlessMode)}. Retrying with headless=true`,
            error
          );
          this.browser = await launchBrowser(true);
        }
      }
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
      const filepath = path10.join(this.uploadsDir, filename);
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
      const filepath = path10.join(this.templatesDir, `${id}.hbs`);
      await fs7.ensureDir(path10.dirname(filepath));
      await fs7.writeFile(filepath, htmlContent, "utf-8");
      logger_default.info(`Created PDF template: ${id}`);
    } catch (error) {
      logger_default.error("Error creating PDF template:", error);
      throw error;
    }
  }
  async loadTemplate(templateId) {
    try {
      const filepath = path10.join(this.templatesDir, `${templateId}.hbs`);
      if (!await fs7.pathExists(filepath)) {
        throw new Error(`Template not found: ${templateId}`);
      }
      return await fs7.readFile(filepath, "utf-8");
    } catch (error) {
      logger_default.error("Error loading template:", error);
      throw error;
    }
  }
  async listTemplates() {
    try {
      const files = await fs7.readdir(this.templatesDir);
      return files.filter((f) => f.endsWith(".hbs")).map((f) => f.replace(".hbs", ""));
    } catch (error) {
      logger_default.error("Error listing templates:", error);
      return [];
    }
  }
  async deleteTemplate(templateId) {
    try {
      const filepath = path10.join(this.templatesDir, `${templateId}.hbs`);
      if (await fs7.pathExists(filepath)) {
        await fs7.remove(filepath);
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
import fs9 from "fs-extra";
import path12 from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { randomUUID as randomUUID3 } from "crypto";
init_environment();

// src/pdf/render.service.ts
init_environment();
import fs8 from "fs-extra";
import path11 from "path";
import crypto2 from "crypto";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
function getCacheKey(filePath, stat, page, scale) {
  const raw = `${filePath}:${stat.size}:${stat.mtimeMs}:${page}:${scale}`;
  return crypto2.createHash("sha1").update(raw).digest("hex");
}
function clampScale(value) {
  if (Number.isNaN(value)) return 1;
  return Math.min(3, Math.max(0.5, value));
}
async function getPdfInfo(filePath) {
  const buffer = await fs8.readFile(filePath);
  const data = new Uint8Array(buffer);
  const task = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await task.promise;
  return {
    pages: pdf.numPages
  };
}
async function renderPdfPageToPng(filePath, options) {
  const stat = await fs8.stat(filePath);
  const scale = clampScale(options.scale);
  const cacheKey = getCacheKey(filePath, stat, options.page, scale);
  const cacheDir = path11.resolve(config.drive.cacheDir, cacheKey);
  const cacheFile = path11.join(cacheDir, `page-${options.page}.png`);
  if (await fs8.pathExists(cacheFile)) {
    return { cacheFile, fromCache: true };
  }
  await fs8.ensureDir(cacheDir);
  const buffer = await fs8.readFile(filePath);
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
  await fs8.writeFile(cacheFile, pngBuffer);
  return { cacheFile, fromCache: false };
}
async function renderPdfPageToPngWithGrid(filePath, options) {
  const stat = await fs8.stat(filePath);
  const scale = clampScale(options.scale);
  const gridSize = options.gridSize && options.gridSize > 0 ? options.gridSize : 50;
  const cacheKey = getCacheKey(filePath, stat, options.page, scale) + `-g${gridSize}`;
  const cacheDir = path11.resolve(config.drive.cacheDir, cacheKey);
  const cacheFile = path11.join(cacheDir, `page-${options.page}-grid.png`);
  if (await fs8.pathExists(cacheFile)) {
    return { cacheFile, fromCache: true };
  }
  await fs8.ensureDir(cacheDir);
  const buffer = await fs8.readFile(filePath);
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
  await fs8.writeFile(cacheFile, pngBuffer);
  return { cacheFile, fromCache: false };
}

// src/api/controllers/pdf-vale.controller.ts
init_sessions_simple();
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
  const sessions2 = listSessions();
  return sessions2.find((phone) => isSessionReady(phone)) || null;
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
  if (!isSessionReady(sessionPhone)) {
    throw new Error("WhatsApp session not connected");
  }
  const socket = getSession(sessionPhone);
  if (!socket) {
    throw new Error("WhatsApp session not found");
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
function resolveProto(req) {
  const forwarded = req.headers["x-forwarded-proto"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0];
  }
  return req.protocol;
}
function buildAbsoluteUrl(req, relativeUrl) {
  const host = req.get("x-forwarded-host") || req.get("host");
  if (!host) return relativeUrl;
  const proto = resolveProto(req);
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
    const templatePath = path12.join(config.pdf.templatesDir, template);
    if (!await fs9.pathExists(templatePath)) {
      const error = new Error("Template not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const bytes = await fs9.readFile(templatePath);
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
    const signaturePath = path12.join(
      path12.dirname(config.pdf.templatesDir),
      "signatures",
      "signature-dispatch-note.png"
    );
    if (await fs9.pathExists(signaturePath)) {
      const signatureBytes = await fs9.readFile(signaturePath);
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
    await fs9.ensureDir(config.pdf.tempDir);
    const valeNumber = fields.nroVale || randomUUID3().slice(0, 8);
    const safeVale = String(valeNumber).replace(/[^a-zA-Z0-9_-]+/g, "-");
    const filename = `vale-despacho-${safeVale}.pdf`;
    const outputPath = path12.join(config.pdf.tempDir, filename);
    const pdfBytes = await pdfDoc.save();
    await fs9.writeFile(outputPath, pdfBytes);
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
    const templatePath = path12.join(config.pdf.templatesDir, template);
    if (!await fs9.pathExists(templatePath)) {
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
    res.status(HTTP_STATUS.OK).sendFile(path12.resolve(cacheFile));
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
import fs12 from "fs-extra";
import path15 from "path";

// src/api/controllers/drive.controller.ts
import fs10 from "fs-extra";
import path13 from "path";
init_storage_path_service();
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
function resolveProto2(req) {
  const forwarded = req.headers["x-forwarded-proto"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0];
  }
  return req.protocol;
}
function buildAbsoluteUrl2(req, relativeUrl) {
  const host = req.get("x-forwarded-host") || req.get("host");
  if (!host) return relativeUrl;
  const proto = resolveProto2(req);
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
    const exists = await fs10.pathExists(resolved);
    if (!exists) {
      const error = new Error("Path not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const stat = await fs10.stat(resolved);
    if (!stat.isDirectory()) {
      const error = new Error("Path is not a folder");
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }
    const entries = (await fs10.readdir(resolved)).filter((name) => !name.startsWith("."));
    const results = await Promise.all(
      entries.map(async (name) => {
        const entryStat = await fs10.stat(path13.join(resolved, name));
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
    const parentExists = await fs10.pathExists(resolved);
    if (!parentExists) {
      const error = new Error("Parent path not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const target = path13.join(resolved, name);
    if (!storagePathService.validateAccess(target, companyId)) {
      const error = new Error("Access denied: invalid target path");
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }
    await fs10.ensureDir(target);
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
    await fs10.ensureDir(resolved);
    const MAX_ORDERS_BYTES = 100 * 1024 * 1024;
    const MAX_DRIVE_BYTES2 = 2 * 1024 * 1024 * 1024;
    const isDriveRoot = relativePath.startsWith("drive");
    const maxAllowedBytes = isDriveRoot ? MAX_DRIVE_BYTES2 : MAX_ORDERS_BYTES;
    if (file.size > maxAllowedBytes) {
      await fs10.remove(file.path).catch(() => {
      });
      const error = new Error("File too large");
      error.statusCode = HTTP_STATUS.REQUEST_TOO_LONG;
      return next(error);
    }
    const target = path13.join(resolved, file.originalname);
    if (!storagePathService.validateAccess(target, companyId)) {
      const error = new Error("Access denied: invalid target path");
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      return next(error);
    }
    await fs10.move(file.path, target, { overwrite: true });
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
    const exists = await fs10.pathExists(resolved);
    if (!exists) {
      const error = new Error("Path not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    const stats = await fs10.stat(resolved);
    const isFile = stats.isFile();
    const fileSize = isFile ? stats.size : 0;
    await fs10.remove(resolved);
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
    const exists = await fs10.pathExists(fromResolved);
    if (!exists) {
      const error = new Error("Source not found");
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      return next(error);
    }
    await fs10.ensureDir(path13.dirname(toResolved));
    await fs10.move(fromResolved, toResolved, { overwrite: false });
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
    const stat = await fs10.stat(resolved);
    const name = path13.basename(resolved);
    const parent = path13.dirname(targetPath).replace(/\\/g, "/");
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
import fs11 from "fs-extra";
import path14 from "path";
init_storage_path_service();
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
  return path14.extname(filePath).toLowerCase() === ".pdf";
}
async function resolveExistingPdfPath(resolved, normalized, companyId) {
  if (await fs11.pathExists(resolved)) {
    return { resolved, normalized };
  }
  const candidates = [normalized.normalize("NFC"), normalized.normalize("NFD")].filter(
    (candidate, index, arr) => candidate && arr.indexOf(candidate) === index
  );
  for (const candidate of candidates) {
    const altResolved = storagePathService.resolvePath(companyId, candidate);
    if (await fs11.pathExists(altResolved)) {
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
    const exists = await fs11.pathExists(resolved);
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
    const exists = await fs11.pathExists(resolved);
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
    res.status(HTTP_STATUS.OK).sendFile(path14.resolve(cacheFile));
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
    const exists = await fs11.pathExists(resolved);
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
    res.status(HTTP_STATUS.OK).sendFile(path14.resolve(cacheFile));
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

// src/middleware/tenant.middleware.ts
var import_jsonwebtoken = __toESM(require_jsonwebtoken(), 1);
init_environment();
init_logger();
import crypto3 from "crypto";
var API_KEY_PREFIX = "lk_fe_";
var normalizeSender = (value) => value.replace(/[^\d]/g, "");
var extractApiKey = (req) => {
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("ApiKey ")) {
    return authHeader.replace("ApiKey ", "").trim();
  }
  return null;
};
var parseApiKey = (apiKey) => {
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }
  const rest = apiKey.slice(API_KEY_PREFIX.length);
  const separatorIndex = rest.indexOf("_");
  if (separatorIndex <= 0) {
    return null;
  }
  const companyId = rest.slice(0, separatorIndex).trim();
  const secret = rest.slice(separatorIndex + 1).trim();
  if (!companyId || !secret) {
    return null;
  }
  return { companyId, secret };
};
var hashApiKey = (apiKey) => crypto3.createHash("sha256").update(apiKey).digest("hex");
var timingSafeEqual = (a, b) => {
  try {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto3.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
};
async function requireTenant(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const parts = authHeader.split(" ");
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
      req.auth = { type: "jwt" };
      logger_default.info(`Tenant validated: ${decoded.companyId}`, {
        path: req.path,
        method: req.method,
        userId: decoded.userId
      });
      return next();
    }
    const apiKey = extractApiKey(req);
    if (!apiKey) {
      const error = new Error("No authorization header provided");
      error.statusCode = 401;
      throw error;
    }
    const parsed = parseApiKey(apiKey);
    if (!parsed) {
      const error = new Error("Invalid API key format");
      error.statusCode = 401;
      throw error;
    }
    const CompanyModel = await getCompanyModel();
    const company = await CompanyModel.findOne({ companyId: parsed.companyId, isActive: true }).lean();
    if (!company) {
      const error = new Error("Company not found");
      error.statusCode = 401;
      throw error;
    }
    const keyData = company["api-key-lila-access"] || {};
    if (!keyData.keyHash || keyData.isActive !== true) {
      const error = new Error("API key inactive or not configured");
      error.statusCode = 401;
      throw error;
    }
    const computedHash = hashApiKey(apiKey);
    if (!timingSafeEqual(computedHash, String(keyData.keyHash))) {
      const error = new Error("Invalid API key");
      error.statusCode = 401;
      throw error;
    }
    const origin = req.headers.origin;
    if (Array.isArray(keyData.allowedOrigins) && keyData.allowedOrigins.length > 0 && typeof origin === "string") {
      if (!keyData.allowedOrigins.includes(origin)) {
        const error = new Error("Origin not allowed");
        error.statusCode = 403;
        throw error;
      }
    }
    req.companyId = parsed.companyId;
    req.auth = { type: "apiKey", keyPrefix: keyData.keyPrefix };
    req.apiKeyAllowedSenders = Array.isArray(keyData.allowedSenders) ? keyData.allowedSenders.map((sender) => normalizeSender(String(sender))) : void 0;
    const baseUrl = req.baseUrl || "";
    if (baseUrl.startsWith("/api/drive") && company.features?.modules?.drive === false) {
      const error = new Error("Drive module not enabled for this company");
      error.statusCode = 403;
      throw error;
    }
    if (baseUrl.startsWith("/api/message") && !company.whatsappConfig?.sender) {
      const error = new Error("WhatsApp sender not configured for this company");
      error.statusCode = 403;
      throw error;
    }
    if (baseUrl.startsWith("/api/message") && req.apiKeyAllowedSenders?.length) {
      const sessionPhoneRaw = req.params?.sessionPhone;
      const sessionPhone = sessionPhoneRaw ? normalizeSender(String(sessionPhoneRaw)) : "";
      if (sessionPhone && !req.apiKeyAllowedSenders.includes(sessionPhone)) {
        const error = new Error("Sender not allowed for this API key");
        error.statusCode = 403;
        throw error;
      }
    }
    await CompanyModel.updateOne(
      { companyId: parsed.companyId },
      {
        $set: {
          "api-key-lila-access.lastUsedAt": /* @__PURE__ */ new Date(),
          "api-key-lila-access.lastUsedIp": req.ip
        }
      }
    );
    logger_default.info(`Tenant validated (apiKey): ${parsed.companyId}`, {
      path: req.path,
      method: req.method
    });
    return next();
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

// src/api/routes/drive.routes.ts
var router5 = Router5();
var MAX_DRIVE_BYTES = 2 * 1024 * 1024 * 1024;
var tempDir = path15.join(config.storage.root, "temp", "uploads");
try {
  fs12.ensureDirSync(tempDir);
} catch (error) {
  if (config.nodeEnv !== "production") {
    const fallback = path15.join(process.cwd(), "data", "storage", "temp", "uploads");
    fs12.ensureDirSync(fallback);
    console.warn(
      `[drive] Failed to init temp dir at ${tempDir}. Using fallback: ${fallback}`
    );
    tempDir = fallback;
  } else {
    throw error;
  }
}
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
                required: ["companyId", "name", "type", "schedule"],
                properties: {
                  companyId: { type: "string" },
                  name: { type: "string" },
                  type: { type: "string", enum: ["api", "message"] },
                  isActive: { type: "boolean" },
                  timeout: { type: "number" },
                  schedule: {
                    type: "object",
                    required: ["cronExpression"],
                    properties: {
                      cronExpression: { type: "string" },
                      timezone: { type: "string" }
                    }
                  },
                  message: {
                    type: "object",
                    properties: {
                      chatId: { type: "string" },
                      body: { type: "string" },
                      mentions: { type: "array", items: { type: "string" } }
                    }
                  },
                  apiConfig: {
                    type: "object",
                    properties: {
                      url: { type: "string" },
                      method: { type: "string", enum: ["GET", "POST", "PUT"] },
                      headers: { type: "object" },
                      body: {}
                    }
                  },
                  metadata: {
                    type: "object",
                    properties: {
                      createdBy: { type: "string" },
                      updatedBy: { type: "string" },
                      tags: { type: "array", items: { type: "string" } }
                    }
                  },
                  retryPolicy: {
                    type: "object",
                    properties: {
                      maxRetries: { type: "number" },
                      backoffMultiplier: { type: "number" },
                      currentRetries: { type: "number" }
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
            name: "companyId",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Filtrar jobs por empresa"
          },
          {
            name: "type",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["api", "message"] },
            description: "Filtrar por tipo"
          },
          {
            name: "isActive",
            in: "query",
            required: false,
            schema: { type: "boolean" },
            description: "Filtrar por estado"
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
                  type: { type: "string", enum: ["api", "message"] },
                  isActive: { type: "boolean" },
                  timeout: { type: "number" },
                  schedule: {
                    type: "object",
                    properties: {
                      cronExpression: { type: "string" },
                      timezone: { type: "string" }
                    }
                  },
                  message: {
                    type: "object",
                    properties: {
                      chatId: { type: "string" },
                      body: { type: "string" },
                      mentions: { type: "array", items: { type: "string" } }
                    }
                  },
                  apiConfig: {
                    type: "object",
                    properties: {
                      url: { type: "string" },
                      method: { type: "string", enum: ["GET", "POST", "PUT"] },
                      headers: { type: "object" },
                      body: {}
                    }
                  },
                  metadata: {
                    type: "object",
                    properties: {
                      updatedBy: { type: "string" },
                      tags: { type: "array", items: { type: "string" } }
                    }
                  },
                  retryPolicy: {
                    type: "object",
                    properties: {
                      maxRetries: { type: "number" },
                      backoffMultiplier: { type: "number" },
                      currentRetries: { type: "number" }
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
                  type: { type: "string", enum: ["api", "message"] },
                  isActive: { type: "boolean" },
                  timeout: { type: "number" },
                  schedule: {
                    type: "object",
                    properties: {
                      cronExpression: { type: "string" },
                      timezone: { type: "string" }
                    }
                  },
                  message: {
                    type: "object",
                    properties: {
                      chatId: { type: "string" },
                      body: { type: "string" },
                      mentions: { type: "array", items: { type: "string" } }
                    }
                  },
                  apiConfig: {
                    type: "object",
                    properties: {
                      url: { type: "string" },
                      method: { type: "string", enum: ["GET", "POST", "PUT"] },
                      headers: { type: "object" },
                      body: {}
                    }
                  },
                  metadata: {
                    type: "object",
                    properties: {
                      updatedBy: { type: "string" },
                      tags: { type: "array", items: { type: "string" } }
                    }
                  },
                  retryPolicy: {
                    type: "object",
                    properties: {
                      maxRetries: { type: "number" },
                      backoffMultiplier: { type: "number" },
                      currentRetries: { type: "number" }
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
init_sessions_simple();

// src/whatsapp/baileys/restore-sessions.simple.ts
init_sessions_simple();
init_environment();
import fs13 from "fs";
var restoreAllSessions = async () => {
  if (!fs13.existsSync(config.whatsapp.sessionDir)) return;
  const sessionDirs = fs13.readdirSync(config.whatsapp.sessionDir, { withFileTypes: true }).filter((dirent) => dirent.isDirectory()).filter((dirent) => /^\d{9,15}$/.test(dirent.name)).map((dirent) => dirent.name);
  for (const phone of sessionDirs) {
    try {
      console.log(`\u267B\uFE0F Restoring session for ${phone}`);
      await startSession(phone, () => {
      });
    } catch (err) {
      console.error(`\u274C Error restoring session for ${phone}:`, err);
    }
  }
};

// src/index.ts
import cron2 from "node-cron";
import fs14 from "fs-extra";
var app = express();
app.set("trust proxy", config.security.trustProxy);
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
var corsOrigins = (process.env.LILA_APP_CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
var resolveStaticCorsOrigin = (origin) => {
  if (!origin) return null;
  const normalized = Array.isArray(origin) ? origin[0] : origin;
  if (!normalized) return null;
  if (corsOrigins.length === 0) return normalized;
  if (corsOrigins.includes(normalized)) return normalized;
  return null;
};
var setStaticCorsHeaders = (req, res) => {
  const origin = resolveStaticCorsOrigin(req.headers.origin);
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type, Authorization, x-api-key, x-request-id");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
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
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    allowedHeaders: ["Authorization", "x-api-key", "Content-Type", "x-request-id"]
  })
);
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
app.use("/api/jobs", jobs_routes_v2_default);
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
    immutable: true,
    setHeaders: (res, _path, _stat) => {
      setStaticCorsHeaders(res.req, res);
    }
  })
);
app.use(
  config.pdf.tempPublicBaseUrl,
  express.static(config.pdf.tempDir, {
    fallthrough: false,
    index: false,
    dotfiles: "deny",
    maxAge: "1h",
    setHeaders: (res, _path, _stat) => {
      setStaticCorsHeaders(res.req, res);
    }
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
  const sessions2 = listSessions();
  res.status(200).json({
    success: true,
    data: {
      activeSessions: sessions2.length,
      nodeEnv: config.nodeEnv,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
});
app.use(notFoundHandler);
app.use(errorHandler);
async function startServer() {
  try {
    logger_default.info("\u{1F680} Starting WhatsApp Server...");
    logger_default.info("Initializing Quota Validator...");
    const { quotaValidatorService: quotaValidatorService2 } = await Promise.resolve().then(() => (init_quota_validator_service(), quota_validator_service_exports));
    try {
      await quotaValidatorService2.connect();
      logger_default.info("\u2705 Quota Validator connected (MongoDB-only)");
    } catch (error) {
      logger_default.warn("Quota Validator initialization failed, quota validation will be disabled:", error);
    }
    await generator_service_default.initialize();
    await fs14.ensureDir(config.pdf.tempDir);
    logger_default.info("Initializing Job Scheduler...");
    await scheduler_v2_instance_default.initialize();
    restoreAllSessions();
    cron2.schedule("0 0 * * 0", async () => {
      try {
        await fs14.emptyDir(config.pdf.tempDir);
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
          const sessions2 = listSessions();
          for (const sessionId of sessions2) {
            try {
              await disconnectSession(sessionId);
            } catch (err) {
              logger_default.error(`Error disconnecting ${sessionId}:`, err);
            }
          }
          logger_default.info("All WhatsApp sessions disconnected");
          await scheduler_v2_instance_default.shutdown();
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
