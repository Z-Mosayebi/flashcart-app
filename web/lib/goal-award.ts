/**
 * Records a GoalDay the moment a learner's answers for today reach their
 * daily goal. Written once (the primary key makes repeats a no-op), so the
 * +20 XP bonus is earned for good: changing the goal later never re-scores
 * past days, and can't fake a level-up.
 */

import { prisma } from "@/lib/prisma";
import { dayKey, resolveTimeZone, startOfDay } from "@/lib/plans";
import { DEFAULT_DAILY_GOAL, goalReached } from "@/lib/game";

/** First answers today (graded or "I don't know") in the learner's zone. */
export async function answersToday(userId: string, timeZone: string, now: Date = new Date()): Promise<number> {
  return prisma.attempt.count({
    where: { userId, kind: { in: ["FIRST", "DONT_KNOW"] }, createdAt: { gte: startOfDay(now, timeZone) } },
  });
}

/** Never throws: a missed award must not fail the answer that triggered it. */
export async function awardGoalDayIfReached(userId: string, now: Date = new Date()): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true, dailyGoal: true } });
    const tz = resolveTimeZone(user?.timeZone);
    const done = await answersToday(userId, tz, now);
    if (!goalReached(done, user?.dailyGoal ?? DEFAULT_DAILY_GOAL)) return;
    await prisma.goalDay.createMany({ data: [{ userId, day: dayKey(now, tz) }], skipDuplicates: true });
  } catch (err) {
    console.error("[goal] could not record the goal day", err);
  }
}
