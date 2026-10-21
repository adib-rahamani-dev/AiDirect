import { z } from 'zod';
import { db } from './db';
import { normalize } from './matching';
import { latinDigits, parseBudget } from './recommendations';

export const dialogueState = z
  .object({
    budget: z.number().int().positive().max(1e12).optional(),
    category: z.string().max(80).optional(),
    products: z.array(z.string().max(100)).max(3).default([]),
    pendingAiText: z.string().max(600).optional(),
  })
  .strict();
export type DialogueState = z.infer<typeof dialogueState>;
export type Intent =
  | 'greeting'
  | 'recommendation'
  | 'price'
  | 'availability'
  | 'shipping'
  | 'human'
  | 'thanks'
  | 'unknown';
export type DialogueSettings = {
  tone: string;
  shippingPolicy: string;
  shorthandMillions: boolean;
  aiEnabled: boolean;
};
type Product = {
  id: string;
  name: string;
  category: string;
  description: string;
  priceToman: bigint;
  stock: number;
  active: boolean;
  url: string;
};
export type ExtractedNeed = {
  intent: 'recommendation' | 'price' | 'availability' | 'shipping' | 'human' | 'unknown';
  categoryIndex: number | null;
  confidence: 'high' | 'low';
};
export type DialoguePlan = {
  reply: string;
  intent: Intent;
  resultKind: string;
  interpretation: 'rules' | 'context' | 'ai';
  aiAttempted: boolean;
  aiSucceeded: boolean;
  state: DialogueState;
  handedOff: boolean;
  selectedProductIds: string[];
  budgetBucket: string | null;
};
export function dmBudget(text: string, millions: boolean) {
  const value = latinDigits(normalize(text));
  const matches = [...value.matchAll(/\d+(?:[.٫]\d+)?/g)];
  if (
    millions &&
    matches.length === 1 &&
    !/ریال|دلار|یورو|تتر|usd|eur|هزار|میلیون|از\s*\d|بین\s*\d|[-−]\s*\d|تومان\s*تا/.test(value)
  ) {
    const match = value.match(/(\d+(?:[.٫]\d+)?)\s*(?:تومن|تومان)/);
    const amount = match ? Number(match[1].replace('٫', '.')) : 0;
    if (amount > 0 && amount < 1000) return parseBudget(`${amount} میلیون تومان`);
  }
  return parseBudget(text);
}
export function redactDm(text: string) {
  return latinDigits(text)
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[لینک]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[ایمیل]')
    .replace(/@[\w.]+/g, '[شناسه]')
    .replace(/(?:\+?\d[\s()-]*){10,}/g, '[شماره]')
    .replace(
      /(?:نام من|اسم من|آدرس من|نشانی من|کد ملی|شماره سفارش)\s*[:：]?[^،؛\n.!؟]*/g,
      '[اطلاعات شخصی]',
    )
    .slice(0, 600);
}
export function localIntent(text: string): Intent {
  const value = normalize(latinDigits(text));
  if (/اپراتور|پشتیبان|فروشنده|ادمین|انسان|توقف|ربات نباش|پاسخ نده|جواب نده/.test(value))
    return 'human';
  if (
    /هزینه.?ارسال|زمان.?ارسال|روش.?ارسال|کی.?میرسه|چند روز|پیک|پستی|ارسال دارید|ارسال دارین/.test(
      value,
    )
  )
    return 'shipping';
  if (/موجود|موجودی|تموم|تمام شده/.test(value)) return 'availability';
  if (/قیمت|قیمتش|چنده|چند هست|چند است/.test(value)) return 'price';
  if (/بودجه|پیشنهاد|محصول|می.?خوا[میه]|میخوام|میخام|خرید|دنبال|تومان|تومن|میلیون|هزار/.test(value))
    return 'recommendation';
  if (/^(سلام|درود|سلام خوبی|سلام وقت بخیر|وقت بخیر|سلام عزیزم)[!؟ .🙂]*$/.test(value))
    return 'greeting';
  if (/^(ممنون|مرسی|سپاس|دمت گرم|خیلی ممنون)[!؟ .🙂]*$/.test(value)) return 'thanks';
  return 'unknown';
}
export function budgetBand(budget?: number) {
  return budget === undefined
    ? null
    : budget <= 1e6
      ? 'up_to_1m'
      : budget <= 1e7
        ? '1m_to_10m'
        : budget <= 3e7
          ? '10m_to_30m'
          : budget <= 1e8
            ? '30m_to_100m'
            : 'over_100m';
}
function selectedReference(text: string, products: Product[], state: DialogueState) {
  const v = normalize(latinDigits(text));
  const named = products.filter(
    (p) => normalize(p.name).length > 1 && v.includes(normalize(p.name)),
  );
  if (named.length === 1) return named[0];
  const index = /اولی|اولین|گزینه\s*1|شماره\s*1/.test(v)
    ? 0
    : /دومی|دومین|گزینه\s*2|شماره\s*2/.test(v)
      ? 1
      : /سومی|سومین|گزینه\s*3|شماره\s*3/.test(v)
        ? 2
        : -1;
  if (index >= 0) return products.find((p) => p.id === state.products[index]);
  if (/همون|همان|این|اون|قیمتش|موجوده/.test(v) && state.products.length === 1)
    return products.find((p) => p.id === state.products[0]);
  return undefined;
}
function mentionsCategory(text: string, category: string) {
  const value = normalize(text),
    label = normalize(category);
  if (value.includes(label)) return true;
  const aliases = [
    ['موبایل', 'گوشی', 'تلفن همراه'],
    ['لپ تاپ', 'لپتاپ', 'نوت بوک'],
    ['کفش', 'کتونی', 'کتانی'],
  ];
  return aliases.some(
    (group) =>
      group.some((word) => label.includes(word)) && group.some((word) => value.includes(word)),
  );
}

