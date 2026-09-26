-- Game mechanics: each attempt records whether it was a first answer, the one
-- retry, or "I don't know"; each learner gets a daily goal; reached goal days
-- are recorded once so the goal bonus never changes after the fact.
-- Additive only.

-- CreateEnum
CREATE TYPE "AttemptKind" AS ENUM ('FIRST', 'RETRY', 'DONT_KNOW');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyGoal" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "kind" "AttemptKind" NOT NULL DEFAULT 'FIRST';

-- CreateTable
CREATE TABLE "GoalDay" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalDay_pkey" PRIMARY KEY ("userId","day")
);

-- AddForeignKey
ALTER TABLE "GoalDay" ADD CONSTRAINT "GoalDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- "I don't know" answers were stored with this placeholder answer; mark them
-- so they earn no XP. (A newly created enum type can be used in the same
-- transaction; only ADD VALUE to an existing enum can't.)
UPDATE "Attempt" SET "kind" = 'DONT_KNOW' WHERE "userAnswer" = '—';

-- Credit past days on which the learner answered at least 10 cards (the
-- default goal, the only goal that existed), in their own time zone.
INSERT INTO "GoalDay" ("userId", "day")
SELECT a."userId",
       to_char((a."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(u."timeZone", 'Europe/Berlin'), 'YYYY-MM-DD')
  FROM "Attempt" a
  JOIN "User" u ON u."id" = a."userId"
 WHERE a."kind"::text IN ('FIRST', 'DONT_KNOW')
 GROUP BY 1, 2
HAVING COUNT(*) >= 10;
