CREATE TABLE "OperatorSession" (
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperatorSession_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "OperatorSession_expiresAt_idx" ON "OperatorSession"("expiresAt");
