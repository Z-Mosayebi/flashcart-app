import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMasteryStats } from "@/lib/leitner";

/**
 * GET /api/dashboard?userId=xxx
 * Aggregates everything the dashboard UI needs in one call:
 * box distribution, mastery %, per-topic mastery, due-today count, recent mistakes.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const progress = await prisma.cardProgress.findMany({
    where: { userId },
    include: { card: { include: { topic: true } } },
  });

  const overall = computeMasteryStats(progress);

  const dueToday = progress.filter((p) => p.dueAt <= new Date()).length;

  const byTopic: Record<string, { total: number; mastered: number }> = {};
  for (const p of progress) {
    const key = p.card.topic.name;
    byTopic[key] ??= { total: 0, mastered: 0 };
    byTopic[key].total += 1;
    if (p.box === 5) byTopic[key].mastered += 1;
  }
  const topicMastery = Object.entries(byTopic).map(([topic, v]) => ({
    topic,
    total: v.total,
    mastered: v.mastered,
    pct: Math.round((v.mastered / v.total) * 100),
  }));

  const recentMistakes = await prisma.attempt.findMany({
    where: { userId, result: { in: ["INCORRECT", "PARTIAL"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { card: { include: { topic: true } } },
  });

  const totalAttempts = await prisma.attempt.count({ where: { userId } });
  const correctAttempts = await prisma.attempt.count({ where: { userId, result: "CORRECT" } });

  return NextResponse.json({
    overall,
    dueToday,
    topicMastery,
    recentMistakes: recentMistakes.map((m) => ({
      cardPrompt: m.card.prompt,
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
