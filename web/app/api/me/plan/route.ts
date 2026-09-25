import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { getEntitlement } from "@/lib/entitlements";

/** GET /api/me/plan — plan, limits and today's usage, for meters and prompts. */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [ent, request] = await Promise.all([
    getEntitlement(userId),
    prisma.premiumRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, createdAt: true, grantedDays: true },
    }),
  ]);

  return NextResponse.json({
    plan: ent.plan,
    admin: ent.admin,
    premiumUntil: ent.premiumUntil,
    limits: ent.limits,
    usage: ent.usage,
    request,
  });
}
