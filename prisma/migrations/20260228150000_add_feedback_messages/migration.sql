CREATE TYPE "FeedbackMessageStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "FeedbackMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "FeedbackMessageStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeedbackMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackMessage_userId_createdAt_idx" ON "FeedbackMessage"("userId", "createdAt");
CREATE INDEX "FeedbackMessage_status_createdAt_idx" ON "FeedbackMessage"("status", "createdAt");

ALTER TABLE "FeedbackMessage"
ADD CONSTRAINT "FeedbackMessage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
