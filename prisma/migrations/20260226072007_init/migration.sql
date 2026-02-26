-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('AUTO', 'USER_CONFIRMED', 'MANUAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Postcard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "imageUrl" TEXT,
    "capturedAt" TIMESTAMP(3),
    "city" TEXT,
    "country" TEXT,
    "placeName" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "aiLatitude" DOUBLE PRECISION,
    "aiLongitude" DOUBLE PRECISION,
    "aiConfidence" DOUBLE PRECISION,
    "aiPlaceGuess" TEXT,
    "locationStatus" "LocationStatus" NOT NULL DEFAULT 'AUTO',
    "locationModelVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Postcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostcardTag" (
    "postcardId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "PostcardTag_pkey" PRIMARY KEY ("postcardId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Postcard_userId_createdAt_idx" ON "Postcard"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- AddForeignKey
ALTER TABLE "Postcard" ADD CONSTRAINT "Postcard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostcardTag" ADD CONSTRAINT "PostcardTag_postcardId_fkey" FOREIGN KEY ("postcardId") REFERENCES "Postcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostcardTag" ADD CONSTRAINT "PostcardTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
