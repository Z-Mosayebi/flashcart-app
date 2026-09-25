-- Reverse of 20260926000000_premium_trial. Applied by hand:
--     psql "$DATABASE_URL" -f web/prisma/migrations/20260926000000_premium_trial/down.sql
--
--   * PremiumRequest rows are DELETED (the table goes) and premiumUntil is
--     dropped (as is timeZone), so everyone is back on the pre-premium behaviour.
--   * Uploaded documents cannot exist in the old schema and are DELETED, but
--     their topics are detached first so the learner's cards survive.

BEGIN;

UPDATE "Topic"
   SET "sourceDocumentId" = NULL
 WHERE "sourceDocumentId" IN (SELECT "id" FROM "SourceDocument" WHERE "provider" = 'UPLOAD');

DELETE FROM "SourceDocument" WHERE "provider" = 'UPLOAD';

DROP TABLE IF EXISTS "PremiumRequest";
DROP TYPE IF EXISTS "PremiumRequestStatus";
DROP TYPE IF EXISTS "LearningGoal";
DROP TYPE IF EXISTS "GermanLevel";
DROP TYPE IF EXISTS "PayWillingness";

ALTER TABLE "User" DROP COLUMN IF EXISTS "premiumUntil";
ALTER TABLE "User" DROP COLUMN IF EXISTS "timeZone";

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
