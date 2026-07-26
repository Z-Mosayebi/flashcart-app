import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateAnswer } from "@/lib/ai";
import { scheduleNextReview } from "@/lib/leitner";

/**
 * POST /api/review/submit
 * body: { userId, cardId, userAnswer }
 *
 * The core tutoring loop:
 *  1. Send the user's free-text answer + the card's expected answer/pattern to the AI service.
 *  2. AI returns CORRECT/PARTIAL/INCORRECT, natural-language feedback, error tags, and a
 *     difficulty estimate for this user on this card.
 *  3. Persist the Attempt (for the error log / dashboard).
 *  4. Run the Leitner scheduler (box + AI-difficulty blended) to compute the next due date.
 *  5. Upsert CardProgress and return feedback + next-review info to the client.
 */
export async function POST(req: NextRequest) {
  const { userId, cardId, userAnswer } = await req.json();

  if (!userId || !cardId || typeof userAnswer !== "string") {
    return NextResponse.json({ error: "userId, cardId, userAnswer are required" }, { status: 400 });
  }

  const card = await prisma.card.findUnique({ where: { id: cardId }, include: { topic: true } });
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });

  const evaluation = await evaluateAnswer({
    cardPrompt: card.prompt,
    expectedAnswer: card.answer,
    userAnswer,
    grammarPattern: card.topic.pattern ?? undefined,
    explanation: card.explanation ?? undefined,
  });

  await prisma.attempt.create({
    data: {
      userId,
      cardId,
      userAnswer,
      result: evaluation.result,
      aiFeedback: evaluation.feedback,
      errorTags: evaluation.errorTags,
    },
  });

  const existing = await prisma.cardProgress.findUnique({ where: { userId_cardId: { userId, cardId } } });
  const currentBox = existing?.box ?? 1;

  const { nextBox, dueAt } = scheduleNextReview({
    currentBox,
    result: evaluation.result,
    aiDifficulty: evaluation.difficulty,
  });

  const nextCorrectStreak = evaluation.result === "CORRECT" ? (existing?.correctStreak ?? 0) + 1 : 0;

  const progress = await prisma.cardProgress.upsert({
    where: { userId_cardId: { userId, cardId } },
    create: {
      userId,
      cardId,
      box: nextBox,
      dueAt,
      lastReviewedAt: new Date(),
      correctStreak: nextCorrectStreak,
      totalReviews: 1,
      totalCorrect: evaluation.result === "CORRECT" ? 1 : 0,
      aiDifficulty: evaluation.difficulty,
    },
    update: {
      box: nextBox,
      dueAt,
      lastReviewedAt: new Date(),
      correctStreak: nextCorrectStreak,
      totalReviews: { increment: 1 },
      totalCorrect: evaluation.result === "CORRECT" ? { increment: 1 } : undefined,
      aiDifficulty: evaluation.difficulty,
    },
  });

  return NextResponse.json({ evaluation, progress });
}
