-- CreateEnum
CREATE TYPE "FeedbackAction" AS ENUM ('LIKE', 'DISLIKE', 'REPORT_WRONG_LOCATION');

-- CreateTable
CREATE TABLE "PostcardFeedback" (
    "id" TEXT NOT NULL,
    "postcardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "FeedbackAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostcardFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostcardFeedback_postcardId_userId_action_key" ON "PostcardFeedback"("postcardId", "userId", "action");

-- CreateIndex
CREATE INDEX "PostcardFeedback_userId_createdAt_idx" ON "PostcardFeedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostcardFeedback_postcardId_createdAt_idx" ON "PostcardFeedback"("postcardId", "createdAt");

-- AddForeignKey
ALTER TABLE "PostcardFeedback" ADD CONSTRAINT "PostcardFeedback_postcardId_fkey" FOREIGN KEY ("postcardId") REFERENCES "Postcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostcardFeedback" ADD CONSTRAINT "PostcardFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
