import Joi from 'joi';
import logger from './logger.js';

export interface ValidationError {
  field: string;
  message: string;
}

export function validatePhone(phone: string): boolean {
  // Validar formato de teléfono peruano (+51, 9)
  const phoneRegex = /^(\+51|0)?9\d{8}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

export function validateCronExpression(cron: string): boolean {
  // Validación básica de expresión cron (5 campos)
  const cronRegex = /^((\d+,)*\d+|\*)(\/\d+)?( ((\d+,)*\d+|\*)(\/\d+)?){4}$/;
  return cronRegex.test(cron);
}

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validateSessionPhone(phone: string): boolean {
  // Validar formato de teléfono para sesión (sin +)
  const sessionPhoneRegex = /^51[0-9]{9}$/;
  return sessionPhoneRegex.test(phone.replace(/\D/g, ''));
}

export function validateCronJob(data: any): { valid: boolean; errors?: ValidationError[] } {
  const schema = Joi.object({
    name: Joi.string().required().min(3).max(100),
    type: Joi.string().valid('api', 'message').default('api'),
    url: Joi.string()
      .when('type', {
        is: 'api',
        then: Joi.string().required().uri(),
        otherwise: Joi.string().allow('').optional(),
      }),
    message: Joi.object({
      sender: Joi.string().required(),
      chatId: Joi.string().required(),
      body: Joi.string().required().min(1),
    }).when('type', {
      is: 'message',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
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
      const errors: ValidationError[] = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      return { valid: false, errors };
    }

    return { valid: true };
  } catch (err) {
    logger.error('Validation error:', err);
    return { valid: false };
  }
}

export function validateCronJobUpdate(
  data: any
): { valid: boolean; errors?: ValidationError[] } {
  const schema = Joi.object({
    name: Joi.string().min(3).max(100),
    type: Joi.string().valid('api', 'message'),
    url: Joi.string().allow('').uri(),
    message: Joi.object({
      sender: Joi.string().required(),
      chatId: Joi.string().required(),
      body: Joi.string().required().min(1),
    }),
    cronExpression: Joi.string()
      .custom((value, helpers) => {
        if (!validateCronExpression(value)) {
          return helpers.error('any.invalid');
        }
        return value;
      })
      .messages({ 'any.invalid': 'Expresión cron inválida' }),
    company: Joi.string().valid('constroad', 'altavia'),
    isActive: Joi.boolean(),
    timeout: Joi.number().min(5000).max(300000),
    retryPolicy: Joi.object({
      maxRetries: Joi.number().min(0).max(10),
      backoffMultiplier: Joi.number().min(1).max(5),
    }),
  }).min(1);

  try {
    const { error } = schema.validate(data, { abortEarly: false });

    if (error) {
      const errors: ValidationError[] = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      return { valid: false, errors };
    }

    return { valid: true };
  } catch (err) {
    logger.error('Validation error:', err);
    return { valid: false };
  }
}

export function validateMessage(message: any): boolean {
  return (
    message &&
    typeof message === 'object' &&
    (message.conversation || message.extendedTextMessage?.text)
  );
}
