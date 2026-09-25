# Free Demo Limits, Premium Trial Requests & Admin Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give free accounts a small allowance (1 document, 30 graded answers and 10 tutor replies a day), let anyone upload a file from their computer, let users request a premium trial through a form, notify the owner by Telegram and email, and give the owner an admin dashboard to approve requests and read demand analytics.

**Architecture:** Limits are pure functions in `web/lib/plans.ts`. Usage is counted from rows the app already writes (`Attempt`, `TutorMessage`, `SourceDocument`), with no counter table. Import is split into sourcing (Drive or upload) and shared processing in `web/lib/import.ts`. Premium state is a single `User.premiumUntil` date. Requests live in a new `PremiumRequest` table. Admin access comes from an `ADMIN_EMAILS` env var, checked server-side.

**Tech Stack:** Next.js 14 (app router), TypeScript, Prisma 5 / Postgres (Neon), NextAuth 4 (JWT), vitest, Tailwind. New deps: `read-excel-file` 9 (`readSheet` from `read-excel-file/node`), `mammoth`, `papaparse`.

**Spec:** `docs/superpowers/specs/2026-09-25-premium-trial-design.md`

## Global Constraints

- Free: 1 document total, 30 graded answers/day, 10 tutor replies/day. Premium: 10 / 200 / 50. Admins: no limits.
- "Per day" resets at midnight in the **user's own time zone** (`User.timeZone`, IANA), falling back to Europe/Berlin when unknown or invalid. See "Amendment" at the end of this plan.
- Trial lengths offered: 7, 14, 30 days. Activating sets `premiumUntil = max(now, premiumUntil) + days`. Expiry is only the date passing; no scheduled job.
- Uploads: `.xlsx`, `.csv`, `.docx`, `.txt`, `.md`, at most 2 MB. The file is never stored, only its extracted text.
- The starter deck is not a document. Re-importing an owned document, or continuing an unfinished one, is always allowed.
- Limit responses: `429 { error: "limit_reached", kind: "graded" | "tutor", limit, plan }` and `403 { error: "limit_reached", kind: "documents", limit, plan }`.
- Request form: goal ∈ EXAM, WORK, IMMIGRATION, STUDY, PERSONAL, OTHER; level ∈ A1, A2, B1, B2, C1, C2, UNKNOWN; willingToPay ∈ NOTHING, UNDER_5, FROM_5_TO_10, OVER_10; contact optional ≤ 100 chars; message optional ≤ 1000 chars. At most one PENDING request per user.
- Notifications: Telegram and email are sent independently. A failure never fails the user's request.
- `/admin`: non-admins are **silently redirected to `/dashboard`**, with no error page. The nav link is rendered only for admins. Admin APIs return 404 to everyone else.
- User-facing strings are added to `web/lib/i18n.ts` in English and German. The admin dashboard is English-only (one reader).
- Everything stays on free tiers. Model output caps are unchanged.
- The app's name is spelled **Flashcard**.
- npm on this machine has a broken cache path (`E:\npm-cache`). Always pass `--cache "$TMPDIR/npm-cache"` to `npm install`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

Most likely first:

1. **Premium ending exactly now.** When `premiumUntil === now`, the user must be free, not premium, and every request must re-read entitlement. Pinned in Task 1 (`planFor` boundary test).
2. **Messy `ADMIN_EMAILS`.** Values with spaces or mixed case, such as `" Zhmosayebi@Gmail.com , "`, must still match, and an empty value must match no one. Pinned in Task 1.
3. **Midnight and DST days in the user's zone.** 23:30 UTC in summer is already "tomorrow" in Berlin, and a bogus zone string must fall back rather than throw. Pinned in Task 1 and Task 11.
4. **A spreadsheet with blank rows or a UTF-8 BOM.** The BOM must be stripped and blank rows dropped. A sheet of only blanks becomes "This spreadsheet is empty". Pinned in Task 4.
5. **Telegram down or Resend unconfigured.** The request is still saved, and the other channel is still tried. Pinned in Task 6.

---

## File map

| File | Responsibility |
|---|---|
| `web/lib/plans.ts` (new) | Plan limits, premium/day/admin pure logic |
| `web/lib/entitlements.ts` (new) | DB-backed usage + limit HTTP response |
| `web/lib/file-parsers.ts` (new) | Upload parsing: xlsx, csv, docx, txt, md |
| `web/lib/premium.ts` (new) | Request enums, labels, input validation |
| `web/lib/notify.ts` (new) | Telegram + admin email fan-out |
| `web/lib/analytics.ts` (new) | Pure aggregations for the admin dashboard |
| `web/lib/admin.ts` (new) | Server-side admin check |
| `web/lib/import.ts` | Split into sourcing + processing; document limit; continue |
| `web/lib/google-drive.ts` | Drive `.xlsx` parsed locally |
| `web/lib/mail.ts` | Premium-activated email |
| `web/lib/auth.ts`, `web/types/next-auth.d.ts` | `isAdmin` on the session |
| `web/prisma/schema.prisma` + migration | `premiumUntil`, `UPLOAD`, `PremiumRequest` |
| `web/app/api/me/plan/route.ts` (new) | Plan + usage for the UI |
| `web/app/api/me/upload/route.ts` (new) | Upload import |
| `web/app/api/me/documents/[id]/continue/route.ts` (new) | Continue any import |
| `web/app/api/premium/request/route.ts` (new) | User request form API |
| `web/app/api/admin/overview/route.ts` (new) | Dashboard data |
| `web/app/api/admin/requests/[id]/route.ts` (new) | Approve / reject |
| `web/app/api/admin/users/[id]/route.ts` (new) | Extend / revoke |
| `web/app/premium/page.tsx`, `web/app/admin/page.tsx` (new) | Pages |
| `web/components/usePlan.ts`, `UpgradePrompt.tsx`, `UsageMeter.tsx`, `PlanCard.tsx`, `UploadPanel.tsx`, `PremiumRequestForm.tsx`, `AdminDashboard.tsx` (new) | UI |
| `web/components/ReviewSession.tsx`, `TutorChat.tsx`, `DriveConnect.tsx`, `SettingsPanel.tsx`, `NavBar.tsx` | Integration |
| `scripts/verify_migration.mjs` | Rehearse any migration by name |

---

### Task 1: Plan rules (pure)

**Files:**
- Create: `web/lib/plans.ts`
- Test: `web/lib/plans.test.ts`

**Interfaces:**
- Produces:
  - `PlanName = "free" | "premium"`
  - `LimitKind = "graded" | "tutor" | "documents"`
  - `PlanLimits { documents; gradedPerDay; tutorPerDay }` (numbers)
  - `PLAN_LIMITS`
  - `TRIAL_DAY_OPTIONS = [7, 14, 30]`, `isTrialDays(v): v is TrialDays`
  - `planFor(premiumUntil: Date | null, now?): PlanName`
  - `extendPremium(current: Date | null, days: number, now?): Date`
  - `startOfDay(now?, timeZone?): Date`
  - `dayKey(date, timeZone?): string` (`YYYY-MM-DD`)
  - `parseAdminEmails(raw?: string): string[]`, `isAdminEmail(email?: string | null, raw?: string): boolean`
  - `limitFor(limits, kind): number`
  - `atLimit(state: { admin: boolean; limits: PlanLimits; usage: Record<LimitKind, number> }, kind): boolean`

- [ ] **Step 1: Write the failing test** — `web/lib/plans.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  PLAN_LIMITS,
  atLimit,
  dayKey,
  extendPremium,
  isAdminEmail,
  isTrialDays,
  limitFor,
  parseAdminEmails,
  planFor,
  startOfDay,
} from "@/lib/plans";

const at = (iso: string) => new Date(iso);

describe("planFor", () => {
  const now = at("2026-09-26T12:00:00Z");
  it("is free without a premium date", () => expect(planFor(null, now)).toBe("free"));
  it("is premium before the end date", () =>
    expect(planFor(at("2026-09-27T00:00:00Z"), now)).toBe("premium"));
  it("is free once the end date is reached", () => expect(planFor(now, now)).toBe("free"));
  it("is free after the end date", () => expect(planFor(at("2026-09-01T00:00:00Z"), now)).toBe("free"));
});

describe("extendPremium", () => {
  const now = at("2026-09-26T12:00:00Z");
  const DAY = 86_400_000;
  it("starts from now when not premium", () =>
    expect(extendPremium(null, 7, now).getTime()).toBe(now.getTime() + 7 * DAY));
  it("starts from now when premium already ended", () =>
    expect(extendPremium(at("2026-09-01T00:00:00Z"), 14, now).getTime()).toBe(now.getTime() + 14 * DAY));
  it("adds to an active premium", () => {
    const until = at("2026-10-01T00:00:00Z");
    expect(extendPremium(until, 30, now).getTime()).toBe(until.getTime() + 30 * DAY);
  });
});

describe("isTrialDays", () => {
  it("accepts 7, 14 and 30 only", () => {
    expect([7, 14, 30].every(isTrialDays)).toBe(true);
    expect([0, 1, 31, "7", null].some(isTrialDays)).toBe(false);
  });
});

describe("startOfDay (Europe/Berlin)", () => {
  it("summer: midnight is 22:00 UTC the day before", () =>
    expect(startOfDay(at("2026-07-01T10:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z"));
  it("summer: 23:30 UTC is already the next Berlin day", () =>
    expect(startOfDay(at("2026-06-30T23:30:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z"));
  it("winter: midnight is 23:00 UTC the day before", () =>
    expect(startOfDay(at("2026-01-15T08:00:00Z")).toISOString()).toBe("2026-01-14T23:00:00.000Z"));
  it("DST switch day (29 Mar 2026) starts at 23:00 UTC", () =>
    expect(startOfDay(at("2026-03-29T12:00:00Z")).toISOString()).toBe("2026-03-28T23:00:00.000Z"));
});

describe("dayKey", () => {
  it("uses the Berlin calendar date", () => {
    expect(dayKey(at("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(dayKey(at("2026-06-30T21:30:00Z"))).toBe("2026-06-30");
  });
});

describe("admin emails", () => {
  it("parses a messy list", () =>
    expect(parseAdminEmails(" Zhmosayebi@Gmail.com , ,other@x.de ")).toEqual([
      "zhmosayebi@gmail.com",
      "other@x.de",
    ]));
  it("matches case-insensitively", () =>
    expect(isAdminEmail("ZHMOSAYEBI@gmail.com", "zhmosayebi@gmail.com")).toBe(true));
  it("matches no one when unset or empty", () => {
    expect(isAdminEmail("a@b.c", undefined)).toBe(false);
    expect(isAdminEmail("a@b.c", "")).toBe(false);
    expect(isAdminEmail(null, "a@b.c")).toBe(false);
  });
});

describe("limits", () => {
  const usage = { graded: 30, tutor: 9, documents: 1 };
  it("maps kinds to plan limits", () => {
    expect(limitFor(PLAN_LIMITS.free, "graded")).toBe(30);
    expect(limitFor(PLAN_LIMITS.free, "tutor")).toBe(10);
    expect(limitFor(PLAN_LIMITS.premium, "documents")).toBe(10);
  });
  it("is at the limit when usage reaches it", () => {
    const state = { admin: false, limits: PLAN_LIMITS.free, usage };
    expect(atLimit(state, "graded")).toBe(true);
    expect(atLimit(state, "tutor")).toBe(false);
    expect(atLimit(state, "documents")).toBe(true);
  });
  it("never limits admins", () =>
    expect(atLimit({ admin: true, limits: PLAN_LIMITS.free, usage }, "graded")).toBe(false));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run lib/plans.test.ts`
Expected: FAIL, cannot resolve `@/lib/plans`.

- [ ] **Step 3: Implement** — `web/lib/plans.ts`

```ts
/**
 * Plan rules: what a free or premium account may do, and when "today" starts.
 *
 * Pure functions only, so the rules are unit-tested without a database. Usage
 * is counted elsewhere (lib/entitlements.ts) from rows the app already writes.
 */

export type PlanName = "free" | "premium";
export type LimitKind = "graded" | "tutor" | "documents";

export interface PlanLimits {
  /** Imported documents in total (Drive + upload). The starter deck is not one. */
  documents: number;
  /** Answers graded by the model per day. */
  gradedPerDay: number;
  /** Tutor replies per day. */
  tutorPerDay: number;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: { documents: 1, gradedPerDay: 30, tutorPerDay: 10 },
  premium: { documents: 10, gradedPerDay: 200, tutorPerDay: 50 },
};

/** Trial lengths the admin can grant. */
export const TRIAL_DAY_OPTIONS = [7, 14, 30] as const;
export type TrialDays = (typeof TRIAL_DAY_OPTIONS)[number];

export function isTrialDays(value: unknown): value is TrialDays {
  return typeof value === "number" && (TRIAL_DAY_OPTIONS as readonly number[]).includes(value);
}

/** Daily limits reset at midnight in this zone (the app's audience is in Germany). */
export const PLAN_TIME_ZONE = "Europe/Berlin";

const DAY_MS = 86_400_000;

/** Premium lasts until the end date; reaching it means free again. */
export function planFor(premiumUntil: Date | null, now: Date = new Date()): PlanName {
  return premiumUntil && premiumUntil.getTime() > now.getTime() ? "premium" : "free";
}

/** Extends an active premium, or starts a new one from now. */
export function extendPremium(current: Date | null, days: number, now: Date = new Date()): Date {
  const from = current && current.getTime() > now.getTime() ? current.getTime() : now.getTime();
  return new Date(from + days * DAY_MS);
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** How far the zone's wall clock is ahead of UTC at `date`, in ms. */
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * The instant today began in `timeZone`. The offset is taken at that date's
 * UTC midnight, which is 01:00-02:00 local, before any DST switch (02:00-03:00).
 */
export function startOfDay(now: Date = new Date(), timeZone: string = PLAN_TIME_ZONE): Date {
  const p = zonedParts(now, timeZone);
  const utcMidnight = Date.UTC(p.year, p.month - 1, p.day);
  return new Date(utcMidnight - offsetMs(new Date(utcMidnight), timeZone));
}

/** The calendar date of `date` in `timeZone`, as YYYY-MM-DD. */
export function dayKey(date: Date, timeZone: string = PLAN_TIME_ZONE): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** ADMIN_EMAILS is comma-separated; tolerate spaces, case and empty entries. */
export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(
  email: string | null | undefined,
  raw: string | undefined = process.env.ADMIN_EMAILS
): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).includes(email.trim().toLowerCase());
}

export function limitFor(limits: PlanLimits, kind: LimitKind): number {
  if (kind === "documents") return limits.documents;
  return kind === "graded" ? limits.gradedPerDay : limits.tutorPerDay;
}

export function atLimit(
  state: { admin: boolean; limits: PlanLimits; usage: Record<LimitKind, number> },
  kind: LimitKind
): boolean {
  if (state.admin) return false;
  return state.usage[kind] >= limitFor(state.limits, kind);
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd web && npx vitest run lib/plans.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/plans.ts web/lib/plans.test.ts
git commit -m "Add plan rules: limits, premium dates, Berlin day, admin emails"
```

---

### Task 2: Schema and migration

