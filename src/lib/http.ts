export class InputError extends Error {
  constructor(public status = 400) {
    super('invalid_input');
  }
}
export async function readJson(request: Request, limit: number): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new InputError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new InputError(413);
      }
      chunks.push(part.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new InputError();
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError();
  }
}
