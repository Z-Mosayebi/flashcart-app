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

/** Whether today's answers meet the goal (when a GoalDay is recorded). */
export function goalReached(done: number, goal: number): boolean {
  return done >= goal;
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
