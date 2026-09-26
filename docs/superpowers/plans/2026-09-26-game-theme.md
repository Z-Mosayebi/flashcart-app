# Game Theme & Light Game Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole app the collectible-card game look (dark and light game modes) and add XP, levels, a daily goal, a streak HUD, a card collection and a level-up celebration.

**Architecture:** Game rules are pure functions in `web/lib/game.ts`. Progress is computed on request from existing rows (`Attempt`, `TutorMessage`, `TutorSession`, `CardProgress`) by `web/lib/progress.ts` and served at `GET /api/me/progress`. One migration adds `Attempt.kind` (FIRST/RETRY/DONT_KNOW) and `User.dailyGoal`. The look changes by re-valuing the existing CSS colour tokens. A small window event (`flashcard:progress`) tells the HUD to refetch after answers.

**Tech Stack:** Next.js 14, TypeScript, Prisma 5 / Postgres (Neon), Tailwind, framer-motion, vitest.

**Spec:** `docs/superpowers/specs/2026-09-26-game-theme-design.md`

## Global Constraints

- XP rules:

  | Event | XP |
  |---|---|
  | first CORRECT | +10 |
  | first PARTIAL | +5 |
  | first INCORRECT | +2 |
  | retry CORRECT | +3 |
  | retry PARTIAL / INCORRECT | 0 |
  | "I don't know" | 0 |
  | learner tutor message | +2 |
  | topic mastered | +25 |
  | daily goal reached (per user-local day) | +20 |

- Level L starts at `25 · L · (L − 1)` XP (L2 = 50, L3 = 150, L4 = 300, L5 = 500).
- Daily goal: 5, 10, 20 or 30; default 10. **30 only for premium users and admins**, enforced on the server.
- Today's progress = first answers (FIRST + DONT_KNOW) today, in the user's time zone.
- Theme: Light / Dark / System stay; **System is the default**. Review holo cards stay dark in both modes.
- Mobile first: works at ≈375px, clears the bottom nav, tap targets ≥ 40px. `prefers-reduced-motion` respected.
- All new UI strings in English and German (`web/lib/i18n.ts`).
- Free tiers only; no new paid services or dependencies.
- npm cache: pass `--cache "$TMPDIR/npm-cache"` to any npm install.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A brand-new user** (0 answers, 0 cards) sees level 1, 0 XP, an empty collection and no crash. Pinned in Task 1 (`levelProgress(0)`, empty collection).
2. **A free user sending `dailyGoal: 30` straight to the API** gets 403 and the goal is unchanged. Pinned in Task 1 (`goalAllowed`) and enforced in Task 2.
3. **Light-mode text and buttons** must stay readable (contrast ≥ 4.5:1 for body text and white-on-brand). Pinned in Task 4 by a test that parses `globals.css`.
4. **Level-up must not fire** on first page load or when XP didn't cross a level. Pinned in Task 1 (`isLevelUp`).
5. **Old "I don't know" answers** must be recognised after the migration (not counted as +2 XP). Pinned by a migration rehearsal check in Task 2.

---

## File map

| File | Responsibility |
|---|---|
| `web/lib/game.ts` (+test) | XP, levels, goals, collection, level-up rules (pure) |
| `web/lib/progress.ts` (+test for its pure mapper) | Compute a user's progress from the DB |
| `web/app/api/me/progress/route.ts` | Serve progress |
| `web/lib/progress-events.ts` | `announceProgress()` window event |
| `web/lib/theme-contrast.test.ts` | Contrast check of CSS tokens |
| `web/prisma/*` + migration `20260928000000_game_mechanics` | `Attempt.kind`, `User.dailyGoal` |
| `web/lib/review-record.ts`, `app/api/review/*` | Write `kind` |
| `web/lib/preferences.ts`, `app/api/me/preferences/route.ts` | `dailyGoal` setting |
| `web/app/globals.css`, `web/tailwind.config.js` | Game tokens and components |
| `web/components/usePlayerProgress.ts`, `GameHud.tsx`, `GoalRing.tsx`, `LevelUpCelebration.tsx` | HUD and celebration |
| `web/components/NavBar.tsx`, `app/layout.tsx` | Icons, HUD placement |
| `web/components/Dashboard.tsx` | Redesigned dashboard |
| `web/components/SettingsPanel.tsx`, `TutorChat.tsx`, `ReviewSession.tsx` | Goal setting, +XP notes, events |
| `web/lib/card-sounds.ts` | `levelUp` sound |
| `scripts/verify_migration.mjs` | Checks for the new migration |

---

### Task 1: Game rules (pure)

**Files:**
- Create: `web/lib/game.ts`, `web/lib/game.test.ts`

**Interfaces:**
- Consumes: `rarityForBox`, `Rarity` from `web/lib/card-look.ts`
- Produces:
  - `XP_RULES`
  - `XpCounts { firstCorrect; firstPartial; firstIncorrect; retryCorrect; tutorMessages; topicsMastered; goalDays }` (all numbers)
  - `xpFromCounts(c): number`
  - `levelStartXp(level): number`
  - `levelForXp(xp): number`
  - `levelProgress(xp): { level; levelStartXp; nextLevelXp; pct }`
  - `DAILY_GOALS = [5, 10, 20, 30]`, `DEFAULT_DAILY_GOAL = 10`, `DailyGoal`
  - `isDailyGoal(v): v is DailyGoal`
  - `goalAllowed(goal, { premium, admin }): boolean`
  - `goalDays(dayCounts: number[], goal): number`
  - `Collection = Record<Rarity | "new", number>`
  - `collectionFromBoxes(boxes: number[], owned: number): Collection`
  - `isLevelUp(prev: number | null, next: number): boolean`

