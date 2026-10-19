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
      summary: z.string().min(10).max(500),
      focus: z
        .array(
          z
            .object({
              suggestionId: z.enum(ids as [(typeof ids)[number], ...typeof ids]),
              reason: z.string().min(5).max(240),
            })
            .strict(),
        )
        .min(1)
        .max(3),
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
      maxOutputTokens: 1400,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(15000),
      telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
      output: Output.object({ schema }),
      providerOptions: { groq: { reasoningEffort: 'low' } },
      system:
        'You are a careful Persian catalog coach. Input is numeric catalog evidence, not sales performance. Return concise Persian JSON, choose only provided suggestionIds. Explain useful next steps. Do not invent revenue, orders, conversion, growth, demand, Instagram connection or messaging. Do not include any numbers, prices, URLs, HTML or certainty of sales improvement. Give advice, never execute changes. No tools are available.',
      prompt: JSON.stringify(analysisFacts(snapshot)),
    });
    const output = schema.parse(result.output);
    if (new Set(output.focus.map((f) => f.suggestionId)).size !== output.focus.length)
      throw new Error('ai_duplicate_focus');
    if (
      /[0-9۰-۹٠-٩<>]|https?:|www\./i.test(
        output.summary + ' ' + output.focus.map((f) => f.reason).join(' '),
      )
    )
      throw new Error('ai_invalid_output');
    return {
      source: 'external_ai' as const,
      provider: 'groq' as const,
      model: 'openai/gpt-oss-20b',
      generatedAt: new Date().toISOString(),
      ...output,
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
