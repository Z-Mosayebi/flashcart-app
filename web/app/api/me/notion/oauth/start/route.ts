import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireUserId } from "@/lib/auth";
import { notionOAuthConfigured, notionAuthorizeUrl } from "@/lib/notion-oauth";

/**
 * GET /api/me/notion/oauth/start — kick off the Notion consent flow.
 *
 * Redirects the user to Notion, where they pick which pages to share. A random
 * `state` value is set as an httpOnly cookie and echoed back by Notion so the
 * callback can prove the response belongs to this browser session (CSRF guard).
 */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.redirect(new URL("/signin", process.env.NEXTAUTH_URL));

  if (!notionOAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?notion=not_configured", process.env.NEXTAUTH_URL)
    );
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(notionAuthorizeUrl(state));

  res.cookies.set("notion_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes is plenty to complete consent
  });

  return res;
}
