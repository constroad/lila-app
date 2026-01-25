export interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}
export interface CollectedData {
    tipoAsfalto?: string;
    espesor?: number;
    ubicacion?: string;
    modalidad?: 'planta' | 'obra';
    cantidad?: number;
    area?: number;
    estadoBase?: string;
    imprimacion?: string;
    fresado?: boolean;
    tipoTerreno?: string;
    puntoCarga?: string;
    puntoDescarga?: string;
    nombreContacto?: string;
    telefono?: string;
    urgente?: boolean;
    fechaEstimada?: string;
    observaciones?: string;
    [key: string]: any;
}
export type ConversationState = 'active' | 'waiting_human' | 'closed';
export type ServiceType = 'venta' | 'colocacion' | 'transporte' | 'fabricacion' | null;
export interface Conversation {
    chatId: string;
    phoneNumber: string;
    sessionPhone: string;
    state: ConversationState;
    service: ServiceType;
    collectedData: CollectedData;
    messageHistory: Message[];
    createdAt: string;
    lastMessageAt: string;
    assignedTo?: string;
}
export interface AgentResponse {
    text: string;
    nextState?: ConversationState;
    shouldHandoff?: boolean;
}
export interface WhatsAppMessage {
    key: {
        fromMe: boolean;
        remoteJid: string;
        id: string;
    };
    message?: {
        conversation?: string;
        extendedTextMessage?: {
            text: string;
        };
    };
    messageTimestamp?: number;
}
export interface SessionConfig {
    phoneNumber: string;
    sessionId: string;
    autoReconnect: boolean;
    maxReconnectAttempts: number;
    qrTimeout: number;
}
export interface CronJobData {
    id: string;
    name: string;
    url: string;
    cronExpression: string;
    company: 'constroad' | 'altavia';
    isActive: boolean;
    metadata: {
        createdAt: string;
        updatedAt: string;
        lastRun?: string;
        nextRun?: string;
        failureCount: number;
        lastError?: string;
    };
    retryPolicy: {
        maxRetries: number;
        backoffMultiplier: number;
    };
    timeout: number;
}
export interface PDFTemplate {
    id: string;
    name: string;
    content: string;
    metadata: {
        company: string;
        createdAt: string;
    };
}
export interface PDFGenerationRequest {
    templateId: string;
    data: Record<string, any>;
    filename?: string;
}
