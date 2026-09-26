# Game theme and light game mechanics — design

Date: 2026-09-26 · Status: approved in conversation, awaiting spec review

## Why

The review screen now uses collectible holo cards. The rest of the app should
feel like the same game, and give learners reasons to come back: visible
progress (XP and levels), a daily goal, a streak and a card collection. Scope
is option B from the brainstorm: look plus light mechanics. Achievements and
medals are a possible later project.

Constraints: mobile first (≈375px, bottom nav, ≥40px targets); free tiers
only; English and German UI; `prefers-reduced-motion` respected.

## Look

- **Two game modes**, both kept: dark (navy, gold, purple glow) and light
  (cream, gold frames, purple actions). Theme setting keeps Light / Dark /
  System; **System stays the default**.
- Implemented by re-valuing the existing colour tokens (`--canvas`,
  `--surface`, `--ink`, `--brand`, …) for `:root` and `.dark`, plus a gold
  accent token, so every page changes at once. Review holo cards stay dark in
  both modes (they already scope their own tokens).
- Shared components restyled: `.btn-primary` (gradient + soft glow),
  `.btn-ghost` (gold edge), `.card-surface` (rounder, subtle gold edge, glow in
  dark), headings a little bolder. Nav items get icons (🃏 Review, 💬 Tutor,
  🏆 Dashboard, ⚙️ settings, admin shield).
- Motion is calm (as the cards); reduced motion disables it.

## Game mechanics

### XP rules

| Event | XP |
|---|---|
| First answer CORRECT | +10 |
| First answer PARTIAL | +5 |
| First answer INCORRECT | +2 |
| Retry CORRECT | +3 |
| Retry PARTIAL / INCORRECT | 0 |
| "I don't know" | 0 |
| Learner message to the tutor | +2 |
| Tutor declares a topic mastered | +25 |
| Daily goal reached (per user-local day) | +20 |

XP is **computed from existing records** on request (no XP counter), so it
stays correct if the rules change.

To tell first answers, retries and "I don't know" apart, `Attempt` gains
`kind AttemptKind @default(FIRST)` with values FIRST, RETRY, DONT_KNOW. The
migration backfills existing "I don't know" rows (`userAnswer = '—'`) to
DONT_KNOW; other existing rows stay FIRST (retries were only possible for a
day; the difference is negligible). New writes set the kind explicitly.

### Levels

Level L starts at `25 · L · (L − 1)` XP: L2 = 50, L3 = 150, L4 = 300,
L5 = 500, … (each step 50 XP more than the last). The XP bar shows progress
within the current level.

### Daily goal and streak

- `User.dailyGoal Int @default(10)`; allowed 5, 10, 20, 30. **30 only for
  premium users and admins** (checked on the server). Set via
  `PATCH /api/me/preferences { dailyGoal }`.
- Today's progress = first answers today (FIRST + DONT_KNOW) in the user's time
  zone. The +20 bonus counts each past or present user-local day on which that
  number reached the user's **current** goal.
- Streak = existing `computeStreak` (user time zone).

### Collection

Counts of the user's seen cards by rarity (from `CardProgress.box` →
common…legendary), plus "new" = owned cards never answered.

### API

`GET /api/me/progress` →
`{ xp, level, levelStartXp, nextLevelXp, streak, today: { done, goal }, collection: { common, uncommon, rare, epic, legendary, new }, dueNow }`.
Computed with a few aggregate queries (grouped counts; per-day counts via SQL
in the user's zone).

### Level-up

The HUD refetches progress after each answer (review) and each tutor reply.
If the level rose compared with the previous fetch in this page session, it
shows a short celebration (level number + gold burst) and plays a level-up
sound (respects "Card sounds" and reduced motion). Never on first load.

## Pages

- **All signed-in pages:** HUD bar under the nav — avatar with level badge,
  XP bar, 🔥 streak, small goal ring (compact on phones: level + XP + 🔥).
- **Dashboard (redesigned):** Today (goal ring + remaining + bonus note) ·
  big "▶ Play · N cards due" (or "All caught up ✓") · collection (5 rarity
  minis + new) · topic progress bars · recent mistakes (kept) · two stat
  tiles (accuracy, total answers).
- **Review:** holo cards unchanged; HUD on top; session-complete screen
  restyled and shows XP earned this session.
- **Tutor:** restyled topic list with progress bars and chat; "+25 XP" shown
  when a topic is mastered.
- **Settings:** new Daily goal selector (5 / 10 / 20 / 30, 30 locked 🔒
  "Premium" for free users); theme selector unchanged.
- **Landing, sign-in/up, forgot/reset, Premium, Admin:** new colours and
  components only; content and layout unchanged.
- All new strings in English and German.

## Data changes (one migration)

`User.dailyGoal Int @default(10)`; enum `AttemptKind (FIRST, RETRY,
DONT_KNOW)`; `Attempt.kind AttemptKind @default(FIRST)` + backfill of
DONT_KNOW; `down.sql` reverses all three. Rolled out with backup → rehearsal
(`verify_migration.mjs`) → apply (owner's go-ahead) → deploy.

## Testing

- Unit (vitest): XP from counts (every rule), level thresholds and
  within-level progress (49/50/149/150…), daily-goal counting and the
  premium-only 30, goal-bonus days, rarity collection incl. "new", level-up
  detection (rises only; not on first load).
- Existing suites stay green; tsc, lint, build pass.
- Visual check at ≈375px and desktop in both modes; light-mode contrast
  checked. Owner gets a short test list (the app needs sign-in).
- Final independent whole-branch review before going online.
