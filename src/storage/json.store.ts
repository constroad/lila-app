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
  // Serializa las operaciones por clave para evitar carreras entre escrituras
  // concurrentes (que antes corrompían y borraban el archivo).
  private chains = new Map<string, Promise<void>>();
  private tmpCounter = 0;

  constructor(options: StorageOptions) {
    this.baseDir = options.baseDir;
    this.autoBackup = options.autoBackup ?? true;
  }

  // Encadena las operaciones de una misma clave: la siguiente no empieza hasta
  // que termina la anterior (resuelva o falle).
  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.chains.set(
      key,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }

  async get<T>(key: string): Promise<T | null> {
    return this.withLock(key, () => this.getUnlocked<T>(key));
  }

  private async getUnlocked<T>(key: string): Promise<T | null> {
    const filePath = path.join(this.baseDir, `${key}.json`);
    const backupPath = `${filePath}.backup`;

    try {
      if (await fs.pathExists(filePath)) {
        return (await fs.readJSON(filePath)) as T;
      }
    } catch (error) {
      // Archivo presente pero corrupto: intentamos recuperarlo desde el backup.
      logger.warn(`Store ${key} corrupt, attempting recovery from backup`, {
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    // El principal falta o está corrupto: intentar backup y restaurarlo.
    try {
      if (await fs.pathExists(backupPath)) {
        const data = (await fs.readJSON(backupPath)) as T;
        await this.atomicWrite(filePath, data, /* skipBackup */ true);
        logger.info(`Store ${key} restored from backup`);
        return data;
      }
    } catch (error) {
      logger.error(`Error recovering ${key} from backup:`, error);
    }

    return null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    return this.withLock(key, async () => {
      const filePath = path.join(this.baseDir, `${key}.json`);
      try {
        await this.atomicWrite(filePath, value, false);
        logger.debug(`Successfully wrote ${key} to store`);
      } catch (error) {
        logger.error(`Error writing ${key} to store:`, error);
        throw error;
      }
    });
  }

  // Escritura atómica segura ante concurrencia:
  //  - temp ÚNICO por escritura (no compartido) → sin contenido entrelazado.
  //  - fs.rename reemplaza el destino de forma atómica (sin borrarlo antes),
  //    así el archivo final siempre existe y completo (a diferencia de
  //    fs.move con overwrite, que hace remove+rename y deja un hueco).
  //  - backup best-effort: un fallo de backup no aborta la escritura.
  private async atomicWrite<T>(
    filePath: string,
    value: T,
    skipBackup: boolean
  ): Promise<void> {
    await fs.ensureDir(path.dirname(filePath));

    const tempPath = `${filePath}.${process.pid}.${Date.now()}.${++this
      .tmpCounter}.tmp`;

    try {
      await fs.writeJSON(tempPath, value, { spaces: 2 });

      if (!skipBackup && this.autoBackup && (await fs.pathExists(filePath))) {
        try {
          await fs.copy(filePath, `${filePath}.backup`, { overwrite: true });
        } catch (backupError) {
          logger.warn('Store backup failed (continuing)', {
            filePath,
            reason:
              backupError instanceof Error
                ? backupError.message
                : String(backupError),
          });
        }
      }

      // rename atómico dentro del mismo directorio.
      await fs.rename(tempPath, filePath);
    } catch (error) {
      await fs.remove(tempPath).catch(() => undefined);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    return this.withLock(key, async () => {
      const filePath = path.join(this.baseDir, `${key}.json`);
      try {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
          logger.debug(`Successfully deleted ${key} from store`);
        }
      } catch (error) {
        logger.error(`Error deleting ${key} from store:`, error);
        throw error;
      }
    });
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
