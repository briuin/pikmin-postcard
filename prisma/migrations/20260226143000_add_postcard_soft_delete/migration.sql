-- AlterTable
ALTER TABLE "Postcard" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Postcard_deletedAt_idx" ON "Postcard"("deletedAt");
