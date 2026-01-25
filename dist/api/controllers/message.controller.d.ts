import { Request, Response, NextFunction } from 'express';
export declare function sendMessage(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getConversation(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getAllConversations(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function closeConversation(req: Request, res: Response, next: NextFunction): Promise<void>;
