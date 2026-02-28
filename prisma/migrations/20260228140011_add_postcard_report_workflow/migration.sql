-- CreateEnum
CREATE TYPE "PostcardReportReason" AS ENUM ('WRONG_LOCATION', 'SPAM', 'ILLEGAL_IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "PostcardReportStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'VERIFIED', 'REMOVED');

-- AlterTable
ALTER TABLE "Postcard" ADD COLUMN     "reportVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "PostcardReportCase" (
    "id" TEXT NOT NULL,
    "postcardId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PostcardReportStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostcardReportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostcardReport" (
    "id" TEXT NOT NULL,
    "postcardId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "caseId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reason" "PostcardReportReason" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostcardReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostcardReportCase_status_updatedAt_idx" ON "PostcardReportCase"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "PostcardReportCase_postcardId_updatedAt_idx" ON "PostcardReportCase"("postcardId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostcardReportCase_postcardId_version_key" ON "PostcardReportCase"("postcardId", "version");

-- CreateIndex
CREATE INDEX "PostcardReport_caseId_createdAt_idx" ON "PostcardReport"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "PostcardReport_reporterUserId_createdAt_idx" ON "PostcardReport"("reporterUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostcardReport_postcardId_version_reporterUserId_key" ON "PostcardReport"("postcardId", "version", "reporterUserId");

-- AddForeignKey
ALTER TABLE "PostcardReportCase" ADD CONSTRAINT "PostcardReportCase_postcardId_fkey" FOREIGN KEY ("postcardId") REFERENCES "Postcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostcardReportCase" ADD CONSTRAINT "PostcardReportCase_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostcardReport" ADD CONSTRAINT "PostcardReport_postcardId_fkey" FOREIGN KEY ("postcardId") REFERENCES "Postcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostcardReport" ADD CONSTRAINT "PostcardReport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PostcardReportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostcardReport" ADD CONSTRAINT "PostcardReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill legacy report feedback into versioned report case tables.
INSERT INTO "PostcardReportCase" (
    "id",
    "postcardId",
    "version",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT('legacy-case-', p."id"),
    p."id",
    p."reportVersion",
    'PENDING'::"PostcardReportStatus",
    NOW(),
    NOW()
FROM "Postcard" p
WHERE p."wrongLocationReports" > 0
ON CONFLICT ("postcardId", "version") DO NOTHING;

INSERT INTO "PostcardReport" (
    "id",
    "postcardId",
    "version",
    "caseId",
    "reporterUserId",
    "reason",
    "description",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT('legacy-report-', pf."id"),
    pf."postcardId",
    p."reportVersion",
    CONCAT('legacy-case-', pf."postcardId"),
    pf."userId",
    'WRONG_LOCATION'::"PostcardReportReason",
    'Migrated from legacy wrong-location report.',
    pf."createdAt",
    NOW()
FROM "PostcardFeedback" pf
JOIN "Postcard" p ON p."id" = pf."postcardId"
WHERE pf."action" = 'REPORT_WRONG_LOCATION'::"FeedbackAction"
ON CONFLICT ("postcardId", "version", "reporterUserId") DO NOTHING;

UPDATE "Postcard" p
SET "wrongLocationReports" = sub."count"
FROM (
    SELECT pr."postcardId", COUNT(*)::INTEGER AS "count"
    FROM "PostcardReport" pr
    GROUP BY pr."postcardId"
) sub
WHERE p."id" = sub."postcardId";

UPDATE "Postcard" p
SET "wrongLocationReports" = 0
WHERE NOT EXISTS (
    SELECT 1 FROM "PostcardReport" pr WHERE pr."postcardId" = p."id"
);
