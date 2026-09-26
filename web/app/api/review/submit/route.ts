import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateAnswer } from "@/lib/ai";
import { recordFirstAnswer } from "@/lib/review-record";
import { shouldReveal } from "@/lib/review-flow";
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
 *  5. Return feedback, next-review info, and — once the card is finished — the
 *     reference answer. A wrong first answer gets one retry (body.retry = true)
 *     that is graded and logged but doesn't reschedule the card.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { cardId?: unknown; userAnswer?: unknown; retry?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { cardId, userAnswer } = body;
  // The one retry after a wrong first answer: graded and logged, but it
  // never moves the card between boxes (see lib/review-flow.ts).
  const isRetry = body.retry === true;

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

  if (isRetry) {
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
    return NextResponse.json({
      evaluation,
      reveal: { answer: card.answer, explanation: card.explanation },
    });
  }

  const outcome = await recordFirstAnswer({
    userId,
    cardId,
    existing,
    result: evaluation.result,
    difficulty: evaluation.difficulty,
    userAnswer,
    feedback: evaluation.feedback,
    errorTags: evaluation.errorTags,
  });
  if (!outcome.ok) {
    // The grade was discarded, so the learner isn't charged for it.
    await reservation.release();
    return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
  }

  // The reference answer is only sent once the card is finished: after a
  // correct answer, after the retry, or when the learner said they didn't
  // know. Otherwise it's held back so the retry is a real attempt.
  return NextResponse.json({
    evaluation,
    progress: outcome.progress,
    reveal: shouldReveal(evaluation.result, false, evaluation.gaveUp)
      ? { answer: card.answer, explanation: card.explanation }
      : null,
  });
}
