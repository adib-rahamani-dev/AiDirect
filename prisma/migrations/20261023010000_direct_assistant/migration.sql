-- AlterTable
ALTER TABLE "InstagramConnection" ADD COLUMN     "assistantConfig" JSONB;

-- AlterTable
ALTER TABLE "InstagramJob" ADD COLUMN     "aiAttempted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiSucceeded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "budgetBucket" TEXT,
ADD COLUMN     "interpretation" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "responseMs" INTEGER;
