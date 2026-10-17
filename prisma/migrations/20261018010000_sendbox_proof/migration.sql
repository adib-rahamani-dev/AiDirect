CREATE TABLE "SendboxConnection" (
    "id" TEXT NOT NULL DEFAULT 'proof',
    "accountId" TEXT NOT NULL,
    "instagramId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SendboxConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SendboxConnection_accountId_key" ON "SendboxConnection"("accountId");
CREATE TABLE "SendboxWebhookEvent" (
    "eventId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadCipher" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SendboxWebhookEvent_pkey" PRIMARY KEY ("eventId")
);
CREATE INDEX "SendboxWebhookEvent_expiresAt_idx" ON "SendboxWebhookEvent"("expiresAt");
