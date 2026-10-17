export function normalize(value: string) {
  return value
    .normalize('NFKC')
    .replace(/ي|ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fa');
}
export function matches(text: string, keyword: string) {
  const trigger = normalize(keyword);
  if (!trigger) return false;
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'u').test(
    normalize(text),
  );
}
