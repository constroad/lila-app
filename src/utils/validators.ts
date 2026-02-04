import Joi from 'joi';

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

export function validateMessage(message: any): boolean {
  return (
    message &&
    typeof message === 'object' &&
    (message.conversation || message.extendedTextMessage?.text)
  );
}

export function validateCronJobCreate(data: any): {
  success: boolean;
  data?: any;
  errors?: ValidationError[];
} {
  const schema = Joi.object({
    companyId: Joi.string().required(),
    name: Joi.string().required().min(3).max(100),
    type: Joi.string().valid('api', 'message').required(),
    isActive: Joi.boolean().default(true),
    timeout: Joi.number().default(30000).min(5000).max(300000),
    schedule: Joi.object({
      cronExpression: Joi.string()
        .required()
        .custom((value, helpers) => {
          if (!validateCronExpression(value)) {
            return helpers.error('any.invalid');
          }
          return value;
        })
        .messages({ 'any.invalid': 'Expresión cron inválida' }),
      timezone: Joi.string().default('America/Lima'),
    }).required(),
    message: Joi.when('type', {
      is: 'message',
      then: Joi.object({
        sender: Joi.string().optional(),
        chatId: Joi.string().required(),
        body: Joi.string().required().min(1),
        mentions: Joi.array().items(Joi.string()).optional(),
      }).required(),
      otherwise: Joi.object({
        sender: Joi.string().optional(),
        chatId: Joi.string().required(),
        body: Joi.string().allow('').optional(),
        mentions: Joi.array().items(Joi.string()).optional(),
      }).optional(),
    }),
    apiConfig: Joi.object({
      url: Joi.string().required().uri(),
      method: Joi.string().valid('GET', 'POST', 'PUT').default('GET'),
      headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
      body: Joi.any(),
    }).when('type', {
      is: 'api',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    metadata: Joi.object({
      createdBy: Joi.string().optional(),
      updatedBy: Joi.string().optional(),
      tags: Joi.array().items(Joi.string()).optional(),
    }).optional(),
    retryPolicy: Joi.object({
      maxRetries: Joi.number().default(3).min(0).max(10),
      backoffMultiplier: Joi.number().default(2).min(1).max(5),
      currentRetries: Joi.number().min(0).max(10).optional(),
    }).optional(),
  });

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors: ValidationError[] = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    return { success: false, errors };
  }

  return { success: true, data: value };
}

export function validateCronJobUpdate(data: any): {
  success: boolean;
  data?: any;
  errors?: ValidationError[];
} {
  const schema = Joi.object({
    name: Joi.string().min(3).max(100),
    type: Joi.string().valid('api', 'message'),
    isActive: Joi.boolean(),
    timeout: Joi.number().min(5000).max(300000),
    schedule: Joi.object({
      cronExpression: Joi.string()
        .custom((value, helpers) => {
          if (!validateCronExpression(value)) {
            return helpers.error('any.invalid');
          }
          return value;
        })
        .messages({ 'any.invalid': 'Expresión cron inválida' }),
      timezone: Joi.string(),
    }).optional(),
    message: Joi.object({
      sender: Joi.string().optional(),
      chatId: Joi.string().required(),
      body: Joi.string().allow('').optional(),
      mentions: Joi.array().items(Joi.string()).optional(),
    }).optional(),
    apiConfig: Joi.object({
      url: Joi.string().required().uri(),
      method: Joi.string().valid('GET', 'POST', 'PUT'),
      headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
      body: Joi.any(),
    }).optional(),
    metadata: Joi.object({
      updatedBy: Joi.string().optional(),
      tags: Joi.array().items(Joi.string()).optional(),
    }).optional(),
    retryPolicy: Joi.object({
      maxRetries: Joi.number().min(0).max(10),
      backoffMultiplier: Joi.number().min(1).max(5),
      currentRetries: Joi.number().min(0).max(10).optional(),
    }).optional(),
  }).min(1);

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors: ValidationError[] = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));
    return { success: false, errors };
  }

  return { success: true, data: value };
}
