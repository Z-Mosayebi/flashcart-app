import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { recordFirstAnswer } from "@/lib/review-record";

/**
 * POST /api/review/dont-know — body { cardId }.
 *
 * "I don't know": records the card as not known (back to box 1, due again
 * soon) and returns the answer, without a model call — so it costs none of
 * the daily grading allowance.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { cardId?: unknown } | null;
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  if (!cardId) return NextResponse.json({ error: "cardId is required" }, { status: 400 });

  const card = await prisma.card.findFirst({
    where: { id: cardId, ownerId: userId },
    select: { answer: true, explanation: true },
  });
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });

  const existing = await prisma.cardProgress.findUnique({ where: { userId_cardId: { userId, cardId } } });

  const outcome = await recordFirstAnswer({
    userId,
    cardId,
    existing,
    result: "INCORRECT",
    // Not known at all: the shortest interval box 1 allows.
    difficulty: 1,
    userAnswer: "—",
    feedback: null,
    errorTags: [],
    kind: "DONT_KNOW",
  });
  if (!outcome.ok) return NextResponse.json({ error: "already_reviewed" }, { status: 409 });

  return NextResponse.json({ progress: outcome.progress, reveal: card });
}
