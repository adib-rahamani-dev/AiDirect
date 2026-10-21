import { db } from './db';
export async function expireSendboxEvidence() {
  await db.sendboxDmContext.updateMany({
    where: {
      expiresAt: { lt: new Date() },
      OR: [{ stateCipher: { not: null } }, { handedOff: true }],
    },
    data: { stateCipher: null, handedOff: false },
  });
  await db.sendboxDmDelivery.updateMany({
    where: { expiresAt: { lt: new Date() }, payloadCipher: { not: null } },
    data: { payloadCipher: null, status: 'expired', errorKind: 'window_closed' },
  });
  await db.sendboxWebhookEvent.updateMany({
    where: { expiresAt: { lt: new Date() }, payloadCipher: { not: null } },
    data: { payloadCipher: null },
  });
}
