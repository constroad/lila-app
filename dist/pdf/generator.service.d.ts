import { PDFGenerationRequest } from '../../types';
export declare class PDFGenerator {
    private browser;
    private templatesDir;
    private uploadsDir;
    constructor();
    initialize(): Promise<void>;
    generatePDF(request: PDFGenerationRequest): Promise<string>;
    createTemplate(id: string, name: string, htmlContent: string): Promise<void>;
    loadTemplate(templateId: string): Promise<string>;
    listTemplates(): Promise<string[]>;
    deleteTemplate(templateId: string): Promise<void>;
    shutdown(): Promise<void>;
}
declare const _default: PDFGenerator;
export default _default;
