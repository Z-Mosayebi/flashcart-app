/** Daily practice streak, counted in the learner's own calendar. */

import { dayKey, startOfDay } from "@/lib/plans";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Consecutive days, ending today or yesterday, with at least one attempt.
 * Yesterday still counts so a streak isn't "lost" before you've practised
 * today.
 *
 * Days are walked back from local *noon*: a DST day is 23 or 25 hours long,
 * and stepping 24h from midnight could skip or repeat a date; from noon it
 * always lands inside the previous day.
 */
export function computeStreak(dates: Date[], now: Date, timeZone: string): number {
  if (dates.length === 0) return 0;

  const days = new Set(dates.map((d) => dayKey(d, timeZone)));
  const noon = startOfDay(now, timeZone).getTime() + 12 * HOUR_MS;
  const keyFor = (daysAgo: number) => dayKey(new Date(noon - daysAgo * DAY_MS), timeZone);

  let daysAgo = days.has(keyFor(0)) ? 0 : 1;
  let streak = 0;
  while (days.has(keyFor(daysAgo))) {
    streak += 1;
    daysAgo += 1;
  }
  return streak;
}