export async function planDmReply(input: {
  workspaceId: string;
  pageId: string;
  text: string;
  settings: DialogueSettings;
  state?: DialogueState;
  firstTurn?: boolean;
  seed?: number;
  extractor?: (text: string, categories: string[]) => Promise<ExtractedNeed>;
}): Promise<DialoguePlan> {
  const { settings } = input;
  const original = dialogueState.parse(input.state ?? { products: [] });
  const state: DialogueState = { ...original, products: [...original.products] };
  const products = await db.catalogProduct.findMany({
    where: { workspaceId: input.workspaceId, pageId: input.pageId, active: true },
    orderBy: [{ priceToman: 'asc' }, { id: 'asc' }],
    take: 500,
  });
  const categories = [...new Set(products.map((p) => p.category))].slice(0, 50);
  let text = input.text,
    intent = localIntent(text);
  let interpretation: DialoguePlan['interpretation'] = 'rules',
    aiAttempted = false,
    aiSucceeded = false;
  const friendly = settings.tone !== 'formal';
  const lead = input.firstTurn
    ? friendly
      ? 'سلام! من دستیار خودکار فروشگاهم 🙂\n'
      : 'سلام. من دستیار خودکار فروشگاه هستم.\n'
    : '';
  const result = (
    reply: string,
    resultKind: string,
    ids: string[] = [],
    handedOff = false,
  ): DialoguePlan => ({
    reply: (lead + reply).slice(0, 990),
    intent,
    resultKind,
    interpretation,
    aiAttempted,
    aiSucceeded,
    state,
    handedOff,
    selectedProductIds: ids,
    budgetBucket: budgetBand(state.budget),
  });
  const confirm = /^(موافقم|رضایت دارم|بله موافقم)[! .]*$/.test(normalize(text));
  if (confirm && state.pendingAiText && settings.aiEnabled && input.extractor) {
    text = state.pendingAiText;
    delete state.pendingAiText;
    aiAttempted = true;
    try {
      const extracted = await input.extractor(text, categories);
      aiSucceeded = true;
      if (
        extracted.confidence === 'high' &&
        (extracted.categoryIndex === null ||
          (extracted.categoryIndex >= 0 && extracted.categoryIndex < categories.length))
      ) {
        intent = extracted.intent;
        interpretation = 'ai';
        if (extracted.categoryIndex !== null) state.category = categories[extracted.categoryIndex];
      } else
        return result(
          friendly
            ? 'هنوز دقیق متوجه نشدم؛ اسم محصول یا دسته‌اش و بودجه‌ات رو می‌گی؟'
            : 'لطفاً نام یا دستهٔ محصول و حداکثر بودجه را مشخص کنید.',
          'clarify',
        );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'externalAttempted' in error &&
        error.externalAttempted === false
      )
        aiAttempted = false;
      return result(
        'تحلیل تکمیلی فعلاً در دسترس نیست. نام محصول یا دسته و حداکثر بودجه را می‌فرستی؟',
        'ai_unavailable',
      );
    }
  } else {
    delete state.pendingAiText;
    if (/^(نه|خیر|موافق نیستم)/.test(normalize(text)) && original.pendingAiText)
      return result(
        'حتماً؛ بدون ارسال پیام به هوش مصنوعی ادامه می‌دهیم. نام یا دستهٔ محصول و بودجه را مشخص کن.',
        'consent_declined',
      );
  }
  if (intent === 'human')
    return result(
      'درخواست گفت‌وگو با فروشنده ثبت شد. پاسخ خودکار این گفتگو متوقف می‌شود تا فروشگاه آن را بررسی کند.',
      'handoff',
      [],
      true,
    );
  if (intent === 'shipping')
    return result(
      settings.shippingPolicy ||
        (friendly
          ? 'شرایط ارسال هنوز در اطلاعات فروشگاه ثبت نشده؛ نمی‌خوام زمان یا هزینهٔ نادرست بگم. برای بررسی فروشنده بنویس «اپراتور».'
          : 'شرایط ارسال در اطلاعات فروشگاه ثبت نشده است. برای بررسی انسانی «اپراتور» را ارسال کنید.'),
      settings.shippingPolicy ? 'shipping_answer' : 'missing_policy',
    );
  if (intent === 'greeting')
    return result(
      friendly
        ? 'خوش اومدی! دنبال چه محصولی هستی و حدود بودجه‌ات چقدره؟'
        : 'خوش آمدید. چه محصولی و با چه حداکثر بودجه‌ای مدنظر دارید؟',
      'greeting',
    );
  if (intent === 'thanks')
    return result(
      friendly
        ? 'خواهش می‌کنم 🙂 اگر سؤال دیگه‌ای دربارهٔ محصول داری بپرس.'
        : 'خواهش می‌کنم. در صورت نیاز، پرسش بعدی خود را مطرح کنید.',
      'thanks',
    );

  const categoryMatches = categories.filter((c) => mentionsCategory(text, c));
  if (categoryMatches.length === 1) state.category = categoryMatches[0];
  if (categoryMatches.length > 1)
    return result('کدام دسته را می‌خواهی بررسی کنیم؟ لطفاً یک دسته را مشخص کن.', 'clarify');
  const reference = selectedReference(text, products, original);
  if (reference && intent === 'unknown') intent = 'recommendation';
  if (
    reference &&
    (intent === 'price' || intent === 'availability' || intent === 'recommendation')
  ) {
    if (
      interpretation !== 'ai' &&
      original.products.includes(reference.id) &&
      !normalize(text).includes(normalize(reference.name))
    )
      interpretation = 'context';
    state.products = [reference.id];
    state.category = reference.category;
    const price = reference.priceToman.toLocaleString('fa-IR');
    return result(
      `${reference.name.slice(0, 100)}\nقیمت ثبت‌شده: ${price} تومان\n${reference.stock > 0 ? 'در کاتالوگ موجود است.' : 'فعلاً در کاتالوگ موجود نیست.'}${reference.url.length <= 250 ? '\n' + reference.url : ''}`,
      reference.stock > 0 ? 'product_answer' : 'out_of_stock',
      [reference.id],
    );
  }
  if (intent === 'price' || intent === 'availability')
    return result(
      friendly
        ? 'کدوم محصول رو می‌گی؟ اسمش رو بنویس یا بگو «اولی»، «دومی» یا «سومی» از پیشنهادهای قبلی.'
        : 'لطفاً نام محصول یا شمارهٔ آن در پیشنهاد قبلی را مشخص کنید.',
      'clarify_product',
    );
  // Never reuse an old budget to silently resolve a new ambiguous amount.
  const budget = dmBudget(text, settings.shorthandMillions);
  const hasNumber = /\d/.test(latinDigits(text));
  if (budget.status === 'ready') {
    state.budget = budget.toman;
    if (intent === 'unknown') intent = 'recommendation';
  } else if (hasNumber) return result(budget.message, 'clarify_budget');
  else if (state.budget && intent === 'recommendation')
    interpretation = interpretation === 'ai' ? 'ai' : 'context';
  if (intent === 'unknown' && categoryMatches.length === 1) intent = 'recommendation';
  if (intent === 'unknown') {
    if (settings.aiEnabled && input.extractor && !aiAttempted) {
      state.pendingAiText = redactDm(text);
      return result(
        'برای فهم بهتر این پیام می‌توانم نسخهٔ کوتاه و پالایش‌شدهٔ آن را به Groq بفرستم. پالایش، حذف همهٔ اطلاعات شخصی را تضمین نمی‌کند. اگر موافقی بنویس «موافقم»؛ در غیر این صورت نام محصول و بودجه را مستقیم بنویس یا «اپراتور» را انتخاب کن.',
        'consent_requested',
      );
    }
    return result(
      friendly
        ? 'می‌خوام درست راهنمایی‌ات کنم؛ اسم محصول یا دسته و حدود بودجه‌ات رو می‌گی؟ برای صحبت با فروشنده هم بنویس «اپراتور».'
        : 'لطفاً نام محصول، دسته یا حداکثر بودجه را مشخص کنید. برای بررسی انسانی «اپراتور» را بنویسید.',
      'clarify',
    );
  }
  if (state.budget === undefined)
    return result(
      friendly
        ? 'حداکثر بودجه‌ات چقدره؟ مثلاً «تا ۳۰ میلیون تومان».'
        : 'لطفاً حداکثر بودجه را به تومان مشخص کنید.',
      'clarify_budget',
    );
  if (!state.category && categories.length > 1)
    return result(
      `بودجه را در نظر گرفتم. کدام دسته را می‌خواهی بررسی کنیم؟ ${categories.join('، ').slice(0, 240)}`,
      'clarify_category',
    );
  if (!state.category && categories.length === 1) state.category = categories[0];
  if (!hasNumber && original.budget && interpretation === 'rules') interpretation = 'context';
  const selected = products
    .filter(
      (p) =>
        p.stock > 0 &&
        Number(p.priceToman) <= state.budget! &&
        (!state.category || p.category === state.category),
    )
    .slice(0, 3);
  state.products = selected.map((p) => p.id);
  if (!selected.length)
    return result(
      friendly
        ? 'با این بودجه و دسته، گزینهٔ موجودی پیدا نکردم. دوست داری بودجه یا دسته رو تغییر بدی؟'
        : 'در بودجه و دستهٔ انتخاب‌شده محصول موجودی یافت نشد. آیا بودجه یا دستهٔ دیگری مدنظر دارید؟',
      'no_match',
    );
  const intros = friendly
    ? ['این گزینه‌ها به بودجه‌ات می‌خورن:', 'با بودجه‌ای که گفتی، این‌ها موجودند:']
    : ['گزینه‌های موجود در محدودهٔ بودجهٔ شما:'];
  let reply = `${intros[(input.seed ?? 0) % intros.length]}\n`;
  const listed: string[] = [];
  for (const [index, p] of selected.entries()) {
    const block = `\n${index + 1}. ${p.name.slice(0, 80)} — ${p.priceToman.toLocaleString('fa-IR')} تومان\n${p.description.slice(0, 70)}${p.url.length <= 250 ? '\n' + p.url : ''}\n`;
    if (lead.length + reply.length + block.length > 850) break;
    listed.push(p.id);
    reply += block;
  }
  state.products = listed;
  return result(
    reply +
      (friendly
        ? '\nکدوم رو بیشتر بررسی کنیم؟ قیمت و موجودی از کاتالوگ فروشگاهه.'
        : '\nکدام گزینه را بررسی کنیم؟ قیمت و موجودی مطابق کاتالوگ فروشگاه است.'),
    'recommendations',
    listed,
  );
}
