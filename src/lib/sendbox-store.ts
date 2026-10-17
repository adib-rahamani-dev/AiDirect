import { db } from './db';
export async function expireSendboxEvidence() {
  await db.sendboxWebhookEvent.updateMany({
    where: { expiresAt: { lt: new Date() }, payloadCipher: { not: null } },
    data: { payloadCipher: null },
  });
}
