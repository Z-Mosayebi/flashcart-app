-- Free demo limits, premium trial requests, and per-user time zones.
-- Additive only: new enum values, nullable columns and a new table. No
-- existing row changes, so every current user starts on the free plan.

-- CreateEnum
CREATE TYPE "PremiumRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LearningGoal" AS ENUM ('EXAM', 'WORK', 'IMMIGRATION', 'STUDY', 'PERSONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "GermanLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PayWillingness" AS ENUM ('NOTHING', 'UNDER_5', 'FROM_5_TO_10', 'OVER_10');

-- AlterEnum
ALTER TYPE "SourceProvider" ADD VALUE 'UPLOAD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "premiumUntil" TIMESTAMP(3),
ADD COLUMN     "timeZone" TEXT;

-- CreateTable
CREATE TABLE "PremiumRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goal" "LearningGoal" NOT NULL,
    "level" "GermanLevel" NOT NULL,
    "willingToPay" "PayWillingness" NOT NULL,
    "contact" TEXT,
    "message" TEXT,
    "status" "PremiumRequestStatus" NOT NULL DEFAULT 'PENDING',
    "grantedDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "PremiumRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PremiumRequest_status_createdAt_idx" ON "PremiumRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PremiumRequest_userId_idx" ON "PremiumRequest"("userId");

-- AddForeignKey
ALTER TABLE "PremiumRequest" ADD CONSTRAINT "PremiumRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

