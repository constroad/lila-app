/**
 * StoragePathService - Multi-Tenant Path Management
 *
 * Servicio centralizado para gestionar rutas de almacenamiento multi-tenant.
 * Estructura: /mnt/constroad-storage/companies/{companyId}/{module}/{subpath}
 *
 * Fase 9: Multi-Tenant Portal Transformation
 *
 * @example
 * ```typescript
 * const service = new StoragePathService();
 *
 * // Obtener ruta de empresa
 * const companyRoot = service.getCompanyRoot('company-123');
 * // => /mnt/constroad-storage/companies/company-123
 *
 * // Obtener ruta de módulo
 * const modulePath = service.getModulePath('company-123', 'orders', 'dispatches');
 * // => /mnt/constroad-storage/companies/company-123/orders/dispatches
 *
 * // Validar acceso
 * const isValid = service.validateAccess(requestedPath, 'company-123');
 * ```
 */

import path from 'path';
import fs from 'fs-extra';
import { config } from '../config/environment.js';
import logger from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface StorageModule {
  name: string;
  description: string;
  autoCreate: boolean;
}

export interface CompanyStorageStructure {
  companyId: string;
  root: string;
  modules: {
    orders: string;
    dispatches: string;
    clients: string;
    certificates: string;
    reports: string;
    media: string;
    projects: string;
    expenses: string;
    services: string;
    temp: string;
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export class StoragePathService {
  private readonly root: string;

  /**
   * Módulos estándar que se crean automáticamente para cada empresa
   */
  private readonly standardModules: StorageModule[] = [
    { name: 'orders', description: 'Pedidos y obras', autoCreate: true },
    { name: 'dispatches', description: 'Despachos y vales', autoCreate: true },
    { name: 'clients', description: 'Documentos de clientes', autoCreate: true },
    { name: 'certificates', description: 'Certificados de calidad', autoCreate: true },
    { name: 'reports', description: 'Reportes y análisis', autoCreate: true },
    { name: 'media', description: 'Archivos multimedia', autoCreate: true },
    { name: 'projects', description: 'Documentos de proyectos', autoCreate: true },
    { name: 'expenses', description: 'Comprobantes de gastos', autoCreate: true },
    { name: 'services', description: 'Servicios y reportes', autoCreate: true },
    { name: 'temp', description: 'Archivos temporales', autoCreate: true },
  ];

  constructor() {
    this.root = config.storage.root;
    logger.info(`StoragePathService initialized with root: ${this.root}`);
  }

  // ==========================================================================
  // PATH BUILDERS
  // ==========================================================================

  /**
   * Obtiene la ruta raíz de una empresa
   * @param companyId ID de la empresa
   * @returns Ruta absoluta a la carpeta de la empresa
   */
  getCompanyRoot(companyId: string): string {
    if (!companyId || companyId.trim() === '') {
      throw new Error('companyId is required');
    }

    return path.join(this.root, 'companies', companyId);
  }

  /**
   * Obtiene la ruta de un módulo específico para una empresa
   * @param companyId ID de la empresa
   * @param module Nombre del módulo (orders, dispatches, clients, etc.)
   * @param subpath Subruta opcional dentro del módulo
   * @returns Ruta absoluta al módulo o subruta
   */
  getModulePath(companyId: string, module: string, subpath?: string): string {
    const root = this.getCompanyRoot(companyId);
    const modulePath = path.join(root, module);

    if (subpath) {
      return path.join(modulePath, subpath);
    }

    return modulePath;
  }

  /**
   * Obtiene la estructura completa de carpetas para una empresa
   * @param companyId ID de la empresa
   * @returns Objeto con todas las rutas de módulos
   */
  getCompanyStructure(companyId: string): CompanyStorageStructure {
    const root = this.getCompanyRoot(companyId);

    return {
      companyId,
      root,
      modules: {
        orders: path.join(root, 'orders'),
        dispatches: path.join(root, 'dispatches'),
        clients: path.join(root, 'clients'),
        certificates: path.join(root, 'certificates'),
        reports: path.join(root, 'reports'),
        media: path.join(root, 'media'),
        projects: path.join(root, 'projects'),
        expenses: path.join(root, 'expenses'),
        services: path.join(root, 'services'),
        temp: path.join(root, 'temp'),
      },
    };
  }

  /**
   * Resuelve una ruta relativa a una ruta absoluta dentro de una empresa
   * @param companyId ID de la empresa
   * @param relativePath Ruta relativa proporcionada por el usuario
   * @returns Ruta absoluta resuelta
   */
  resolvePath(companyId: string, relativePath: string): string {
    const companyRoot = this.getCompanyRoot(companyId);

    // Normalizar la ruta relativa (eliminar ../, ./, etc.)
    const normalized = path.normalize(relativePath);

    // Unir con la raíz de la empresa
    const resolved = path.join(companyRoot, normalized);

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
  validateAccess(requestedPath: string, companyId: string): boolean {
    try {
      const companyRoot = this.getCompanyRoot(companyId);

      // Normalizar ambas rutas
      const normalizedRequested = path.normalize(requestedPath);
      const normalizedRoot = path.normalize(companyRoot);

      // Verificar que la ruta solicitada comience con la raíz de la empresa
      const isWithinCompanyRoot = normalizedRequested.startsWith(normalizedRoot);

      if (!isWithinCompanyRoot) {
        logger.warn('Path validation failed: outside company root', {
          companyId,
          requestedPath: normalizedRequested,
          companyRoot: normalizedRoot,
        });
        return false;
      }

      // Verificar que no haya intentos de escapar con path traversal
      const relative = path.relative(normalizedRoot, normalizedRequested);
      const hasTraversal = relative.startsWith('..') || path.isAbsolute(relative);

      if (hasTraversal) {
        logger.warn('Path validation failed: traversal attempt detected', {
          companyId,
          requestedPath: normalizedRequested,
          relative,
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Path validation error:', error);
      return false;
    }
  }

  /**
   * Valida que un módulo sea válido
   * @param moduleName Nombre del módulo
   * @returns true si es un módulo estándar
   */
  isValidModule(moduleName: string): boolean {
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
  async ensureCompanyStructure(companyId: string): Promise<CompanyStorageStructure> {
    const structure = this.getCompanyStructure(companyId);

    logger.info(`Creating company storage structure for: ${companyId}`);

    try {
      // Crear carpeta raíz de la empresa
      await fs.ensureDir(structure.root);

      // Crear todas las carpetas de módulos
      const moduleCreations = this.standardModules
        .filter((m) => m.autoCreate)
        .map(async (module) => {
          const modulePath = path.join(structure.root, module.name);
          await fs.ensureDir(modulePath);
          logger.debug(`Created module folder: ${module.name}`, { companyId });
        });

      await Promise.all(moduleCreations);

      logger.info(`Company storage structure created successfully for: ${companyId}`);

      return structure;
    } catch (error) {
      logger.error(`Failed to create company storage structure for: ${companyId}`, error);
      throw error;
    }
  }

  /**
   * Verifica si la estructura de una empresa existe
   * @param companyId ID de la empresa
   * @returns true si existe la carpeta raíz
   */
  async companyStructureExists(companyId: string): Promise<boolean> {
    const root = this.getCompanyRoot(companyId);
    return fs.pathExists(root);
  }

  /**
   * Asegura que un directorio exista, creándolo si es necesario
   * Solo si está dentro del espacio de la empresa
   * @param dirPath Ruta del directorio
   * @param companyId ID de la empresa
   */
  async ensureDir(dirPath: string, companyId: string): Promise<void> {
    // Validar que la ruta esté dentro del espacio de la empresa
    if (!this.validateAccess(dirPath, companyId)) {
      throw new Error('Invalid path: outside company storage space');
    }

    await fs.ensureDir(dirPath);
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Obtiene información de uso de almacenamiento para una empresa
   * @param companyId ID de la empresa
   * @returns Tamaño total en bytes
   */
  async getStorageUsage(companyId: string): Promise<number> {
    const root = this.getCompanyRoot(companyId);

    if (!(await fs.pathExists(root))) {
      return 0;
    }

    try {
      const calculateSize = async (dir: string): Promise<number> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        let totalSize = 0;

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            totalSize += await calculateSize(fullPath);
          } else {
            const stats = await fs.stat(fullPath);
            totalSize += stats.size;
          }
        }

        return totalSize;
      };

      return await calculateSize(root);
    } catch (error) {
      logger.error(`Failed to calculate storage usage for: ${companyId}`, error);
      return 0;
    }
  }

  /**
   * Convierte bytes a formato legible
   * @param bytes Tamaño en bytes
   * @returns String formateado (ej: "1.5 GB")
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Limpia archivos temporales de una empresa
   * @param companyId ID de la empresa
   */
  async cleanTempFiles(companyId: string): Promise<void> {
    const tempPath = this.getModulePath(companyId, 'temp');

    if (await fs.pathExists(tempPath)) {
      await fs.emptyDir(tempPath);
      logger.info(`Cleaned temp files for company: ${companyId}`);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const storagePathService = new StoragePathService();
export default storagePathService;
