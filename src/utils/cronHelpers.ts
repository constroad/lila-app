import cronParser from 'cron-parser';

export function calculateNextRun(
  cronExpression: string,
  timezone: string = 'America/Lima'
): Date {
  const interval = cronParser.parseExpression(cronExpression, {
    currentDate: new Date(),
    tz: timezone,
  });

  return interval.next().toDate();
}
