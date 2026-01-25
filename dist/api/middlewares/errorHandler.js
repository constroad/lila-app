import logger from '../../utils/logger';
import { HTTP_STATUS } from '../../config/constants';
export function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_ERROR;
    const message = err.message || 'Internal Server Error';
    logger.error('Error:', {
        statusCode,
        message,
        path: req.path,
        method: req.method,
        details: err.details,
    });
    res.status(statusCode).json({
        success: false,
        error: {
            message,
            statusCode,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        },
    });
}
export function notFoundHandler(req, res, next) {
    const error = new Error(`Route not found: ${req.path}`);
    error.statusCode = HTTP_STATUS.NOT_FOUND;
    next(error);
}
export function requestLogger(req, res, next) {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    next();
}
export function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.API_SECRET_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
        const error = new Error('Unauthorized: Invalid API Key');
        error.statusCode = HTTP_STATUS.UNAUTHORIZED;
        return next(error);
    }
    next();
}
//# sourceMappingURL=errorHandler.js.map