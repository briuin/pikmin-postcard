-- CreateEnum
CREATE TYPE "DetectionJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "DetectionJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "status" "DetectionJobStatus" NOT NULL DEFAULT 'QUEUED',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "placeGuess" TEXT,
    "errorMessage" TEXT,
    "modelVersion" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DetectionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DetectionJob_userId_createdAt_idx" ON "DetectionJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DetectionJob_status_createdAt_idx" ON "DetectionJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "DetectionJob" ADD CONSTRAINT "DetectionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