**Files:**
- Modify: `web/prisma/schema.prisma`
- Create: `web/prisma/migrations/20260926000000_premium_trial/migration.sql`, `down.sql`
- Modify: `scripts/verify_migration.mjs` (take a migration name; add checks for this one)

**Interfaces:**
- Produces (Prisma):
  - `User.premiumUntil: Date | null`
  - `SourceProvider` gains `"UPLOAD"`
  - `PremiumRequest { id, userId, goal: LearningGoal, level: GermanLevel, willingToPay: PayWillingness, contact: string | null, message: string | null, status: PremiumRequestStatus, grantedDays: number | null, createdAt, decidedAt: Date | null }`
  - `User.premiumRequests`

- [ ] **Step 1: Edit the schema.** In `web/prisma/schema.prisma`:

In `model User`, after `deckProvisionedAt DateTime?`, add:

```prisma
  // Premium lasts until this instant; null or past means the free plan.
  // Nothing needs to run at expiry — the date passing is the expiry.
  premiumUntil DateTime?
```

and in its relation list add `premiumRequests  PremiumRequest[]`.

Replace the `SourceProvider` enum:

```prisma
// Where a document came from. NOTION is retained only so documents imported
// before the move to Drive keep their provenance; nothing creates new ones.
// UPLOAD is a file sent from the learner's computer; its externalId is the
// SHA-256 of the bytes, so the same file always maps to the same document.
enum SourceProvider {
  GOOGLE_DRIVE
  NOTION
  UPLOAD
}
```

Append at the end of the file:

```prisma
// ---------- Premium trial requests ----------

enum PremiumRequestStatus {
  PENDING
  APPROVED
  REJECTED
}

enum LearningGoal {
  EXAM
  WORK
  IMMIGRATION
  STUDY
  PERSONAL
  OTHER
}

enum GermanLevel {
  A1
  A2
  B1
  B2
  C1
  C2
  UNKNOWN
}

// What the learner says they would pay per month, in EUR. Demand research
// for pricing, not a commitment.
enum PayWillingness {
  NOTHING
  UNDER_5
  FROM_5_TO_10
  OVER_10
}

model PremiumRequest {
  id           String               @id @default(cuid())
  userId       String
  goal         LearningGoal
  level        GermanLevel
  willingToPay PayWillingness
  // Telegram handle or phone, optional. Personal data: shown only to admins.
  contact      String?
  message      String?              @db.Text
  status       PremiumRequestStatus @default(PENDING)
  grantedDays  Int?
  createdAt    DateTime             @default(now())
  decidedAt    DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([status, createdAt])
  @@index([userId])
}
```

- [ ] **Step 2: Generate the SQL without touching any database**

```bash
cd web
git show main:web/prisma/schema.prisma > "$TMPDIR/schema-before.prisma"
mkdir -p prisma/migrations/20260926000000_premium_trial
npx prisma migrate diff --from-schema-datamodel "$TMPDIR/schema-before.prisma" \
  --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/20260926000000_premium_trial/migration.sql
cat prisma/migrations/20260926000000_premium_trial/migration.sql
```

Expected: the file contains exactly these operations, in any order Prisma chooses:
- `CREATE TYPE` for `PremiumRequestStatus`, `LearningGoal`, `GermanLevel` and `PayWillingness`
- `ALTER TYPE "SourceProvider" ADD VALUE 'UPLOAD';`
- `ALTER TABLE "User" ADD COLUMN "premiumUntil" TIMESTAMP(3);`
- `CREATE TABLE "PremiumRequest"`, with both indexes and the foreign key `ON DELETE CASCADE`

If anything else appears, stop and investigate: it means the schema drifted. Prepend this header comment to the file:

```sql
-- Free demo limits and premium trial requests.
-- Additive only: new enum values, a nullable column and a new table. No
-- existing row changes, so every current user starts on the free plan.
```

- [ ] **Step 3: Write `down.sql`** — `web/prisma/migrations/20260926000000_premium_trial/down.sql`

```sql
-- Reverse of 20260926000000_premium_trial. Applied by hand:
--     psql "$DATABASE_URL" -f web/prisma/migrations/20260926000000_premium_trial/down.sql
--
--   * PremiumRequest rows are DELETED (the table goes) and premiumUntil is
--     dropped, so everyone is back on the pre-premium behaviour.
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
```

- [ ] **Step 4: Make the rehearsal script take a migration name.** In `scripts/verify_migration.mjs`:

Replace the fixed `MIGRATION_DIR` block with:

```js
// Which migration to rehearse. Defaults to the Drive migration this script was
// written for, so the documented command keeps working.
const MIGRATION = process.argv[2] ?? "20260902000000_drive_import";
const MIGRATION_DIR = resolve(WEB_DIR, "prisma/migrations", MIGRATION);
```

Replace the body between `console.log("\nApplying migration.sql:");` and `// Nothing above is kept` with a dispatch:

```js
      console.log(`\nApplying ${MIGRATION}/migration.sql:`);
      for (const sql of statements("migration.sql")) {
        await tx.$executeRawUnsafe(sql);
      }
      await (CHECKS[MIGRATION]?.up ?? noChecks)(tx);
      const afterUp = await counts(tx);
      check(
        "no study data lost going up",
        afterUp.topics === before.topics && afterUp.cards === before.cards && afterUp.progress === before.progress,
        JSON.stringify(afterUp)
      );

      console.log("\nApplying down.sql:");
      for (const sql of statements("down.sql")) {
        await tx.$executeRawUnsafe(sql);
      }
      await (CHECKS[MIGRATION]?.down ?? noChecks)(tx);
      const afterDown = await counts(tx);
      check(
        "no study data lost coming back",
        afterDown.topics === before.topics && afterDown.cards === before.cards && afterDown.progress === before.progress,
        JSON.stringify(afterDown)
      );
```

Then, above the `try {`, add the per-migration checks. The Drive checks move here unchanged:

```js
const noChecks = async () => check("no schema checks defined for this migration", false);

/** Schema assertions per migration, after the forward and the reverse step. */
const CHECKS = {
  "20260902000000_drive_import": {
    async up(tx) {
      const cols = await columnsOf(tx, "SourceDocument");
      check("externalId replaces notionPageId", cols.includes("externalId") && !cols.includes("notionPageId"));
      check("progress columns added", ["sectionsDone", "sectionsTotal", "status", "revisionId"].every((c) => cols.includes(c)));
      check("DriveConnection created", (await columnsOf(tx, "DriveConnection")) !== null);
      check("NotionConnection dropped", (await columnsOf(tx, "NotionConnection")) === null);
    },
    async down(tx) {
      const cols = await columnsOf(tx, "SourceDocument");
      check("notionPageId restored", cols.includes("notionPageId") && !cols.includes("externalId"));
      check("DriveConnection removed", (await columnsOf(tx, "DriveConnection")) === null);
      check("NotionConnection restored", (await columnsOf(tx, "NotionConnection")) !== null);
    },
  },
  "20260926000000_premium_trial": {
    async up(tx) {
      check("User.premiumUntil added", (await columnsOf(tx, "User")).includes("premiumUntil"));
      check("PremiumRequest created", (await columnsOf(tx, "PremiumRequest")) !== null);
      const [row] = await tx.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'SourceProvider' AND e.enumlabel = 'UPLOAD'`
      );
      check("SourceProvider has UPLOAD", row.n === 1);
    },
    async down(tx) {
      check("User.premiumUntil removed", !(await columnsOf(tx, "User")).includes("premiumUntil"));
      check("PremiumRequest removed", (await columnsOf(tx, "PremiumRequest")) === null);
      const [row] = await tx.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'SourceProvider' AND e.enumlabel = 'UPLOAD'`
      );
      check("SourceProvider back to two values", row.n === 0);
    },
  },
};
```

Also update the usage line in the header comment: `node scripts/verify_migration.mjs [migration_name]`.

- [ ] **Step 5: Regenerate the client and type-check**

Run: `cd web && npx prisma generate && npx tsc --noEmit -p .`
Expected: success (exit 0).

- [ ] **Step 6: Commit**

```bash
git add web/prisma scripts/verify_migration.mjs
git commit -m "Add premiumUntil, UPLOAD source and PremiumRequest to the schema"
```

The migration is **not** applied to any database in this task. See Task 10.

---

### Task 3: Entitlements, plan endpoint, and enforcing daily limits

**Files:**
- Create: `web/lib/entitlements.ts`, `web/app/api/me/plan/route.ts`
- Modify: `web/app/api/review/submit/route.ts`, `web/app/api/tutor/chat/route.ts`

**Interfaces:**
- Consumes (Task 1): `PLAN_LIMITS`, `planFor`, `isAdminEmail`, `startOfDay`, `atLimit`, `limitFor`, `LimitKind`, `PlanLimits`, `PlanName`
- Produces:
  - `Entitlement { plan: PlanName; admin: boolean; premiumUntil: Date | null; limits: PlanLimits; usage: Record<LimitKind, number> }`
  - `getEntitlement(userId: string, now?: Date): Promise<Entitlement>`
  - `limitResponse(ent: Entitlement, kind: LimitKind): NextResponse`
  - `class DocumentLimitError extends Error { entitlement: Entitlement }`
  - `GET /api/me/plan → { plan, admin, premiumUntil, limits, usage, request: { status, createdAt, grantedDays } | null }`

The repo does not unit-test route handlers (see `web/vitest.config.ts`). The pure rules are tested in Task 1, and this task is verified by the type-check and build.

- [ ] **Step 1: Create** `web/lib/entitlements.ts`

```ts
/**
 * What a user may do right now: their plan, and today's usage counted from
 * rows the app already writes. A model call that fails writes no row, so a
 * failed request never costs the learner any of their allowance.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  PLAN_LIMITS,
  isAdminEmail,
  limitFor,
  planFor,
  startOfDay,
  type LimitKind,
  type PlanLimits,
  type PlanName,
} from "@/lib/plans";

export interface Entitlement {
  plan: PlanName;
  admin: boolean;
  premiumUntil: Date | null;
  limits: PlanLimits;
  usage: Record<LimitKind, number>;
}

export async function getEntitlement(userId: string, now: Date = new Date()): Promise<Entitlement> {
  const dayStart = startOfDay(now);

  const [user, graded, tutor, documents] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, premiumUntil: true } }),
    prisma.attempt.count({ where: { userId, createdAt: { gte: dayStart } } }),
    // Every tutor model call writes exactly one ASSISTANT message.
    prisma.tutorMessage.count({
      where: { role: "ASSISTANT", createdAt: { gte: dayStart }, session: { userId } },
    }),
    prisma.sourceDocument.count({ where: { ownerId: userId } }),
  ]);

  const premiumUntil = user?.premiumUntil ?? null;
  const plan = planFor(premiumUntil, now);

  return {
    plan,
    admin: isAdminEmail(user?.email),
    premiumUntil,
    limits: PLAN_LIMITS[plan],
    usage: { graded, tutor, documents },
  };
}

/** The response every limited endpoint returns, so the UI handles one shape. */
export function limitResponse(ent: Entitlement, kind: LimitKind) {
  return NextResponse.json(
    { error: "limit_reached", kind, limit: limitFor(ent.limits, kind), plan: ent.plan },
    { status: kind === "documents" ? 403 : 429 }
  );
}

/** Thrown by the import pipeline when a new document would exceed the plan. */
export class DocumentLimitError extends Error {
  constructor(public readonly entitlement: Entitlement) {
    super("document_limit");
  }
}
```

- [ ] **Step 2: Create** `web/app/api/me/plan/route.ts`

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { getEntitlement } from "@/lib/entitlements";

/** GET /api/me/plan — plan, limits and today's usage, for meters and prompts. */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [ent, request] = await Promise.all([
    getEntitlement(userId),
    prisma.premiumRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, createdAt: true, grantedDays: true },
    }),
  ]);

  return NextResponse.json({
    plan: ent.plan,
    admin: ent.admin,
    premiumUntil: ent.premiumUntil,
    limits: ent.limits,
    usage: ent.usage,
    request,
  });
}
```

- [ ] **Step 3: Enforce in review submit.** In `web/app/api/review/submit/route.ts`:
  - Add `import { getEntitlement, limitResponse } from "@/lib/entitlements";` and `import { atLimit } from "@/lib/plans";`.
  - Insert this right after the `if (!card) return ... 404` line:

```ts
  // Checked before the model call: the cap exists to protect the shared
  // free model quota, so a request over it must not reach the model at all.
  const entitlement = await getEntitlement(userId);
  if (atLimit(entitlement, "graded")) return limitResponse(entitlement, "graded");
```

- [ ] **Step 4: Enforce in tutor chat.** In `web/app/api/tutor/chat/route.ts`, add the same two imports and insert this right after the `if (!topic) return ... 404` line:

```ts
  // The opening turn is a model call too, so it counts like any other reply.
  const entitlement = await getEntitlement(userId);
  if (atLimit(entitlement, "tutor")) return limitResponse(entitlement, "tutor");
```

- [ ] **Step 5: Verify**

Run: `cd web && npx tsc --noEmit -p . && npm run lint && npx vitest run`
Expected: tsc exit 0, "No ESLint warnings or errors", all tests pass.

- [ ] **Step 6: Commit**

```bash
git add web/lib/entitlements.ts web/app/api/me/plan web/app/api/review/submit/route.ts web/app/api/tutor/chat/route.ts
git commit -m "Enforce daily graded-answer and tutor limits; expose plan usage"
```

---

### Task 4: File parsers for uploads

**Files:**
- Create: `web/lib/file-parsers.ts`, `web/lib/file-parsers.test.ts`
- Create: `scripts/make_upload_fixtures.py`, `web/lib/__fixtures__/vocab.xlsx`, `web/lib/__fixtures__/notes.docx`
- Modify: `web/package.json` (dependencies)

**Interfaces:**
- Produces:
  - `MAX_UPLOAD_BYTES = 2 * 1024 * 1024`
  - `ImportContent = { kind: "rows"; rows: string[][] } | { kind: "text"; text: string }`
  - `class UploadError extends Error { status: 400 | 422 }`
  - `uploadExtension(fileName): ".xlsx" | ".csv" | ".docx" | ".txt" | ".md" | null`, `mimeForUpload(fileName): string`
  - `parseXlsx(bytes: Buffer): Promise<string[][]>`, `parseCsv(text: string): string[][]`
  - `htmlToText(html: string): string`, `docxToText(bytes: Buffer): Promise<string>`
  - `parseUpload(fileName: string, bytes: Buffer): Promise<ImportContent>`
  - `sha256Hex(bytes: Buffer): string`

- [ ] **Step 1: Install dependencies**

```bash
cd web
npm install read-excel-file@^9.3.10 mammoth@^1.12.3 papaparse@^5.7.0 --cache "$TMPDIR/npm-cache"
npm install -D @types/papaparse@^5.5.2 --cache "$TMPDIR/npm-cache"
```

- [ ] **Step 2: Create the fixture generator** — `scripts/make_upload_fixtures.py`

```python
"""Writes the binary test fixtures for web/lib/file-parsers.test.ts.

Run once (fixtures are committed):
    pip install openpyxl python-docx
    python scripts/make_upload_fixtures.py
"""

