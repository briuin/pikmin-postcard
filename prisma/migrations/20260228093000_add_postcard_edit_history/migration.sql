-- CreateEnum
CREATE TYPE "PostcardEditAction" AS ENUM ('DETAILS_UPDATED', 'CROP_UPDATED', 'SOFT_DELETED');

-- CreateTable
CREATE TABLE "PostcardEditHistory" (
    "id" TEXT NOT NULL,
    "postcardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "PostcardEditAction" NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostcardEditHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostcardEditHistory_postcardId_createdAt_idx" ON "PostcardEditHistory"("postcardId", "createdAt");

-- CreateIndex
CREATE INDEX "PostcardEditHistory_userId_createdAt_idx" ON "PostcardEditHistory"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PostcardEditHistory" ADD CONSTRAINT "PostcardEditHistory_postcardId_fkey" FOREIGN KEY ("postcardId") REFERENCES "Postcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostcardEditHistory" ADD CONSTRAINT "PostcardEditHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
