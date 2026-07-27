import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMasteryStats } from "@/lib/leitner";
import { requireUserId } from "@/lib/auth";

/**
 * Counts consecutive days ending today (or yesterday) that have at least one
 * attempt. Yesterday still counts so a streak isn't "lost" before you've
 * practised today.
 */
function computeStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;

  const days = new Set(dates.map((d) => new Date(d).toISOString().slice(0, 10)));

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  if (!days.has(todayKey) && !days.has(yesterdayKey)) return 0;

  let streak = 0;
  const cursor = new Date(today);
  if (!days.has(todayKey)) cursor.setDate(cursor.getDate() - 1);

  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * GET /api/dashboard
 * Aggregates everything the dashboard UI needs in one call: box distribution,
 * mastery %, per-topic mastery, due-today count, streak, recent mistakes.
 */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [progress, recentMistakes, totalAttempts, correctAttempts, totalCards, attemptDates] =
    await Promise.all([
      prisma.cardProgress.findMany({
        where: { userId },
        include: { card: { include: { topic: true } } },
      }),
      prisma.attempt.findMany({
        where: { userId, result: { in: ["INCORRECT", "PARTIAL"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { card: { include: { topic: true } } },
      }),
      prisma.attempt.count({ where: { userId } }),
      prisma.attempt.count({ where: { userId, result: "CORRECT" } }),
      prisma.card.count({ where: { ownerId: userId } }),
      prisma.attempt.findMany({
        where: { userId },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ]);

  const overall = computeMasteryStats(progress);
  const now = new Date();
  const seenCardIds = new Set(progress.map((p) => p.cardId));
  // Unseen cards are due immediately, so they belong in the "due today" count.
  const dueToday = progress.filter((p) => p.dueAt <= now).length + (totalCards - seenCardIds.size);

  const byTopic: Record<string, { total: number; mastered: number }> = {};
  for (const p of progress) {
    const key = p.card.topic.name;
    byTopic[key] ??= { total: 0, mastered: 0 };
    byTopic[key].total += 1;
    if (p.box === 5) byTopic[key].mastered += 1;
  }
  const topicMastery = Object.entries(byTopic)
    .map(([topic, v]) => ({
      topic,
      total: v.total,
      mastered: v.mastered,
      pct: Math.round((v.mastered / v.total) * 100),
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    overall,
    dueToday,
    totalCards,
    streak: computeStreak(attemptDates.map((a) => a.createdAt)),
    topicMastery,
    recentMistakes: recentMistakes.map((m) => ({
      cardPrompt: m.card.prompt,
      cardAnswer: m.card.answer,
      topic: m.card.topic.name,
      userAnswer: m.userAnswer,
      aiFeedback: m.aiFeedback,
      errorTags: m.errorTags,
      createdAt: m.createdAt,
    })),
    accuracyPct: totalAttempts === 0 ? 0 : Math.round((correctAttempts / totalAttempts) * 100),
    totalAttempts,
  });
}
