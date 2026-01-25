import { Request, Response, NextFunction } from 'express';
export interface CustomError extends Error {
    statusCode?: number;
    details?: any;
}
export declare function errorHandler(err: CustomError, req: Request, res: Response, next: NextFunction): void;
export declare function notFoundHandler(req: Request, res: Response, next: NextFunction): void;
export declare function requestLogger(req: Request, res: Response, next: NextFunction): void;
export declare function validateApiKey(req: Request, res: Response, next: NextFunction): void;
