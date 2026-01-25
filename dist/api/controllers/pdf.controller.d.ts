import { Request, Response, NextFunction } from 'express';
export declare function generatePDF(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function createTemplate(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function listTemplates(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function deleteTemplate(req: Request, res: Response, next: NextFunction): Promise<void>;
