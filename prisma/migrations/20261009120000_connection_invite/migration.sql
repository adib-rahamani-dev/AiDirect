ALTER TABLE "OAuthAttempt" ADD COLUMN "inviteHash" TEXT;
ALTER TABLE "ProofConnection" ADD COLUMN "acceptCommentsSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "ConnectionInvite" (
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectionInvite_pkey" PRIMARY KEY ("tokenHash")
);
