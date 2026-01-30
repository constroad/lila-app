/**
 * QuotaValidatorService - Multi-Tenant Quota Validation
 *
 * Servicio SINGLETON para validar quotas de empresas consultando Portal MongoDB.
 * Usa MongoDB como fuente única de verdad para limits y usage.
 *
 * ARQUITECTURA ROBUSTA PARA PRODUCCIÓN:
 * ========================================
 * ✅ Singleton global para evitar múltiples conexiones
 * ✅ Connection pooling optimizado
 * ✅ Circuit breaker para evitar connection storms
 * ✅ Lazy connection (solo conecta cuando se necesita)
 * ✅ Event listeners sin duplicados
 * ✅ Logging controlado
 *
 * Fase 10: Quotas y Validaciones (MongoDB-only)
 *
 * @example
 * ```typescript
 * import { quotaValidatorService } from './quota-validator.service';
 *
 * // Auto-conecta en primera llamada
 * const canSend = await quotaValidatorService.checkWhatsAppQuota('company-123');
 * if (!canSend) {
 *   throw new Error('WhatsApp quota exceeded');
 * }
 * ```
 */

import mongoose, { Connection, Model } from 'mongoose';
import { config } from '../config/environment.js';
import { CompanySchema, ICompany } from '../models/company.model.js';
import logger from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  period: string;
}

export interface QuotaInfo {
  whatsappMessages: QuotaCheckResult;
  storage: QuotaCheckResult;
}

interface CircuitBreakerState {
  isOpen: boolean;
  failures: number;
  lastFailure: number;
  nextRetry: number;
}

// ============================================================================
// GLOBAL CACHE (sobrevive hot reloads en desarrollo)
// ============================================================================

declare global {
  // eslint-disable-next-line no-var
  var __quotaValidatorService: QuotaValidatorService | undefined;
}

// ============================================================================
// SERVICE
// ============================================================================

export class QuotaValidatorService {
  private portalMongoConn: Connection | null = null;
  private CompanyModel: Model<ICompany> | null = null;
  private isConnected = false;
  private isConnecting = false;

  // Circuit breaker
  private circuitBreaker: CircuitBreakerState = {
    isOpen: false,
    failures: 0,
    lastFailure: 0,
    nextRetry: 0,
  };

  // Configuration
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60 * 1000; // 1 min
  private readonly CONNECTION_TIMEOUT = 10000; // 10 sec
  private readonly IS_PROD = process.env.NODE_ENV === 'production';

  // Singleton
  private static instance: QuotaValidatorService | undefined;

  private constructor() {
    // Private constructor para forzar uso de getInstance()
    // Graceful shutdown
    process.once('SIGINT', () => this.disconnect());
    process.once('SIGTERM', () => this.disconnect());
  }

  /**
   * Get singleton instance (global cache para hot reloads)
   */
  public static getInstance(): QuotaValidatorService {
    if (!global.__quotaValidatorService) {
      global.__quotaValidatorService = new QuotaValidatorService();
    }
    return global.__quotaValidatorService;
  }

  // ==========================================================================
  // CONNECTION
  // ==========================================================================

  /**
   * Conecta a MongoDB de Portal (lazy, solo si es necesario)
   */
  async connect(): Promise<void> {
    // Si ya está conectado, retornar inmediatamente
    if (this.isConnected && this.portalMongoConn && this.portalMongoConn.readyState === 1) {
      return;
    }

    // Si ya está conectando, esperar
    if (this.isConnecting) {
      return this.waitForConnection();
    }

    // Circuit breaker check
    if (this.isCircuitBreakerOpen()) {
      throw new Error('Circuit breaker is open. Too many connection failures.');
    }

    this.isConnecting = true;

    try {
      // Solo log en primera conexión
      if (!this.portalMongoConn || !this.IS_PROD) {
        logger.info('📡 Connecting to Portal MongoDB (shared_db)...');
      }

      const connection = mongoose.createConnection(config.mongodb.portalUri, {
        dbName: config.mongodb.sharedDb,
        serverSelectionTimeoutMS: this.CONNECTION_TIMEOUT,
        socketTimeoutMS: 45000,
        maxPoolSize: this.IS_PROD ? 5 : 3,
        minPoolSize: 1,
        family: 4, // Force IPv4
        retryWrites: true,
        heartbeatFrequencyMS: 10000,
      });

      // Setup event listeners (evitar duplicados)
      this.setupConnectionListeners(connection);

      this.portalMongoConn = await connection.asPromise();

      // Crear modelo de Company (verificar si ya existe para evitar OverwriteModelError)
      if (this.portalMongoConn.models.Company) {
        this.CompanyModel = this.portalMongoConn.models.Company as Model<ICompany>;
      } else {
        this.CompanyModel = this.portalMongoConn.model<ICompany>('Company', CompanySchema);
      }

      this.isConnected = true;
      this.isConnecting = false;
      this.resetCircuitBreaker();

      logger.info('✅ QuotaValidator connected to Portal MongoDB');
    } catch (error) {
      this.isConnecting = false;
      this.isConnected = false;
      this.recordCircuitBreakerFailure();

      logger.error('❌ Failed to connect to Portal MongoDB:', error);
      throw error;
    }
  }

