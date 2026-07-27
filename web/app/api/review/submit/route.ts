import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateAnswer } from "@/lib/ai";
import { scheduleNextReview } from "@/lib/leitner";
import { requireUserId } from "@/lib/auth";

/**
 * POST /api/review/submit
 * body: { cardId, userAnswer }
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
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { cardId, userAnswer } = await req.json();

  if (!cardId || typeof userAnswer !== "string" || !userAnswer.trim()) {
    return NextResponse.json({ error: "cardId and userAnswer are required" }, { status: 400 });
  }

  // Scope by owner as well as id: without this, a caller could submit answers
  // against another user's card and write progress rows referencing it.
  const card = await prisma.card.findFirst({
    where: { id: cardId, ownerId: userId },
    include: { topic: true },
  });
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });

  let evaluation;
  try {
    evaluation = await evaluateAnswer({
      cardPrompt: card.prompt,
      expectedAnswer: card.answer,
      userAnswer,
      grammarPattern: card.topic.pattern ?? undefined,
      explanation: card.explanation ?? undefined,
    });
  } catch (err) {
    // The AI service being down shouldn't look like a client bug.
    console.error("evaluateAnswer failed", err);
    return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
  }

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
