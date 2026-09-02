/**
 * Full database backup to a restorable SQL file.
 *
 * Written to run through Prisma rather than pg_dump, so it needs no Postgres
 * client tooling installed — the machine that can run the app can always take
 * a backup, which is the point of having one.
 *
 * The output is plain INSERT statements wrapped in a transaction, so restoring
 * is `psql < file` or pasting into any SQL console. Rows are dumped in
 * dependency order and restored inside one transaction, so a failure part-way
 * leaves the database untouched rather than half-restored.
 *
 * Usage (from the repository root):
 *     node scripts/backup_db.mjs                 # writes backups/<timestamp>.sql
 *     node scripts/backup_db.mjs my-backup.sql
 */

import { createRequire } from "module";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

const WEB_DIR = resolve(process.cwd(), "web");

// The Prisma client is installed under web/, not here, and Node resolves
// imports relative to this file. Requiring it through web/package.json keeps
// the script runnable from the repository root.
const require = createRequire(resolve(WEB_DIR, "package.json"));
const { PrismaClient } = require("@prisma/client");

/**
 * Reads DATABASE_URL out of web/.env when it isn't already in the environment.
 *
 * Parsed here rather than pulled in as a dependency: a backup script should
 * have as few reasons to fail as possible, and this is the one variable it
 * needs. An existing environment value always wins, so pointing the script at
 * another database is just `DATABASE_URL=... node scripts/backup_db.mjs`.
 */
function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return;

  let env;
  try {
    env = readFileSync(resolve(WEB_DIR, ".env"), "utf8");
  } catch {
    throw new Error("DATABASE_URL is not set and web/.env could not be read.");
  }

  const match = env.match(/^\s*DATABASE_URL\s*=\s*(.+)$/m);
  if (!match) throw new Error("DATABASE_URL not found in web/.env.");

  process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "");
}

loadDatabaseUrl();

// Parents before children: a restore inserts in this order, so every foreign
// key already points at a row that exists.
const TABLES = [
  "User",
  "Account",
  "Session",
  "VerificationToken",
  "PasswordResetToken",
  "SourceDocument",
  "NotionConnection",
  "DriveConnection",
  "Topic",
  "Card",
  "CardProgress",
  "Attempt",
  "TutorSession",
  "TutorMessage",
  "_prisma_migrations",
];

/** Renders one value as a SQL literal, preserving type and NULLs. */
function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString()}'::timestamptz`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString("hex")}'::bytea`;

  if (Array.isArray(value)) {
    // Postgres array literal; each element quoted the same way as a scalar.
    return `ARRAY[${value.map(literal).join(",")}]`;
  }

  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }

  // Single quotes are doubled; backslashes are left alone because the string
  // is not written as an E'' escape literal.
  return `'${String(value).replace(/'/g, "''")}'`;
}

const prisma = new PrismaClient();

try {
  const out = [];
  const now = new Date().toISOString();

  out.push(`-- Flashcard database backup`);
  out.push(`-- Taken: ${now}`);
  out.push(`--`);
  out.push(`-- Restore with:  psql "$DATABASE_URL" -f <this file>`);
  out.push(`--`);
  out.push(`-- This DELETEs existing rows in the tables it restores, so it returns`);
  out.push(`-- the database to exactly this snapshot rather than merging into it.`);
  out.push(`-- It runs in one transaction: a failure rolls the whole thing back.`);
  out.push(``);
  out.push(`BEGIN;`);
  out.push(``);

  const counts = {};
  const present = [];

  for (const table of TABLES) {
    let rows;
    try {
      rows = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}"`);
    } catch {
      // A table absent from this schema version is not an error: the same
      // script has to work before and after a migration.
      continue;
    }
    present.push(table);
    counts[table] = rows.length;
    if (rows.length === 0) continue;

    const columns = Object.keys(rows[0]);
    out.push(`-- ${table} (${rows.length} rows)`);
    for (const row of rows) {
      const values = columns.map((c) => literal(row[c])).join(", ");
      out.push(
        `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values});`
      );
    }
    out.push(``);
  }

  // Children first, so deletes never trip a foreign key.
  const deletes = [...present].reverse().map((t) => `DELETE FROM "${t}";`);
  const beginAt = out.indexOf(`BEGIN;`) + 1;
  out.splice(
    beginAt,
    0,
    ``,
    `-- Clear before restoring, so the result is this snapshot exactly.`,
    ...deletes,
    ``
  );

  out.push(`COMMIT;`);
  out.push(``);

  const target = resolve(
    process.argv[2] ?? `backups/${now.replace(/[:.]/g, "-")}.sql`
  );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, out.join("\n"), "utf8");

  console.log(`Backup written: ${target}`);
  for (const table of present) {
    if (counts[table] > 0) console.log(`  ${table}: ${counts[table]}`);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`  ${total} rows total`);
} finally {
  await prisma.$disconnect();
}
