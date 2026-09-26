import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

/**
 * GET /api/cards/{id}/reveal — the reference answer and explanation, for when
 * the learner chooses "Show answer" instead of using their retry. Owner-only.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const card = await prisma.card.findFirst({
    where: { id: params.id, ownerId: userId },
    select: { answer: true, explanation: true },
  });
  if (!card) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ reveal: card });
}
