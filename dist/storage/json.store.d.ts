export interface StorageOptions {
    baseDir: string;
    autoBackup?: boolean;
}
export declare class JsonStore {
    private baseDir;
    private autoBackup;
    constructor(options: StorageOptions);
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    getAllKeys(): Promise<string[]>;
    clear(): Promise<void>;
    exists(key: string): Promise<boolean>;
}
export default JsonStore;