  /**
   * Wait for connection in progress
   */
  private async waitForConnection(): Promise<void> {
    const maxWait = 30000; // 30 seconds
    const checkInterval = 100; // 100ms
    let waited = 0;

    while (waited < maxWait) {
      if (this.isConnected && this.portalMongoConn?.readyState === 1) {
        return;
      }
      if (!this.isConnecting) {
        // Connection failed
        throw new Error('Connection attempt failed');
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    throw new Error('Connection timeout');
  }

  /**
   * Setup connection event listeners (evita duplicados)
   */
  private setupConnectionListeners(conn: Connection): void {
    // Remover listeners anteriores si existen
    conn.removeAllListeners('error');
    conn.removeAllListeners('disconnected');
    conn.removeAllListeners('reconnected');

    // Error handler
    conn.on('error', (err) => {
      if (this.IS_PROD) {
        logger.error('❌ Portal MongoDB error:', err.message);
      }
      this.isConnected = false;
    });

    // Disconnected (silencioso)
    conn.on('disconnected', () => {
      this.isConnected = false;
      // Silencioso - no loggear desconexiones normales
    });

    // Reconnected (solo en producción)
    conn.on('reconnected', () => {
      this.isConnected = true;
      if (this.IS_PROD) {
        logger.info('🔄 Portal MongoDB reconnected');
      }
    });
  }

  /**
   * Circuit breaker: Check if open
   */
  private isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreaker.isOpen) return false;

    // Check si es tiempo de reintentar
    if (Date.now() > this.circuitBreaker.nextRetry) {
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failures = 0;
      logger.info('🔓 Circuit breaker closed - retrying connections');
      return false;
    }

    return true;
  }

  /**
   * Circuit breaker: Record failure
   */
  private recordCircuitBreakerFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.nextRetry = Date.now() + this.CIRCUIT_BREAKER_TIMEOUT;

