-- Reverse of 20260927000000_user_blocking. Applied by hand:
--     psql "$DATABASE_URL" -f web/prisma/migrations/20260927000000_user_blocking/down.sql
-- Blocked users become active again: the old schema can't express a block.

BEGIN;

ALTER TABLE "User" DROP COLUMN IF EXISTS "blockedAt";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260927000000_user_blocking';

COMMIT;
