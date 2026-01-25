export declare class ConnectionManager {
    private connections;
    private qrCodes;
    createConnection(sessionPhone: string): Promise<any>;
    private setupListeners;
    private loadOrCreateState;
    disconnect(sessionPhone: string): Promise<void>;
    disconnectAll(): Promise<void>;
    getConnection(sessionPhone: string): any;
    getAllConnections(): Map<string, any>;
    getQRCode(sessionPhone: string): string | undefined;
    isConnected(sessionPhone: string): boolean;
    getConnectionStatus(sessionPhone: string): string;
}
declare const _default: ConnectionManager;
export default _default;
