-- CreateTable
CREATE TABLE "SendboxDmSettings" (
    "accountId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "shorthandMillions" BOOLEAN NOT NULL DEFAULT false,
    "revision" TEXT NOT NULL,
    "enabledSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SendboxDmSettings_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "SendboxDmDelivery" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "messageHash" TEXT NOT NULL,
    "senderHash" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "payloadCipher" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorKind" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inboundAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SendboxDmDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SendboxDmDelivery_status_nextAttemptAt_idx" ON "SendboxDmDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "SendboxDmDelivery_expiresAt_idx" ON "SendboxDmDelivery"("expiresAt");

-- CreateIndex
CREATE INDEX "SendboxDmDelivery_accountId_senderHash_receivedAt_idx" ON "SendboxDmDelivery"("accountId", "senderHash", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SendboxDmDelivery_accountId_messageHash_key" ON "SendboxDmDelivery"("accountId", "messageHash");

-- AddForeignKey
ALTER TABLE "SendboxDmSettings" ADD CONSTRAINT "SendboxDmSettings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SendboxConnection"("accountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendboxDmSettings" ADD CONSTRAINT "SendboxDmSettings_pageId_workspaceId_fkey" FOREIGN KEY ("pageId", "workspaceId") REFERENCES "CatalogPage"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
