-- Reverse of 20260926000000_premium_trial. Applied by hand:
--     psql "$DATABASE_URL" -f web/prisma/migrations/20260926000000_premium_trial/down.sql
--
--   * PremiumRequest and AiUsage rows are DELETED (the tables go) and premiumUntil is
--     dropped (as is timeZone), so everyone is back on the pre-premium behaviour.
--   * Uploaded documents cannot exist in the old schema and are DELETED, but
--     their topics are detached first so the learner's cards survive.

BEGIN;

UPDATE "Topic"
   SET "sourceDocumentId" = NULL
 WHERE "sourceDocumentId" IN (SELECT "id" FROM "SourceDocument" WHERE "provider"::text = 'UPLOAD');

DELETE FROM "SourceDocument" WHERE "provider"::text = 'UPLOAD';

DROP TABLE IF EXISTS "PremiumRequest";
DROP TABLE IF EXISTS "AiUsage";
DROP TYPE IF EXISTS "UsageKind";
DROP TYPE IF EXISTS "PremiumRequestStatus";
DROP TYPE IF EXISTS "LearningGoal";
DROP TYPE IF EXISTS "GermanLevel";
DROP TYPE IF EXISTS "PayWillingness";

ALTER TABLE "User" DROP COLUMN IF EXISTS "premiumUntil";
ALTER TABLE "User" DROP COLUMN IF EXISTS "timeZone";

-- Removed documents have no representation in the old schema: they go too
-- (their topics were detached or deleted when they were removed).
DELETE FROM "SourceDocument" WHERE "removedAt" IS NOT NULL;
ALTER TABLE "SourceDocument" DROP COLUMN IF EXISTS "removedAt";

-- Postgres cannot drop an enum value, so the type is rebuilt without UPLOAD.
ALTER TYPE "SourceProvider" RENAME TO "SourceProvider_old";
CREATE TYPE "SourceProvider" AS ENUM ('GOOGLE_DRIVE', 'NOTION');
ALTER TABLE "SourceDocument" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "SourceDocument"
  ALTER COLUMN "provider" TYPE "SourceProvider" USING ("provider"::text::"SourceProvider");
ALTER TABLE "SourceDocument" ALTER COLUMN "provider" SET DEFAULT 'GOOGLE_DRIVE';
DROP TYPE "SourceProvider_old";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260926000000_premium_trial';

COMMIT;