- [ ] **Step 1: Write the failing test** — `web/lib/game.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  collectionFromBoxes,
  goalAllowed,
  goalDays,
  isDailyGoal,
  isLevelUp,
  levelForXp,
  levelProgress,
  levelStartXp,
  xpFromCounts,
} from "@/lib/game";

const zero = { firstCorrect: 0, firstPartial: 0, firstIncorrect: 0, retryCorrect: 0, tutorMessages: 0, topicsMastered: 0, goalDays: 0 };

describe("xpFromCounts", () => {
  it("is 0 for a new user", () => expect(xpFromCounts(zero)).toBe(0));
  it("applies every rule", () => {
    expect(xpFromCounts({ ...zero, firstCorrect: 1 })).toBe(10);
    expect(xpFromCounts({ ...zero, firstPartial: 1 })).toBe(5);
    expect(xpFromCounts({ ...zero, firstIncorrect: 1 })).toBe(2);
    expect(xpFromCounts({ ...zero, retryCorrect: 1 })).toBe(3);
    expect(xpFromCounts({ ...zero, tutorMessages: 1 })).toBe(2);
    expect(xpFromCounts({ ...zero, topicsMastered: 1 })).toBe(25);
    expect(xpFromCounts({ ...zero, goalDays: 1 })).toBe(20);
  });
  it("adds them up", () =>
    expect(xpFromCounts({ firstCorrect: 3, firstPartial: 1, firstIncorrect: 2, retryCorrect: 1, tutorMessages: 4, topicsMastered: 1, goalDays: 2 })).toBe(30 + 5 + 4 + 3 + 8 + 25 + 40));
});

describe("levels", () => {
  it("starts each level at 25·L·(L−1)", () => {
    expect([1, 2, 3, 4, 5].map(levelStartXp)).toEqual([0, 50, 150, 300, 500]);
  });
  it("crosses exactly at the boundary", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(49)).toBe(1);
    expect(levelForXp(50)).toBe(2);
    expect(levelForXp(149)).toBe(2);
    expect(levelForXp(150)).toBe(3);
    expect(levelForXp(500)).toBe(5);
  });
  it("reports progress within the level", () => {
    expect(levelProgress(0)).toEqual({ level: 1, levelStartXp: 0, nextLevelXp: 50, pct: 0 });
    expect(levelProgress(320)).toEqual({ level: 4, levelStartXp: 300, nextLevelXp: 500, pct: 10 });
  });
});

describe("daily goal", () => {
  it("accepts only the offered goals", () => {
    expect([5, 10, 20, 30].every(isDailyGoal)).toBe(true);
    expect([0, 7, 50, "10", null].some(isDailyGoal)).toBe(false);
  });
  it("keeps 30 for premium users and admins", () => {
    expect(goalAllowed(30, { premium: false, admin: false })).toBe(false);
    expect(goalAllowed(30, { premium: true, admin: false })).toBe(true);
    expect(goalAllowed(30, { premium: false, admin: true })).toBe(true);
    expect(goalAllowed(20, { premium: false, admin: false })).toBe(true);
  });
  it("counts the days that reached the goal", () => {
    expect(goalDays([12, 9, 10, 3], 10)).toBe(2);
    expect(goalDays([], 10)).toBe(0);
  });
});

describe("collectionFromBoxes", () => {
  it("counts seen cards by rarity and the rest as new", () =>
    expect(collectionFromBoxes([1, 1, 2, 3, 5], 8)).toEqual({ common: 2, uncommon: 1, rare: 1, epic: 0, legendary: 1, new: 3 }));
  it("is all zero for a new user", () =>
    expect(collectionFromBoxes([], 0)).toEqual({ common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, new: 0 }));
});

describe("isLevelUp", () => {
  it("never fires on the first reading", () => expect(isLevelUp(null, 5)).toBe(false));
  it("fires only when the level rises", () => {
    expect(isLevelUp(4, 5)).toBe(true);
    expect(isLevelUp(5, 5)).toBe(false);
    expect(isLevelUp(5, 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd web && npx vitest run lib/game.test.ts`
Expected: FAIL, cannot resolve `@/lib/game`.

- [ ] **Step 3: Implement** — `web/lib/game.ts`

```ts
/**
 * Game rules: XP, levels, the daily goal and the card collection. Pure, so
 * the rules are tested without a database; lib/progress.ts feeds them counts.
 */

import { RARITIES, rarityForBox, type Rarity } from "@/lib/card-look";

export const XP_RULES = {
  firstCorrect: 10,
  firstPartial: 5,
  firstIncorrect: 2,
  retryCorrect: 3,
  tutorMessage: 2,
  topicMastered: 25,
  dailyGoal: 20,
} as const;

export interface XpCounts {
  firstCorrect: number;
  firstPartial: number;
  firstIncorrect: number;
  retryCorrect: number;
  tutorMessages: number;
  topicsMastered: number;
  /** User-local days on which the daily goal was reached. */
  goalDays: number;
}

export function xpFromCounts(c: XpCounts): number {
  return (
    c.firstCorrect * XP_RULES.firstCorrect +
    c.firstPartial * XP_RULES.firstPartial +
    c.firstIncorrect * XP_RULES.firstIncorrect +
    c.retryCorrect * XP_RULES.retryCorrect +
    c.tutorMessages * XP_RULES.tutorMessage +
    c.topicsMastered * XP_RULES.topicMastered +
    c.goalDays * XP_RULES.dailyGoal
  );
}

/** Level L starts at 25·L·(L−1) XP: 0, 50, 150, 300, 500, … */
export function levelStartXp(level: number): number {
  return 25 * level * (level - 1);
}

export function levelForXp(xp: number): number {
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * Math.max(xp, 0)) / 25)) / 2));
  // Guard against floating-point edges right at a boundary.
  while (levelStartXp(level + 1) <= xp) level += 1;
  while (level > 1 && levelStartXp(level) > xp) level -= 1;
  return level;
}

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const start = levelStartXp(level);
  const next = levelStartXp(level + 1);
  return { level, levelStartXp: start, nextLevelXp: next, pct: Math.floor(((xp - start) / (next - start)) * 100) };
}

export const DAILY_GOALS = [5, 10, 20, 30] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number];
export const DEFAULT_DAILY_GOAL: DailyGoal = 10;
const PREMIUM_ONLY_GOAL = 30;

export function isDailyGoal(v: unknown): v is DailyGoal {
  return typeof v === "number" && (DAILY_GOALS as readonly number[]).includes(v);
}

/** 30 cards a day is past the free plan's 30 graded answers, so it's premium. */
export function goalAllowed(goal: DailyGoal, who: { premium: boolean; admin: boolean }): boolean {
  return goal !== PREMIUM_ONLY_GOAL || who.premium || who.admin;
}

export function goalDays(dayCounts: number[], goal: number): number {
  return dayCounts.filter((n) => n >= goal).length;
}

export type Collection = Record<Rarity | "new", number>;

/** Seen cards by rarity (from their Leitner box); owned but never answered = new. */
export function collectionFromBoxes(boxes: number[], owned: number): Collection {
  const c = Object.fromEntries([...RARITIES, "new"].map((k) => [k, 0])) as Collection;
  for (const box of boxes) c[rarityForBox(box)] += 1;
  c.new = Math.max(owned - boxes.length, 0);
  return c;
}

/** A level-up only counts when a previous reading exists and was lower. */
export function isLevelUp(prev: number | null, next: number): boolean {
  return prev !== null && next > prev;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd web && npx vitest run lib/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/game.ts web/lib/game.test.ts
git commit -m "Add game rules: XP, levels, daily goal and collection"
```

