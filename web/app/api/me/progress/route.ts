import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { getProgress } from "@/lib/progress";

/** GET /api/me/progress — XP, level, streak, today's goal, collection. */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getProgress(userId));
}
