/**
 * A learner's game progress, computed from rows the app already stores —
 * no XP counter to drift, and a rule change re-scores everyone correctly.
 */

import { prisma } from "@/lib/prisma";
import { resolveTimeZone } from "@/lib/plans";
import { answersToday } from "@/lib/goal-award";
import { computeStreak } from "@/lib/streak";
import {
  DEFAULT_DAILY_GOAL,
  collectionFromBoxes,
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

  const [groups, tutorMessages, topicsMastered, goalDayCount, today, boxes, owned, recent, dueSeen] =
    await Promise.all([
      prisma.attempt.groupBy({ by: ["kind", "result"], where: { userId }, _count: { _all: true } }),
      prisma.tutorMessage.count({ where: { role: "USER", session: { userId } } }),
      prisma.tutorSession.count({ where: { userId, mastered: true } }),
      // Goal days are recorded once when reached (lib/goal-award.ts), so
      // changing the goal later never re-scores the past.
      prisma.goalDay.count({ where: { userId } }),
      answersToday(userId, tz, now),
      prisma.cardProgress.findMany({ where: { userId }, select: { box: true } }),
      prisma.card.count({ where: { ownerId: userId } }),
      prisma.attempt.findMany({ where: { userId }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.cardProgress.count({ where: { userId, dueAt: { lte: now } } }),
    ]);

  const xp = xpFromCounts({
    ...countsFromGroups(groups as unknown as AttemptGroup[]),
    tutorMessages,
    topicsMastered,
    goalDays: goalDayCount,
  });
  const collection = collectionFromBoxes(boxes.map((b) => b.box), owned);

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
