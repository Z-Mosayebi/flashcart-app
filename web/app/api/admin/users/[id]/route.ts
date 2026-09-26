import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminId } from "@/lib/admin";
import { extendPremium, isTrialDays } from "@/lib/plans";

/** POST /api/admin/users/{id} — { action: "extend", days: 7|14|30 } or { action: "revoke" }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdminId())) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { action?: string; days?: unknown } | null;
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, premiumUntil: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date();

  if (body?.action === "extend") {
    if (!isTrialDays(body.days)) return NextResponse.json({ error: "invalid_days" }, { status: 400 });
    const premiumUntil = extendPremium(user.premiumUntil, body.days, now);
    await prisma.user.update({ where: { id: user.id }, data: { premiumUntil } });
    return NextResponse.json({ ok: true, premiumUntil });
  }

  if (body?.action === "revoke") {
    // "Now" rather than null keeps a record that this user had premium.
    await prisma.user.update({ where: { id: user.id }, data: { premiumUntil: now } });
    return NextResponse.json({ ok: true, premiumUntil: now });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