---

### Task 2: Migration, `kind` on attempts, `dailyGoal` preference

**Files:**
- Modify: `web/prisma/schema.prisma`, `web/lib/review-record.ts`, `web/app/api/review/submit/route.ts`, `web/app/api/review/dont-know/route.ts`, `web/lib/preferences.ts`, `web/lib/preferences.test.ts`, `web/app/api/me/preferences/route.ts`, `scripts/verify_migration.mjs`
- Create: `web/prisma/migrations/20260928000000_game_mechanics/migration.sql`, `down.sql`

**Interfaces:**
- Consumes: `isDailyGoal`, `goalAllowed`, `DailyGoal` (Task 1); `getEntitlement` (`web/lib/entitlements.ts`)
- Produces:
  - `Attempt.kind: "FIRST" | "RETRY" | "DONT_KNOW"`
  - `User.dailyGoal: number`
  - `FirstAnswer.kind: "FIRST" | "DONT_KNOW"`
  - `PreferencesUpdate.dailyGoal?: DailyGoal`

- [ ] **Step 1: Failing preference test.** Append to `web/lib/preferences.test.ts`:

```ts
describe("preferencesUpdate — daily goal", () => {
  it("accepts an offered goal", () => expect(preferencesUpdate({ dailyGoal: 20 })).toEqual({ dailyGoal: 20 }));
  it("drops a goal that isn't offered", () => expect(preferencesUpdate({ dailyGoal: 7 })).toBeNull());
});
```

Run: `cd web && npx vitest run lib/preferences.test.ts`
Expected: the two new tests FAIL.

- [ ] **Step 2: Implement it** in `web/lib/preferences.ts`:
  - Add `dailyGoal?: DailyGoal` to `PreferencesUpdate`.
  - Add `if (isDailyGoal(b.dailyGoal)) update.dailyGoal = b.dailyGoal;`.
  - Import from `@/lib/game`.

Run it again. Expected: PASS.

- [ ] **Step 3: Schema.** In `web/prisma/schema.prisma`:
  - Add to `model User`, after `blockedAt`:
    ```prisma
      // Cards per day the learner aims for: 5, 10, 20 or 30 (30 needs premium).
      dailyGoal Int @default(10)
    ```
  - Add the enum:
    ```prisma
    // First answer to a card, the one retry after a miss, or "I don't know".
    // Only first answers move a card between boxes; XP weighs each differently.
    enum AttemptKind {
      FIRST
      RETRY
      DONT_KNOW
    }
    ```
  - Add to `model Attempt`: `kind AttemptKind @default(FIRST)`.

- [ ] **Step 4: Generate the SQL offline and add the backfill**

```bash
cd web
git show main:web/prisma/schema.prisma > "$TMPDIR/schema-before3.prisma"
mkdir -p prisma/migrations/20260928000000_game_mechanics
npx prisma migrate diff --from-schema-datamodel "$TMPDIR/schema-before3.prisma" --to-schema-datamodel prisma/schema.prisma --script
```

Expected output, and nothing else:
- `CREATE TYPE "AttemptKind"`
- `ALTER TABLE "Attempt" ADD COLUMN "kind" …DEFAULT 'FIRST'`
- `ALTER TABLE "User" ADD COLUMN "dailyGoal" INTEGER NOT NULL DEFAULT 10`

Write `migration.sql` as a header comment, then that SQL, then:

```sql
-- "I don't know" answers were stored with this placeholder answer; mark them
-- so they earn no XP. (A new enum type can be used in the same transaction.)
UPDATE "Attempt" SET "kind" = 'DONT_KNOW' WHERE "userAnswer" = '—';
```

`down.sql`:

```sql
-- Reverse of 20260928000000_game_mechanics. Applied by hand:
--     psql "$DATABASE_URL" -f web/prisma/migrations/20260928000000_game_mechanics/down.sql
-- Drops the daily goal (everyone back to the default experience) and the
-- attempt kind (retries and "I don't know" become indistinguishable again).
BEGIN;
ALTER TABLE "Attempt" DROP COLUMN IF EXISTS "kind";
DROP TYPE IF EXISTS "AttemptKind";
ALTER TABLE "User" DROP COLUMN IF EXISTS "dailyGoal";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260928000000_game_mechanics';
COMMIT;
```

- [ ] **Step 5: Rehearsal checks.** In `scripts/verify_migration.mjs`, add this entry to `CHECKS`:

