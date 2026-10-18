import { normalize } from './matching';

export function latinDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) - (c <= '٩' ? 1632 : 1776)));
}
export type Budget = { status: 'ready'; toman: number } | { status: 'clarify'; message: string };
export function parseBudget(message: string, explicit?: string): Budget {
  if (explicit) {
    const digits = latinDigits(explicit).replace(/[,٬\s]/g, '');
    const number = Number(digits);
    if (/^\d+$/.test(digits) && Number.isSafeInteger(number) && number > 0 && number <= 1e12)
      return { status: 'ready', toman: number };
    return { status: 'clarify', message: 'بودجه را با عدد کامل و به تومان وارد کن.' };
  }
  const value = latinDigits(normalize(message)).replace(/[,٬](?=\d{3}(?:\D|$))/g, '');
  if (/ریال|دلار|یورو|usd|eur|تتر|تومان\s*تا|از\s*\d|بین\s*\d|[-−]\s*\d/.test(value))
    return { status: 'clarify', message: 'حداکثر بودجه را با عدد کامل و به تومان مشخص می‌کنی؟' };
  const amounts = [...value.matchAll(/(\d+(?:[.٫]\d+)?)\s*(میلیون|هزار)?\s*(تومان|تومن)?/g)];
  if (amounts.length !== 1)
    return { status: 'clarify', message: 'حداکثر بودجه‌ات چند تومان است؟ مثلاً ۳۰ میلیون تومان.' };
  const amount = amounts[0];
  const multiplier = amount[2] === 'میلیون' ? 1e6 : amount[2] === 'هزار' ? 1e3 : 1;
  const number = Number(amount[1].replace('٫', '.')) * multiplier;
  if (
    (!amount[2] && (!amount[3] || number < 1000)) ||
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    number > 1e12
  )
    return {
      status: 'clarify',
      message: 'منظورت چند تومان است؟ مبلغ کامل را بنویس؛ مثلاً ۳۰ میلیون تومان.',
    };
  return { status: 'ready', toman: number };
}
export type Candidate = {
  id: string;
  name: string;
  description: string;
  category: string;
  priceToman: string;
  stock: number;
  active: boolean;
  url: string;
};
export function recommend(products: Candidate[], budget: number, category = '') {
  const query = normalize(category);
  return products
    .filter(
      (p) =>
        p.active &&
        p.stock > 0 &&
        Number(p.priceToman) <= budget &&
        (!query || normalize(p.category).includes(query) || normalize(p.name).includes(query)),
    )
    .sort((a, b) => Number(a.priceToman) - Number(b.priceToman) || a.id.localeCompare(b.id))
    .slice(0, 3);
}
export function recommendationText(products: Candidate[]) {
  if (!products.length)
    return 'در بودجه و دسته‌بندی انتخابی محصول موجودی نداریم. دسته‌بندی یا بودجه دیگری مدنظرت هست؟';
  return (
    'این گزینه‌ها در بودجه‌ات هستند:\n' +
    products
      .map(
        (p) =>
          `${p.name} — ${Number(p.priceToman).toLocaleString('fa-IR')} تومان\n${p.description}\n${p.url}`,
      )
      .join('\n\n') +
    '\n\nکدام را بیشتر بررسی کنیم؟'
  );
}
export function csvCell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
