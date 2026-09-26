import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminId } from "@/lib/admin";
import { USERS_PAGE_SIZE, likePattern, parseUserQuery } from "@/lib/admin-users";
import { PLAN_LIMITS, isAdminEmail, planFor, resolveTimeZone, startOfDay } from "@/lib/plans";

const DAY_MS = 86_400_000;

/**
 * GET /api/admin/users?q=&sort=newest|active|name&page= — one page of users
 * with what the admin needs to manage them. 404 for non-admins.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdminId())) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { q, sort, page } = parseUserQuery(req.nextUrl.searchParams);
  const pattern = likePattern(q);

  const where = q ? Prisma.sql`WHERE u."email" ILIKE ${pattern} OR u."name" ILIKE ${pattern}` : Prisma.empty;
  const order =
    sort === "name"
      ? Prisma.sql`ORDER BY u."name" ASC NULLS LAST, u."email" ASC`
      : sort === "active"
        ? Prisma.sql`ORDER BY "lastActive" DESC NULLS LAST, u."createdAt" DESC`
        : Prisma.sql`ORDER BY u."createdAt" DESC`;

  // Last activity is the latest graded answer or model call; sorting on it
  // needs SQL, so the page of ids comes from here and details from Prisma.
  const [pageRows, total] = await Promise.all([
    prisma.$queryRaw<{ id: string; lastActive: Date | null }[]>`
      SELECT u."id",
        GREATEST(
          (SELECT MAX(a."createdAt") FROM "Attempt" a WHERE a."userId" = u."id"),
          (SELECT MAX(g."createdAt") FROM "AiUsage" g WHERE g."userId" = u."id")
        ) AS "lastActive"
      FROM "User" u
      ${where}
      ${order}
      LIMIT ${USERS_PAGE_SIZE} OFFSET ${(page - 1) * USERS_PAGE_SIZE}`,
    prisma.user.count({
      where: q
        ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
        : {},
    }),
  ]);

  const ids = pageRows.map((r) => r.id);
  const now = new Date();

  const [users, recentUsage] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        premiumUntil: true,
        blockedAt: true,
        timeZone: true,
        _count: { select: { sourceDocuments: true, cards: true, attempts: true } },
      },
    }),
    // Enough to cover "today" in any time zone.
    prisma.aiUsage.findMany({
      where: { userId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 2 * DAY_MS) } },
      select: { userId: true, kind: true, createdAt: true },
    }),
  ]);

  const byId = new Map(users.map((u) => [u.id, u]));
  const rows = pageRows.flatMap(({ id, lastActive }) => {
    const u = byId.get(id);
    if (!u) return [];
    const dayStart = startOfDay(now, resolveTimeZone(u.timeZone));
    const today = recentUsage.filter((r) => r.userId === id && r.createdAt >= dayStart);
    const plan = planFor(u.premiumUntil, now);
    return [
      {
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.createdAt,
        lastActive,
        admin: isAdminEmail(u.email),
        blocked: u.blockedAt != null,
        plan,
        premiumUntil: plan === "premium" ? u.premiumUntil : null,
        documents: u._count.sourceDocuments,
        cards: u._count.cards,
        answers: u._count.attempts,
        today: {
          graded: today.filter((r) => r.kind === "GRADED").length,
          tutor: today.filter((r) => r.kind === "TUTOR").length,
        },
        limits: PLAN_LIMITS[plan],
      },
    ];
  });

  return NextResponse.json({ users: rows, total, page, pageSize: USERS_PAGE_SIZE });
}
