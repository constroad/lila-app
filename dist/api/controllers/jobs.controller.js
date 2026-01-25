import jobScheduler from '../../jobs/scheduler.service';
import { HTTP_STATUS } from '../../config/constants';
import { validateCronJob } from '../../utils/validators';
export async function createJob(req, res, next) {
    try {
        const validation = validateCronJob(req.body);
        if (!validation.valid) {
            const error = new Error('Validation failed');
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            error.details = validation.errors;
            return next(error);
        }
        const job = await jobScheduler.createJob(req.body);
        res.status(HTTP_STATUS.CREATED).json({
            success: true,
            data: job,
        });
    }
    catch (error) {
        next(error);
    }
}
export async function updateJob(req, res, next) {
    try {
        const { id } = req.params;
        const job = await jobScheduler.updateJob(id, req.body);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: job,
        });
    }
    catch (error) {
        next(error);
    }
}
export async function deleteJob(req, res, next) {
    try {
        const { id } = req.params;
        await jobScheduler.deleteJob(id);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Job ${id} deleted`,
        });
    }
    catch (error) {
        next(error);
    }
}
export async function getJob(req, res, next) {
    try {
        const { id } = req.params;
        const job = await jobScheduler.getJob(id);
        if (!job) {
            const error = new Error('Job not found');
            error.statusCode = HTTP_STATUS.NOT_FOUND;
            return next(error);
        }
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: job,
        });
    }
    catch (error) {
        next(error);
    }
}
export async function getAllJobs(req, res, next) {
    try {
        const { company } = req.query;
        let jobs;
        if (company && (company === 'constroad' || company === 'altavia')) {
            jobs = await jobScheduler.getJobsByCompany(company);
        }
        else {
            jobs = await jobScheduler.getAllJobs();
        }
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                total: jobs.length,
                jobs,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
export async function runJobNow(req, res, next) {
    try {
        const { id } = req.params;
        await jobScheduler.runJobNow(id);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Job ${id} executed`,
        });
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=jobs.controller.js.map