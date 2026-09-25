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
 * Distinct users who, on at least one of their own calendar days (in the zone
 * `zoneOf` gives for them), produced `cap` or
 * more rows — i.e. hit a daily limit. The strongest demand signal: they wanted
 * more than the free plan gives.
 */
export function usersOverDailyCap(
  rows: { userId: string; createdAt: Date }[],
  cap: number,
  exclude: Set<string>,
  zoneOf: (userId: string) => string
): number {
  const perUserDay = new Map<string, number>();
  for (const row of rows) {
    if (exclude.has(row.userId)) continue;
    const key = `${row.userId}|${dayKey(row.createdAt, zoneOf(row.userId))}`;
    perUserDay.set(key, (perUserDay.get(key) ?? 0) + 1);
  }
  const users = new Set<string>();
  perUserDay.forEach((count, key) => {
    if (count >= cap) users.add(key.split("|")[0]);
  });
  return users.size;
}
