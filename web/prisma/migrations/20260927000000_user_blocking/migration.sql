-- Lets an admin block an account. Additive: a nullable column, so every
-- existing user stays active.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blockedAt" TIMESTAMP(3);

