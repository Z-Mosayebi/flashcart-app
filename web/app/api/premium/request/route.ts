import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { validatePremiumRequest } from "@/lib/premium";
import { notifyAdmins, premiumRequestNotice } from "@/lib/notify";

const REQUEST_FIELDS = { status: true, createdAt: true, grantedDays: true, decidedAt: true } as const;

/** GET /api/premium/request — the user's latest request and premium end date. */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [request, user] = await Promise.all([
    prisma.premiumRequest.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: REQUEST_FIELDS }),
    prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } }),
  ]);

  return NextResponse.json({ request, premiumUntil: user?.premiumUntil ?? null });
}

/** POST /api/premium/request — submit the form. One pending request at a time. */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = validatePremiumRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const pending = await prisma.premiumRequest.findFirst({ where: { userId, status: "PENDING" }, select: { id: true } });
  if (pending) return NextResponse.json({ error: "already_pending" }, { status: 409 });

  const [request, user] = await Promise.all([
    prisma.premiumRequest.create({ data: { userId, ...parsed.value }, select: REQUEST_FIELDS }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
  ]);

  // Awaited (a serverless function may freeze once it responds), but its
  // outcome never changes ours: the request is saved either way.
  await notifyAdmins(
    premiumRequestNotice({
      name: user?.name ?? null,
      email: user?.email ?? "(unknown)",
      ...parsed.value,
      adminUrl: `${process.env.NEXTAUTH_URL ?? ""}/admin`,
    })
  );

  return NextResponse.json({ request }, { status: 201 });
}
