import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger';
export class JsonStore {
    constructor(options) {
        this.baseDir = options.baseDir;
        this.autoBackup = options.autoBackup ?? true;
    }
    async get(key) {
        try {
            const filePath = path.join(this.baseDir, `${key}.json`);
            const exists = await fs.pathExists(filePath);
            if (!exists) {
                return null;
            }
            const data = await fs.readJSON(filePath);
            return data;
        }
        catch (error) {
            logger.error(`Error reading ${key} from store:`, error);
            return null;
        }
    }
    async set(key, value) {
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
        }
        catch (error) {
            logger.error(`Error writing ${key} to store:`, error);
            throw error;
        }
    }
    async delete(key) {
        try {
            const filePath = path.join(this.baseDir, `${key}.json`);
            if (await fs.pathExists(filePath)) {
                await fs.remove(filePath);
                logger.debug(`Successfully deleted ${key} from store`);
            }
        }
        catch (error) {
            logger.error(`Error deleting ${key} from store:`, error);
            throw error;
        }
    }
    async getAllKeys() {
        try {
            const files = await fs.readdir(this.baseDir);
            return files
                .filter((f) => f.endsWith('.json'))
                .map((f) => f.replace('.json', ''));
        }
        catch (error) {
            logger.error('Error reading keys from store:', error);
            return [];
        }
    }
    async clear() {
        try {
            await fs.emptyDir(this.baseDir);
            logger.debug('Store cleared');
        }
        catch (error) {
            logger.error('Error clearing store:', error);
            throw error;
        }
    }
    async exists(key) {
        const filePath = path.join(this.baseDir, `${key}.json`);
        return await fs.pathExists(filePath);
    }
}
export default JsonStore;
//# sourceMappingURL=json.store.js.map