-- Move the note source from Notion to Google Drive.
--
-- Documents imported from Notion keep their cards: SourceDocument becomes
-- provider-agnostic rather than Notion-shaped, so existing rows are relabelled
-- in place instead of being dropped. Only the Notion *connection* goes, since
-- nothing can use it any more.

-- CreateEnum
CREATE TYPE "SourceProvider" AS ENUM ('GOOGLE_DRIVE', 'NOTION');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'IMPORTING', 'COMPLETE', 'FAILED');

-- The old uniqueness constraint names a column that is about to be renamed.
-- DropIndex
DROP INDEX "SourceDocument_ownerId_notionPageId_key";

-- Rename rather than add-and-drop: the column already holds exactly the
-- identifier the new one means, so this preserves every existing document.
-- AlterTable
ALTER TABLE "SourceDocument" RENAME COLUMN "notionPageId" TO "externalId";

-- AlterTable
ALTER TABLE "SourceDocument"
  ADD COLUMN "provider" "SourceProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "revisionId" TEXT,
  ADD COLUMN "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "sectionsDone" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sectionsTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError" TEXT;

-- Every row that exists at this point came from Notion, and every one of them
-- finished importing under the old flow. The column defaults above describe new
-- Drive documents, so existing rows are corrected here.
UPDATE "SourceDocument" SET "provider" = 'NOTION', "status" = 'COMPLETE';

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_ownerId_provider_externalId_key"
  ON "SourceDocument"("ownerId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "SourceDocument_status_idx" ON "SourceDocument"("status");

-- CreateTable
CREATE TABLE "DriveConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveConnection_userId_key" ON "DriveConnection"("userId");

-- AddForeignKey
ALTER TABLE "DriveConnection" ADD CONSTRAINT "DriveConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notion tokens can no longer be used by anything, and keeping stored
-- credentials that nothing reads is a liability rather than a fallback.
-- DropTable
DROP TABLE "NotionConnection";
