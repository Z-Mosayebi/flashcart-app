import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

/**
 * GET /api/topics — topics available for a tutor session, with the signed-in
 * user's mastery on each so the UI can suggest what to practise.
 */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const topics = await prisma.topic.findMany({
    where: { ownerId: userId },
    include: {
      cards: {
        select: {
          id: true,
          progress: { where: { userId }, select: { box: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const payload = topics
    .filter((t) => t.cards.length > 0)
    .map((t) => {
      const boxes = t.cards.flatMap((c) => c.progress.map((p) => p.box));
      const mastered = boxes.filter((b) => b === 5).length;
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        pattern: t.pattern,
        cardCount: t.cards.length,
        masteredPct: t.cards.length ? Math.round((mastered / t.cards.length) * 100) : 0,
      };
    });

  return NextResponse.json({ topics: payload });
}
