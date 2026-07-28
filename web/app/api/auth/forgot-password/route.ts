import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createResetToken, resetUrl, RESET_TOKEN_TTL_MINUTES } from "@/lib/password-reset";
import { passwordResetEmail, sendMail } from "@/lib/mail";

/**
 * POST /api/auth/forgot-password — email a reset link.
 *
 * Always answers 200 with the same body, whether or not the address has an
 * account. Distinguishing the two would turn this endpoint into a way to check
 * which emails are registered.
 */
export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const email = body.email?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    // Skip OAuth-only accounts too: they have no password to reset, and saying
    // so here would reveal that the address is registered.
    if (user?.passwordHash) {
      const token = await createResetToken(user.id);
      const { subject, html, text } = passwordResetEmail(
        resetUrl(token),
        RESET_TOKEN_TTL_MINUTES
      );
      await sendMail({ to: email, subject, html, text });
    }
  } catch (err) {
    // A failure here is ours, not the caller's. Log it and still return the
    // neutral response rather than leaking that something broke mid-lookup.
    console.error("[forgot-password] Could not process request:", err);
  }

  return NextResponse.json({ ok: true });
}
