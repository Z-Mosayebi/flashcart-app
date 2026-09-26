-- Game mechanics: each attempt records whether it was a first answer, the one
-- retry, or "I don't know"; each learner gets a daily goal. Additive only.

-- CreateEnum
CREATE TYPE "AttemptKind" AS ENUM ('FIRST', 'RETRY', 'DONT_KNOW');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyGoal" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "kind" "AttemptKind" NOT NULL DEFAULT 'FIRST';

-- "I don't know" answers were stored with this placeholder answer; mark them
-- so they earn no XP. (A newly created enum type can be used in the same
-- transaction; only ADD VALUE to an existing enum can't.)
UPDATE "Attempt" SET "kind" = 'DONT_KNOW' WHERE "userAnswer" = '—';