      logger.error(
        `🔒 Circuit breaker OPEN - Too many failures (${this.circuitBreaker.failures}). ` +
        `Will retry in ${this.CIRCUIT_BREAKER_TIMEOUT / 1000}s`
      );
    }
  }

  /**
   * Circuit breaker: Reset
   */
  private resetCircuitBreaker(): void {
    if (this.circuitBreaker.failures > 0 || this.circuitBreaker.isOpen) {
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failures = 0;
      logger.info('✅ Circuit breaker reset');
    }
  }

  /**
   * Desconecta de MongoDB
   */
  async disconnect(): Promise<void> {
    if (this.portalMongoConn) {
      try {
        await this.portalMongoConn.close();
        this.portalMongoConn = null;
        this.CompanyModel = null;
        this.isConnected = false;
        logger.info('🔌 QuotaValidator disconnected from Portal MongoDB');
      } catch (error) {
        logger.error('❌ Error disconnecting QuotaValidator:', error);
      }
    }
  }

  /**
   * Verifica si está conectado y listo
   */
  isReady(): boolean {
    return this.isConnected && this.portalMongoConn !== null && this.portalMongoConn.readyState === 1;
  }

  // ==========================================================================
  // COMPANY HELPERS
  // ==========================================================================

  /**
   * Obtiene los datos de una empresa desde Portal MongoDB
   * (auto-conecta si es necesario)
   */
  private async getCompany(companyId: string): Promise<ICompany> {
    // Auto-connect si no está conectado
    if (!this.isReady()) {
      await this.connect();
    }

    if (!this.CompanyModel) {
      throw new Error('QuotaValidator not initialized');
    }

    const company = await this.CompanyModel.findOne({ companyId, isActive: true });

    if (!company) {
      logger.warn(`Company not found or inactive: ${companyId}`);
      throw new Error(`Company not found: ${companyId}`);
    }

    return company;
  }

  /**
   * Obtiene el periodo actual (YYYY-MM)
   */
  private getCurrentPeriod(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
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
  async checkWhatsAppQuota(companyId: string): Promise<boolean> {
    try {
      const company = await this.getCompany(companyId);
      const limit = company.limits.whatsappMessages;
      const used = company.subscription?.usage?.whatsappMessages || 0;

      // -1 significa ilimitado
      if (limit === -1) {
        return true;
      }

      const allowed = used < limit;

      if (!allowed) {
        logger.warn(`WhatsApp quota exceeded for ${companyId}: ${used}/${limit}`);
      }

      return allowed;
    } catch (error) {
      logger.error(`Error checking WhatsApp quota for ${companyId}:`, error);
      // En caso de error, permitir la operación para no bloquear el servicio
      return true;
    }
  }

  /**
   * Obtiene información detallada de la quota de WhatsApp
   */
  async getWhatsAppQuotaInfo(companyId: string): Promise<QuotaCheckResult> {
    const company = await this.getCompany(companyId);
    const limit = company.limits.whatsappMessages;
    const current = company.subscription?.usage?.whatsappMessages || 0;

    // -1 significa ilimitado
    if (limit === -1) {
      return {
        allowed: true,
        current,
        limit,
        remaining: -1, // Ilimitado
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
  async incrementWhatsAppUsage(companyId: string, count: number = 1): Promise<number> {
    if (!this.isReady()) {
      await this.connect();
    }

    if (!this.CompanyModel) {
      throw new Error('QuotaValidator not initialized');
    }

    const result = await this.CompanyModel.findOneAndUpdate(
      { companyId, isActive: true },
      { $inc: { 'subscription.usage.whatsappMessages': count } },
      { new: true }
    );

    if (!result) {
      throw new Error(`Company not found: ${companyId}`);
    }

    const newValue = result.subscription?.usage?.whatsappMessages || 0;
    logger.debug(`WhatsApp usage for ${companyId}: ${newValue}`);

    return newValue;
  }

  // ==========================================================================
  // STORAGE QUOTA
  // ==========================================================================

  /**
   * Verifica si una empresa puede almacenar un archivo
   */
  async checkStorageQuota(companyId: string, fileSize: number): Promise<boolean> {
    try {
      const company = await this.getCompany(companyId);
      const limitGb = company.limits.storage;

      // -1 significa ilimitado
      if (limitGb === -1) {
        return true;
      }

      const limitBytes = limitGb * 1024 * 1024 * 1024;

      const usedGb = company.subscription?.usage?.storage || 0;
      const usedBytes = usedGb * 1024 * 1024 * 1024;

      const allowed = usedBytes + fileSize <= limitBytes;

      if (!allowed) {
        logger.warn(
          `Storage quota exceeded for ${companyId}: ${this.formatBytes(usedBytes + fileSize)}/${limitGb} GB`
        );
      }

      return allowed;
    } catch (error) {
      logger.error(`Error checking storage quota for ${companyId}:`, error);
      return true;
    }
  }

  /**
   * Obtiene información detallada de la quota de almacenamiento
   */
  async getStorageQuotaInfo(companyId: string): Promise<QuotaCheckResult> {
    const company = await this.getCompany(companyId);
    const limitGb = company.limits.storage;

    const usedGb = company.subscription?.usage?.storage || 0;
    const current = usedGb * 1024 * 1024 * 1024;

    // -1 significa ilimitado
    if (limitGb === -1) {
      return {
        allowed: true,
        current,
        limit: -1,
        remaining: -1, // Ilimitado
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
  async incrementStorageUsage(companyId: string, fileSize: number): Promise<number> {
    if (!this.isReady()) {
      await this.connect();
    }

    if (!this.CompanyModel) {
      throw new Error('QuotaValidator not initialized');
    }

    const fileSizeGb = fileSize / (1024 * 1024 * 1024);

    const result = await this.CompanyModel.findOneAndUpdate(
      { companyId, isActive: true },
      { $inc: { 'subscription.usage.storage': fileSizeGb } },
      { new: true }
    );

    if (!result) {
      throw new Error(`Company not found: ${companyId}`);
    }

    const newValueGb = result.subscription?.usage?.storage || 0;
    const newValueBytes = newValueGb * 1024 * 1024 * 1024;

    logger.debug(`Storage usage for ${companyId}: ${newValueGb.toFixed(4)} GB`);

    return newValueBytes;
  }

  /**
   * Decrementa el contador de almacenamiento en MongoDB
   */
  async decrementStorageUsage(companyId: string, fileSize: number): Promise<number> {
    if (!this.isReady()) {
      await this.connect();
    }

    if (!this.CompanyModel) {
      throw new Error('QuotaValidator not initialized');
    }

    const fileSizeGb = fileSize / (1024 * 1024 * 1024);

    const result = await this.CompanyModel.findOneAndUpdate(
      { companyId, isActive: true },
      { $inc: { 'subscription.usage.storage': -fileSizeGb } },
      { new: true }
    );

    if (!result) {
      throw new Error(`Company not found: ${companyId}`);
    }

    const newValueGb = result.subscription?.usage?.storage || 0;
    const newValueBytes = newValueGb * 1024 * 1024 * 1024;

    logger.debug(`Storage usage for ${companyId}: ${newValueGb.toFixed(4)} GB`);

    return newValueBytes;
  }

  // ==========================================================================
  // GENERAL QUOTA INFO
  // ==========================================================================

  /**
   * Obtiene información completa de todas las quotas
   */
  async getQuotaInfo(companyId: string): Promise<QuotaInfo> {
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
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const quotaValidatorService = QuotaValidatorService.getInstance();
export default quotaValidatorService;
