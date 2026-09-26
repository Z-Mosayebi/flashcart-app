import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { preferencesUpdate } from "@/lib/preferences";

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

  await prisma.user.update({ where: { id: userId }, data: update });

  return NextResponse.json({ ok: true });
}
