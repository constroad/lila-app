import { CronJobData } from '../../types';
export declare class JobScheduler {
    private store;
    private scheduledTasks;
    private jobsFile;
    constructor();
    initialize(): Promise<void>;
    createJob(jobData: Omit<CronJobData, 'id' | 'metadata'>): Promise<CronJobData>;
    updateJob(id: string, updates: Partial<CronJobData>): Promise<CronJobData>;
    deleteJob(id: string): Promise<void>;
    runJobNow(id: string): Promise<void>;
    getJob(id: string): Promise<CronJobData | null>;
    getAllJobs(): Promise<CronJobData[]>;
    getJobsByCompany(company: 'constroad' | 'altavia'): Promise<CronJobData[]>;
    private scheduleJob;
    private executeJob;
    private loadJobs;
    private saveJob;
    private saveAllJobs;
    shutdown(): Promise<void>;
}
declare const _default: JobScheduler;
export default _default;
