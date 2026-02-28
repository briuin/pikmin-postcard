CREATE TYPE "UserApprovalStatus" AS ENUM ('PENDING', 'APPROVED');

ALTER TABLE "User"
ADD COLUMN "approvalStatus" "UserApprovalStatus" NOT NULL DEFAULT 'APPROVED';
