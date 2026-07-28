import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { findValidResetToken, MIN_PASSWORD_LENGTH } from "@/lib/password-reset";

/**
 * GET /api/auth/reset-password?token=… — is this link still good?
 * Lets the page show "this link expired" up front instead of after the user
 * has typed a new password.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  try {
    const record = await findValidResetToken(token);
    return NextResponse.json({ valid: Boolean(record) });
  } catch (err) {
    console.error("[reset-password] Token check failed:", err);
    return NextResponse.json({ valid: false });
  }
}

/** POST /api/auth/reset-password — set a new password using a valid token. */
export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { token, password } = body;

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "weak_password" }, { status: 400 });
  }

  try {
    const record = await findValidResetToken(token ?? "");
    if (!record) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Marking the token used and changing the password must happen together —
    // otherwise a crash between them either leaves the link replayable or
    // burns it without actually changing anything.
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Any other outstanding links for this account are now stale.
      prisma.passwordResetToken.deleteMany({
        where: { userId: record.userId, usedAt: null },
      }),
      // Drop existing database sessions so a stolen session can't outlive the
      // reset. JWT sessions can't be revoked this way, but signing in again
      // issues a fresh one.
      prisma.session.deleteMany({ where: { userId: record.userId } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reset-password] Could not reset password:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
