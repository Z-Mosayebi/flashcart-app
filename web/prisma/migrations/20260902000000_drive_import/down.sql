-- Reverse of 20260902000000_drive_import.
--
-- Prisma has no `migrate down`, so this is applied by hand:
--     psql "$DATABASE_URL" -f web/prisma/migrations/20260902000000_drive_import/down.sql
--
-- It returns the schema to its pre-migration shape and re-marks the migration
-- as unapplied, so `prisma migrate deploy` will run the forward migration
-- again afterwards. Run it inside a transaction — Postgres supports
-- transactional DDL, so a failure part-way leaves the schema untouched.
--
-- What survives and what does not:
--
--   * SourceDocument rows survive. externalId becomes notionPageId again, and
--     rows whose provider was GOOGLE_DRIVE are DELETED — the old schema has no
--     column able to express them, and keeping them would mislabel Drive
--     documents as Notion pages.
--   * Topics and Cards survive untouched, including cards generated from Drive
--     documents. They are the learner's study material and are not worth losing
--     to a schema rollback; they simply lose their link to a source document.
--   * DriveConnection rows are DELETED. There is nowhere to put them, and they
--     hold encrypted credentials that nothing would read afterwards.
--   * NotionConnection is recreated EMPTY. The tokens it held were dropped by
--     the forward migration and cannot be recovered here — restore the SQL
--     backup instead if those are needed.

BEGIN;

-- Drive documents cannot be represented by the old schema. Detach their topics
-- first so the cascade does not take the learner's cards with them.
UPDATE "Topic"
   SET "sourceDocumentId" = NULL
 WHERE "sourceDocumentId" IN (
   SELECT "id" FROM "SourceDocument" WHERE "provider" = 'GOOGLE_DRIVE'
 );

DELETE FROM "SourceDocument" WHERE "provider" = 'GOOGLE_DRIVE';

-- DropTable
DROP TABLE IF EXISTS "DriveConnection";

-- DropIndex
DROP INDEX IF EXISTS "SourceDocument_ownerId_provider_externalId_key";
DROP INDEX IF EXISTS "SourceDocument_status_idx";

-- AlterTable
ALTER TABLE "SourceDocument"
  DROP COLUMN IF EXISTS "provider",
  DROP COLUMN IF EXISTS "mimeType",
  DROP COLUMN IF EXISTS "revisionId",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "sectionsDone",
  DROP COLUMN IF EXISTS "sectionsTotal",
  DROP COLUMN IF EXISTS "lastError";

ALTER TABLE "SourceDocument" RENAME COLUMN "externalId" TO "notionPageId";

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_ownerId_notionPageId_key"
  ON "SourceDocument"("ownerId", "notionPageId");

-- DropEnum
DROP TYPE IF EXISTS "SourceProvider";
DROP TYPE IF EXISTS "ImportStatus";

-- CreateTable
CREATE TABLE "NotionConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "pageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authType" TEXT NOT NULL DEFAULT 'oauth',
    "workspaceName" TEXT,
    "workspaceIcon" TEXT,

    CONSTRAINT "NotionConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotionConnection_userId_key" ON "NotionConnection"("userId");

-- AddForeignKey
ALTER TABLE "NotionConnection" ADD CONSTRAINT "NotionConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mark the forward migration unapplied so `prisma migrate deploy` re-runs it.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260902000000_drive_import';

COMMIT;
