import Joi from 'joi';
import logger from './logger';
export function validatePhone(phone) {
    // Validar formato de teléfono peruano (+51, 9)
    const phoneRegex = /^(\+51|0)?9\d{8}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
}
export function validateCronExpression(cron) {
    // Validación básica de expresión cron (5 campos)
    const cronRegex = /^((\d+,)*\d+|\*)(\/\d+)?( ((\d+,)*\d+|\*)(\/\d+)?){4}$/;
    return cronRegex.test(cron);
}
export function validateUrl(url) {
    try {
        new URL(url);
        return true;
    }
    catch {
        return false;
    }
}
export function validateSessionPhone(phone) {
    // Validar formato de teléfono para sesión (sin +)
    const sessionPhoneRegex = /^51[0-9]{9}$/;
    return sessionPhoneRegex.test(phone.replace(/\D/g, ''));
}
export function validateCronJob(data) {
    const schema = Joi.object({
        name: Joi.string().required().min(3).max(100),
        url: Joi.string().required().uri(),
        cronExpression: Joi.string()
            .required()
            .custom((value, helpers) => {
            if (!validateCronExpression(value)) {
                return helpers.error('any.invalid');
            }
            return value;
        })
            .messages({ 'any.invalid': 'Expresión cron inválida' }),
        company: Joi.string().valid('constroad', 'altavia').required(),
        isActive: Joi.boolean().default(true),
        timeout: Joi.number().default(30000).min(5000).max(300000),
        retryPolicy: Joi.object({
            maxRetries: Joi.number().default(3).min(0).max(10),
            backoffMultiplier: Joi.number().default(2).min(1).max(5),
        }),
    });
    try {
        const { error, value } = schema.validate(data, { abortEarly: false });
        if (error) {
            const errors = error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message,
            }));
            return { valid: false, errors };
        }
        return { valid: true };
    }
    catch (err) {
        logger.error('Validation error:', err);
        return { valid: false };
    }
}
export function validateMessage(message) {
    return (message &&
        typeof message === 'object' &&
        (message.conversation || message.extendedTextMessage?.text));
}
//# sourceMappingURL=validators.js.map