from pathlib import Path

from docx import Document
from openpyxl import Workbook

OUT = Path(__file__).resolve().parent.parent / "web" / "lib" / "__fixtures__"
OUT.mkdir(parents=True, exist_ok=True)

wb = Workbook()
ws = wb.active
ws.append(["Deutsch", "English"])
ws.append(["der Hund", "the dog"])
ws.append([None, None])  # a blank row the parser must drop
ws.append(["die Katze", "the cat"])
ws.append(["Anzahl", 3])  # a number cell the parser must stringify
wb.save(OUT / "vocab.xlsx")

doc = Document()
doc.add_heading("Dativ", level=1)
doc.add_paragraph("Ich helfe dem Mann & der Frau.")
doc.add_heading("Akkusativ", level=2)
doc.add_paragraph("Ich sehe den Mann.")
doc.save(OUT / "notes.docx")

print(f"Wrote fixtures to {OUT}")
```

Run: `pip install openpyxl python-docx && python scripts/make_upload_fixtures.py`. If pip can't install globally, use the repo's `.venv`: `.venv/Scripts/python -m pip install ...`.
Expected: `Wrote fixtures to .../web/lib/__fixtures__`.

- [ ] **Step 3: Write the failing test** — `web/lib/file-parsers.test.ts`

```ts
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  UploadError,
  htmlToText,
  mimeForUpload,
  parseCsv,
  parseUpload,
  sha256Hex,
  uploadExtension,
} from "@/lib/file-parsers";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe("uploadExtension", () => {
  it("recognises supported types case-insensitively", () => {
    expect(uploadExtension("Vokabeln.XLSX")).toBe(".xlsx");
    expect(uploadExtension("notes.md")).toBe(".md");
    expect(uploadExtension("scan.pdf")).toBeNull();
    expect(uploadExtension("noextension")).toBeNull();
  });
  it("maps to a mime type", () => expect(mimeForUpload("a.csv")).toBe("text/csv"));
});

describe("parseCsv", () => {
  it("strips a BOM, keeps quoted commas, drops blank lines", () => {
    const csv = '\uFEFFDeutsch,English\n"der Hund, groß",the big dog\n\n , \ndie Katze,the cat\n';
    expect(parseCsv(csv)).toEqual([
      ["Deutsch", "English"],
      ["der Hund, groß", "the big dog"],
      ["die Katze", "the cat"],
    ]);
  });
  it("returns no rows for a blank file", () => expect(parseCsv("\n , \n")).toEqual([]));
});

describe("htmlToText", () => {
  it("turns headings into markdown and decodes entities", () => {
    const html = "<h1>Dativ</h1><p>mit &amp; nach</p><h2>Liste</h2><ul><li>eins</li><li>zwei</li></ul>";
    expect(htmlToText(html)).toBe("# Dativ\n\nmit & nach\n\n## Liste\n\n- eins\n- zwei");
  });
});

describe("parseUpload", () => {
  it("reads an xlsx as rows, dropping blank rows and stringifying numbers", async () => {
    const out = await parseUpload("vocab.xlsx", fixture("vocab.xlsx"));
    expect(out).toEqual({
      kind: "rows",
      rows: [
        ["Deutsch", "English"],
        ["der Hund", "the dog"],
        ["die Katze", "the cat"],
        ["Anzahl", "3"],
      ],
    });
  });

  it("reads a docx as text with headings preserved", async () => {
    const out = await parseUpload("notes.docx", fixture("notes.docx"));
    expect(out.kind).toBe("text");
    const text = out.kind === "text" ? out.text : "";
    expect(text).toContain("# Dativ");
    expect(text).toContain("## Akkusativ");
    expect(text).toContain("Ich helfe dem Mann & der Frau.");
  });

  it("reads txt and md as text", async () => {
    const out = await parseUpload("n.md", Buffer.from("\uFEFF# Titel\n\nText"));
    expect(out).toEqual({ kind: "text", text: "# Titel\n\nText" });
  });

  it("rejects unsupported types with 400", async () => {
    await expect(parseUpload("scan.pdf", Buffer.from("x"))).rejects.toMatchObject({ status: 400 });
  });

  it("rejects files over 2 MB with 400", async () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    await expect(parseUpload("big.txt", big)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a corrupt xlsx with 422", async () => {
    const err = await parseUpload("bad.xlsx", Buffer.from("not a zip")).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(err.status).toBe(422);
  });
});

describe("sha256Hex", () => {
  it("hashes bytes", () =>
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    ));
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `cd web && npx vitest run lib/file-parsers.test.ts`
Expected: FAIL, cannot resolve `@/lib/file-parsers`.

- [ ] **Step 5: Implement** — `web/lib/file-parsers.ts`

```ts
/**
 * Reads files uploaded from the learner's computer into the two shapes the
 * import pipeline understands: rows (spreadsheets) or text (notes).
 *
 * Nothing here touches the database or the network, so every format is
 * unit-tested. The uploaded bytes are discarded after parsing.
 */

import { createHash } from "crypto";
import mammoth from "mammoth";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export type ImportContent = { kind: "rows"; rows: string[][] } | { kind: "text"; text: string };

const UPLOAD_MIME = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
} as const;

export type UploadExtension = keyof typeof UPLOAD_MIME;

/** A problem with the file itself, reported to the learner as-is. */
export class UploadError extends Error {
  constructor(message: string, public readonly status: 400 | 422) {
    super(message);
  }
}

export function uploadExtension(fileName: string): UploadExtension | null {
  const match = /\.[^.]+$/.exec(fileName.toLowerCase());
  const ext = match?.[0];
  return ext && ext in UPLOAD_MIME ? (ext as UploadExtension) : null;
}

export function mimeForUpload(fileName: string): string {
  const ext = uploadExtension(fileName);
  return ext ? UPLOAD_MIME[ext] : "application/octet-stream";
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeText(bytes: Buffer): string {
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function cellToString(cell: unknown): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return String(cell).trim();
}

/** Drops rows with no content, so a sheet of blanks reads as empty. */
function nonBlankRows(rows: string[][]): string[][] {
  return rows.filter((row) => row.some((cell) => cell !== ""));
}

/** First sheet only, the same rule as Google Sheets imports. */
export async function parseXlsx(bytes: Buffer): Promise<string[][]> {
  const rows = (await readSheet(bytes)) as unknown[][];
  return nonBlankRows(rows.map((row) => row.map(cellToString)));
}

export function parseCsv(text: string): string[][] {
  const { data } = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  return nonBlankRows(data.map((row) => row.map((cell) => cellToString(cell))));
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/**
 * Converts mammoth's HTML to markdown-ish text. Headings become `#` lines
 * because the sectioner splits a document on its headings — plain text from
 * a .docx would lose exactly the structure card generation relies on.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) =>
      `\n\n${"#".repeat(Number(level))} ${inner.replace(/<[^>]+>/g, "").trim()}\n\n`
    )
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|ul|ol|table|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function docxToText(bytes: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer: bytes });
  return htmlToText(value);
}

export async function parseUpload(fileName: string, bytes: Buffer): Promise<ImportContent> {
  const ext = uploadExtension(fileName);
  if (!ext) {
    throw new UploadError("Unsupported file type. Use .xlsx, .csv, .docx, .txt or .md.", 400);
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new UploadError("This file is larger than 2 MB.", 400);
  }

  try {
    switch (ext) {
      case ".xlsx":
        return { kind: "rows", rows: await parseXlsx(bytes) };
      case ".csv":
        return { kind: "rows", rows: parseCsv(decodeText(bytes)) };
      case ".docx":
        return { kind: "text", text: await docxToText(bytes) };
      default:
        return { kind: "text", text: decodeText(bytes) };
    }
  } catch (err) {
    console.error(`Could not parse uploaded ${ext}`, err);
    throw new UploadError(`Couldn't read this file. Is it a valid ${ext} file?`, 422);
  }
}
```

If TypeScript reports that `readSheet` has no types or a different signature, check `node_modules/read-excel-file/node/index.d.ts`. The README documents `readSheet(input: Buffer | Stream | path)`, resolving to an array of rows. Adapt the cast only.

- [ ] **Step 6: Run it to see it pass**

Run: `cd web && npx vitest run lib/file-parsers.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/lib/file-parsers.ts web/lib/file-parsers.test.ts web/lib/__fixtures__ scripts/make_upload_fixtures.py web/package.json web/package-lock.json
git commit -m "Parse uploaded xlsx, csv, docx, txt and md files"
```

---

### Task 5: Import pipeline — sources, document limit, uploads, continue

**Files:**
- Modify: `web/lib/import.ts` (full rewrite below), `web/lib/google-drive.ts`, `web/app/api/me/drive/import/route.ts`, `web/app/api/me/drive/route.ts`
- Create: `web/app/api/me/upload/route.ts`, `web/app/api/me/documents/[id]/continue/route.ts`

**Interfaces:**
- Consumes:
  - Task 3: `getEntitlement`, `DocumentLimitError`, `limitResponse`
  - Task 1: `atLimit`
  - Task 4: `ImportContent`, `parseUpload`, `parseXlsx`, `UploadError`, `sha256Hex`, `mimeForUpload`, `MAX_UPLOAD_BYTES`
- Produces:
  - `ImportOutcome` (unchanged shape; `fileId` is the document's externalId)
  - `SourceRef { provider: "GOOGLE_DRIVE" | "UPLOAD"; externalId; revisionId: string | null; title; mimeType; modifiedTime?: string | null }`
  - `importFromSource(userId, ref, load: () => Promise<ImportContent>, deadline?): Promise<ImportOutcome>`
  - `importDocument(userId, fileId, deadline?)` (Drive, unchanged signature)
  - `continueImport(userId, documentId, deadline?): Promise<ImportOutcome | null>`
  - `POST /api/me/upload` (multipart field `file`) → `{ ok: true, result: ImportOutcome }`
  - `POST /api/me/documents/{id}/continue` → `{ ok: true, result: ImportOutcome }`
  - `GET /api/me/drive` documents gain `provider`, with `readOnly = provider !== "GOOGLE_DRIVE"`

- [ ] **Step 1: Rewrite `web/lib/import.ts`**

Keep the module header comment, `IMPORT_TIME_BUDGET_MS`, `MAX_NOTES_CHARS`, `sectionTitle` and `persistCards` exactly as they are. Replace everything else with:

```ts
import { prisma } from "@/lib/prisma";
import { generateCards, type GeneratedCard } from "@/lib/ai";
import {
  MIME,
  fetchDocumentText,
  fetchSpreadsheetRows,
  getFileMetadata,
  isSpreadsheet,
  isSupported,
  unsupportedReason,
} from "@/lib/google-drive";
import { buildCardsFromRows, detectColumns, rowsToMarkdown } from "@/lib/spreadsheet-cards";
import { splitIntoSections, type Section } from "@/lib/sectioner";
import type { ImportContent } from "@/lib/file-parsers";
import { DocumentLimitError, getEntitlement } from "@/lib/entitlements";
import { atLimit } from "@/lib/plans";

// (IMPORT_TIME_BUDGET_MS and MAX_NOTES_CHARS stay here unchanged.)

/** Documents imported as rows; everything else is prose split into sections. */
const ROWS_MIMES: string[] = [MIME.googleSheet, MIME.xlsx, "text/csv"];

export interface ImportOutcome {
  documentId: string;
  /** The document's external id (Drive file id, or upload hash). */
  fileId: string;
  title: string;
  /** "partial": the time budget ran out; continuing picks up where it stopped. */
  status: "unchanged" | "imported" | "partial" | "failed";
  cardsCreated: number;
  sectionsDone: number;
  sectionsTotal: number;
  error?: string;
}

/** Identifies a document independently of where it came from. */
export interface SourceRef {
  provider: "GOOGLE_DRIVE" | "UPLOAD";
  externalId: string;
  /** Changes only when content does. Uploads use the content hash. */
  revisionId: string | null;
  title: string;
  mimeType: string;
  modifiedTime?: string | null;
}

interface SectionProgress {
  cardsCreated: number;
  sectionsDone: number;
  sectionsTotal: number;
  remaining?: boolean;
}

type StoredDocument = NonNullable<Awaited<ReturnType<typeof prisma.sourceDocument.findUnique>>>;

/** An interrupted prose import of the same revision can pick up from its stored text. */
function resumePoint(doc: StoredDocument | null, revisionId: string | null) {
  if (
    doc &&
    (doc.status === "IMPORTING" || doc.status === "PENDING") &&
    doc.revisionId != null &&
    doc.revisionId === revisionId &&
    !ROWS_MIMES.includes(doc.mimeType ?? "") &&
    doc.rawMarkdown.length > 0 &&
    doc.sectionsTotal > 0 &&
    doc.sectionsDone < doc.sectionsTotal
  ) {
    return { text: doc.rawMarkdown, from: doc.sectionsDone };
  }
  return undefined;
}

/** Imports one Drive document. See importFromSource for the guarantees. */
export async function importDocument(
  userId: string,
  fileId: string,
  deadline: number = Date.now() + IMPORT_TIME_BUDGET_MS
): Promise<ImportOutcome> {
  const meta = await getFileMetadata(userId, fileId);
  if (!isSupported(meta.mimeType)) {
    throw new Error(unsupportedReason(meta.mimeType));
  }

  return importFromSource(
    userId,
    {
      provider: "GOOGLE_DRIVE",
      externalId: fileId,
      revisionId: meta.revisionId ?? null,
      title: meta.name,
      mimeType: meta.mimeType,
      modifiedTime: meta.modifiedTime,
    },
    async () =>
      isSpreadsheet(meta.mimeType)
        ? { kind: "rows", rows: await fetchSpreadsheetRows(userId, fileId, meta.mimeType) }
        : { kind: "text", text: await fetchDocumentText(userId, fileId, meta.mimeType) },
    deadline
  );
}

/**
 * Imports one document from any source into a user's deck.
 *
 * Safe to call again: unchanged documents are skipped by revision, cards are
 * de-duplicated by prompt, and an interrupted import resumes at the section it
 * reached. A *new* document beyond the plan's allowance throws
 * DocumentLimitError before anything is written; an existing one is always
 * allowed, since re-importing costs the learner no new document.
 */
