-- AlterTable
ALTER TABLE "NotionConnection" ADD COLUMN     "authType" TEXT NOT NULL DEFAULT 'oauth',
ADD COLUMN     "workspaceIcon" TEXT,
ADD COLUMN     "workspaceName" TEXT;
