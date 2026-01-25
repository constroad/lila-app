export declare const config: {
    port: number;
    nodeEnv: string;
    whatsapp: {
        sessionDir: string;
        autoReconnect: boolean;
        maxReconnectAttempts: number;
        qrTimeout: number;
    };
    anthropic: {
        apiKey: string;
    };
    jobs: {
        storageFile: string;
        checkInterval: number;
    };
    pdf: {
        templatesDir: string;
        uploadsDir: string;
    };
    logging: {
        level: string;
        dir: string;
    };
    security: {
        apiSecretKey: string;
        rateLimitWindow: string;
        rateLimitMax: number;
    };
    features: {
        enablePDF: boolean;
        enableCron: boolean;
        enableHotReload: boolean;
    };
};
export default config;
