import { Request, Response, NextFunction } from 'express';
export declare function createSession(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getSessionStatus(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function disconnectSession(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getAllSessions(req: Request, res: Response, next: NextFunction): Promise<void>;
