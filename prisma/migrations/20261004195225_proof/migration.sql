-- CreateTable
CREATE TABLE "ProofConnection" (
    "id" TEXT NOT NULL DEFAULT 'proof',
    "accountId" TEXT NOT NULL,
    "appScopedId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "tokenCipher" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "subscribed" BOOLEAN NOT NULL DEFAULT false,
    "nextSendAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofRule" (
    "id" TEXT NOT NULL DEFAULT 'proof',
    "accountId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "replyText" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "replyCipher" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "messageId" TEXT,
    "errorKind" TEXT,
    "errorCode" INTEGER,
    "errorSubcode" INTEGER,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "observedAt" TIMESTAMP(3),

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAttempt" (
    "stateHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAttempt_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "ProofLoginGuard" (
    "id" TEXT NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofLoginGuard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProofConnection_accountId_key" ON "ProofConnection"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentEvent_accountId_commentId_source_key" ON "CommentEvent"("accountId", "commentId", "source");

-- CreateIndex
CREATE INDEX "Delivery_status_nextAttemptAt_idx" ON "Delivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_accountId_commentId_provider_key" ON "Delivery"("accountId", "commentId", "provider");

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CommentEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
