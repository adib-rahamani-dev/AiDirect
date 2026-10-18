CREATE TABLE "SendboxInvite" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "claimHash" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SendboxInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SendboxInvite_tokenHash_key" ON "SendboxInvite"("tokenHash");
CREATE INDEX "SendboxInvite_expiresAt_idx" ON "SendboxInvite"("expiresAt");
