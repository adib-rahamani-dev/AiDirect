-- AlterTable
ALTER TABLE "InstagramConnection" ADD COLUMN     "historyCursorCipher" TEXT,
ADD COLUMN     "historyHasMore" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "historyLeaseToken" TEXT,
ADD COLUMN     "historyLeaseUntil" TIMESTAMP(3),
ADD COLUMN     "historySyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InstagramThread" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contactUsername" TEXT,
ADD COLUMN     "historySyncedAt" TIMESTAMP(3),
ADD COLUMN     "lastReadAt" TIMESTAMP(3),
ADD COLUMN     "noteCipher" TEXT,
ADD COLUMN     "remoteIdCipher" TEXT,
ADD COLUMN     "starred" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "InstagramMessage" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'webhook';

-- CreateIndex
CREATE INDEX "InstagramThread_workspaceId_archived_lastMessageAt_idx" ON "InstagramThread"("workspaceId", "archived", "lastMessageAt");

-- Existing outbound rows were created only after an accepted API response.
UPDATE "InstagramMessage" SET "source" = 'api' WHERE "direction" = 'outbound';
