/**
 * Writes the outcome of a card's *first* answer: the Leitner move and the
 * attempt log, in one transaction. Shared by a graded answer and by
 * "I don't know" (which is recorded as an incorrect answer without a model
 * call).
 */

import { Prisma, type AttemptResult, type CardProgress } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scheduleNextReview } from "@/lib/leitner";

export interface FirstAnswer {
  userId: string;
  cardId: string;
  /** The progress row as read before the answer, for the concurrency check. */
  existing: CardProgress | null;
  result: AttemptResult;
  difficulty: number;
  userAnswer: string;
  feedback: string | null;
  errorTags: string[];
}

export type RecordOutcome = { ok: true; progress: CardProgress } | { ok: false; duplicate: true };

class ConcurrentReviewError extends Error {}

export async function recordFirstAnswer(a: FirstAnswer): Promise<RecordOutcome> {
  const { userId, cardId, existing } = a;
  const { nextBox, dueAt } = scheduleNextReview({
    currentBox: existing?.box ?? 1,
    result: a.result,
    aiDifficulty: a.difficulty,
  });
  const isCorrect = a.result === "CORRECT";
  const now = new Date();

  try {
    const progress = await prisma.$transaction(async (tx) => {
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
            aiDifficulty: a.difficulty,
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
            aiDifficulty: a.difficulty,
          },
        });
      }

      // Written in the same transaction, so the error log never records an
      // attempt whose scheduling was rejected.
      await tx.attempt.create({
        data: {
          userId,
          cardId,
          userAnswer: a.userAnswer,
          result: a.result,
          aiFeedback: a.feedback,
          errorTags: a.errorTags,
        },
      });

      return tx.cardProgress.findUniqueOrThrow({ where: { userId_cardId: { userId, cardId } } });
    });
    return { ok: true, progress };
  } catch (err) {
    const duplicate =
      err instanceof ConcurrentReviewError ||
      (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002");
    if (duplicate) return { ok: false, duplicate: true };
    throw err;
  }
}