```js
  "20260928000000_game_mechanics": {
    async up(tx) {
      check("User.dailyGoal added", (await columnsOf(tx, "User")).includes("dailyGoal"));
      check("Attempt.kind added", (await columnsOf(tx, "Attempt")).includes("kind"));
      const [row] = await tx.$queryRawUnsafe(
        `SELECT COUNT(*) FILTER (WHERE "userAnswer" = '—')::int AS dk,
                COUNT(*) FILTER (WHERE "kind"::text = 'DONT_KNOW')::int AS marked
           FROM "Attempt"`
      );
      check("old 'I don't know' answers marked DONT_KNOW", row.dk === row.marked, JSON.stringify(row));
    },
    async down(tx) {
      check("User.dailyGoal removed", !(await columnsOf(tx, "User")).includes("dailyGoal"));
      check("Attempt.kind removed", !(await columnsOf(tx, "Attempt")).includes("kind"));
    },
  },
```

- [ ] **Step 6: Write `kind` on every attempt.**
  - `web/lib/review-record.ts`: add `kind: "FIRST" | "DONT_KNOW";` to `FirstAnswer` and `kind: a.kind,` to the `attempt.create` data.
  - `web/app/api/review/submit/route.ts`: pass `kind: "FIRST"` to `recordFirstAnswer`, and add `kind: "RETRY",` to the retry branch's `prisma.attempt.create` data.
  - `web/app/api/review/dont-know/route.ts`: pass `kind: "DONT_KNOW"`.

- [ ] **Step 7: Enforce premium-only 30.** In `web/app/api/me/preferences/route.ts`, after `const update = preferencesUpdate(body)`, add:

```ts
  if (update.dailyGoal !== undefined) {
    const ent = await getEntitlement(userId);
    if (!goalAllowed(update.dailyGoal, { premium: ent.plan === "premium", admin: ent.admin })) {
      return NextResponse.json({ error: "goal_premium_only" }, { status: 403 });
    }
  }
```

Also add the imports `getEntitlement` and `goalAllowed`.

- [ ] **Step 8: Verify**

Run: `cd web && npx prisma generate && npx tsc --noEmit -p . && npm run lint && npx vitest run`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add web/prisma web/lib/review-record.ts web/app/api/review web/lib/preferences.ts web/lib/preferences.test.ts web/app/api/me/preferences/route.ts scripts/verify_migration.mjs
git commit -m "Record the kind of each attempt and store a daily goal"
```

---

### Task 3: Progress service and API

**Files:**
- Create: `web/lib/progress.ts`, `web/lib/progress.test.ts`, `web/app/api/me/progress/route.ts`

**Interfaces:**
- Consumes: Task 1 (`xpFromCounts`, `levelProgress`, `goalDays`, `collectionFromBoxes`, `DEFAULT_DAILY_GOAL`, `XpCounts`); `resolveTimeZone`, `dayKey` (`lib/plans`); `computeStreak` (`lib/streak`)
- Produces:
  - `countsFromGroups(rows: { kind: string; result: string; _count: { _all: number } }[]): Pick<XpCounts, "firstCorrect" | "firstPartial" | "firstIncorrect" | "retryCorrect">`
  - `PlayerProgress { xp; level; levelStartXp; nextLevelXp; pct; streak; today: { done; goal }; collection: Collection; dueNow }`
  - `getProgress(userId, now?): Promise<PlayerProgress>`
  - `GET /api/me/progress → PlayerProgress`

- [ ] **Step 1: Failing test** — `web/lib/progress.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { countsFromGroups } from "@/lib/progress";

const g = (kind: string, result: string, n: number) => ({ kind, result, _count: { _all: n } });

describe("countsFromGroups", () => {
  it("maps first answers and correct retries; ignores the rest", () =>
    expect(
      countsFromGroups([
        g("FIRST", "CORRECT", 4),
        g("FIRST", "PARTIAL", 2),
        g("FIRST", "INCORRECT", 3),
        g("RETRY", "CORRECT", 1),
        g("RETRY", "INCORRECT", 5),
        g("DONT_KNOW", "INCORRECT", 6),
      ])
    ).toEqual({ firstCorrect: 4, firstPartial: 2, firstIncorrect: 3, retryCorrect: 1 }));
  it("is all zero with no attempts", () =>
    expect(countsFromGroups([])).toEqual({ firstCorrect: 0, firstPartial: 0, firstIncorrect: 0, retryCorrect: 0 }));
});
```

Run: `cd web && npx vitest run lib/progress.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 2: Implement** — `web/lib/progress.ts`

```ts
/**
 * A learner's game progress, computed from rows the app already stores —
 * no XP counter to drift, and a rule change re-scores everyone correctly.
 */

import { prisma } from "@/lib/prisma";
import { dayKey, resolveTimeZone } from "@/lib/plans";
import { computeStreak } from "@/lib/streak";
import {
  DEFAULT_DAILY_GOAL,
  collectionFromBoxes,
  goalDays,
  levelProgress,
  xpFromCounts,
  type Collection,
  type XpCounts,
} from "@/lib/game";

type AttemptGroup = { kind: string; result: string; _count: { _all: number } };

export function countsFromGroups(rows: AttemptGroup[]) {
  const n = (kind: string, result: string) =>
    rows.find((r) => r.kind === kind && r.result === result)?._count._all ?? 0;
  return {
    firstCorrect: n("FIRST", "CORRECT"),
    firstPartial: n("FIRST", "PARTIAL"),
    firstIncorrect: n("FIRST", "INCORRECT"),
    retryCorrect: n("RETRY", "CORRECT"),
  } satisfies Partial<XpCounts>;
}

export interface PlayerProgress {
  xp: number;
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  pct: number;
  streak: number;
  today: { done: number; goal: number };
  collection: Collection;
  dueNow: number;
}

export async function getProgress(userId: string, now: Date = new Date()): Promise<PlayerProgress> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true, dailyGoal: true } });
  const tz = resolveTimeZone(user?.timeZone);
  const goal = user?.dailyGoal ?? DEFAULT_DAILY_GOAL;

  const [groups, tutorMessages, topicsMastered, perDay, boxes, owned, recent, dueSeen] = await Promise.all([
    prisma.attempt.groupBy({ by: ["kind", "result"], where: { userId }, _count: { _all: true } }),
    prisma.tutorMessage.count({ where: { role: "USER", session: { userId } } }),
    prisma.tutorSession.count({ where: { userId, mastered: true } }),
    // First answers per user-local day, for today's goal and the goal bonus.
    prisma.$queryRaw<{ day: string; n: number }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS n
        FROM "Attempt"
       WHERE "userId" = ${userId} AND "kind"::text IN ('FIRST', 'DONT_KNOW')
       GROUP BY 1`,
    prisma.cardProgress.findMany({ where: { userId }, select: { box: true } }),
    prisma.card.count({ where: { ownerId: userId } }),
    prisma.attempt.findMany({ where: { userId }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.cardProgress.count({ where: { userId, dueAt: { lte: now } } }),
  ]);

  const xp = xpFromCounts({
    ...countsFromGroups(groups as unknown as AttemptGroup[]),
    tutorMessages,
    topicsMastered,
    goalDays: goalDays(perDay.map((d) => d.n), goal),
  });
  const collection = collectionFromBoxes(boxes.map((b) => b.box), owned);
  const today = perDay.find((d) => d.day === dayKey(now, tz))?.n ?? 0;

  return {
    xp,
    ...levelProgress(xp),
    streak: computeStreak(recent.map((r) => r.createdAt), now, tz),
    today: { done: today, goal },
    collection,
    // Unseen cards are due immediately, as in /api/cards/due.
    dueNow: dueSeen + collection.new,
  };
}
```

`web/app/api/me/progress/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getProgress } from "@/lib/progress";

