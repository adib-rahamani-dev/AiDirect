-- CreateTable
CREATE TABLE "WorkerState" (
    "id" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,

    CONSTRAINT "WorkerState_pkey" PRIMARY KEY ("id")
);
