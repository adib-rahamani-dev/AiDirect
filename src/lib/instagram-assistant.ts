import { z } from 'zod';
import { normalize } from './matching';
import { businessHoursSchema } from './business-hours';

export const assistantConfigSchema = z
  .object({
    aiEnabled: z.boolean().default(false),
    privacyAcknowledged: z.boolean().default(false),
    brandName: z.string().trim().max(60).default(''),
    welcomeText: z.string().trim().max(200).default(''),
    businessHours: businessHoursSchema.default({
      enabled: false,
      days: [0, 1, 2, 3, 4, 5, 6],
      start: '09:00',
      end: '21:00',
    }),
    faqs: z
      .array(
        z
          .object({
            keyword: z.string().trim().min(2).max(60),
            answer: z.string().trim().min(1).max(450),
          })
          .strict(),
      )
      .max(5)
      .default([]),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.aiEnabled && !config.privacyAcknowledged)
      ctx.addIssue({
        code: 'custom',
        message: 'privacy_acknowledgment_required',
        path: ['privacyAcknowledged'],
      });
    const keys = config.faqs.map((f) => normalize(f.keyword));
    if (new Set(keys).size !== keys.length || keys.some((k) => k.length < 2))
      ctx.addIssue({ code: 'custom', message: 'distinct_faq_keywords_required', path: ['faqs'] });
  });
export type AssistantConfig = z.infer<typeof assistantConfigSchema>;
export function assistantConfig(value: unknown): AssistantConfig {
  const parsed = assistantConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : assistantConfigSchema.parse({});
}
export const directAiAvailable = () =>
  Boolean(process.env.GROQ_API_KEY) && process.env.META_DM_AI_DISABLED !== 'true';
