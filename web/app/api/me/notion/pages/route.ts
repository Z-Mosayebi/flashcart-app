import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { listAccessiblePages } from "@/lib/notion-oauth";

/** GET — pages this connection can see, for the picker in Settings. */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conn = await prisma.notionConnection.findUnique({ where: { userId } });
  if (!conn) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  try {
    const pages = await listAccessiblePages(decryptSecret(conn.encryptedToken));
    return NextResponse.json({ pages, selected: conn.pageIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list pages";
    return NextResponse.json({ error: "list_failed", detail: message }, { status: 502 });
  }
}

/** PATCH — save which pages to sync. */
export async function PATCH(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { pageIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!Array.isArray(body.pageIds) || body.pageIds.some((p) => typeof p !== "string")) {
    return NextResponse.json({ error: "invalid_pageIds" }, { status: 400 });
  }

  const conn = await prisma.notionConnection.findUnique({ where: { userId } });
  if (!conn) return NextResponse.json({ error: "not_connected" }, { status: 400 });

  await prisma.notionConnection.update({
    where: { userId },
    data: { pageIds: body.pageIds as string[] },
  });

  return NextResponse.json({ ok: true });
}
