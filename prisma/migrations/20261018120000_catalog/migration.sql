-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId","workspaceId")
);

-- CreateTable
CREATE TABLE "CatalogPage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priceToman" BIGINT NOT NULL,
    "stock" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaProduct" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,

    CONSTRAINT "MediaProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationControl" (
    "id" TEXT NOT NULL DEFAULT 'proof',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationControl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPage_id_workspaceId_key" ON "CatalogPage"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogPage_workspaceId_handle_key" ON "CatalogPage"("workspaceId", "handle");

-- CreateIndex
CREATE INDEX "CatalogProduct_workspaceId_pageId_active_priceToman_idx" ON "CatalogProduct"("workspaceId", "pageId", "active", "priceToman");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_id_workspaceId_pageId_key" ON "CatalogProduct"("id", "workspaceId", "pageId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaProduct_workspaceId_pageId_productId_permalink_key" ON "MediaProduct"("workspaceId", "pageId", "productId", "permalink");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogPage" ADD CONSTRAINT "CatalogPage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_pageId_workspaceId_fkey" FOREIGN KEY ("pageId", "workspaceId") REFERENCES "CatalogPage"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaProduct" ADD CONSTRAINT "MediaProduct_productId_workspaceId_pageId_fkey" FOREIGN KEY ("productId", "workspaceId", "pageId") REFERENCES "CatalogProduct"("id", "workspaceId", "pageId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_price_valid" CHECK ("priceToman" > 0 AND "priceToman" <= 1000000000000);
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_stock_valid" CHECK ("stock" >= 0 AND "stock" <= 1000000);
