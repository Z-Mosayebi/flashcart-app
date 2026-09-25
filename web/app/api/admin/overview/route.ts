import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminId } from "@/lib/admin";
import { countBy, latestPerUser, usersOverDailyCap } from "@/lib/analytics";
import { PLAN_LIMITS, parseAdminEmails, resolveTimeZone } from "@/lib/plans";
import { GOALS, LEVELS, PAY_OPTIONS } from "@/lib/premium";

const DAY_MS = 86_400_000;

/** GET /api/admin/overview — everything the admin dashboard shows. 404 for non-admins. */
export async function GET() {
  if (!(await requireAdminId())) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);

  const [totalUsers, signups7, signups30, active, requests, premiumUsers, admins, attempts, tutorReplies] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: since7 } } }),
      prisma.user.count({ where: { createdAt: { gte: since30 } } }),
      prisma.attempt.findMany({ where: { createdAt: { gte: since7 } }, distinct: ["userId"], select: { userId: true } }),
      prisma.premiumRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
        include: { user: { select: { id: true, name: true, email: true, premiumUntil: true } } },
      }),
      prisma.user.findMany({
        where: { premiumUntil: { gt: now } },
        orderBy: { premiumUntil: "asc" },
        select: { id: true, name: true, email: true, premiumUntil: true },
      }),
      prisma.user.findMany({ where: { email: { in: adminEmails } }, select: { id: true } }),
      prisma.attempt.findMany({ where: { createdAt: { gte: since7 } }, select: { userId: true, createdAt: true } }),
      prisma.tutorMessage.findMany({
        where: { role: "ASSISTANT", createdAt: { gte: since7 } },
        select: { createdAt: true, session: { select: { userId: true } } },
      }),
    ]);

  // Limit hits only mean something for users on the free plan.
  const notFree = new Set([...premiumUsers.map((u) => u.id), ...admins.map((u) => u.id)]);

  // Each user's rows are bucketed into days in that user's own time zone.
  const tutorRows = tutorReplies.map((m) => ({ userId: m.session.userId, createdAt: m.createdAt }));
  const activeIds = Array.from(new Set([...attempts, ...tutorRows].map((r) => r.userId)));
  const zones = new Map(
    (await prisma.user.findMany({ where: { id: { in: activeIds } }, select: { id: true, timeZone: true } })).map(
      (u) => [u.id, u.timeZone]
    )
  );
  const zoneOf = (id: string) => resolveTimeZone(zones.get(id));
  const latest = latestPerUser(requests);

  const sorted = [...requests].sort((a, b) => {
    if ((a.status === "PENDING") !== (b.status === "PENDING")) return a.status === "PENDING" ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return NextResponse.json({
    requests: sorted,
    pendingCount: requests.filter((r) => r.status === "PENDING").length,
    premiumUsers,
    analytics: {
      totalUsers,
      signups7,
      signups30,
      active7: active.length,
      requesters: latest.length,
      requestRatePct: totalUsers === 0 ? 0 : Math.round((latest.length / totalUsers) * 100),
      pay: countBy(latest.map((r) => r.willingToPay), PAY_OPTIONS),
      goal: countBy(latest.map((r) => r.goal), GOALS),
      level: countBy(latest.map((r) => r.level), LEVELS),
      hitGradedCap7: usersOverDailyCap(attempts, PLAN_LIMITS.free.gradedPerDay, notFree, zoneOf),
      hitTutorCap7: usersOverDailyCap(tutorRows, PLAN_LIMITS.free.tutorPerDay, notFree, zoneOf),
    },
  });
}
