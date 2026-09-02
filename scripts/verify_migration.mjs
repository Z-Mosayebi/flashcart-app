/**
 * Dry-run the Drive migration and its reverse, without touching real data.
 *
 * Applies the forward migration inside a transaction, checks the resulting
 * schema, applies down.sql, checks the schema is back, then ROLLS BACK — so
 * the database ends exactly as it started regardless of the outcome.
 *
 * This is what makes the migration recoverable rather than merely reversible
 * on paper: the reverse is proven to run against this specific database before
 * the forward one is committed to it.
 *
 * Usage (from the repository root):
 *     node scripts/verify_migration.mjs
 */

import { createRequire } from "module";
import { readFileSync } from "fs";
import { resolve } from "path";

const WEB_DIR = resolve(process.cwd(), "web");
const require = createRequire(resolve(WEB_DIR, "package.json"));
const { PrismaClient } = require("@prisma/client");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const env = readFileSync(resolve(WEB_DIR, ".env"), "utf8");
  const match = env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
  if (!match) throw new Error("DATABASE_URL not found in web/.env.");
  process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "");
}
loadDatabaseUrl();

const MIGRATION_DIR = resolve(
  WEB_DIR,
  "prisma/migrations/20260902000000_drive_import"
);

/**
 * Splits a migration file into statements.
 *
 * BEGIN/COMMIT are dropped: the whole run is wrapped in one transaction by the
 * caller, and a nested COMMIT would end it early — committing exactly what this
 * script exists to avoid committing.
 */
function statements(file) {
  return readFileSync(resolve(MIGRATION_DIR, file), "utf8")
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean)
    .filter((s) => !/^(BEGIN|COMMIT)$/i.test(s));
}

const prisma = new PrismaClient();

/** Column names of a table, or null when the table is absent. */
async function columnsOf(tx, table) {
  const rows = await tx.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1`,
    table
  );
  return rows.length ? rows.map((r) => r.column_name).sort() : null;
}

async function counts(tx) {
  const [docs] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "SourceDocument"`);
  const [topics] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "Topic"`);
  const [cards] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "Card"`);
  const [progress] = await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "CardProgress"`);
  return { docs: docs.n, topics: topics.n, cards: cards.n, progress: progress.n };
}

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  await prisma.$transaction(
    async (tx) => {
      console.log("\nBefore:");
      const before = await counts(tx);
      console.log(" ", JSON.stringify(before));

      console.log("\nApplying migration.sql:");
      for (const sql of statements("migration.sql")) {
        await tx.$executeRawUnsafe(sql);
      }

      const afterCols = await columnsOf(tx, "SourceDocument");
      check("externalId replaces notionPageId", afterCols.includes("externalId") && !afterCols.includes("notionPageId"));
      check("progress columns added", ["sectionsDone", "sectionsTotal", "status", "revisionId"].every((c) => afterCols.includes(c)));
      check("DriveConnection created", (await columnsOf(tx, "DriveConnection")) !== null);
      check("NotionConnection dropped", (await columnsOf(tx, "NotionConnection")) === null);

      const afterUp = await counts(tx);
      check(
        "no study data lost going up",
        afterUp.topics === before.topics &&
          afterUp.cards === before.cards &&
          afterUp.progress === before.progress,
        JSON.stringify(afterUp)
      );

      console.log("\nApplying down.sql:");
      for (const sql of statements("down.sql")) {
        await tx.$executeRawUnsafe(sql);
      }

      const backCols = await columnsOf(tx, "SourceDocument");
      check("notionPageId restored", backCols.includes("notionPageId") && !backCols.includes("externalId"));
      check("DriveConnection removed", (await columnsOf(tx, "DriveConnection")) === null);
      check("NotionConnection restored", (await columnsOf(tx, "NotionConnection")) !== null);

      const afterDown = await counts(tx);
      check(
        "no study data lost coming back",
        afterDown.topics === before.topics &&
          afterDown.cards === before.cards &&
          afterDown.progress === before.progress,
        JSON.stringify(afterDown)
      );

      // Nothing above is kept: this is a rehearsal, not the performance.
      throw new Error("__ROLLBACK__");
    },
    { timeout: 120_000 }
  );
} catch (err) {
  if (!String(err.message).includes("__ROLLBACK__")) {
    console.error("\nVerification failed to run:", err.message.slice(0, 400));
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}

if (process.exitCode !== 1) {
  const failed = checks.filter((c) => !c.ok);
  console.log(
    `\n${checks.length - failed.length}/${checks.length} checks passed. ` +
      `Transaction rolled back — the database is unchanged.`
  );
  if (failed.length) process.exitCode = 1;
}
