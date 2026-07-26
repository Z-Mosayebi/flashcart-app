import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cards/due?userId=xxx&limit=10
 * Returns cards due for review right now, ordered by most-overdue first.
 * Cards the user has never seen (no CardProgress row) are included too,
 * treated as immediately due at box 1.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 10);

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const dueProgress = await prisma.cardProgress.findMany({
    where: { userId, dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: limit,
    include: { card: { include: { topic: true } } },
  });

  let cards = dueProgress.map((p) => ({
    progressId: p.id,
    box: p.box,
    dueAt: p.dueAt,
    card: p.card,
  }));

  if (cards.length < limit) {
    const seenCardIds = (await prisma.cardProgress.findMany({ where: { userId }, select: { cardId: true } })).map(
      (p) => p.cardId
    );

    const unseen = await prisma.card.findMany({
      where: { id: { notIn: seenCardIds } },
      take: limit - cards.length,
      include: { topic: true },
    });

    cards = cards.concat(
      unseen.map((card) => ({ progressId: null as unknown as string, box: 1, dueAt: new Date(), card }))
    );
  }

  return NextResponse.json({ cards });
}
