import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminId } from "@/lib/admin";
import { extendPremium, isTrialDays } from "@/lib/plans";
import { mailConfigured, premiumActivatedEmail, sendMail } from "@/lib/mail";

class AlreadyDecided extends Error {}

/** POST /api/admin/requests/{id} — { action: "approve", days: 7|14|30 } or { action: "reject" }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdminId())) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { action?: string; days?: unknown } | null;
  const request = await prisma.premiumRequest.findUnique({
    where: { id: params.id },
    include: { user: { select: { email: true, premiumUntil: true } } },
  });
  if (!request) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date();

  try {
    if (body?.action === "approve") {
      if (!isTrialDays(body.days)) return NextResponse.json({ error: "invalid_days" }, { status: 400 });
      const days = body.days;
      const until = extendPremium(request.user.premiumUntil, days, now);

      // Guarded on PENDING so a double click can't grant the trial twice.
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.premiumRequest.updateMany({
          where: { id: request.id, status: "PENDING" },
          data: { status: "APPROVED", grantedDays: days, decidedAt: now },
        });
        if (count === 0) throw new AlreadyDecided();
        await tx.user.update({ where: { id: request.userId }, data: { premiumUntil: until } });
      });

      if (mailConfigured()) {
        const email = premiumActivatedEmail(until, process.env.NEXTAUTH_URL ?? "");
        await sendMail({ to: request.user.email, ...email });
      }
      return NextResponse.json({ ok: true, premiumUntil: until });
    }

    if (body?.action === "reject") {
      const { count } = await prisma.premiumRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: { status: "REJECTED", decidedAt: now },
      });
      if (count === 0) throw new AlreadyDecided();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (err) {
    if (err instanceof AlreadyDecided) {
      return NextResponse.json({ error: "already_decided", status: request.status }, { status: 409 });
    }
    throw err;
  }
}
