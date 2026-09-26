-- Reverse of 20260928000000_game_mechanics. Applied by hand:
--     psql "$DATABASE_URL" -f web/prisma/migrations/20260928000000_game_mechanics/down.sql
-- Drops the daily goal (everyone back to the default experience) and the
-- attempt kind (retries and "I don't know" become indistinguishable again),
-- and the record of reached goal days.

BEGIN;

DROP TABLE IF EXISTS "GoalDay";
ALTER TABLE "Attempt" DROP COLUMN IF EXISTS "kind";
DROP TYPE IF EXISTS "AttemptKind";
ALTER TABLE "User" DROP COLUMN IF EXISTS "dailyGoal";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260928000000_game_mechanics';

COMMIT;
