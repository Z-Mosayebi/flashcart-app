import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCodeForToken } from "@/lib/notion-oauth";

/**
 * GET /api/me/notion/oauth/callback — Notion redirects here after consent.
 *
 * Verifies the state cookie, exchanges the code for an access token, and stores
 * it encrypted. No page ids yet: the user picks those from a list on the
 * Settings page, which is nicer than asking them to paste a URL.
 */
export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const settings = (status: string) => NextResponse.redirect(new URL(`/settings?notion=${status}`, base));

  const userId = await requireUserId();
  if (!userId) return NextResponse.redirect(new URL("/signin", base));

  const params = req.nextUrl.searchParams;

  // The user pressed "Cancel" on Notion's consent screen.
  if (params.get("error")) return settings("cancelled");

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = req.cookies.get("notion_oauth_state")?.value;

  if (!code) return settings("failed");

  // Reject a callback that didn't originate from our own start route.
  if (!state || !expectedState || state !== expectedState) {
    return settings("state_mismatch");
  }

  try {
    const token = await exchangeCodeForToken(code);

    await prisma.notionConnection.upsert({
      where: { userId },
      create: {
        userId,
        encryptedToken: encryptSecret(token.access_token),
        authType: "oauth",
        workspaceName: token.workspace_name ?? null,
        workspaceIcon: token.workspace_icon ?? null,
        pageIds: [],
      },
      update: {
        encryptedToken: encryptSecret(token.access_token),
        authType: "oauth",
        workspaceName: token.workspace_name ?? null,
        workspaceIcon: token.workspace_icon ?? null,
        lastSyncError: null,
      },
    });

    const res = settings("connected");
    res.cookies.delete("notion_oauth_state");
    return res;
  } catch (err) {
    console.error("Notion OAuth callback failed", err);
    return settings("failed");
  }
}
