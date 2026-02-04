import { validateCronJobCreate, validateCronJobUpdate } from '../validators';

describe('validators', () => {
  it('valida la creacion de un cronjob de mensaje', () => {
    const result = validateCronJobCreate({
      companyId: 'constroad',
      name: 'Notificacion diaria',
      type: 'message',
      isActive: true,
      schedule: {
        cronExpression: '0 9 * * *',
        timezone: 'America/Lima',
      },
      message: {
        chatId: '12345',
        body: 'Hola mundo',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.companyId).toBe('constroad');
  });

  it('rechaza creacion sin companyId', () => {
    const result = validateCronJobCreate({
      name: 'Sin empresa',
      type: 'api',
      schedule: {
        cronExpression: '*/15 * * * *',
        timezone: 'America/Lima',
      },
      apiConfig: {
        url: 'https://example.com',
        method: 'GET',
      },
    });

    expect(result.success).toBe(false);
    expect(result.errors?.some((error) => error.field === 'companyId')).toBe(true);
  });

  it('rechaza update vacio', () => {
    const result = validateCronJobUpdate({});
    expect(result.success).toBe(false);
  });
});
