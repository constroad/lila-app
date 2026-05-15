import cronParser from "cron-parser";

export function calculateNextRun(
  cronExpression: string,
  timezone: string = "America/Lima",
): Date {
  const interval = cronParser.parseExpression(cronExpression, {
    currentDate: new Date(),
    tz: timezone,
  });

  return interval.next().toDate();
}

export function normalizeCronExpressions(
  primaryExpression?: string,
  extraExpressions: string[] = [],
): string[] {
  return Array.from(
    new Set(
      [primaryExpression, ...extraExpressions]
        .map((value) => value?.trim())
        .filter(Boolean),
    ),
  ) as string[];
}

export function calculateEarliestNextRun(
  cronExpressions: string[],
  timezone: string = "America/Lima",
): Date | undefined {
  const nextRuns = cronExpressions.map((expression) =>
    calculateNextRun(expression, timezone),
  );
  return nextRuns.sort((left, right) => left.getTime() - right.getTime())[0];
}
