import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

/**
 * GET /api/cards/due?limit=10
 * Returns cards due for review right now, ordered by most-overdue first.
 * Cards the user has never seen (no CardProgress row) are included too,
 * treated as immediately due at box 1.
 *
 * The user comes from the session, never from a query param.
 */
export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 10);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 10, 1), 50);

  const dueProgress = await prisma.cardProgress.findMany({
    where: { userId, dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: limit,
    include: { card: { include: { topic: true } } },
  });

  let cards = dueProgress.map((p) => ({
    progressId: p.id as string | null,
    box: p.box,
    dueAt: p.dueAt,
    card: p.card,
  }));

  if (cards.length < limit) {
    const seen = await prisma.cardProgress.findMany({
      where: { userId },
      select: { cardId: true },
    });
    const seenCardIds = seen.map((p) => p.cardId);

    // Only ever surface cards this user owns.
    const unseen = await prisma.card.findMany({
      where: {
        ownerId: userId,
        ...(seenCardIds.length ? { id: { notIn: seenCardIds } } : {}),
      },
      take: limit - cards.length,
      include: { topic: true },
      orderBy: { createdAt: "asc" },
    });

    cards = cards.concat(
      unseen.map((card) => ({
        progressId: null,
        box: 1,
        dueAt: new Date(),
        card,
      }))
    );
  }

  return NextResponse.json({ cards });
}
