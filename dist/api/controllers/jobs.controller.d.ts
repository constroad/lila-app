import { Request, Response, NextFunction } from 'express';
export declare function createJob(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function updateJob(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function deleteJob(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getJob(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getAllJobs(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function runJobNow(req: Request, res: Response, next: NextFunction): Promise<void>;
