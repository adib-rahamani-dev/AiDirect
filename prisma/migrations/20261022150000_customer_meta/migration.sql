-- CreateTable
CREATE TABLE "InstagramConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "appScopedId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "tokenCipher" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "subscribed" BOOLEAN NOT NULL DEFAULT false,
    "errorKind" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoDm" BOOLEAN NOT NULL DEFAULT false,
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "shippingPolicy" TEXT NOT NULL DEFAULT '',
    "shorthandMillions" BOOLEAN NOT NULL DEFAULT false,
    "settingsRevision" TEXT NOT NULL,
    "nextSendAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramWebhookEnvelope" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "payloadCipher" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramWebhookEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramOAuthAttempt" (
    "stateHash" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramOAuthAttempt_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "InstagramAutomation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "replyText" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramThread" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "senderCipher" TEXT NOT NULL,
    "lastInboundAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "handedOff" BOOLEAN NOT NULL DEFAULT false,
    "contextCipher" TEXT,
    "contextAt" TIMESTAMP(3),
    "lastProcessedInboundAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),

    CONSTRAINT "InstagramThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "textCipher" TEXT,
    "intent" TEXT NOT NULL DEFAULT 'unclassified',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramJob" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "threadId" TEXT,
    "kind" TEXT NOT NULL,
    "automationId" TEXT,
    "revision" TEXT,
    "payloadCipher" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "errorKind" TEXT,
    "messageId" TEXT,
    "intent" TEXT NOT NULL DEFAULT 'unclassified',
    "resultKind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConnection_workspaceId_key" ON "InstagramConnection"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConnection_accountId_key" ON "InstagramConnection"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConnection_id_workspaceId_key" ON "InstagramConnection"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "InstagramWebhookEnvelope_status_receivedAt_idx" ON "InstagramWebhookEnvelope"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "InstagramOAuthAttempt_expiresAt_idx" ON "InstagramOAuthAttempt"("expiresAt");

-- CreateIndex
CREATE INDEX "InstagramAutomation_workspaceId_idx" ON "InstagramAutomation"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAutomation_connectionId_mediaId_keyword_key" ON "InstagramAutomation"("connectionId", "mediaId", "keyword");

-- CreateIndex
CREATE INDEX "InstagramThread_workspaceId_lastMessageAt_idx" ON "InstagramThread"("workspaceId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramThread_id_workspaceId_key" ON "InstagramThread"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "InstagramMessage_workspaceId_threadId_receivedAt_idx" ON "InstagramMessage"("workspaceId", "threadId", "receivedAt");

-- CreateIndex
CREATE INDEX "InstagramMessage_expiresAt_idx" ON "InstagramMessage"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramJob_dedupeKey_key" ON "InstagramJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "InstagramJob_status_nextAttemptAt_idx" ON "InstagramJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "InstagramJob_workspaceId_createdAt_idx" ON "InstagramJob"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "InstagramConnection" ADD CONSTRAINT "InstagramConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramWebhookEnvelope" ADD CONSTRAINT "InstagramWebhookEnvelope_connectionId_workspaceId_fkey" FOREIGN KEY ("connectionId", "workspaceId") REFERENCES "InstagramConnection"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramOAuthAttempt" ADD CONSTRAINT "InstagramOAuthAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramAutomation" ADD CONSTRAINT "InstagramAutomation_connectionId_workspaceId_fkey" FOREIGN KEY ("connectionId", "workspaceId") REFERENCES "InstagramConnection"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramThread" ADD CONSTRAINT "InstagramThread_connectionId_workspaceId_fkey" FOREIGN KEY ("connectionId", "workspaceId") REFERENCES "InstagramConnection"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramMessage" ADD CONSTRAINT "InstagramMessage_threadId_workspaceId_fkey" FOREIGN KEY ("threadId", "workspaceId") REFERENCES "InstagramThread"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramJob" ADD CONSTRAINT "InstagramJob_connectionId_workspaceId_fkey" FOREIGN KEY ("connectionId", "workspaceId") REFERENCES "InstagramConnection"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramJob" ADD CONSTRAINT "InstagramJob_threadId_workspaceId_fkey" FOREIGN KEY ("threadId", "workspaceId") REFERENCES "InstagramThread"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
