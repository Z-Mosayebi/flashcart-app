import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateAnswer } from "@/lib/ai";
import { scheduleNextReview } from "@/lib/leitner";
import { requireUserId } from "@/lib/auth";
import { reserveAiCall } from "@/lib/entitlements";

/** Matches the AI service's limit; longer input is almost certainly not an answer. */
const MAX_ANSWER_CHARS = 2_000;

/**
 * POST /api/review/submit
 * body: { cardId, userAnswer }
 *
 * The core tutoring loop:
 *  1. Send the user's free-text answer + the card's expected answer/pattern to the AI service.
 *  2. AI returns CORRECT/PARTIAL/INCORRECT, natural-language feedback, error tags, and a
 *     difficulty estimate for this user on this card.
 *  3. Run the Leitner scheduler (box + AI-difficulty blended) to compute the next due date.
 *  4. In one transaction, update CardProgress (rejecting a concurrent duplicate review
 *     with 409) and persist the Attempt for the error log / dashboard.
 *  5. Return feedback, next-review info, and the now-revealed reference answer.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { cardId?: unknown; userAnswer?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { cardId, userAnswer } = body;

  if (typeof cardId !== "string" || !cardId || typeof userAnswer !== "string" || !userAnswer.trim()) {
    return NextResponse.json({ error: "cardId and userAnswer are required" }, { status: 400 });
  }
  if (userAnswer.length > MAX_ANSWER_CHARS) {
    return NextResponse.json({ error: "answer_too_long" }, { status: 400 });
  }

  // Scope by owner as well as id: without this, a caller could submit answers
  // against another user's card and write progress rows referencing it.
  const card = await prisma.card.findFirst({
    where: { id: cardId, ownerId: userId },
    include: { topic: true },
  });
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });

  // Reserved before the model call: the cap exists to protect the shared
  // free model quota, so a request over it must not reach the model at all.
  const reservation = await reserveAiCall(userId, "graded");
  if (!reservation.ok) return reservation.response;

  // Read the progress row before grading so a concurrent submit of the same
  // card (double click, second tab) can be detected when writing below.
  const existing = await prisma.cardProgress.findUnique({ where: { userId_cardId: { userId, cardId } } });

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
    await reservation.release();
    return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
  }

  const { nextBox, dueAt } = scheduleNextReview({
    currentBox: existing?.box ?? 1,
    result: evaluation.result,
    aiDifficulty: evaluation.difficulty,
  });

  const isCorrect = evaluation.result === "CORRECT";
  const now = new Date();

  let progress;
  try {
    progress = await prisma.$transaction(async (tx) => {
      if (existing) {
        // Optimistic concurrency: only apply this review if nobody else has
        // reviewed the card since we read it. Without the guard, two submits
        // racing on the same card would each promote it a box.
        const { count } = await tx.cardProgress.updateMany({
          where: { id: existing.id, lastReviewedAt: existing.lastReviewedAt, totalReviews: existing.totalReviews },
          data: {
            box: nextBox,
            dueAt,
            lastReviewedAt: now,
            correctStreak: isCorrect ? existing.correctStreak + 1 : 0,
            totalReviews: { increment: 1 },
            totalCorrect: isCorrect ? { increment: 1 } : undefined,
            aiDifficulty: evaluation.difficulty,
          },
        });
        if (count === 0) throw new ConcurrentReviewError();
      } else {
        // The (userId, cardId) unique constraint rejects a racing duplicate.
        await tx.cardProgress.create({
          data: {
            userId,
            cardId,
            box: nextBox,
            dueAt,
            lastReviewedAt: now,
            correctStreak: isCorrect ? 1 : 0,
            totalReviews: 1,
            totalCorrect: isCorrect ? 1 : 0,
            aiDifficulty: evaluation.difficulty,
          },
        });
      }

      // Written in the same transaction, so the error log never records an
      // attempt whose scheduling was rejected.
      await tx.attempt.create({
        data: {
          userId,
          cardId,
          userAnswer,
          result: evaluation.result,
          aiFeedback: evaluation.feedback,
          errorTags: evaluation.errorTags,
        },
      });

      return tx.cardProgress.findUniqueOrThrow({ where: { userId_cardId: { userId, cardId } } });
    });
  } catch (err) {
    const duplicate =
      err instanceof ConcurrentReviewError ||
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002");
    if (duplicate) {
      // The grade was discarded, so the learner isn't charged for it.
      await reservation.release();
      return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
    }
    throw err;
  }

  // The reference answer is only sent once the learner has committed to theirs;
  // the due-cards endpoint deliberately leaves it out.
  return NextResponse.json({
    evaluation,
    progress,
    reveal: { answer: card.answer, explanation: card.explanation },
  });
}

class ConcurrentReviewError extends Error {}