export async function importFromSource(
  userId: string,
  ref: SourceRef,
  load: () => Promise<ImportContent>,
  deadline: number = Date.now() + IMPORT_TIME_BUDGET_MS
): Promise<ImportOutcome> {
  const key = {
    ownerId_provider_externalId: { ownerId: userId, provider: ref.provider, externalId: ref.externalId },
  };
  const existing = await prisma.sourceDocument.findUnique({ where: key });

  if (!existing) {
    const entitlement = await getEntitlement(userId);
    if (atLimit(entitlement, "documents")) throw new DocumentLimitError(entitlement);
  }

  const unchanged =
    existing?.status === "COMPLETE" && existing.revisionId != null && existing.revisionId === ref.revisionId;

  if (unchanged) {
    return {
      documentId: existing.id,
      fileId: ref.externalId,
      title: existing.title,
      status: "unchanged",
      cardsCreated: 0,
      sectionsDone: existing.sectionsDone,
      sectionsTotal: existing.sectionsTotal,
    };
  }

  const resume = resumePoint(existing, ref.revisionId);

  const doc = await prisma.sourceDocument.upsert({
    where: key,
    create: {
      provider: ref.provider,
      externalId: ref.externalId,
      title: ref.title,
      rawMarkdown: "",
      mimeType: ref.mimeType,
      ownerId: userId,
      status: "IMPORTING",
      // Recorded up front so an interrupted import can tell whether the
      // document changed before resuming. It only marks the document up to
      // date together with status COMPLETE, so a partial import is never skipped.
      revisionId: ref.revisionId,
    },
    update: resume
      ? { status: "IMPORTING", lastError: null }
      : {
          title: ref.title,
          mimeType: ref.mimeType,
          status: "IMPORTING",
          revisionId: ref.revisionId,
          sectionsDone: 0,
          sectionsTotal: 0,
          lastError: null,
        },
  });

  try {
    const outcome = resume
      ? await processText(userId, doc.id, resume.text, ref.title, deadline, resume.from)
      : await processContent(userId, doc.id, await load(), ref.title, deadline);

    const progress = {
      cardsCreated: outcome.cardsCreated,
      sectionsDone: outcome.sectionsDone,
      sectionsTotal: outcome.sectionsTotal,
    };

    if (outcome.remaining) {
      // Out of time, not out of work: leave it resumable for the next call.
      await prisma.sourceDocument.update({ where: { id: doc.id }, data: { status: "PENDING" } });
      return { documentId: doc.id, fileId: ref.externalId, title: ref.title, status: "partial", ...progress };
    }

    await prisma.sourceDocument.update({
      where: { id: doc.id },
      data: {
        status: "COMPLETE",
        revisionId: ref.revisionId,
        lastEditedTime: ref.modifiedTime ? new Date(ref.modifiedTime) : null,
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });

    return { documentId: doc.id, fileId: ref.externalId, title: ref.title, status: "imported", ...progress };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";

    // FAILED is never treated as up to date (that needs COMPLETE), so the next
    // attempt re-imports the document from the start.
    await prisma.sourceDocument.update({
      where: { id: doc.id },
      data: { status: "FAILED", lastError: message },
    });

    return {
      documentId: doc.id,
      fileId: ref.externalId,
      title: ref.title,
      status: "failed",
      cardsCreated: 0,
      sectionsDone: 0,
      sectionsTotal: 0,
      error: message,
    };
  }
}

/**
 * Continues an unfinished import by document id, whatever its source. Drive
 * documents are re-fetched through the normal path (which resumes). Uploads
 * have no source to re-fetch, so only their stored text can be continued.
 * Returns null when the document isn't the user's.
 */
export async function continueImport(
  userId: string,
  documentId: string,
  deadline: number = Date.now() + IMPORT_TIME_BUDGET_MS
): Promise<ImportOutcome | null> {
  const doc = await prisma.sourceDocument.findFirst({ where: { id: documentId, ownerId: userId } });
  if (!doc) return null;

  if (doc.provider === "GOOGLE_DRIVE") return importDocument(userId, doc.externalId, deadline);

  const ref: SourceRef = {
    provider: "UPLOAD",
    externalId: doc.externalId,
    revisionId: doc.revisionId,
    title: doc.title,
    mimeType: doc.mimeType ?? "text/plain",
  };

  if (doc.status !== "COMPLETE" && !resumePoint(doc, doc.revisionId)) {
    throw new Error("This upload can't be continued. Upload the file again.");
  }

  return importFromSource(
    userId,
    ref,
    async () => {
      // Unreachable: a COMPLETE upload returns "unchanged", and a resumable
      // one resumes from stored text without loading.
      throw new Error("Upload the file again.");
    },
    deadline
  );
}

async function processContent(
  userId: string,
  documentId: string,
  content: ImportContent,
  title: string,
  deadline: number
): Promise<SectionProgress> {
  if (content.kind === "rows") return importRows(userId, documentId, content.rows, title);
  return processText(userId, documentId, content.text, title, deadline, 0);
}

/** Prose: split on the learner's headings, generate per section, resumable. */
async function processText(
  userId: string,
  documentId: string,
  text: string,
  title: string,
  deadline: number,
  startFrom: number
): Promise<SectionProgress> {
  if (!text.trim()) {
    throw new Error("This document is empty.");
  }

  const { generable } = splitIntoSections(text, title);

  if (generable.length === 0) {
    throw new Error(
      "Couldn't find anything to make cards from. Documents work best with headings for each topic."
    );
  }

  const startAt = Math.min(startFrom, generable.length);

  if (startAt === 0) {
    await prisma.sourceDocument.update({
      where: { id: documentId },
      data: { rawMarkdown: text, sectionsTotal: generable.length },
    });
  }

  let cardsCreated = 0;
  let sectionsDone = startAt;
  const failures: string[] = [];

  for (const section of generable.slice(startAt)) {
    // Always make some progress per call, then stop once time is up so the
    // request ends cleanly rather than being killed by the platform.
    if (sectionsDone > startAt && Date.now() > deadline) {
      return { cardsCreated, sectionsDone, sectionsTotal: generable.length, remaining: true };
    }

    try {
      const { cards } = await generateCards({
        rawMarkdown: section.body,
        sourceDocumentTitle: sectionTitle(section),
      });
      cardsCreated += await persistCards(userId, documentId, cards);
    } catch (err) {
      // One bad section must not discard the rest of a long document.
      console.error(`Card generation failed for section "${sectionTitle(section)}"`, err);
      failures.push(sectionTitle(section));
    }

    sectionsDone += 1;
    await prisma.sourceDocument.update({ where: { id: documentId }, data: { sectionsDone } });
  }

  // Every section of this run failing means something systemic — an outage or
  // an exhausted quota — not a quirk of the notes.
  if (failures.length > 0 && failures.length === generable.length - startAt) {
    throw new Error("Card generation is unavailable right now. Try again shortly.");
  }

  return { cardsCreated, sectionsDone, sectionsTotal: generable.length };
}

/** Rows: map columns directly, falling back to the model. */
async function importRows(
  userId: string,
  documentId: string,
  rows: string[][],
  title: string
): Promise<SectionProgress> {
  if (rows.length === 0) {
    throw new Error("This spreadsheet is empty.");
  }

  const asText = rowsToMarkdown(rows);
  await prisma.sourceDocument.update({
    where: { id: documentId },
    data: { rawMarkdown: asText, sectionsTotal: 1 },
  });

  const detection = detectColumns(rows);

  // A recognisable vocabulary sheet is already a deck; mapping it directly
  // costs nothing and preserves exactly what the learner wrote.
  const cards: GeneratedCard[] = detection.mappable
    ? buildCardsFromRows(rows, detection, { defaultTopic: title })
    : (
        await generateCards({
          // The AI service caps input size; a huge unmapped sheet is cut
          // rather than rejected outright.
          rawMarkdown: asText.slice(0, MAX_NOTES_CHARS),
          sourceDocumentTitle: title,
        })
      ).cards;

  const cardsCreated = await persistCards(userId, documentId, cards);

  await prisma.sourceDocument.update({ where: { id: documentId }, data: { sectionsDone: 1 } });

  return { cardsCreated, sectionsDone: 1, sectionsTotal: 1 };
}
```

`Section` stays imported for `sectionTitle`. If `buildCardsFromRows` returns a type other than `GeneratedCard[]`, drop the annotation on `cards` (it was un-annotated before).

- [ ] **Step 2: Parse Drive `.xlsx` locally.** In `web/lib/google-drive.ts`:
  - Add `import { parseXlsx } from "@/lib/file-parsers";`.
  - Replace the `if (mimeType === MIME.xlsx) { throw ... }` block in `fetchSpreadsheetRows` with the code below.
  - Update that function's doc comment to say `.xlsx` is downloaded and parsed locally.
  - If `unsupportedReason` or any i18n string mentions converting Excel to Google Sheets, remove that wording.

```ts
  if (mimeType === MIME.xlsx) {
    // Downloaded and parsed here, rather than asking the learner to convert
    // it to Google Sheets (which would duplicate their file in Drive).
    const token = await getAccessToken(userId);
    const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`);
    return parseXlsx(Buffer.from(await res.arrayBuffer()));
  }
```

- [ ] **Step 3: Drive import route — document limit.** In `web/app/api/me/drive/import/route.ts`:
  - Add `import { DocumentLimitError, limitResponse } from "@/lib/entitlements";`.
  - As the **first** statement inside the `catch (err)` of the per-file loop, add:

```ts
      // The plan's document allowance is used up: nothing further can import,
      // so stop and let the client show the upgrade prompt.
      if (err instanceof DocumentLimitError) return limitResponse(err.entitlement, "documents");
```

- [ ] **Step 4: Drive status route — provider.** In `web/app/api/me/drive/route.ts`, keep `provider` in the mapped document and change `readOnly`:

```ts
      // Only Drive documents can be re-fetched. Uploads are continued by id
      // instead, and pre-Drive Notion documents can only be reviewed.
      readOnly: doc.provider !== "GOOGLE_DRIVE",
```

- [ ] **Step 5: Create** `web/app/api/me/upload/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { IMPORT_TIME_BUDGET_MS, importFromSource } from "@/lib/import";
import { MAX_UPLOAD_BYTES, UploadError, mimeForUpload, parseUpload, sha256Hex } from "@/lib/file-parsers";
import { DocumentLimitError, limitResponse } from "@/lib/entitlements";

// Generating cards from a long document is many model calls.
export const maxDuration = 300;

/**
 * POST /api/me/upload — multipart form with one `file`.
 *
 * The file is parsed here and only its text is kept. The content hash is the
 * document's identity, so uploading the same file again re-uses the same
 * document (and never counts as a second one against the plan).
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "upload_invalid", detail: "This file is larger than 2 MB." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  let content;
  try {
    content = await parseUpload(file.name, bytes);
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: "upload_invalid", detail: err.message }, { status: err.status });
    }
    throw err;
  }

  const hash = sha256Hex(bytes);

  try {
    const result = await importFromSource(
      userId,
      {
        provider: "UPLOAD",
        externalId: hash,
        revisionId: hash,
        title: file.name.slice(0, 200),
        mimeType: mimeForUpload(file.name),
      },
      async () => content,
      Date.now() + IMPORT_TIME_BUDGET_MS
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof DocumentLimitError) return limitResponse(err.entitlement, "documents");
    throw err;
  }
}
```

- [ ] **Step 6: Create** `web/app/api/me/documents/[id]/continue/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { IMPORT_TIME_BUDGET_MS, continueImport } from "@/lib/import";
import { DocumentLimitError, limitResponse } from "@/lib/entitlements";
import { isAuthError } from "@/lib/google-drive";

export const maxDuration = 300;

/**
 * POST /api/me/documents/{id}/continue — continue an unfinished import,
 * whether it came from Drive or an upload. Call again while the result's
 * status is "partial".
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await continueImport(userId, params.id, Date.now() + IMPORT_TIME_BUDGET_MS);
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    if (err instanceof DocumentLimitError) return limitResponse(err.entitlement, "documents");
    const message = err instanceof Error ? err.message : "Import failed";
    if (isAuthError(err)) {
      await prisma.driveConnection.updateMany({ where: { userId }, data: { lastError: message } });
      return NextResponse.json({ error: "drive_unauthorized", detail: message }, { status: 403 });
    }
    return NextResponse.json({ error: "continue_failed", detail: message }, { status: 400 });
  }
}
```

- [ ] **Step 7: Verify**

Run: `cd web && npx tsc --noEmit -p . && npm run lint && npx vitest run`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add web/lib/import.ts web/lib/google-drive.ts web/app/api/me
git commit -m "Import from uploads as well as Drive; enforce the document allowance"
```

---

### Task 6: Premium requests and notifications

**Files:**
- Create: `web/lib/premium.ts`, `web/lib/premium.test.ts`, `web/lib/notify.ts`, `web/lib/notify.test.ts`, `web/app/api/premium/request/route.ts`
- Modify: `web/lib/mail.ts`

**Interfaces:**
- Consumes: `parseAdminEmails` (Task 1), `sendMail`, `mailConfigured` (`web/lib/mail.ts`), Prisma `PremiumRequest` (Task 2)
- Produces:
  - `GOALS`, `LEVELS`, `PAY_OPTIONS` (readonly tuples), with types `Goal`, `Level`, `PayOption`
  - `GOAL_LABELS`, `PAY_LABELS` (English, admin-facing)
  - `MAX_CONTACT_CHARS = 100`, `MAX_MESSAGE_CHARS = 1000`
  - `PremiumRequestInput`
  - `validatePremiumRequest(body: unknown): { ok: true; value: PremiumRequestInput } | { ok: false; error: string }`
  - `AdminNotice { subject; text }`
  - `premiumRequestNotice(p): AdminNotice`
  - `sendTelegram(text): Promise<boolean>`
  - `notifyAdmins(notice): Promise<{ telegram: boolean; email: boolean }>`
  - `premiumActivatedEmail(until: Date, appUrl: string): { subject; html; text }`
  - `GET /api/premium/request → { request: {status, createdAt, grantedDays, decidedAt} | null, premiumUntil }`
  - `POST /api/premium/request` → 201 `{ request }`, 409 `{ error: "already_pending" }`, 400 `{ error }`

- [ ] **Step 1: Write the failing tests** — `web/lib/premium.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { MAX_CONTACT_CHARS, MAX_MESSAGE_CHARS, validatePremiumRequest } from "@/lib/premium";

const valid = { goal: "EXAM", level: "B1", willingToPay: "FROM_5_TO_10" };

describe("validatePremiumRequest", () => {
  it("accepts the required fields and trims optional ones", () => {
    expect(validatePremiumRequest({ ...valid, contact: "  @parastoo ", message: " Hallo " })).toEqual({
      ok: true,
      value: { ...valid, contact: "@parastoo", message: "Hallo" },
    });
  });
  it("turns blank optional fields into null", () => {
    expect(validatePremiumRequest({ ...valid, contact: "   ", message: "" })).toEqual({
      ok: true,
      value: { ...valid, contact: null, message: null },
    });
  });
  it("rejects unknown enum values", () => {
    expect(validatePremiumRequest({ ...valid, goal: "FUN" }).ok).toBe(false);
    expect(validatePremiumRequest({ ...valid, level: "D1" }).ok).toBe(false);
    expect(validatePremiumRequest({ ...valid, willingToPay: 5 }).ok).toBe(false);
  });
  it("rejects over-long optional fields", () => {
    expect(validatePremiumRequest({ ...valid, contact: "x".repeat(MAX_CONTACT_CHARS + 1) }).ok).toBe(false);
    expect(validatePremiumRequest({ ...valid, message: "x".repeat(MAX_MESSAGE_CHARS + 1) }).ok).toBe(false);
  });
  it("rejects a non-object body", () => {
    expect(validatePremiumRequest(null).ok).toBe(false);
    expect(validatePremiumRequest("x").ok).toBe(false);
  });
});
```

`web/lib/notify.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyAdmins, premiumRequestNotice } from "@/lib/notify";

const notice = { subject: "New premium request", text: "body" };

describe("notifyAdmins", () => {
  beforeEach(() => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "t");
    vi.stubEnv("TELEGRAM_CHAT_ID", "c");
    vi.stubEnv("RESEND_API_KEY", "r");
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("still emails when Telegram is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("telegram") ? Promise.reject(new Error("down")) : new Response("{}", { status: 200 })
      )
    );
    expect(await notifyAdmins(notice)).toEqual({ telegram: false, email: true });
  });

  it("still sends Telegram when email is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("telegram") ? new Response("{}", { status: 200 }) : new Response("bad", { status: 403 })
      )
    );
    expect(await notifyAdmins(notice)).toEqual({ telegram: true, email: false });
  });

  it("does nothing, and says so, when no channel is configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await notifyAdmins(notice)).toEqual({ telegram: false, email: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("premiumRequestNotice", () => {
  it("includes the answers, contact and admin link", () => {
    const n = premiumRequestNotice({
      name: "Sara",
      email: "sara@example.com",
      goal: "EXAM",
      level: "B1",
      willingToPay: "FROM_5_TO_10",
      contact: "@sara",
      message: null,
      adminUrl: "https://app.example/admin",
    });
    expect(n.subject).toContain("Sara");
    expect(n.text).toContain("sara@example.com");
    expect(n.text).toContain("Exam");
    expect(n.text).toContain("€5–10");
    expect(n.text).toContain("@sara");
    expect(n.text).toContain("https://app.example/admin");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd web && npx vitest run lib/premium.test.ts lib/notify.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement** `web/lib/premium.ts`

```ts
/** The premium request form: allowed answers, labels, and validation. */

export const GOALS = ["EXAM", "WORK", "IMMIGRATION", "STUDY", "PERSONAL", "OTHER"] as const;
export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "UNKNOWN"] as const;
export const PAY_OPTIONS = ["NOTHING", "UNDER_5", "FROM_5_TO_10", "OVER_10"] as const;

export type Goal = (typeof GOALS)[number];
export type Level = (typeof LEVELS)[number];
export type PayOption = (typeof PAY_OPTIONS)[number];

export const MAX_CONTACT_CHARS = 100;
export const MAX_MESSAGE_CHARS = 1000;

/** English labels for the admin dashboard and notifications. */
export const GOAL_LABELS: Record<Goal, string> = {
  EXAM: "Exam (Goethe, telc…)",
  WORK: "Work",
  IMMIGRATION: "Moving to a German-speaking country",
  STUDY: "Study",
  PERSONAL: "Personal interest",
  OTHER: "Other",
};

export const PAY_LABELS: Record<PayOption, string> = {
  NOTHING: "Nothing — only if free",
  UNDER_5: "Under €5/month",
  FROM_5_TO_10: "€5–10/month",
  OVER_10: "Over €10/month",
};

export interface PremiumRequestInput {
  goal: Goal;
  level: Level;
  willingToPay: PayOption;
  contact: string | null;
  message: string | null;
}

export type ValidationResult =
  | { ok: true; value: PremiumRequestInput }
  | { ok: false; error: string };

const oneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? undefined : trimmed;
}

export function validatePremiumRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const b = body as Record<string, unknown>;

  if (!oneOf(GOALS, b.goal)) return { ok: false, error: "invalid_goal" };
  if (!oneOf(LEVELS, b.level)) return { ok: false, error: "invalid_level" };
  if (!oneOf(PAY_OPTIONS, b.willingToPay)) return { ok: false, error: "invalid_pay" };

  const contact = optionalText(b.contact, MAX_CONTACT_CHARS);
  if (contact === undefined) return { ok: false, error: "invalid_contact" };
  const message = optionalText(b.message, MAX_MESSAGE_CHARS);
  if (message === undefined) return { ok: false, error: "invalid_message" };

  return { ok: true, value: { goal: b.goal, level: b.level, willingToPay: b.willingToPay, contact, message } };
}
```

- [ ] **Step 4: Implement** `web/lib/notify.ts`

```ts
/**
 * Tells the admin about things that need a human: new premium requests.
 *
 * Telegram and email are independent channels. Each is tried on its own, a
 * failure in one never stops the other, and nothing here throws — the caller's
 * work (saving a request) has already succeeded and must not be undone by a
 * notification problem. The admin dashboard is the source of truth.
 */

import { mailConfigured, sendMail } from "@/lib/mail";
import { parseAdminEmails } from "@/lib/plans";
import { GOAL_LABELS, PAY_LABELS, type Goal, type Level, type PayOption } from "@/lib/premium";

export interface AdminNotice {
  subject: string;
  text: string;
}

const TIMEOUT_MS = 8_000;

function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegram(text: string): Promise<boolean> {
  if (!telegramConfigured()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Plain text: no parse_mode, so user-typed characters need no escaping.
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[notify] Telegram rejected the message (${res.status})`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify] Could not reach Telegram:", err);
    return false;
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function emailAdmins(notice: AdminNotice): Promise<boolean> {
  const to = parseAdminEmails(process.env.ADMIN_EMAILS);
  // Unconfigured mail would log the body — which holds a user's contact
  // details — to the server console, so skip it rather than fall back.
  if (!mailConfigured() || to.length === 0) return false;
  const html = `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(notice.text)}</pre>`;
  const results = await Promise.all(to.map((address) => sendMail({ to: address, subject: notice.subject, text: notice.text, html })));
  return results.every(Boolean);
}

export async function notifyAdmins(notice: AdminNotice): Promise<{ telegram: boolean; email: boolean }> {
  const [telegram, email] = await Promise.allSettled([
    sendTelegram(`${notice.subject}\n\n${notice.text}`),
    emailAdmins(notice),
  ]);
  return {
    telegram: telegram.status === "fulfilled" && telegram.value,
    email: email.status === "fulfilled" && email.value,
  };
}

export function premiumRequestNotice(p: {
  name: string | null;
  email: string;
  goal: Goal;
  level: Level;
  willingToPay: PayOption;
  contact: string | null;
  message: string | null;
  adminUrl: string;
}): AdminNotice {
  const who = p.name || p.email;
  return {
    subject: `New premium request: ${who}`,
    text: [
      `Name: ${p.name ?? "—"}`,
      `Email: ${p.email}`,
      `Goal: ${GOAL_LABELS[p.goal]}`,
      `Level: ${p.level === "UNKNOWN" ? "Not sure" : p.level}`,
      `Would pay: ${PAY_LABELS[p.willingToPay]}`,
      `Contact: ${p.contact ?? "—"}`,
      p.message ? `Message: ${p.message}` : null,
      "",
      `Review it: ${p.adminUrl}`,
    ]
      .filter((line) => line !== null)
      .join("\n"),
  };
}
```

- [ ] **Step 5: Add the activation email** to `web/lib/mail.ts` (after `passwordResetEmail`)

```ts
/** Sent when the admin activates a premium trial. */
export function premiumActivatedEmail(until: Date, appUrl: string) {
  const date = until.toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "Europe/Berlin" });
  const subject = "Your Flashcard Premium is active";

  const html = layout(
    "Premium is on",
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#57534e;">
       Your premium trial is active until <strong>${date}</strong>: more documents,
       more graded answers and more tutor practice every day.
     </p>
     <a href="${appUrl}"
        style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:12px;">
       Open Flashcard
     </a>`
  );

  const text = `Your Flashcard Premium is active until ${date}.

Open Flashcard: ${appUrl}`;

  return { subject, html, text };
}
```

- [ ] **Step 6: Create** `web/app/api/premium/request/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { validatePremiumRequest } from "@/lib/premium";
import { notifyAdmins, premiumRequestNotice } from "@/lib/notify";

const REQUEST_FIELDS = { status: true, createdAt: true, grantedDays: true, decidedAt: true } as const;

/** GET /api/premium/request — the user's latest request and premium end date. */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [request, user] = await Promise.all([
    prisma.premiumRequest.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: REQUEST_FIELDS }),
    prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } }),
  ]);

  return NextResponse.json({ request, premiumUntil: user?.premiumUntil ?? null });
}

/** POST /api/premium/request — submit the form. One pending request at a time. */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = validatePremiumRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const pending = await prisma.premiumRequest.findFirst({ where: { userId, status: "PENDING" }, select: { id: true } });
  if (pending) return NextResponse.json({ error: "already_pending" }, { status: 409 });

  const [request, user] = await Promise.all([
    prisma.premiumRequest.create({ data: { userId, ...parsed.value }, select: REQUEST_FIELDS }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
  ]);

  // Awaited (a serverless function may freeze once it responds), but its
  // outcome never changes ours: the request is saved either way.
  await notifyAdmins(
    premiumRequestNotice({
      name: user?.name ?? null,
      email: user?.email ?? "(unknown)",
      ...parsed.value,
      adminUrl: `${process.env.NEXTAUTH_URL ?? ""}/admin`,
    })
  );

  return NextResponse.json({ request }, { status: 201 });
}
```

- [ ] **Step 7: Run the tests to see them pass, then type-check**

Run: `cd web && npx vitest run lib/premium.test.ts lib/notify.test.ts && npx tsc --noEmit -p .`
Expected: PASS, and tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add web/lib/premium.ts web/lib/premium.test.ts web/lib/notify.ts web/lib/notify.test.ts web/lib/mail.ts web/app/api/premium
git commit -m "Accept premium trial requests and notify the admin by Telegram and email"
```

---

### Task 7: Admin backend — access, analytics, actions

**Files:**
- Create: `web/lib/admin.ts`, `web/lib/analytics.ts`, `web/lib/analytics.test.ts`, `web/app/api/admin/overview/route.ts`, `web/app/api/admin/requests/[id]/route.ts`, `web/app/api/admin/users/[id]/route.ts`
- Modify: `web/lib/auth.ts`, `web/types/next-auth.d.ts`

**Interfaces:**
- Consumes: Task 1 (`isAdminEmail`, `extendPremium`, `isTrialDays`, `PLAN_LIMITS`, `dayKey`, `parseAdminEmails`), Task 6 (`GOALS`, `LEVELS`, `PAY_OPTIONS`, `premiumActivatedEmail`), `sendMail`, `mailConfigured`
- Produces:
  - `isAdminUser(userId: string | null): Promise<boolean>`, `requireAdminId(): Promise<string | null>`
  - `countBy<T extends string>(values: T[], keys: readonly T[]): Record<T, number>`
  - `latestPerUser<R extends { userId: string; createdAt: Date }>(rows: R[]): R[]`
  - `usersOverDailyCap(rows: { userId: string; createdAt: Date }[], cap: number, exclude: Set<string>): number`
  - `session.user.isAdmin: boolean`
  - `GET /api/admin/overview`
  - `POST /api/admin/requests/{id}` with `{ action: "approve", days } | { action: "reject" }`
  - `POST /api/admin/users/{id}` with `{ action: "extend", days } | { action: "revoke" }`

- [ ] **Step 1: Write the failing test** — `web/lib/analytics.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { countBy, latestPerUser, usersOverDailyCap } from "@/lib/analytics";

describe("countBy", () => {
  it("counts every key, including zeros", () =>
    expect(countBy(["A", "B", "A"], ["A", "B", "C"] as const)).toEqual({ A: 2, B: 1, C: 0 }));
});

describe("latestPerUser", () => {
  it("keeps each user's newest row", () => {
    const rows = [
      { userId: "u1", createdAt: new Date("2026-09-01"), v: 1 },
      { userId: "u1", createdAt: new Date("2026-09-05"), v: 2 },
      { userId: "u2", createdAt: new Date("2026-09-02"), v: 3 },
    ];
    expect(latestPerUser(rows).map((r) => r.v).sort()).toEqual([2, 3]);
  });
});

describe("usersOverDailyCap", () => {
  const t = (iso: string) => new Date(iso);
  it("counts users who reached the cap on some Berlin day", () => {
    const rows = [
      // u1: 2 rows on the same Berlin day (23:30 UTC in summer is the next day)
      { userId: "u1", createdAt: t("2026-06-30T23:30:00Z") },
      { userId: "u1", createdAt: t("2026-07-01T09:00:00Z") },
      // u2: 2 rows on different Berlin days
      { userId: "u2", createdAt: t("2026-06-30T20:00:00Z") },
      { userId: "u2", createdAt: t("2026-06-30T23:30:00Z") },
      // u3: over the cap but excluded (premium or admin)
      { userId: "u3", createdAt: t("2026-07-01T09:00:00Z") },
      { userId: "u3", createdAt: t("2026-07-01T10:00:00Z") },
    ];
    expect(usersOverDailyCap(rows, 2, new Set(["u3"]))).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run lib/analytics.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `web/lib/analytics.ts`

```ts
/** Pure aggregations behind the admin dashboard's analytics. */

import { dayKey } from "@/lib/plans";

export function countBy<T extends string>(values: T[], keys: readonly T[]): Record<T, number> {
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

/** A user who asked twice is one data point, so distributions use their latest answer. */
export function latestPerUser<R extends { userId: string; createdAt: Date }>(rows: R[]): R[] {
  const latest = new Map<string, R>();
  for (const row of rows) {
    const current = latest.get(row.userId);
    if (!current || row.createdAt > current.createdAt) latest.set(row.userId, row);
  }
  return Array.from(latest.values());
}

/**
 * Distinct users who, on at least one Berlin calendar day, produced `cap` or
 * more rows — i.e. hit a daily limit. The strongest demand signal: they wanted
 * more than the free plan gives.
 */
export function usersOverDailyCap(
  rows: { userId: string; createdAt: Date }[],
  cap: number,
  exclude: Set<string>
): number {
  const perUserDay = new Map<string, number>();
  for (const row of rows) {
    if (exclude.has(row.userId)) continue;
    const key = `${row.userId}|${dayKey(row.createdAt)}`;
    perUserDay.set(key, (perUserDay.get(key) ?? 0) + 1);
  }
  const users = new Set<string>();
  perUserDay.forEach((count, key) => {
    if (count >= cap) users.add(key.split("|")[0]);
  });
  return users.size;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd web && npx vitest run lib/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement** `web/lib/admin.ts`

```ts
/**
 * Admin access. The allow-list is ADMIN_EMAILS; the email is read from the
 * database rather than the session so a stale token can't keep access.
 */

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { isAdminEmail } from "@/lib/plans";

export async function isAdminUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return isAdminEmail(user?.email);
}

/** The signed-in admin's id, or null for anyone else (including signed out). */
export async function requireAdminId(): Promise<string | null> {
  const userId = await requireUserId();
  return (await isAdminUser(userId)) ? userId : null;
}
```

- [ ] **Step 6: Put `isAdmin` on the session** (for the nav link only; APIs re-check).

In `web/types/next-auth.d.ts`, add `isAdmin?: boolean;` to `Session.user` and to `JWT`.

In `web/lib/auth.ts`:
- Add `import { isAdminEmail } from "@/lib/plans";`.
- In the `jwt` callback, change the select to `{ locale: true, name: true, image: true, email: true }` and add `token.isAdmin = isAdminEmail(dbUser.email);` inside `if (dbUser)`.
- In the `session` callback, add `session.user.isAdmin = Boolean(token.isAdmin);`.

- [ ] **Step 7: Create** `web/app/api/admin/overview/route.ts`

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminId } from "@/lib/admin";
import { countBy, latestPerUser, usersOverDailyCap } from "@/lib/analytics";
import { PLAN_LIMITS, parseAdminEmails } from "@/lib/plans";
import { GOALS, LEVELS, PAY_OPTIONS } from "@/lib/premium";

const DAY_MS = 86_400_000;

/** GET /api/admin/overview — everything the admin dashboard shows. 404 for non-admins. */
export async function GET() {
  if (!(await requireAdminId())) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);

  const [totalUsers, signups7, signups30, active, requests, premiumUsers, admins, attempts, tutorReplies] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: since7 } } }),
      prisma.user.count({ where: { createdAt: { gte: since30 } } }),
      prisma.attempt.findMany({ where: { createdAt: { gte: since7 } }, distinct: ["userId"], select: { userId: true } }),
      prisma.premiumRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
        include: { user: { select: { id: true, name: true, email: true, premiumUntil: true } } },
      }),
      prisma.user.findMany({
        where: { premiumUntil: { gt: now } },
        orderBy: { premiumUntil: "asc" },
        select: { id: true, name: true, email: true, premiumUntil: true },
      }),
      prisma.user.findMany({ where: { email: { in: adminEmails } }, select: { id: true } }),
      prisma.attempt.findMany({ where: { createdAt: { gte: since7 } }, select: { userId: true, createdAt: true } }),
      prisma.tutorMessage.findMany({
        where: { role: "ASSISTANT", createdAt: { gte: since7 } },
        select: { createdAt: true, session: { select: { userId: true } } },
      }),
    ]);

  // Limit hits only mean something for users on the free plan.
  const notFree = new Set([...premiumUsers.map((u) => u.id), ...admins.map((u) => u.id)]);
  const latest = latestPerUser(requests);

  const sorted = [...requests].sort((a, b) => {
    if ((a.status === "PENDING") !== (b.status === "PENDING")) return a.status === "PENDING" ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return NextResponse.json({
    requests: sorted,
    pendingCount: requests.filter((r) => r.status === "PENDING").length,
    premiumUsers,
    analytics: {
      totalUsers,
      signups7,
      signups30,
      active7: active.length,
      requesters: latest.length,
      requestRatePct: totalUsers === 0 ? 0 : Math.round((latest.length / totalUsers) * 100),
      pay: countBy(latest.map((r) => r.willingToPay), PAY_OPTIONS),
      goal: countBy(latest.map((r) => r.goal), GOALS),
      level: countBy(latest.map((r) => r.level), LEVELS),
      hitGradedCap7: usersOverDailyCap(attempts, PLAN_LIMITS.free.gradedPerDay, notFree),
      hitTutorCap7: usersOverDailyCap(
        tutorReplies.map((m) => ({ userId: m.session.userId, createdAt: m.createdAt })),
        PLAN_LIMITS.free.tutorPerDay,
        notFree
      ),
    },
  });
}
```

- [ ] **Step 8: Create** `web/app/api/admin/requests/[id]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminId } from "@/lib/admin";
import { extendPremium, isTrialDays } from "@/lib/plans";
import { mailConfigured, premiumActivatedEmail, sendMail } from "@/lib/mail";

class AlreadyDecided extends Error {}

/** POST /api/admin/requests/{id} — { action: "approve", days: 7|14|30 } or { action: "reject" }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdminId())) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { action?: string; days?: unknown } | null;
  const request = await prisma.premiumRequest.findUnique({
    where: { id: params.id },
    include: { user: { select: { email: true, premiumUntil: true } } },
  });
  if (!request) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date();

  try {
    if (body?.action === "approve") {
      if (!isTrialDays(body.days)) return NextResponse.json({ error: "invalid_days" }, { status: 400 });
      const days = body.days;
      const until = extendPremium(request.user.premiumUntil, days, now);

      // Guarded on PENDING so a double click can't grant the trial twice.
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.premiumRequest.updateMany({
          where: { id: request.id, status: "PENDING" },
          data: { status: "APPROVED", grantedDays: days, decidedAt: now },
        });
        if (count === 0) throw new AlreadyDecided();
        await tx.user.update({ where: { id: request.userId }, data: { premiumUntil: until } });
      });

      if (mailConfigured()) {
        const email = premiumActivatedEmail(until, process.env.NEXTAUTH_URL ?? "");
        await sendMail({ to: request.user.email, ...email });
      }
      return NextResponse.json({ ok: true, premiumUntil: until });
    }

    if (body?.action === "reject") {
      const { count } = await prisma.premiumRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "REJECTED", decidedAt: now },
      });
      if (count === 0) throw new AlreadyDecided();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (err) {
    if (err instanceof AlreadyDecided) {
      return NextResponse.json({ error: "already_decided", status: request.status }, { status: 409 });
    }
    throw err;
  }
}
```

- [ ] **Step 9: Create** `web/app/api/admin/users/[id]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminId } from "@/lib/admin";
import { extendPremium, isTrialDays } from "@/lib/plans";

/** POST /api/admin/users/{id} — { action: "extend", days: 7|14|30 } or { action: "revoke" }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdminId())) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { action?: string; days?: unknown } | null;
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, premiumUntil: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date();

  if (body?.action === "extend") {
    if (!isTrialDays(body.days)) return NextResponse.json({ error: "invalid_days" }, { status: 400 });
    const premiumUntil = extendPremium(user.premiumUntil, body.days, now);
    await prisma.user.update({ where: { id: user.id }, data: { premiumUntil } });
    return NextResponse.json({ ok: true, premiumUntil });
  }

  if (body?.action === "revoke") {
    // "Now" rather than null keeps a record that this user had premium.
    await prisma.user.update({ where: { id: user.id }, data: { premiumUntil: now } });
    return NextResponse.json({ ok: true, premiumUntil: now });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
```

- [ ] **Step 10: Verify**

Run: `cd web && npx tsc --noEmit -p . && npm run lint && npx vitest run`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add web/lib/admin.ts web/lib/analytics.ts web/lib/analytics.test.ts web/app/api/admin web/lib/auth.ts web/types/next-auth.d.ts
git commit -m "Add admin APIs: overview analytics, approve/reject requests, extend/revoke premium"
```

---

### Task 8: User-facing UI — meters, upgrade prompt, plan card, upload, request form

**Files:**
- Modify: `web/lib/i18n.ts`, `web/components/ReviewSession.tsx`, `web/components/TutorChat.tsx`, `web/components/DriveConnect.tsx`, `web/components/SettingsPanel.tsx`
- Create: `web/components/usePlan.ts`, `UpgradePrompt.tsx`, `UsageMeter.tsx`, `PlanCard.tsx`, `UploadPanel.tsx`, `PremiumRequestForm.tsx`, `PremiumHeader.tsx`, `web/app/premium/page.tsx`

**Interfaces:**
- Consumes: `GET /api/me/plan`, `POST /api/me/upload`, `POST /api/me/documents/{id}/continue`, `GET/POST /api/premium/request`, the limit response shape, and `GOALS`, `LEVELS`, `PAY_OPTIONS`, `MAX_CONTACT_CHARS`, `MAX_MESSAGE_CHARS` from `@/lib/premium`
- Produces:
  - `usePlan(): { plan: PlanInfo | null; reload: () => void }`
  - `<UpgradePrompt kind limit />`
  - `<UsageMeter kind plan />`
  - `LimitHit = { kind: "graded" | "tutor" | "documents"; limit: number }`
  - `readLimitHit(res: Response): Promise<LimitHit | null>`

- [ ] **Step 1: Add translations.** In `web/lib/i18n.ts`, add these keys to `en`, just before `"common.error"`:

```ts
  "nav.admin": "Admin",

  "plan.free": "Free plan",
  "plan.premiumUntil": "Premium until {date}",
  "plan.admin": "Admin · no limits",
  "plan.documents": "{used} of {limit} documents",
  "plan.daily": "{graded} graded answers and {tutor} tutor replies a day",
  "plan.getMore": "Get more with Premium",
  "plan.pending": "Your premium request is being reviewed.",

  "usage.today": "Today {used} / {limit}",

  "limit.graded": "You've used all {limit} graded answers for today.",
  "limit.tutor": "You've used all {limit} tutor replies for today.",
  "limit.documents": "Your plan includes {limit} document(s), and you've used them.",
  "limit.body": "Want more? Request a free premium trial and we'll activate it for you.",
  "limit.cta": "Request premium",
  "limit.pending": "Your premium request is being reviewed — we'll email you when it's active.",
  "limit.resets": "Free limits reset at midnight, German time.",

  "upload.title": "Upload from your computer",
  "upload.subtitle": "Excel (.xlsx, .csv) or notes (.docx, .txt, .md), up to 2 MB.",
  "upload.choose": "Choose a file",
  "upload.working": "Reading {name} and making cards…",
  "upload.done": "{count} new cards added from {name}",
  "upload.unchanged": "{name} was already imported",
  "upload.failed": "Couldn't import {name}: {reason}",
  "upload.tooLarge": "That file is larger than 2 MB.",

  "drive.documents.uploaded": "Uploaded from your computer",
  "drive.documents.continue": "Continue",

  "premium.title": "Request Premium",
  "premium.subtitle":
    "Premium is free while we test it. Tell us a little about how you learn, and we'll activate a trial for you.",
  "premium.goal": "Why are you learning German?",
  "premium.goal.EXAM": "Exam (Goethe, telc…)",
  "premium.goal.WORK": "Work",
  "premium.goal.IMMIGRATION": "Moving to a German-speaking country",
  "premium.goal.STUDY": "Study",
  "premium.goal.PERSONAL": "Personal interest",
  "premium.goal.OTHER": "Something else",
  "premium.level": "Your German level now",
  "premium.level.UNKNOWN": "Not sure",
  "premium.pay": "If Premium were paid, what would you pay per month?",
  "premium.pay.NOTHING": "Nothing — only if it's free",
  "premium.pay.UNDER_5": "Under €5",
  "premium.pay.FROM_5_TO_10": "€5–10",
  "premium.pay.OVER_10": "More than €10",
  "premium.contact": "Telegram username or phone (optional)",
  "premium.contactHint": "Only so we can reach you. Never shown to anyone else.",
  "premium.message": "Anything else? (optional)",
  "premium.submit": "Send request",
  "premium.sending": "Sending…",
  "premium.sent": "Thanks! Your request is in. We'll email you when your trial is active.",
  "premium.status.PENDING": "Your request is being reviewed.",
  "premium.status.APPROVED": "Premium is active until {date}.",
  "premium.status.REJECTED": "Your last request wasn't approved. You can send a new one.",
```

And the same keys in `de`, just before its `"common.error"`:

```ts
  "nav.admin": "Admin",

  "plan.free": "Kostenloser Plan",
  "plan.premiumUntil": "Premium bis {date}",
  "plan.admin": "Admin · ohne Limits",
  "plan.documents": "{used} von {limit} Dokumenten",
  "plan.daily": "{graded} bewertete Antworten und {tutor} Tutor-Antworten pro Tag",
  "plan.getMore": "Mehr mit Premium",
  "plan.pending": "Deine Premium-Anfrage wird geprüft.",

  "usage.today": "Heute {used} / {limit}",

  "limit.graded": "Du hast heute alle {limit} bewerteten Antworten genutzt.",
  "limit.tutor": "Du hast heute alle {limit} Tutor-Antworten genutzt.",
  "limit.documents": "Dein Plan umfasst {limit} Dokument(e), und du hast sie genutzt.",
  "limit.body": "Mehr gewünscht? Fordere eine kostenlose Premium-Testphase an — wir schalten sie für dich frei.",
  "limit.cta": "Premium anfragen",
  "limit.pending": "Deine Premium-Anfrage wird geprüft — wir schreiben dir, sobald sie aktiv ist.",
  "limit.resets": "Die kostenlosen Limits werden um Mitternacht (deutsche Zeit) zurückgesetzt.",

  "upload.title": "Vom Computer hochladen",
  "upload.subtitle": "Excel (.xlsx, .csv) oder Notizen (.docx, .txt, .md), bis 2 MB.",
  "upload.choose": "Datei auswählen",
  "upload.working": "{name} wird gelesen und in Karten verwandelt…",
  "upload.done": "{count} neue Karten aus {name} hinzugefügt",
  "upload.unchanged": "{name} wurde bereits importiert",
  "upload.failed": "{name} konnte nicht importiert werden: {reason}",
  "upload.tooLarge": "Diese Datei ist größer als 2 MB.",

  "drive.documents.uploaded": "Vom Computer hochgeladen",
  "drive.documents.continue": "Fortsetzen",

  "premium.title": "Premium anfragen",
  "premium.subtitle":
    "Premium ist kostenlos, solange wir es testen. Erzähl uns kurz, wie du lernst, und wir schalten eine Testphase für dich frei.",
  "premium.goal": "Warum lernst du Deutsch?",
  "premium.goal.EXAM": "Prüfung (Goethe, telc…)",
  "premium.goal.WORK": "Beruf",
  "premium.goal.IMMIGRATION": "Umzug in ein deutschsprachiges Land",
  "premium.goal.STUDY": "Studium",
  "premium.goal.PERSONAL": "Persönliches Interesse",
  "premium.goal.OTHER": "Etwas anderes",
  "premium.level": "Dein aktuelles Deutschniveau",
  "premium.level.UNKNOWN": "Weiß nicht",
  "premium.pay": "Wenn Premium kostenpflichtig wäre: Wie viel würdest du pro Monat zahlen?",
  "premium.pay.NOTHING": "Nichts — nur wenn es kostenlos ist",
  "premium.pay.UNDER_5": "Unter 5 €",
  "premium.pay.FROM_5_TO_10": "5–10 €",
  "premium.pay.OVER_10": "Mehr als 10 €",
  "premium.contact": "Telegram-Name oder Telefon (optional)",
  "premium.contactHint": "Nur damit wir dich erreichen können. Wird niemandem sonst gezeigt.",
  "premium.message": "Sonst noch etwas? (optional)",
  "premium.submit": "Anfrage senden",
  "premium.sending": "Wird gesendet…",
  "premium.sent": "Danke! Deine Anfrage ist da. Wir schreiben dir, sobald deine Testphase aktiv ist.",
  "premium.status.PENDING": "Deine Anfrage wird geprüft.",
  "premium.status.APPROVED": "Premium ist aktiv bis {date}.",
  "premium.status.REJECTED": "Deine letzte Anfrage wurde nicht freigegeben. Du kannst eine neue senden.",
```

- [ ] **Step 2: Create** `web/components/usePlan.ts`

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import type { LimitKind } from "@/lib/plans";

// One definition of the limit kinds, shared with the server (type-only import).
export type { LimitKind };

export interface PlanInfo {
  plan: "free" | "premium";
  admin: boolean;
  premiumUntil: string | null;
  limits: { documents: number; gradedPerDay: number; tutorPerDay: number };
  usage: Record<LimitKind, number>;
  request: { status: "PENDING" | "APPROVED" | "REJECTED"; createdAt: string; grantedDays: number | null } | null;
}

export interface LimitHit {
  kind: LimitKind;
  limit: number;
}

/** The body of a limit response, or null for any other failure. */
export async function readLimitHit(res: Response): Promise<LimitHit | null> {
  if (res.status !== 429 && res.status !== 403) return null;
  const data = await res.clone().json().catch(() => null);
  return data?.error === "limit_reached" ? { kind: data.kind, limit: data.limit } : null;
}

export function usePlan() {
  const [plan, setPlan] = useState<PlanInfo | null>(null);

  const reload = useCallback(() => {
    fetch("/api/me/plan", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPlan(d))
      .catch(() => {});
  }, []);

  useEffect(reload, [reload]);

  return { plan, reload };
}
```

- [ ] **Step 3: Create** `web/components/UpgradePrompt.tsx`

```tsx
"use client";

import Link from "next/link";
import { usePreferences } from "@/components/PreferencesProvider";
import { usePlan, type LimitKind } from "@/components/usePlan";
import type { TranslationKey } from "@/lib/i18n";

/** Shown wherever a limit is hit: what happened, and how to get more. */
export default function UpgradePrompt({ kind, limit }: { kind: LimitKind; limit: number }) {
  const { t } = usePreferences();
  const { plan } = usePlan();
  const pending = plan?.request?.status === "PENDING";

  return (
    <div className="rounded-xl border border-brand/30 bg-brand-soft px-4 py-4 text-sm">
      <p className="font-semibold text-ink">{t(`limit.${kind}` as TranslationKey, { limit })}</p>
      {pending ? (
        <p className="mt-1 text-ink-muted">{t("limit.pending")}</p>
      ) : (
        <>
          <p className="mt-1 text-ink-muted">{t("limit.body")}</p>
          <Link href="/premium" className="btn-primary mt-3 inline-flex">
            {t("limit.cta")}
          </Link>
        </>
      )}
      {kind !== "documents" && <p className="mt-3 text-xs text-ink-faint">{t("limit.resets")}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Create** `web/components/UsageMeter.tsx`

```tsx
"use client";

import { usePreferences } from "@/components/PreferencesProvider";
import type { PlanInfo } from "@/components/usePlan";

/** "Today 12 / 30" — hidden for admins, who have no limits. */
export default function UsageMeter({ kind, plan }: { kind: "graded" | "tutor"; plan: PlanInfo | null }) {
  const { t } = usePreferences();
  if (!plan || plan.admin) return null;
  const limit = kind === "graded" ? plan.limits.gradedPerDay : plan.limits.tutorPerDay;
  return (
    <span className="shrink-0 text-xs text-ink-faint">
      {t("usage.today", { used: Math.min(plan.usage[kind], limit), limit })}
    </span>
  );
}
```

- [ ] **Step 5: Create** `web/components/PlanCard.tsx`

```tsx
"use client";

import Link from "next/link";
import { usePreferences } from "@/components/PreferencesProvider";
import { usePlan } from "@/components/usePlan";

/** The plan, its allowance, and the way to more — top of Settings. */
export default function PlanCard() {
  const { t, locale } = usePreferences();
  const { plan } = usePlan();
  if (!plan) return <div className="skeleton h-16 w-full" />;

  const date = plan.premiumUntil
    ? new Date(plan.premiumUntil).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" })
    : null;

  const title = plan.admin
    ? t("plan.admin")
    : plan.plan === "premium" && date
      ? t("plan.premiumUntil", { date })
      : t("plan.free");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {!plan.admin && (
          <p className="mt-0.5 text-sm text-ink-muted">
            {t("plan.documents", { used: plan.usage.documents, limit: plan.limits.documents })} ·{" "}
            {t("plan.daily", { graded: plan.limits.gradedPerDay, tutor: plan.limits.tutorPerDay })}
          </p>
        )}
      </div>
      {!plan.admin && plan.plan === "free" &&
        (plan.request?.status === "PENDING" ? (
          <p className="text-sm text-ink-muted">{t("plan.pending")}</p>
        ) : (
          <Link href="/premium" className="btn-primary shrink-0">
            {t("plan.getMore")}
          </Link>
        ))}
    </div>
  );
}
```

- [ ] **Step 6: Create** `web/components/UploadPanel.tsx`

```tsx
"use client";

import { useRef, useState } from "react";
import { usePreferences } from "@/components/PreferencesProvider";
import UpgradePrompt from "@/components/UpgradePrompt";
import { readLimitHit, type LimitHit } from "@/components/usePlan";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = ".xlsx,.csv,.docx,.txt,.md";
/** Continuation requests for one upload (each is up to ~3 min). */
const MAX_ROUNDS = 40;

interface Result {
  documentId: string;
  status: "unchanged" | "imported" | "partial" | "failed";
  cardsCreated: number;
  error?: string;
}

/** Import a file from the computer — available to everyone, no Drive needed. */
export default function UploadPanel({ onImported }: { onImported?: () => void }) {
  const { t } = usePreferences();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<LimitHit | null>(null);

  async function upload(file: File) {
    setNotice(null);
    setError(null);
    setLimit(null);
    if (file.size > MAX_BYTES) {
      setError(t("upload.tooLarge"));
      return;
    }

    setBusy(file.name);
    try {
      const form = new FormData();
      form.append("file", file);
      let res = await fetch("/api/me/upload", { method: "POST", body: form });
      let added = 0;

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const hit = await readLimitHit(res);
        if (hit) {
          setLimit(hit);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(t("upload.failed", { name: file.name, reason: data.detail ?? t("common.error") }));
          return;
        }

        const result = data.result as Result;
        added += result.cardsCreated ?? 0;
        onImported?.();

        if (result.status === "partial") {
          // Long notes are generated over several requests; keep going.
          res = await fetch(`/api/me/documents/${result.documentId}/continue`, { method: "POST" });
          continue;
        }
        if (result.status === "failed") {
          setError(t("upload.failed", { name: file.name, reason: result.error ?? t("common.error") }));
        } else if (result.status === "unchanged") {
          setNotice(t("upload.unchanged", { name: file.name }));
        } else {
          setNotice(t("upload.done", { count: added, name: file.name }));
        }
        return;
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">{t("upload.title")}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t("upload.subtitle")}</p>
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button onClick={() => input.current?.click()} disabled={busy !== null} className="btn-primary">
        {t("upload.choose")}
      </button>

      {busy && <p className="text-sm text-ink-muted">{t("upload.working", { name: busy })}</p>}
      {limit && <UpgradePrompt kind={limit.kind} limit={limit.limit} />}
      {error && (
        <p className="rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical">{error}</p>
      )}
      {notice && !error && (
        <p className="rounded-xl border border-positive/30 bg-positive/10 px-4 py-3 text-sm text-positive">{notice}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create the request form** — `web/components/PremiumRequestForm.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { usePreferences } from "@/components/PreferencesProvider";
import type { TranslationKey } from "@/lib/i18n";
import {
  GOALS,
  LEVELS,
  MAX_CONTACT_CHARS,
  MAX_MESSAGE_CHARS,
  PAY_OPTIONS,
  type Goal,
  type Level,
  type PayOption,
} from "@/lib/premium";

interface Latest {
  status: "PENDING" | "APPROVED" | "REJECTED";
}

function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={clsx(
            "rounded-lg border px-3 py-1.5 text-sm transition-colors",
            value === o ? "border-brand bg-brand text-white" : "border-line text-ink-muted hover:text-ink"
          )}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

export default function PremiumRequestForm() {
  const { t, locale } = usePreferences();
  const [latest, setLatest] = useState<Latest | null>(null);
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [goal, setGoal] = useState<Goal | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [pay, setPay] = useState<PayOption | null>(null);
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/premium/request", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setLatest(d.request);
        setPremiumUntil(d.premiumUntil);
      })
      .catch(() => setError(t("common.error")))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!goal || !level || !pay || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/premium/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, level, willingToPay: pay, contact, message }),
      });
      if (!res.ok && res.status !== 409) throw new Error(String(res.status));
      setSent(true);
    } catch {
      setError(t("common.error"));
    } finally {
      setSending(false);
    }
  }

  if (!loaded) return <div className="skeleton h-64 w-full" />;

  const active = premiumUntil && new Date(premiumUntil) > new Date();
  const date = premiumUntil
    ? new Date(premiumUntil).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" })
    : "";

  if (sent) return <p className="card-surface p-6 text-ink">{t("premium.sent")}</p>;
  if (active) return <p className="card-surface p-6 text-ink">{t("premium.status.APPROVED", { date })}</p>;
  if (latest?.status === "PENDING") return <p className="card-surface p-6 text-ink">{t("premium.status.PENDING")}</p>;

  return (
    <div className="card-surface space-y-6 p-5 sm:p-7">
      {latest?.status === "REJECTED" && <p className="text-sm text-ink-muted">{t("premium.status.REJECTED")}</p>}

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium text-ink">{t("premium.goal")}</legend>
        <Choice options={GOALS} value={goal} onChange={setGoal} label={(g) => t(`premium.goal.${g}` as TranslationKey)} />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium text-ink">{t("premium.level")}</legend>
        <Choice
          options={LEVELS}
          value={level}
          onChange={setLevel}
          label={(l) => (l === "UNKNOWN" ? t("premium.level.UNKNOWN") : l)}
        />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium text-ink">{t("premium.pay")}</legend>
        <Choice options={PAY_OPTIONS} value={pay} onChange={setPay} label={(p) => t(`premium.pay.${p}` as TranslationKey)} />
      </fieldset>

      <label className="block space-y-1">
        <span className="font-medium text-ink">{t("premium.contact")}</span>
        <input
          className="field"
          value={contact}
          maxLength={MAX_CONTACT_CHARS}
          onChange={(e) => setContact(e.target.value)}
        />
        <span className="block text-xs text-ink-faint">{t("premium.contactHint")}</span>
      </label>

      <label className="block space-y-1">
        <span className="font-medium text-ink">{t("premium.message")}</span>
        <textarea
          className="field min-h-[5rem] resize-none"
          value={message}
          maxLength={MAX_MESSAGE_CHARS}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      {error && <p className="text-sm text-critical">{error}</p>}

      <button onClick={submit} disabled={!goal || !level || !pay || sending} className="btn-primary">
        {sending ? t("premium.sending") : t("premium.submit")}
      </button>
    </div>
  );
}
```

`@/lib/premium` has no server-only imports, so it is safe in a client component.

- [ ] **Step 8: Create** `web/app/premium/page.tsx`

```tsx
import { redirect } from "next/navigation";
import PremiumRequestForm from "@/components/PremiumRequestForm";
import PremiumHeader from "@/components/PremiumHeader";
import { requireUserId } from "@/lib/auth";

export default async function PremiumPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/signin?callbackUrl=/premium");

  return (
    <div className="space-y-6">
      <PremiumHeader />
      <PremiumRequestForm />
    </div>
  );
}
```

Create `web/components/PremiumHeader.tsx`. It is a client component because the title is translated:

```tsx
"use client";

import { usePreferences } from "@/components/PreferencesProvider";

export default function PremiumHeader() {
  const { t } = usePreferences();
  return (
    <header className="space-y-1">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t("premium.title")}</h1>
      <p className="text-ink-muted">{t("premium.subtitle")}</p>
    </header>
  );
}
```

- [ ] **Step 9: Integrate into Review.** In `web/components/ReviewSession.tsx`:
  - Imports:
    ```ts
    import UpgradePrompt from "@/components/UpgradePrompt";
    import UsageMeter from "@/components/UsageMeter";
    import { readLimitHit, usePlan, type LimitHit } from "@/components/usePlan";
    ```
  - In the component: `const { plan, reload } = usePlan();` and `const [limit, setLimit] = useState<LimitHit | null>(null);`
  - In `submit()`, directly after the `409` block, add:
    ```ts
      const hit = await readLimitHit(res);
      if (hit) {
        setLimit(hit);
        return;
      }
    ```
    and after `setReveal(data.reveal ?? null);` add `reload();`.
  - In the progress header, replace the right-hand `<span>` with:
    ```tsx
        <span className="flex shrink-0 items-center gap-3 text-ink-faint">
          <UsageMeter kind="graded" plan={plan} />
          {t("review.remaining", { count: queue.length })}
        </span>
    ```
  - Directly above `{error && (` in the active-card view, add:
    ```tsx
            {limit && <UpgradePrompt kind={limit.kind} limit={limit.limit} />}
    ```
  - In `next()`, add `setLimit(null);`.

- [ ] **Step 10: Integrate into Tutor.** In `web/components/TutorChat.tsx`:
  - Add the same three imports and `const { plan, reload } = usePlan();` and `const [limit, setLimit] = useState<LimitHit | null>(null);`.
  - In `send`, replace `if (!res.ok) throw new Error(String(res.status));` with:
    ```ts
        const hit = await readLimitHit(res);
        if (hit) {
          setLimit(hit);
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
    ```
    and after `setSessionId(data.sessionId);` add `reload();`.
  - Add `setLimit(null);` in `reset()`.
  - Render `{limit && <UpgradePrompt kind={limit.kind} limit={limit.limit} />}` immediately above where `error` is rendered in the chat view.
  - Render `<UsageMeter kind="tutor" plan={plan} />` next to the active topic's name in the chat header.
  - Keep `t` in the `useCallback` deps and add `reload`.

- [ ] **Step 11: Integrate into DriveConnect.** In `web/components/DriveConnect.tsx`:
  - Add `provider: "GOOGLE_DRIVE" | "NOTION" | "UPLOAD";` to `DriveDocument`.
  - Add imports:
    ```ts
    import UpgradePrompt from "@/components/UpgradePrompt";
    import { readLimitHit, type LimitHit } from "@/components/usePlan";
    ```
  - Add state `const [limit, setLimit] = useState<LimitHit | null>(null);`.
  - In `startImport`'s request loop, directly after the `fetch(...)` and **before** `res.json()`, add:
    ```ts
        const hit = await readLimitHit(res);
        if (hit) {
          setLimit(hit);
          setNotice(null);
          return;
        }
    ```
  - Reset with `setLimit(null)` at the start of `startImport`.
  - Render `{limit && <UpgradePrompt kind={limit.kind} limit={limit.limit} />}` just above `{error && (`.
  - Replace the `{doc.readOnly && (...legacy...)}` block with:
    ```tsx
                    {doc.provider === "NOTION" && (
                      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{t("drive.documents.legacy")}</p>
                    )}
                    {doc.provider === "UPLOAD" && (
                      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{t("drive.documents.uploaded")}</p>
                    )}
    ```
  - Beside the existing re-import button, add a continue button for unfinished uploads:
    ```tsx
                    {doc.provider === "UPLOAD" && (doc.status === "PENDING" || doc.status === "IMPORTING") && (
                      <button
                        onClick={() => void continueDocument(doc.id)}
                        disabled={importing}
                        className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        {t("drive.documents.continue")}
                      </button>
                    )}
    ```
  - Add the handler next to `startImport`:
    ```ts
  const continueDocument = async (documentId: string) => {
    setImporting(true);
    setError(null);
    setLimit(null);
    try {
      for (let round = 0; round < MAX_IMPORT_ROUNDS; round++) {
        const res = await fetch(`/api/me/documents/${documentId}/continue`, { method: "POST" });
        const hit = await readLimitHit(res);
        if (hit) {
          setLimit(hit);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail);
        void load();
        if (data.result?.status !== "partial") return;
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("drive.error.generic"));
    } finally {
      setImporting(false);
      void load();
    }
  };
    ```
  - Export a way for the upload panel to refresh this list: accept an optional `refreshKey?: number` prop and add it to the dependency list of the initial `load()` effect (`useEffect(() => { void load(); }, [load, refreshKey]);`).

- [ ] **Step 12: Integrate into Settings.** In `web/components/SettingsPanel.tsx`:
  - Import `PlanCard` and `UploadPanel`.
  - Add `const [docsVersion, setDocsVersion] = useState(0);` (import `useState`).
  - Right after the profile section, add:
    ```tsx
      <section className="card-surface p-5 sm:p-6">
        <PlanCard />
      </section>

      <section className="card-surface p-5 sm:p-6">
        <UploadPanel onImported={() => setDocsVersion((v) => v + 1)} />
      </section>
    ```
  - Change `<DriveConnect />` to `<DriveConnect refreshKey={docsVersion} />`.

- [ ] **Step 13: Verify**

Run: `cd web && npx tsc --noEmit -p . && npm run lint && npx vitest run && npm run build`
Expected: all green, and the build lists `/premium`.

- [ ] **Step 14: Commit**

```bash
git add web/lib/i18n.ts web/components web/app/premium
git commit -m "Show usage and upgrade prompts, add computer upload and the premium request page"
```

---

### Task 9: Admin UI

**Files:**
- Create: `web/app/admin/page.tsx`, `web/components/AdminDashboard.tsx`
- Modify: `web/components/NavBar.tsx`

**Interfaces:**
- Consumes: `isAdminUser` (Task 7), `GET /api/admin/overview`, `POST /api/admin/requests/{id}`, `POST /api/admin/users/{id}`, `GOAL_LABELS`, `PAY_LABELS`, `GOALS`, `LEVELS`, `PAY_OPTIONS`, `TRIAL_DAY_OPTIONS`, `session.user.isAdmin`

- [ ] **Step 1: Create** `web/app/admin/page.tsx`

```tsx
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import { requireUserId } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * Admin dashboard. Anyone else — signed out or signed in — is quietly sent to
 * their own dashboard: no error page, nothing that reveals this page exists.
 */
export default async function AdminPage() {
  const userId = await requireUserId();
  if (!(await isAdminUser(userId))) redirect("/dashboard");

  return <AdminDashboard />;
}
```

- [ ] **Step 2: Create** `web/components/AdminDashboard.tsx`

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { GOALS, GOAL_LABELS, LEVELS, PAY_LABELS, PAY_OPTIONS } from "@/lib/premium";
import { TRIAL_DAY_OPTIONS } from "@/lib/plans";

interface RequestRow {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  goal: (typeof GOALS)[number];
  level: (typeof LEVELS)[number];
  willingToPay: (typeof PAY_OPTIONS)[number];
  contact: string | null;
  message: string | null;
  grantedDays: number | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string; premiumUntil: string | null };
}

interface Overview {
  requests: RequestRow[];
  pendingCount: number;
  premiumUsers: { id: string; name: string | null; email: string; premiumUntil: string }[];
  analytics: {
    totalUsers: number;
    signups7: number;
    signups30: number;
    active7: number;
    requesters: number;
    requestRatePct: number;
    pay: Record<string, number>;
    goal: Record<string, number>;
    level: Record<string, number>;
    hitGradedCap7: number;
    hitTutorCap7: number;
  };
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" });

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card-surface p-4">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{label}</p>
    </div>
  );
}

function Bars({ title, counts, label }: { title: string; counts: Record<string, number>; label: (k: string) => string }) {
  const max = Math.max(1, ...Object.values(counts));
  return (
    <div className="card-surface space-y-2 p-4">
      <p className="font-medium text-ink">{title}</p>
      {Object.entries(counts).map(([key, n]) => (
        <div key={key} className="text-sm">
          <div className="flex justify-between text-ink-muted">
            <span>{label(key)}</span>
            <span>{n}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-line">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${(n / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Admin-only, English-only: requests, premium users, and demand analytics. */
export default function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setError("Couldn't load the dashboard.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(url: string, body: object, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok && res.status !== 409) throw new Error(String(res.status));
      await load();
    } catch {
      setError("That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!data) return error ? <p className="text-critical">{error}</p> : <div className="skeleton h-64 w-full" />;
  const a = data.analytics;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Admin</h1>
        {error && <p className="mt-2 text-sm text-critical">{error}</p>}
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Users" value={a.totalUsers} />
          <Stat label="Sign-ups, 7 / 30 days" value={`${a.signups7} / ${a.signups30}`} />
          <Stat label="Active, last 7 days" value={a.active7} />
          <Stat label="Asked for premium" value={`${a.requesters} (${a.requestRatePct}%)`} />
          <Stat label="Free users who hit the answer limit (7d)" value={a.hitGradedCap7} />
          <Stat label="Free users who hit the tutor limit (7d)" value={a.hitTutorCap7} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Bars title="Would pay per month" counts={a.pay} label={(k) => PAY_LABELS[k as keyof typeof PAY_LABELS]} />
          <Bars title="Goal" counts={a.goal} label={(k) => GOAL_LABELS[k as keyof typeof GOAL_LABELS]} />
          <Bars title="Level" counts={a.level} label={(k) => (k === "UNKNOWN" ? "Not sure" : k)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Requests ({data.pendingCount} pending)</h2>
        {data.requests.length === 0 && <p className="text-sm text-ink-muted">No requests yet.</p>}
        {data.requests.map((r) => (
          <div key={r.id} className="card-surface space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-ink">
                {r.user.name ?? "—"} · <span className="text-ink-muted">{r.user.email}</span>
              </p>
              <p className="text-xs text-ink-faint">
                {fmt(r.createdAt)} · {r.status}
                {r.grantedDays ? ` · ${r.grantedDays} days` : ""}
              </p>
            </div>
            <p className="text-ink-muted">
              {GOAL_LABELS[r.goal]} · {r.level === "UNKNOWN" ? "Level not sure" : r.level} ·{" "}
              {PAY_LABELS[r.willingToPay]}
            </p>
            {r.contact && <p className="text-ink">Contact: {r.contact}</p>}
            {r.message && <p className="whitespace-pre-wrap text-ink">“{r.message}”</p>}
            {r.status === "PENDING" && (
              <div className="flex flex-wrap gap-2 pt-1">
                {TRIAL_DAY_OPTIONS.map((days) => (
                  <button
                    key={days}
                    disabled={busy !== null}
                    onClick={() => act(`/api/admin/requests/${r.id}`, { action: "approve", days }, r.id)}
                    className="btn-primary"
                  >
                    Activate {days} days
                  </button>
                ))}
                <button
                  disabled={busy !== null}
                  onClick={() => act(`/api/admin/requests/${r.id}`, { action: "reject" }, r.id)}
                  className="btn-ghost"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Premium users</h2>
        {data.premiumUsers.length === 0 && <p className="text-sm text-ink-muted">Nobody is on premium right now.</p>}
        {data.premiumUsers.map((u) => (
          <div key={u.id} className="card-surface flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <p>
              {u.name ?? "—"} · <span className="text-ink-muted">{u.email}</span> · until {fmt(u.premiumUntil)}
            </p>
            <div className="flex gap-2">
              {TRIAL_DAY_OPTIONS.map((days) => (
                <button
                  key={days}
                  disabled={busy !== null}
                  onClick={() => act(`/api/admin/users/${u.id}`, { action: "extend", days }, u.id)}
                  className="btn-ghost"
                >
                  +{days}d
                </button>
              ))}
              <button
                disabled={busy !== null}
                onClick={() => act(`/api/admin/users/${u.id}`, { action: "revoke" }, u.id)}
                className="btn-ghost text-critical"
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
```

`@/lib/plans` reads `process.env.ADMIN_EMAILS` only inside `isAdminEmail`'s default parameter, which the client never calls. Importing `TRIAL_DAY_OPTIONS` from it is therefore safe on the client.

- [ ] **Step 3: Admin link in the nav.** In `web/components/NavBar.tsx`, add after the `NAV` array:

```tsx
/** Rendered only for admins; everyone else never sees the page exists. */
const ADMIN_ITEM: NavItem = {
  href: "/admin",
  labelKey: "nav.admin",
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};
```

In the component, after `const signedIn = ...`, add `const items = session?.user?.isAdmin ? [...NAV, ADMIN_ITEM] : NAV;`, then replace both `NAV.map(` calls with `items.map(`.

- [ ] **Step 4: Verify**

Run: `cd web && npx tsc --noEmit -p . && npm run lint && npx vitest run && npm run build`
Expected: all green, and the build lists `/admin`.

- [ ] **Step 5: Commit**

```bash
git add web/app/admin web/components/AdminDashboard.tsx web/components/NavBar.tsx
git commit -m "Add the admin dashboard with requests, premium users and analytics"
```

---

### Task 10: Docs, configuration, full check, and rollout

**Files:**
- Modify: `web/.env.example`, `README.md`, `docs/ADR.md`

- [ ] **Step 1: Document the configuration.** Append to `web/.env.example`:

```bash
# --- Premium trial & admin (optional) ---
# Comma-separated emails with access to /admin and no usage limits.
ADMIN_EMAILS=
# Telegram notifications for new premium requests. Create a bot with
# @BotFather (gives the token); your chat id comes from
# https://api.telegram.org/bot<TOKEN>/getUpdates after you message the bot.
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# New-request emails go to ADMIN_EMAILS through RESEND_API_KEY (above).
```

- [ ] **Step 2: README.** Add a section "Free plan, premium trials and the admin dashboard" after the setup section. It covers:
  - the limits table
  - how to become admin (`ADMIN_EMAILS`)
  - the three optional notification variables
  - the migration steps from Step 5 below

- [ ] **Step 3: ADR.** Add an entry "Free demo limits counted from existing rows". Record:
  - usage is counted from `Attempt` and `TutorMessage` rather than a counter table: failed model calls cost nothing, and at the boundary the count can overshoot by one
  - premium is a single end date, with no scheduler
  - admin is an env allow-list

- [ ] **Step 4: Full verification**

```bash
cd ai-service && python -m pytest tests/ -q && cd ..
cd web && npx tsc --noEmit -p . && npm run lint && npx vitest run && npm run build
```
Expected: pytest all pass, and tsc, lint, vitest and build all succeed. Commit the docs:

```bash
git add web/.env.example README.md docs/ADR.md
git commit -m "Document the free plan, premium trials and admin setup"
```

- [ ] **Step 5: Rollout — CHECKPOINT: ask the owner before touching the production database.**

The web deploy that uses the new schema must come **after** the migration. In order:

1. Back up the database: `node scripts/backup_db.mjs`. Confirm a new file in `backups/`.
2. Rehearse: `node scripts/verify_migration.mjs 20260926000000_premium_trial`. Every check must PASS and the output must end with "Transaction rolled back".
3. Apply: `cd web && npx prisma migrate deploy`. The output must list `20260926000000_premium_trial` as applied.
4. Merge `feature/premium-trial` (which contains `chore/flashcard-name`) into `main` and push. Watch CI with `gh run watch`.
5. Give the owner step-by-step instructions to set these in Vercel, then redeploy:
   - `ADMIN_EMAILS=zhmosayebi@gmail.com`
   - Telegram bot token and chat id
   - Resend, if they want email
6. Manual online checks:
   - As a normal user:
     - Settings shows "Free plan · 0 of 1 documents".
     - Uploading a small `.xlsx` creates cards.
     - Uploading the same file again says "already imported".
     - Uploading a second, different file shows the upgrade prompt.
   - Submit the premium form. The Telegram message (and the email, if configured) arrives.
   - As admin, `/admin` lists the request. "Activate 7 days" changes that user's plan card to "Premium until …".
   - As a non-admin, opening `/admin` lands on `/dashboard` with no error.

Rollback: `psql "$DATABASE_URL" -f web/prisma/migrations/20260926000000_premium_trial/down.sql`, then redeploy the previous `main` commit.

---

## Amendment: per-user time zone and streak (approved 2026-09-26)

These changes are folded into the tasks above during execution:

- **Task 1:** also export `DEFAULT_TIME_ZONE = "Europe/Berlin"`, `isValidTimeZone(tz: unknown): tz is string` (true iff `new Intl.DateTimeFormat("en-US", { timeZone: tz })` does not throw), and `resolveTimeZone(tz?: string | null): string`. `startOfDay` and `dayKey` keep their `timeZone` parameter. Tests: `isValidTimeZone("Asia/Tehran")` is true; `"Mars/Base"`, `""` and `null` are false; `resolveTimeZone("Mars/Base")` is `"Europe/Berlin"`; `startOfDay(at("2026-01-15T08:00:00Z"), "Asia/Tehran")` is `"2026-01-14T20:30:00.000Z"`.
- **Task 2:** `User.timeZone String?` with the comment "IANA zone reported by the browser; daily limits and the streak reset at its midnight." The migration adds `ALTER TABLE "User" ADD COLUMN "timeZone" TEXT;`. down.sql drops it, and the verify checks include it.
- **Task 3:**
  - `getEntitlement` selects `timeZone` and uses `startOfDay(now, resolveTimeZone(user?.timeZone))`.
  - `Entitlement` gains `timeZone: string`.
  - `PATCH /api/me/preferences` accepts `{ locale?, timeZone? }`: at least one is required, each is validated (`isLocale` / `isValidTimeZone`), and only the valid fields are updated.
- **Task 7:** `usersOverDailyCap(rows, cap, exclude, zoneOf: (userId: string) => string)` buckets with `dayKey(row.createdAt, zoneOf(row.userId))`. The overview route loads `{ id, timeZone }` for the users in the rows and passes `(id) => resolveTimeZone(map.get(id))`. The test passes `() => "Europe/Berlin"`.
- **Task 8:**
  - `limit.resets` becomes "Free limits reset at midnight, your time." / "Die kostenlosen Limits werden um Mitternacht (deine Ortszeit) zurückgesetzt."
  - New `web/components/TimeZoneSync.tsx`, rendered inside the session provider in `web/components/Providers.tsx`. When `status === "authenticated"` and `sessionStorage["flashcard:tz-synced"]` is not the current zone, it PATCHes `{ timeZone }` and then sets the flag (both inside try/catch).
- **Task 11 (new): streak in the user's zone.**
  - Move `computeStreak` from `web/app/api/dashboard/route.ts` to `web/lib/streak.ts` as `computeStreak(dates: Date[], now: Date, timeZone: string): number`.
  - It walks back from **local noon** of today (`startOfDay(now, tz) + 12h`, minus `i × 24h`), so a 23- or 25-hour DST day can't skip or repeat a date. It keys days with `dayKey(date, tz)` and keeps "yesterday still counts".
  - Tests: consecutive local days count, a gap breaks the streak, yesterday-only counts, and a streak across the 29 Mar 2026 DST switch in Europe/Berlin is not broken.
  - The dashboard route loads the user's `timeZone` and calls it with `resolveTimeZone(...)`.
