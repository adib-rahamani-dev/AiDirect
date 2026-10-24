import { z } from 'zod';
export const businessHoursSchema = z
  .object({
    enabled: z.boolean().default(false),
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0, 1, 2, 3, 4, 5, 6]),
    start: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default('09:00'),
    end: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .default('21:00'),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.days).size !== v.days.length)
      ctx.addIssue({ code: 'custom', message: 'duplicate_days' });
    if (v.enabled && v.start === v.end)
      ctx.addIssue({ code: 'custom', message: 'distinct_hours_required' });
  });
export type BusinessHours = z.infer<typeof businessHoursSchema>;
const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function withinBusinessHours(hours: BusinessHours, now = new Date()) {
  if (!hours.enabled) return true;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = weekdays[part('weekday')],
    minutes = Number(part('hour')) * 60 + Number(part('minute'));
  const convert = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const start = convert(hours.start),
    end = convert(hours.end);
  if (start < end) return hours.days.includes(day) && minutes >= start && minutes < end;
  return (
    (hours.days.includes(day) && minutes >= start) ||
    (hours.days.includes((day + 6) % 7) && minutes < end)
  );
}