/** GET /api/me/progress — XP, level, streak, today's goal, collection. */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getProgress(userId));
}
```

- [ ] **Step 3: Verify**

Run: `cd web && npx vitest run lib/progress.test.ts && npx tsc --noEmit -p .`
Expected: PASS; tsc 0.

- [ ] **Step 4: Commit**

```bash
git add web/lib/progress.ts web/lib/progress.test.ts web/app/api/me/progress
git commit -m "Compute player progress and serve it at /api/me/progress"
```

---

### Task 4: Game colour tokens and components (both modes)

**Files:**
- Modify: `web/app/globals.css`, `web/tailwind.config.js`
- Create: `web/lib/theme-contrast.test.ts`

**Interfaces:**
- Produces:
  - CSS tokens `--gold` and `--brand-2` (plus the re-valued existing tokens)
  - Tailwind colour `gold`
  - Classes `.card-surface`, `.btn-primary`, `.btn-ghost` in game style

- [ ] **Step 1: Failing contrast test** — `web/lib/theme-contrast.test.ts`

```ts
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

/** Token values ("r g b") declared in the first block matching `selector {`. */
function tokens(selector: string): Record<string, number[]> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const out: Record<string, number[]> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) out[m[1]] = [+m[2], +m[3], +m[4]];
  return out;
}

