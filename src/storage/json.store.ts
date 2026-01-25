import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';

export interface StorageOptions {
  baseDir: string;
  autoBackup?: boolean;
}

export class JsonStore {
  private baseDir: string;
  private autoBackup: boolean;

  constructor(options: StorageOptions) {
    this.baseDir = options.baseDir;
    this.autoBackup = options.autoBackup ?? true;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const filePath = path.join(this.baseDir, `${key}.json`);
      const exists = await fs.pathExists(filePath);

      if (!exists) {
        return null;
      }

      const data = await fs.readJSON(filePath);
      return data as T;
    } catch (error) {
      logger.error(`Error reading ${key} from store:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const filePath = path.join(this.baseDir, `${key}.json`);
      await fs.ensureDir(path.dirname(filePath));

      // Crear backup si existe archivo previo
      if (this.autoBackup && (await fs.pathExists(filePath))) {
        const backupPath = `${filePath}.backup`;
        await fs.copy(filePath, backupPath);
      }

      // Escribir nuevo archivo de forma atómica
      const tempPath = `${filePath}.tmp`;
      await fs.writeJSON(tempPath, value, { spaces: 2 });
      await fs.move(tempPath, filePath, { overwrite: true });

      logger.debug(`Successfully wrote ${key} to store`);
    } catch (error) {
      logger.error(`Error writing ${key} to store:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = path.join(this.baseDir, `${key}.json`);
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        logger.debug(`Successfully deleted ${key} from store`);
      }
    } catch (error) {
      logger.error(`Error deleting ${key} from store:`, error);
      throw error;
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.baseDir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));
    } catch (error) {
      logger.error('Error reading keys from store:', error);
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      await fs.emptyDir(this.baseDir);
      logger.debug('Store cleared');
    } catch (error) {
      logger.error('Error clearing store:', error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = path.join(this.baseDir, `${key}.json`);
    return await fs.pathExists(filePath);
  }
}

export default JsonStore;
