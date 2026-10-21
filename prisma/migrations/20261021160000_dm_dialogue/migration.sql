-- AlterTable
ALTER TABLE "SendboxDmSettings" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shippingPolicy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tone" TEXT NOT NULL DEFAULT 'friendly';

-- AlterTable
ALTER TABLE "SendboxDmDelivery" ADD COLUMN     "aiAttempted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiSucceeded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "analyzedAt" TIMESTAMP(3),
ADD COLUMN     "budgetBucket" TEXT,
ADD COLUMN     "intent" TEXT NOT NULL DEFAULT 'unclassified',
ADD COLUMN     "interpretation" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "responseMs" INTEGER,
ADD COLUMN     "resultKind" TEXT,
ADD COLUMN     "selectedProductIds" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "SendboxDmContext" (
    "accountId" TEXT NOT NULL,
    "senderHash" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "stateCipher" TEXT,
    "handedOff" BOOLEAN NOT NULL DEFAULT false,
    "lastInboundAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SendboxDmContext_pkey" PRIMARY KEY ("accountId","senderHash")
);

-- CreateIndex
CREATE INDEX "SendboxDmContext_expiresAt_idx" ON "SendboxDmContext"("expiresAt");

-- AddForeignKey
ALTER TABLE "SendboxDmContext" ADD CONSTRAINT "SendboxDmContext_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SendboxConnection"("accountId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendboxDmContext" ADD CONSTRAINT "SendboxDmContext_pageId_workspaceId_fkey" FOREIGN KEY ("pageId", "workspaceId") REFERENCES "CatalogPage"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