const lum = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe.each([[":root"], [".dark"]])("%s game palette", (sel) => {
  const t = tokens(sel);
  it("defines the gold accent", () => expect(t.gold).toBeDefined());
  it("keeps body text readable on the page and on panels", () => {
    expect(contrast(t.ink, t.canvas)).toBeGreaterThanOrEqual(7);
    expect(contrast(t.ink, t.surface)).toBeGreaterThanOrEqual(7);
    expect(contrast(t["ink-muted"], t.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps white button text readable on the brand colour", () =>
    expect(contrast([255, 255, 255], t.brand)).toBeGreaterThanOrEqual(4.5));
});
```

Run: `cd web && npx vitest run lib/theme-contrast.test.ts`
Expected: FAIL on "defines the gold accent" (and in dark mode, white on the current `--brand` is under 4.5).

- [ ] **Step 2: Re-value tokens.** In `web/app/globals.css`, replace the `:root { … }` and `.dark { … }` token blocks with:

```css
  /* Light game mode: warm cream, gold frames, purple actions. */
  :root {
    --canvas: 250 246 236;
    --surface: 255 255 255;
    --surface-raised: 255 250 238;
    --line: 236 220 174;
    --ink: 27 35 64;
    --ink-muted: 88 94 122;
    --ink-faint: 139 143 166;
    --brand: 98 80 224;
    --brand-2: 142 125 255;
    --brand-soft: 238 235 255;
    --gold: 190 140 40;
    --glow: 255 243 214;
    --positive: 4 120 87;
    --caution: 180 83 9;
    --critical: 190 18 60;
  }

  /* Dark game mode: deep navy, gold and purple glow. */
  .dark {
    --canvas: 13 16 32;
    --surface: 26 32 54;
    --surface-raised: 34 41 68;
    --line: 52 61 96;
    --ink: 238 240 255;
    --ink-muted: 182 190 216;
    --ink-faint: 130 140 175;
    --brand: 118 100 240;
    --brand-2: 170 110 250;
    --brand-soft: 42 36 92;
    --gold: 232 198 90;
    --glow: 29 33 64;
    --positive: 52 211 153;
    --caution: 251 191 36;
    --critical: 251 113 133;
  }
```

In the `body` rule, add below the `@apply`:

```css
    /* A soft glow at the top of every page. Not fixed (mobile Safari). */
    background-image: radial-gradient(120% 60% at 50% 0%, rgb(var(--glow)) 0%, transparent 60%);
    background-repeat: no-repeat;
```

- [ ] **Step 3: Game components.** Replace `.card-surface`, `.btn-primary` and `.btn-ghost` in `@layer components` with:

```css
  .card-surface {
    @apply rounded-2xl border bg-surface;
    border-color: rgb(var(--gold) / 0.28);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.04), 0 10px 26px -10px rgb(var(--gold) / 0.28);
  }
  .dark .card-surface {
    box-shadow: 0 0 0 1px rgb(var(--line)), 0 0 22px -6px rgb(var(--brand) / 0.35);
  }

  .btn-primary {
    @apply inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3
           font-semibold text-white transition-all duration-200
           hover:brightness-110 active:scale-[0.98]
           disabled:opacity-40 disabled:pointer-events-none;
    background-image: linear-gradient(90deg, rgb(var(--brand)), rgb(var(--brand-2)));
    box-shadow: 0 6px 18px -4px rgb(var(--brand) / 0.55);
  }

  .btn-ghost {
    @apply inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border
           bg-surface px-5 py-3 font-medium text-ink transition-all duration-200
           hover:bg-surface-raised active:scale-[0.98]
           disabled:opacity-40 disabled:pointer-events-none;
    border-color: rgb(var(--gold) / 0.45);
  }
```

In `web/tailwind.config.js` colours, add `gold: "rgb(var(--gold) / <alpha-value>)",`.

- [ ] **Step 4: Verify**

Run: `cd web && npx vitest run lib/theme-contrast.test.ts && npx vitest run && npm run lint && npm run build`
Expected: contrast PASS in both modes; everything green. If a contrast assertion fails, adjust only that token's value until it passes, and ledger the change.

- [ ] **Step 5: Commit**

```bash
git add web/app/globals.css web/tailwind.config.js web/lib/theme-contrast.test.ts
git commit -m "Game colour tokens for light and dark, with a contrast test"
```

---

### Task 5: HUD, nav icons, level-up celebration

**Files:**
- Create: `web/lib/progress-events.ts`, `web/components/usePlayerProgress.ts`, `web/components/GoalRing.tsx`, `web/components/GameHud.tsx`, `web/components/LevelUpCelebration.tsx`
- Modify: `web/lib/card-sounds.ts`, `web/components/NavBar.tsx`, `web/app/layout.tsx`, `web/components/ReviewSession.tsx`, `web/components/TutorChat.tsx`, `web/lib/i18n.ts`

**Interfaces:**
- Consumes: `GET /api/me/progress` (Task 3), `isLevelUp` (Task 1), `playCardSound` (`lib/card-sounds`)
- Produces:
  - `PROGRESS_EVENT = "flashcard:progress"`
  - `announceProgress(): void`
  - `usePlayerProgress(): { progress: PlayerProgressDto | null; levelUp: number | null; dismissLevelUp: () => void }`
  - `<GoalRing done goal size? />`
  - `<GameHud />`
  - `<LevelUpCelebration level onClose />`
  - `CardSound` gains `"levelUp"`

- [ ] **Step 1: Event helper** — `web/lib/progress-events.ts`

```ts
/** Fired after anything that can change XP, so the HUD refetches. */
export const PROGRESS_EVENT = "flashcard:progress";

export function announceProgress(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROGRESS_EVENT));
}
```

- [ ] **Step 2: Hook** — `web/components/usePlayerProgress.ts`

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isLevelUp } from "@/lib/game";
import { PROGRESS_EVENT } from "@/lib/progress-events";

export interface PlayerProgressDto {
  xp: number;
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  pct: number;
  streak: number;
  today: { done: number; goal: number };
  collection: { common: number; uncommon: number; rare: number; epic: number; legendary: number; new: number };
  dueNow: number;
}

/** Progress for the signed-in player; refetches on PROGRESS_EVENT and reports level-ups. */
export function usePlayerProgress() {
  const [progress, setProgress] = useState<PlayerProgressDto | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const lastLevel = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/progress", { cache: "no-store" });
      if (!res.ok) return;
      const data: PlayerProgressDto = await res.json();
      if (isLevelUp(lastLevel.current, data.level)) setLevelUp(data.level);
      lastLevel.current = data.level;
      setProgress(data);
    } catch {
      /* the HUD simply keeps its last reading */
    }
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener(PROGRESS_EVENT, onChange);
    return () => window.removeEventListener(PROGRESS_EVENT, onChange);
  }, [load]);

  return { progress, levelUp, dismissLevelUp: () => setLevelUp(null) };
}
```

- [ ] **Step 3: Goal ring** — `web/components/GoalRing.tsx`

```tsx
/** A ring that fills with today's answers toward the daily goal. */
export default function GoalRing({ done, goal, size = 40 }: { done: number; goal: number; size?: number }) {
  const stroke = size >= 60 ? 7 : 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.min(done / Math.max(goal, 1), 1);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} / ${goal}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgb(var(--gold))"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={size >= 60 ? 15 : 10}
        fontWeight={800}
        fill="rgb(var(--ink))"
      >
        {Math.min(done, goal)}/{goal}
      </text>
    </svg>
  );
}
```

- [ ] **Step 4: Level-up sound.** In `web/lib/card-sounds.ts`:
  - Change the type to `"deal" | "flip" | "correct" | "wrong" | "complete" | "levelUp"`.
  - Add to `PLAYERS`:

```ts
  // New level: a bright rising fanfare.
  levelUp(ac) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ac, f, i * 0.08, 0.35, 0.11, "triangle"));
  },
```

- [ ] **Step 5: Celebration** — `web/components/LevelUpCelebration.tsx`

```tsx
"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { usePreferences } from "@/components/PreferencesProvider";
import { playCardSound } from "@/lib/card-sounds";

/** A short, dismissible "Level N!" burst; closes itself after a few seconds. */
export default function LevelUpCelebration({ level, onClose }: { level: number; onClose: () => void }) {
  const { t, cardSounds } = usePreferences();

  useEffect(() => {
    if (cardSounds) playCardSound("levelUp");
    const timer = setTimeout(onClose, 3200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      role="status"
      aria-live="polite"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6"
    >
      <motion.div
        initial={{ scale: 0.6, rotate: -6 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        className="relative rounded-3xl border-2 border-gold bg-surface px-10 py-8 text-center shadow-[0_0_60px_rgb(var(--gold)/0.55)]"
      >
        <p className="text-4xl">✨</p>
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-gold">{t("game.levelUp")}</p>
        <p className="mt-1 font-display text-5xl font-extrabold text-ink">{t("game.level", { n: level })}</p>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 6: HUD** — `web/components/GameHud.tsx`

```tsx
"use client";

