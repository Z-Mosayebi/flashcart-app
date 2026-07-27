import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { encryptSecret, decryptSecret, maskToken } from "@/lib/crypto";
import { extractNotionPageId } from "@/lib/notion";
import { notionOAuthConfigured } from "@/lib/notion-oauth";

/** GET — current connection status. The token itself is never returned. */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conn = await prisma.notionConnection.findUnique({ where: { userId } });
  const oauthAvailable = notionOAuthConfigured();

  if (!conn) return NextResponse.json({ connected: false, oauthAvailable });

  let tokenHint: string | null = null;
  try {
    tokenHint = maskToken(decryptSecret(conn.encryptedToken));
  } catch {
    // Ciphertext unreadable (e.g. ENCRYPTION_KEY rotated) — surface it as
    // needing reconnection rather than throwing.
    tokenHint = null;
  }

  return NextResponse.json({
    connected: true,
    oauthAvailable,
    authType: conn.authType,
    workspaceName: conn.workspaceName,
    workspaceIcon: conn.workspaceIcon,
    tokenHint,
    pageIds: conn.pageIds,
    lastSyncedAt: conn.lastSyncedAt,
    lastSyncError: conn.lastSyncError,
  });
}

/** PUT — save or replace the connection. */
export async function PUT(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { token?: string; pageUrls?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token_required" }, { status: 400 });
  }

  const rawPages = (body.pageUrls ?? []).map((p) => p.trim()).filter(Boolean);
  if (rawPages.length === 0) {
    return NextResponse.json({ error: "page_required" }, { status: 400 });
  }

  const pageIds: string[] = [];
  for (const raw of rawPages) {
    const id = extractNotionPageId(raw);
    if (!id) {
      return NextResponse.json({ error: "invalid_page", detail: raw }, { status: 400 });
    }
    pageIds.push(id);
  }

  const encryptedToken = encryptSecret(token);

  await prisma.notionConnection.upsert({
    where: { userId },
    create: { userId, encryptedToken, pageIds, authType: "token" },
    update: { encryptedToken, pageIds, authType: "token", lastSyncError: null },
  });

  return NextResponse.json({ ok: true, pageIds });
}

/** DELETE — disconnect. Cards already imported are kept; only access is removed. */
export async function DELETE() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await prisma.notionConnection.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
