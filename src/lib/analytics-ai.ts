import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { z } from 'zod';
import type { AnalyticsSnapshot } from './analytics';
export function analysisAvailability() {
  return {
    provider: 'groq' as const,
    configured: Boolean(process.env.GROQ_API_KEY),
    enabled: process.env.GROQ_CUSTOMER_ANALYSIS_ENABLED === 'true',
    mode:
      process.env.GROQ_API_KEY && process.env.GROQ_CUSTOMER_ANALYSIS_ENABLED === 'true'
        ? 'available'
        : 'disabled',
    verified: false,
  };
}
// Explicit projection: never send names, category labels, handles, emails, messages or IDs.
export function analysisFacts(snapshot: AnalyticsSnapshot) {
  return {
    products: snapshot.metrics.products,
    active: snapshot.metrics.active,
    available: snapshot.metrics.available,
    outOfStock: snapshot.metrics.outOfStock,
    lowStock: snapshot.metrics.lowStock,
    missingDescription: snapshot.metrics.missingDescription,
    mapped: snapshot.metrics.mapped,
    paused: snapshot.workspace.paused,
    categoryCountShown: snapshot.categories.length,
    canMeasureSales: false,
    suggestionIds: snapshot.suggestions.map((s) => s.id),
  };
}
export async function generateCatalogAnalysis(
  snapshot: AnalyticsSnapshot,
  fetcher: typeof fetch = fetch,
) {
  const availability = analysisAvailability();
  if (availability.mode !== 'available') throw new Error('ai_not_configured');
  const ids = snapshot.suggestions.map((s) => s.id);
  if (!ids.length) throw new Error('ai_no_evidence');
  const schema = z
    .object({
      priorities: z
        .array(z.enum(ids as [(typeof ids)[number], ...typeof ids]))
        .min(1)
        .max(2),
    })
    .strict();
  const provider = createGroq({
    apiKey: process.env.GROQ_API_KEY,
    fetch: async (input, init) => {
      if (String(input) !== 'https://api.groq.com/openai/v1/chat/completions')
        throw new Error('ai_destination');
      const response = await fetcher(input, { ...init, redirect: 'error' });
      const reader = response.body?.getReader();
      if (!reader) return response;
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 64000) {
          await reader.cancel();
          throw new Error('ai_response_limit');
        }
        chunks.push(part.value);
      }
      return new Response(Buffer.concat(chunks), {
        status: response.status,
        headers: response.headers,
      });
    },
  });
  try {
    const result = await generateText({
      model: provider('openai/gpt-oss-20b'),
      maxOutputTokens: 1000,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(15000),
      telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
      output: Output.object({ schema }),
      providerOptions: { groq: { reasoningEffort: 'low' } },
      system:
        'Rank up to two distinct existing suggestionIds by usefulness for the supplied numeric catalog evidence. Return JSON with priorities only. No free text, new actions, statistics or explanations. We do not have sales, search, demand or Instagram conversation data. Meanings: add_products=create real catalog products when empty; stock=fix active products with zero stock; description=complete missing/short product descriptions; post_mapping=manually associate an Instagram post/reel URL with a catalog product, never publishing anything; paused=review before resuming internal recommendations; test_catalog=test local budget-based recommendations, never sending a DM. Prioritize a paused workspace and stock problems over optional testing. You cannot execute actions.',
      prompt: JSON.stringify(analysisFacts(snapshot)),
    });
    const output = schema.parse(result.output);
    const focus = [...new Set(output.priorities)].map((suggestionId) => ({
      suggestionId,
      reason: snapshot.suggestions.find((s) => s.id === suggestionId)!.detail,
    }));
    return {
      source: 'external_ai' as const,
      mode: 'ai_prioritized_rules' as const,
      provider: 'groq' as const,
      model: 'openai/gpt-oss-20b',
      generatedAt: new Date().toISOString(),
      summary:
        'مدل از میان اقدام‌های معتبر کاتالوگ، این موارد را برای بررسی زودتر انتخاب کرده است. توضیحات از قواعد برنامه هستند؛ این اولویت‌بندی تضمین نتیجه نیست.',
      focus,
    };
  } catch (error) {
    // No SDK error payload or prompt reaches the response/logs.
    if (typeof error === 'object' && error && 'statusCode' in error && error.statusCode === 429)
      throw new Error('ai_rate_limited');
    const status =
      typeof error === 'object' &&
      error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
    const failureKind = NoObjectGeneratedError.isInstance(error)
      ? error.finishReason === 'length'
        ? 'incomplete_output'
        : 'invalid_structure'
      : error instanceof Error &&
          ['ai_invalid_output', 'ai_duplicate_focus', 'ai_response_limit'].includes(error.message)
        ? error.message
        : error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
          ? 'timeout'
          : status
            ? 'provider_rejection'
            : 'unknown';
    throw Object.assign(new Error('ai_unavailable'), { providerStatus: status, failureKind });
  }
}
