import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminId } from "@/lib/admin";
import { canManageUser } from "@/lib/admin-users";
import { extendPremium, isAdminEmail, isTrialDays } from "@/lib/plans";

const forbidden = () =>
  NextResponse.json({ error: "cannot_manage", detail: "You can't block or delete yourself or another admin." }, { status: 403 });

/**
 * POST /api/admin/users/{id}
 *   { action: "extend", days: 7|14|30 } | { action: "revoke" }
 *   { action: "block" } | { action: "unblock" }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const adminId = await requireAdminId();
  if (!adminId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { action?: string; days?: unknown } | null;
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true, premiumUntil: true },
  });
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

  if (body?.action === "block" || body?.action === "unblock") {
    if (!canManageUser({ actorId: adminId, targetId: user.id, targetIsAdmin: isAdminEmail(user.email) })) {
      return forbidden();
    }
    // Blocking takes effect on the user's next request: the session callback
    // drops a blocked account's id (see lib/auth.ts).
    const blockedAt = body.action === "block" ? now : null;
    await prisma.user.update({ where: { id: user.id }, data: { blockedAt } });
    return NextResponse.json({ ok: true, blocked: blockedAt != null });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}

/**
 * DELETE /api/admin/users/{id} — body { confirmEmail } must equal the user's
 * email. Deletes the account and, through the schema's cascades, everything
 * it owns: cards, progress, documents, requests, Drive access, usage.
 * Irreversible; only a database backup brings it back.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const adminId = await requireAdminId();
  if (!adminId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { confirmEmail?: unknown } | null;
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!canManageUser({ actorId: adminId, targetId: user.id, targetIsAdmin: isAdminEmail(user.email) })) {
    return forbidden();
  }

  const typed = typeof body?.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";
  if (typed !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "confirmation_mismatch" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: user.id } });
  return NextResponse.json({ ok: true });
}