import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { usePreferences } from "@/components/PreferencesProvider";
import UserAvatar from "@/components/UserAvatar";
import GoalRing from "@/components/GoalRing";
import LevelUpCelebration from "@/components/LevelUpCelebration";
import { usePlayerProgress } from "@/components/usePlayerProgress";

/** The player bar under the nav: level, XP, streak, today's goal. */
export default function GameHud() {
  const { status, data: session } = useSession();
  const pathname = usePathname();
  const { t } = usePreferences();
  const { progress, levelUp, dismissLevelUp } = usePlayerProgress();

  if (status !== "authenticated" || pathname === "/" || !progress) return null;

  return (
    <>
      <div className="mx-auto max-w-5xl px-4 pt-3 sm:px-6">
        <div className="card-surface flex items-center gap-3 px-3 py-2">
          <div className="relative shrink-0">
            <UserAvatar name={session?.user?.name} email={session?.user?.email} image={session?.user?.image} size={34} />
            <span className="absolute -bottom-1 -right-2 rounded-full bg-gold px-1.5 text-[9px] font-extrabold text-[#221700]">
              {t("game.lvShort", { n: progress.level })}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-[11px] text-ink-muted">
              <span>{t("game.level", { n: progress.level })}</span>
              <span className="tabular-nums">
                {progress.xp} / {progress.nextLevelXp} XP
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progress.pct}%`,
                  backgroundImage: "linear-gradient(90deg, rgb(var(--brand)), rgb(var(--gold)))",
                }}
              />
            </div>
          </div>
          <span className="shrink-0 text-sm font-extrabold text-caution" title={t("dashboard.streak")}>
            🔥 {progress.streak}
          </span>
          {/* The ring needs room: hidden on phones, where the bar stays compact. */}
          <span className="hidden sm:block">
            <GoalRing done={progress.today.done} goal={progress.today.goal} size={40} />
          </span>
        </div>
      </div>
      <AnimatePresence>
        {levelUp !== null && <LevelUpCelebration level={levelUp} onClose={dismissLevelUp} />}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 7: Place the HUD; nav icons.**
  - In `web/app/layout.tsx`, import `GameHud` and render `<GameHud />` directly after `<NavBar />`.
  - In `web/components/NavBar.tsx`, replace each item's `icon` SVG with an emoji span:
    - Review → `<span aria-hidden className="text-lg">🃏</span>`
    - Tutor → `💬`
    - Dashboard → `🏆`
    - admin → `🛡️`
  - Render `{item.icon}` before the label in the desktop nav as well.

- [ ] **Step 8: Announce progress after answers.**
  - In `web/components/ReviewSession.tsx`, import `announceProgress` and call it:
    - after `reload();` in `submit`
    - after `setStage("done");` in `dontKnow`
  - In `web/components/TutorChat.tsx`, call it after `reload();` in `send`.

- [ ] **Step 9: Strings.** Add to `en` in `web/lib/i18n.ts`:
  - `"game.level": "Level {n}"`
  - `"game.lvShort": "Lv {n}"`
  - `"game.levelUp": "Level up!"`

  Add to `de`:
  - `"game.level": "Level {n}"`
  - `"game.lvShort": "Lv {n}"`
  - `"game.levelUp": "Levelaufstieg!"`

- [ ] **Step 10: Verify and commit**

Run: `cd web && npx tsc --noEmit -p . && npm run lint && npx vitest run && npm run build`
Expected: all green.

```bash
git add web/lib/progress-events.ts web/components web/lib/card-sounds.ts web/app/layout.tsx web/lib/i18n.ts
git commit -m "Add the player HUD, nav icons and a level-up celebration"
```

---

### Task 6: Dashboard redesign

**Files:**
- Modify: `web/components/Dashboard.tsx` (rewrite), `web/lib/i18n.ts`

**Interfaces:**
- Consumes:
  - `GET /api/dashboard` (existing; uses `topicMastery`, `recentMistakes`, `accuracyPct`, `totalAttempts`, `totalCards`)
  - `usePlayerProgress`, `GoalRing` (Task 5)
  - `RARITIES` (`lib/card-look`)

- [ ] **Step 1: Strings.** Add to `en`:
  - `"dashboard.today": "Today"`
  - `"dashboard.goalLeft": "{n} more to reach today's goal — +20 XP when you do."`
  - `"dashboard.goalDone": "Goal reached — +20 XP earned today! 🎉"`
  - `"dashboard.play": "▶ Play · {n} cards due"`
  - `"dashboard.caughtUp": "All caught up ✓"`
  - `"dashboard.collection": "Your collection"`
  - `"dashboard.new": "New"`
  - `"dashboard.topics": "Topics"`
  - `"dashboard.answers": "Answers"`

  Add to `de`:
  - `"dashboard.today": "Heute"`
  - `"dashboard.goalLeft": "Noch {n} bis zum Tagesziel — dafür gibt es +20 XP."`
  - `"dashboard.goalDone": "Tagesziel erreicht — +20 XP verdient! 🎉"`
  - `"dashboard.play": "▶ Spielen · {n} Karten fällig"`
  - `"dashboard.caughtUp": "Alles erledigt ✓"`
  - `"dashboard.collection": "Deine Sammlung"`
  - `"dashboard.new": "Neu"`
  - `"dashboard.topics": "Themen"`
  - `"dashboard.answers": "Antworten"`

- [ ] **Step 2: Rewrite** `web/components/Dashboard.tsx`. Keep its data interfaces (`TopicMastery`, `Mistake`, `DashboardData`), and its loading / error / empty branches with their existing strings. Replace the main render with this layout, in this order:
  1. **Today:** a `card-surface` holding `<GoalRing size={74} />` from `usePlayerProgress().progress.today`, and either `dashboard.goalLeft` (n = goal − done) or `dashboard.goalDone`.
  2. **Play:** a full-width `Link` to `/review`, styled `btn-primary w-full py-4 text-base`, labelled `dashboard.play` (n = `progress.dueNow`). When `dueNow === 0`, render a non-link `card-surface` with `dashboard.caughtUp` instead.
  3. **Collection:** a `grid grid-cols-6 gap-2` of mini cards, one per `RARITIES` value plus `new`. Each is a `holo-card rarity-<r>` element at aspect 3/4 with the count (`text-lg font-extrabold`) and the translated rarity label (`card.rarity.<r>`; `dashboard.new` for new) in `text-[10px]`. The `new` card uses `card-surface` instead of `holo-card`.
  4. **Topics:** for each `topicMastery`, the name and `pct%`, then an `h-2 rounded-full bg-line` bar filled `pct%` with the brand→gold gradient.
  5. **Stat tiles:** a two-tile grid (`dashboard.accuracy` with `%`, and `dashboard.answers` = `totalAttempts`), using the existing `StatTile`.
  6. **Recent mistakes:** keep the existing list markup unchanged.

  All section headings use `text-xs font-semibold uppercase tracking-wider text-ink-faint`. Remove the old four-tile row and the Leitner-box bar chart: their information now lives in the HUD and the collection.

- [ ] **Step 3: Verify and commit**

Run: `cd web && npx tsc --noEmit -p . && npm run lint && npx vitest run && npm run build`
Expected: all green.

```bash
git add web/components/Dashboard.tsx web/lib/i18n.ts
git commit -m "Redesign the dashboard around today's goal, play and the collection"
```

---

### Task 7: Settings goal, tutor and review XP notes

**Files:**
- Modify: `web/components/SettingsPanel.tsx`, `web/components/TutorChat.tsx`, `web/components/ReviewSession.tsx`, `web/app/api/me/plan/route.ts` (no change needed if `plan` / `admin` are already returned), `web/lib/i18n.ts`, `web/app/api/me/progress/route.ts` (unchanged)

**Interfaces:**
- Consumes: `PATCH /api/me/preferences { dailyGoal }` (Task 2), `usePlan` (existing; gives `plan` and `admin`), `usePlayerProgress` (Task 5), `DAILY_GOALS`, `goalAllowed` (Task 1)

- [ ] **Step 1: Strings.** Add to `en`:
  - `"settings.goal": "Daily goal"`
  - `"settings.goalHint": "Cards per day. Reaching it earns +20 XP."`
  - `"settings.goalPremium": "Premium"`
  - `"tutor.masteredXp": "+25 XP"`
  - `"review.sessionXp": "+{n} XP this session"`

  Add to `de`:
  - `"settings.goal": "Tagesziel"`
  - `"settings.goalHint": "Karten pro Tag. Erreichst du es, gibt es +20 XP."`
  - `"settings.goalPremium": "Premium"`
  - `"tutor.masteredXp": "+25 XP"`
  - `"review.sessionXp": "+{n} XP in dieser Runde"`

- [ ] **Step 2: Goal selector in Settings.** In `web/components/SettingsPanel.tsx`, add a `card-surface` section after the plan card. It holds the heading `settings.goal`, the hint `settings.goalHint`, and four buttons, one for each value in `DAILY_GOALS`, each `min-h-11 min-w-14`:
  - **Selected:** `bg-brand text-white`.
  - **Locked:** a goal is locked when `!goalAllowed(g, { premium: plan?.plan === "premium", admin: !!plan?.admin })`. Show it as `🔒 30`, with `settings.goalPremium` underneath, disabled.
  - The current goal comes from `usePlayerProgress().progress?.today.goal`.
  - **On click:**

    ```ts
    await fetch("/api/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyGoal: g }),
    });
    announceProgress();
    ```

- [ ] **Step 3: Tutor mastered XP.** In `web/components/TutorChat.tsx`, inside the existing "mastered" banner, add `<span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-bold text-gold">{t("tutor.masteredXp")}</span>`.

