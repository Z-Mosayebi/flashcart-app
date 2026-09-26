import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { preferencesUpdate } from "@/lib/preferences";
import { getEntitlement } from "@/lib/entitlements";
import { goalAllowed } from "@/lib/game";
import { awardGoalDayIfReached } from "@/lib/goal-award";

/**
 * PATCH /api/me/preferences — persist interface language and/or time zone.
 * The time zone is sent automatically by the browser; daily limits and the
 * streak reset at the user's own midnight.
 */
export async function PATCH(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const update = preferencesUpdate(body);
  if (!update) {
    return NextResponse.json({ error: "invalid_preferences" }, { status: 400 });
  }

  // 30 a day is past the free plan's 30 graded answers: premium and admins only.
  if (update.dailyGoal !== undefined) {
    const ent = await getEntitlement(userId);
    if (!goalAllowed(update.dailyGoal, { premium: ent.plan === "premium", admin: ent.admin })) {
      return NextResponse.json({ error: "goal_premium_only" }, { status: 403 });
    }
  }

  await prisma.user.update({ where: { id: userId }, data: update });
  // Lowering the goal below today's answers reaches it right now.
  if (update.dailyGoal !== undefined) await awardGoalDayIfReached(userId);

  return NextResponse.json({ ok: true });
}
