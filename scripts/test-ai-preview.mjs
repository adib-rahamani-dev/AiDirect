import { groqIntentPreview } from '../src/lib/groq-preview.ts';
import { parseBudget } from '../src/lib/recommendations.ts';
// No arbitrary customer text, IDs or inventory are accepted by this test command.
if (!process.argv.includes('--synthetic'))
  throw new Error('Use --synthetic for the fixed, artificial test request');
try {
  const message = 'تا ۳۰ میلیون تومان لپ‌تاپ می‌خواهم';
  const intent = await groqIntentPreview(message, ['لپ‌تاپ', 'هدفون', 'گوشی']);
  console.log(
    JSON.stringify({
      mode: 'synthetic_external_api_test',
      intent,
      budget: parseBudget(message),
      sendsInstagramMessage: false,
    }),
  );
} catch {
  console.error(
    'AI test did not succeed. Check private server configuration, account eligibility and provider limits. No Instagram message was sent.',
  );
  process.exitCode = 1;
}