- [ ] **Step 4: Session XP in Review.** In `web/components/ReviewSession.tsx`:
  - `const { progress } = usePlayerProgress();`
  - `const startXp = useRef<number | null>(null);`
  - `useEffect(() => { if (progress && startXp.current === null) startXp.current = progress.xp; }, [progress]);`
  - In the finished-session screen, under the accuracy line, when `progress && startXp.current !== null && progress.xp > startXp.current`, render:

    ```tsx
    <p className="mt-2 font-bold text-gold">
      {t("review.sessionXp", { n: progress.xp - startXp.current })}
    </p>
    ```

- [ ] **Step 5: Verify and commit**

Run: `cd web && npx tsc --noEmit -p . && npm run lint && npx vitest run && npm run build`
Expected: all green.

```bash
git add web/components web/lib/i18n.ts
git commit -m "Daily goal setting, tutor mastery XP and session XP in review"
```

---

### Task 8: Docs, full check, review, rollout

- [ ] **Step 1: README.** Add a subsection "Game mechanics" under section 7 (free plan) with the XP table, the level formula and the daily-goal rules.

- [ ] **Step 2: ADR.** Add ADR-016 "XP computed from records, not stored": what the decision is, what it costs (a few aggregate queries per HUD refresh), and why (rules can change; nothing to drift). Add its row to the ADR index table.

- [ ] **Step 3: Full verification**

```bash
cd ai-service && python -m pytest tests/ -q && cd ..
cd web && npx tsc --noEmit -p . && npm run lint && npx vitest run && npm run build
```

Expected: all green. Commit the docs.

- [ ] **Step 4: Rehearse the migration** (safe, rolled back):
  `node scripts/verify_migration.mjs 20260928000000_game_mechanics` must show every check PASS.

- [ ] **Step 5: Final independent review** of the branch (executing-plans final review).

- [ ] **Step 6: Rollout — CHECKPOINT: ask the owner before touching the production database.**
  1. Back up with `node scripts/backup_db.mjs`.
  2. Apply with `cd web && npx prisma migrate deploy`.
  3. Check that the counts are unchanged.
  4. Merge `feature/game-theme` into `main`, push, and watch CI.
  5. Give the owner a test list:
     - the HUD in light and dark
     - the dashboard
     - a level-up (answer until XP crosses a boundary)
     - the daily goal setting, with 30 locked for free users
     - everything at phone width
